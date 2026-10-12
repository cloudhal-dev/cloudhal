/**
 * `/api/invites` — people join only through single-use, expiring, role- and email-bound links
 * (RFC-0005 §7, I11, I12). Every step is audited without the token or its hash (I14).
 *
 * Signed-in (`members:invite`):
 * - `GET    /` → `{items: InviteView[]}` (pending, plus accepted ones whose account was not created)
 * - `POST   /` {email, role, expiresInHours?, delivery?} → 201 `{invite, url?}`; `url` is
 *   `<studio>/invite#chinv_…`, shown once (not with `delivery: "email"`). Re-inviting an email
 *   replaces its pending invite. Errors: 403 `rank`, 400 `invalid_expiry`, 400
 *   `delivery_unavailable`, 409 `already_member`, 409 `too_many_invites` (50 pending), 429
 *   `rate_limited` (20 per inviter per hour)
 * - `DELETE /:id` → `{invite}` (revoked); 409 `invite_not_pending`
 *
 * Public, JSON only (415), 10 per minute per IP (429):
 * - `POST /inspect` {token} → `{email, role, inviterName, deploymentName, expiresAt, account}`;
 *   consumes nothing; 410 `invite_gone`
 * - `POST /accept` {token, name?, password} → `{user, role}` + session cookie. 409
 *   `signed_in_as_other`, 410 `invite_gone`, 400 `weak_password` / `name_required`, 403
 *   `wrong_password` (existing account), 409 `already_member`
 */
