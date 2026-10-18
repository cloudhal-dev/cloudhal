/**
 * `/api/members` — the deployment's staff (RFC-0005 §3, §10.1). Membership changes only through
 * these audited routes (I3); every row has `site_id = NULL` and a structured `input` (I14).
 *
 * - `GET    /` → `{items: MemberView[]}`; `email` only with `members:manage`
 * - `PATCH  /:userId` {role} → `{member, keysNarrowed}` (`members:manage` + rank rule); the
 *   person's keys are narrowed to the new role in the same request (§5.3, `agent-key.narrow`)
 * - `DELETE /:userId` → `{userId, role, keysDisabled, invitesCanceled, requestsDenied}`: deletes the
 *   membership, revokes sessions, disables keys, cancels their invites, denies their agents'
 *   pending requests (I13)
 * - `POST   /transfer-ownership` {userId, password} → `{from, to}` (Owner; target must be an
 *   Administrator; password re-entered; one guarded batch)
 * - `POST   /:userId/password-reset` → `{url, expiresAt}`: a one-time reset link (`chrst_…`, 1 h,
 *   open question 6), same rank rule as removal
 *
 * Errors: 403 `rank` (details.problem: self | owner_role | target_is_owner | role_too_high |
 * not_allowed), 404 `not_found`, 409 `conflict` (the member changed meanwhile), 409
 * `not_administrator` (transfer target), 403 `wrong_password`, 400 `bad_request`.
 */
import {
  type AuditLog,
  describeRankProblem,
  holds,
  isRole,
  type PersonRef,
  type RankProblem,
  removalProblem,
  roleChangeProblem,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import { actorIdForUser, type KeyNarrowing, type StaffService } from "../auth.ts";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound, unauthorized } from "../errors.ts";
import { param } from "../params.ts";
import type { MemberRow } from "../staff.ts";
import { hashToken, newToken, RESET_TOKEN_PREFIX, studioOrigin } from "../tokens.ts";
import { memberSiteRoutes, visibleMembers } from "./member-sites.ts";

export interface MemberView {
  userId: string;
  /** The actor id (`user_…`) entries, snapshots and activity use. */
  actorId: string;
  name: string;
  role: MemberRow["role"];
  joinedAt: string;
  /** Administrators and the Owner only (`members:manage`). */
  email?: string;
  /** RFC-0034 A2: the sites this member is limited to (absent: every site). */
  sites?: MemberRow["sites"];
}

/** Who decides when the server does (removal denies pending requests). */
export const MEMBERS_SYSTEM_ACTOR: Actor = {
  kind: "system",
  id: "sys_members0001",
  name: "Cloudhal",
};

/** How long an administrator-issued password reset link lasts. */
export const RESET_LINK_MINUTES = 60;

export function memberView(m: MemberRow, withEmail: boolean): MemberView {
  return {
    userId: m.userId,
    actorId: actorIdForUser(m.userId),
    name: m.name,
    role: m.role,
    joinedAt: m.joinedAt,
    ...(withEmail ? { email: m.email } : {}),
    ...(m.sites ? { sites: m.sites } : {}),
  };
}

export function rankError(problem: RankProblem) {
  return apiError(403, "rank", describeRankProblem(problem), { problem });
}

/** The signed-in person (the route guard has checked membership). */
export function me(c: Context<Env>): { person: PersonRef; actor: Actor; staff: StaffService } {
  const principal = c.get("principal");
  const staff = c.get("staff");
  if (!principal?.person || !staff) throw unauthorized();
  return { person: principal.person, actor: principal.actor, staff };
}

/** Records a deployment event (no site) with structured input. */
export async function auditEvent(
  audit: AuditLog | undefined,
  actor: Actor,
  tool: string,
  input: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  await audit?.record({
    at: new Date().toISOString(),
    actor,
    tool,
    decision: "allow",
    outcome: "ok",
    input,
    ...(reason ? { reason } : {}),
  });
}

async function auditNarrowing(
  c: Context<Env>,
  actor: Actor,
  userId: string,
  narrowed: KeyNarrowing[],
): Promise<void> {
  for (const n of narrowed)
    await auditEvent(c.get("audit"), actor, "agent-key.narrow", {
      userId,
      keyId: n.keyId,
      scopes: n.scopes,
      mode: n.mode,
      elevationEnded: n.elevationEnded,
    });
}