import {
  canInvite,
  inviteDefaultHours,
  inviteExpiryProblem,
  inviteProblem,
  isRole,
  type Role,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import { actorIdForUser, type StaffService } from "../auth.ts";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import type { InviteRow } from "../staff.ts";
import {
  hashToken,
  INVITE_TOKEN_PREFIX,
  isToken,
  jsonBody,
  limitPublic,
  newToken,
  studioOrigin,
} from "../tokens.ts";
import { auditEvent, me, rankError } from "./members.ts";

/** At most this many pending invites per deployment, and creations per inviter per hour. */
export const MAX_PENDING_INVITES = 50;
export const MAX_INVITES_PER_HOUR = 20;

export interface InviteView {
  id: string;
  email: string;
  role: Role;
  status: InviteRow["status"];
  delivery: "link" | "email";
  inviter: { userId: string; name: string | null };
  createdAt: string;
  expiresAt: string;
  /** Set when accepted: the account it created or re-admitted (null: accepted, no account yet). */
  acceptedUserId: string | null;
  acceptedAt: string | null;
}

export function inviteView(i: InviteRow): InviteView {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    delivery: i.delivery,
    inviter: { userId: i.inviterId, name: i.inviterName },
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    acceptedUserId: i.acceptedUserId,
    acceptedAt: i.acceptedAt,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function gone() {
  return apiError(
    410,
    "invite_gone",
    "This invite link was used, revoked or has expired. Ask for a new one.",
  );
}

/** A usable invite for a token, or 410. */
async function usableInvite(
  staff: StaffService,
  token: unknown,
): Promise<{ invite: InviteRow; hash: string }> {
  if (!isToken(INVITE_TOKEN_PREFIX, token)) throw gone();
  const hash = await hashToken(token);
  const invite = await staff.store.inviteByHash(hash);
  if (invite?.status !== "pending") throw gone();
  return { invite, hash };
}

function staffOf(c: Context<Env>): StaffService {
  const staff = c.get("staff");
  if (!staff) throw notFound("invites are not enabled on this server");
  return staff;
}

export function inviteRoutes(options: {
  studioOrigin?: string | undefined;
  trustedOrigins: ReadonlySet<string>;
}): Hono<Env> {
  return new Hono<Env>()
    .post("/inspect", async (c) => {
      const staff = staffOf(c);
      await limitPublic(c, "invite");
      const body = await jsonBody(c);
      const { invite } = await usableInvite(staff, body.token);
      const existing = await staff.userByEmail(invite.email);
      return c.json({
        email: invite.email,
        role: invite.role,
        inviterName: invite.inviterName,
        deploymentName: await staff.store.deploymentName(),
        expiresAt: invite.expiresAt,
        account: existing ? "existing" : "new",
      });
    })
    .post("/accept", async (c) => {
      const staff = staffOf(c);
      await limitPublic(c, "invite");
      const body = await jsonBody(c);
      const { invite, hash } = await usableInvite(staff, body.token);
      const password = body.password;
      if (
        typeof password !== "string" ||
        password.length < staff.minPasswordLength ||
        password.length > staff.maxPasswordLength
      )
        throw apiError(
          400,
          "weak_password",
          `the password needs ${staff.minPasswordLength} to ${staff.maxPasswordLength} characters`,
        );
      const existing = await staff.userByEmail(invite.email);
      // No silent session switch (also blocks login CSRF): a different signed-in user is refused.
      const signedIn = await staff.sessionUserId(c.req.raw.headers);
      if (signedIn && signedIn !== existing?.id)
        throw apiError(
          409,
          "signed_in_as_other",
          "You are signed in as someone else. Sign out first, then open the invite link again.",
        );
      let name: string | undefined;
      if (existing) {
        if (await staff.store.member(existing.id))
          throw apiError(409, "already_member", "this account is already a member");
        if (!(await staff.verifyPassword(existing.id, password)))
          throw apiError(403, "wrong_password", "the password is not correct for this account");
      } else {
        name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
        if (!name || name.length > 100)
          throw apiError(400, "name_required", "a name (up to 100 characters) is required");
      }
      // Single use: one guarded statement claims it (RFC-0005 §7.1).
      if (!(await staff.store.claimInvite(hash))) throw gone();
      let user: { id: string; name: string; email: string };
      if (existing) user = existing;
      else {
        try {
          // Server-side creation: public sign-up stays closed (§7.3).
          user = await staff.createUser({
            email: invite.email,
            name: name as string,
            password,
            emailVerified: invite.delivery === "email",
          });
        } catch (e) {
          await staff.store.releaseInvite(invite.id);
          throw e;
        }
      }
      if (existing && invite.delivery === "email") await staff.markEmailVerified(existing.id);
      if (!(await staff.store.completeInvite(invite, user.id)))
        throw apiError(409, "conflict", "the invite could not be completed; ask for a new one");
      const headers = await staff.signIn(invite.email, password);
      const actor: Actor = { kind: "human", id: actorIdForUser(user.id), name: user.name };
      await auditEvent(c.get("audit"), actor, "member.invite-accept", {
        inviteId: invite.id,
        role: invite.role,
        invitedBy: invite.inviterId,
        account: existing ? "existing" : "new",
      });
      const res = c.json({
        user: { id: user.id, actorId: actor.id, name: user.name, email: user.email },
        role: invite.role,
      });
      for (const cookie of headers.getSetCookie?.() ?? []) res.headers.append("set-cookie", cookie);
      return res;
    })
    .get("/", async (c) => {
      const { staff } = me(c);
      return c.json({ items: (await staff.store.listInvites()).map(inviteView) });
    })
    .post("/", async (c) => {
      const { person, actor, staff } = me(c);
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL.test(email) || email.length > 254) throw badRequest("a valid email is required");
      if (!isRole(body.role))
        throw badRequest("role must be administrator, editor, author or contributor");
      const role = body.role;
      const problem = inviteProblem(person.role, role);
      if (problem) throw rankError(problem);
      const hours =
        body.expiresInHours === undefined ? inviteDefaultHours(role) : body.expiresInHours;
      const expiry = inviteExpiryProblem(role, hours as number);
      if (typeof hours !== "number" || expiry)
        throw apiError(400, "invalid_expiry", expiry ?? "expiresInHours must be a number");
      const delivery = body.delivery ?? "link";
      if (delivery !== "link" && delivery !== "email")
        throw badRequest('delivery must be "link" or "email"');
      const mail = c.get("mail");
      if (delivery === "email" && !mail)
        throw apiError(
          400,
          "delivery_unavailable",
          "this server cannot send email; copy the link instead",
        );
      const existing = await staff.userByEmail(email);
      if (existing && (await staff.store.member(existing.id)))
        throw apiError(409, "already_member", "this person is already a member");
      if ((await staff.store.countPending()) >= MAX_PENDING_INVITES)
        throw apiError(
          409,
          "too_many_invites",
          `at most ${MAX_PENDING_INVITES} invites can be pending`,
        );
      const now = c.get("now")();
      const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
      if ((await staff.store.countCreatedSince(person.userId, hourAgo)) >= MAX_INVITES_PER_HOUR)
        throw apiError(429, "rate_limited", `at most ${MAX_INVITES_PER_HOUR} invites per hour`);
      const token = newToken(INVITE_TOKEN_PREFIX);
      const expiresAt = new Date(now.getTime() + hours * 3_600_000).toISOString();
      const invite = await staff.store.createInvite({
        email,
        role,
        inviterId: person.userId,
        expiresAt,
        delivery,
        tokenHash: await hashToken(token),
      });
      const url = `${studioOrigin(c, options.studioOrigin, options.trustedOrigins)}/invite#${token}`;
      if (delivery === "email" && mail)
        await mail.send({
          to: email,
          subject: `You are invited to ${await staff.store.deploymentName()}`,
          text: `${person.name ?? "Someone"} invited you to join as ${role}.\n\nAccept: ${url}\n\nThe link works once and expires ${expiresAt}.`,
        });
      await auditEvent(c.get("audit"), actor, "member.invite", {
        inviteId: invite.id,
        email,
        role,
        expiresAt,
        delivery,
      });
      return c.json({ invite: inviteView(invite), ...(delivery === "link" ? { url } : {}) }, 201);
    })
    .delete("/:id", async (c) => {
      const { person, actor, staff } = me(c);
      const invite = await staff.store.invite(param(c, "id"));
      if (!invite) throw notFound("invite not found");
      // Nobody revokes an invite for a role they could not invite (I12).
      if (!canInvite(person.role, invite.role)) throw rankError("role_too_high");
      if (!(await staff.store.cancelInvite(invite.id, person.userId)))
        throw apiError(409, "invite_not_pending", `this invite is ${invite.status}`);
      await auditEvent(c.get("audit"), actor, "member.invite-revoke", { inviteId: invite.id });
      return c.json({ invite: inviteView((await staff.store.invite(invite.id)) as InviteRow) });
    });
}