export function memberRoutes(options: {
  studioOrigin?: string | undefined;
  trustedOrigins: ReadonlySet<string>;
}): Hono<Env> {
  return new Hono<Env>()
    .route("/", memberSiteRoutes())
    .get("/", async (c) => {
      const { person, staff } = me(c);
      const withEmail = holds(c.get("principal")?.scopes ?? [], "members:manage");
      const items = visibleMembers(person, await staff.store.list()).map((m) =>
        memberView(m, withEmail),
      );
      return c.json({ items });
    })
    .post("/transfer-ownership", async (c) => {
      const { person, actor, staff } = me(c);
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
        userId?: unknown;
        password?: unknown;
      };
      if (typeof body.userId !== "string" || !body.userId) throw badRequest("userId is required");
      if (typeof body.password !== "string" || !body.password)
        throw badRequest("password is required");
      const target = await staff.store.member(body.userId);
      if (!target) throw notFound("member not found");
      if (target.userId === person.userId) throw rankError("self");
      if (target.role !== "administrator")
        throw apiError(
          409,
          "not_administrator",
          "ownership goes to an Administrator; make them one first",
        );
      if (!(await staff.verifyPassword(person.userId, body.password)))
        throw apiError(403, "wrong_password", "the password is not correct");
      if (!(await staff.store.transfer(person.userId, target.userId)))
        throw apiError(409, "conflict", "the members changed meanwhile; reload and try again");
      // The former Owner is an Administrator now: their keys narrow like any demotion.
      await auditNarrowing(
        c,
        actor,
        person.userId,
        await staff.narrowKeys(person.userId, "administrator"),
      );
      await auditEvent(
        c.get("audit"),
        actor,
        "member.transfer-ownership",
        { from: person.userId, to: target.userId },
        `${person.name ?? person.userId} → ${target.name}`,
      );
      return c.json({ from: person.userId, to: target.userId });
    })
    .patch("/:userId", async (c) => {
      const { person, actor, staff } = me(c);
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { role?: unknown };
      if (!isRole(body.role))
        throw badRequest("role must be administrator, editor, author or contributor");
      const target = await staff.store.member(param(c, "userId"));
      if (!target) throw notFound("member not found");
      const problem = roleChangeProblem(person, target, body.role);
      if (problem) throw rankError(problem);
      if (target.role === body.role)
        return c.json({ member: memberView(target, true), keysNarrowed: [] });
      if (!(await staff.store.setRole(target.userId, target.role, body.role)))
        throw apiError(409, "conflict", "the member changed meanwhile; reload and try again");
      // Persist the narrowing now; resolvePrincipal already narrows on the next call (§5.3).
      const narrowed = await staff.narrowKeys(target.userId, body.role);
      await auditEvent(
        c.get("audit"),
        actor,
        "member.role",
        { userId: target.userId, from: target.role, to: body.role },
        `${target.name}: ${target.role} → ${body.role}`,
      );
      await auditNarrowing(c, actor, target.userId, narrowed);
      const updated = (await staff.store.member(target.userId)) as MemberRow;
      return c.json({ member: memberView(updated, true), keysNarrowed: narrowed });
    })
    .delete("/:userId", async (c) => {
      const { person, actor, staff } = me(c);
      const target = await staff.store.member(param(c, "userId"));
      if (!target) throw notFound("member not found");
      const problem = removalProblem(person, target);
      if (problem) throw rankError(problem);
      // 1. membership (effective at once: roles are read per request)
      if (!(await staff.store.remove(target.userId)))
        throw apiError(409, "conflict", "the member changed meanwhile; reload and try again");
      // 2. sessions, 3. keys, 4. their pending invites, 5. their agents' pending requests
      await staff.revokeSessions(target.userId);
      const keysDisabled = await staff.store.disableKeysOf(target.userId);
      const invitesCanceled = await staff.store.cancelInvitesBy(target.userId, person.userId);
      const agents = await staff.store.agentsOf(target.userId);
      const requestsDenied =
        (await c
          .get("approvals")
          ?.denyPending(
            [...agents, actorIdForUser(target.userId)],
            MEMBERS_SYSTEM_ACTOR,
            "member removed",
          )) ?? 0;
      const result = {
        userId: target.userId,
        role: target.role,
        keysDisabled,
        invitesCanceled,
        requestsDenied,
      };
      await auditEvent(c.get("audit"), actor, "member.remove", result, `${target.name} removed`);
      return c.json(result);
    })
    .post("/:userId/password-reset", async (c) => {
      const { person, actor, staff } = me(c);
      const target = await staff.store.member(param(c, "userId"));
      if (!target) throw notFound("member not found");
      const problem = removalProblem(person, target);
      if (problem) throw rankError(problem);
      const token = newToken(RESET_TOKEN_PREFIX);
      const expiresAt = new Date(
        c.get("now")().getTime() + RESET_LINK_MINUTES * 60_000,
      ).toISOString();
      const reset = await staff.store.createReset({
        userId: target.userId,
        createdBy: person.userId,
        expiresAt,
        tokenHash: await hashToken(token),
      });
      await auditEvent(c.get("audit"), actor, "member.password-reset", {
        resetId: reset.id,
        userId: target.userId,
        expiresAt,
      });
      const origin = studioOrigin(c, options.studioOrigin, options.trustedOrigins);
      return c.json({ url: `${origin}/reset-password#${token}`, expiresAt }, 201);
    });
}
