/**
 * `/api/password-reset` — one-time reset links (RFC-0005 open question 6; RFC-0011). An
 * Administrator issues one with `POST /api/members/:userId/password-reset`; with a mail sender, a
 * member can also ask for one by email. Public, JSON only (415), 10 per minute per IP (429); the
 * token travels in the link's fragment and in POST bodies only.
 *
 * - `POST /request` {email} → 202 `{ok: true}`, always: whether or not the address belongs to a
 *   member, the lookup and the mail run after the response. At most 3 mails per address per hour.
 *   404 `email_unavailable` without a sender; 400 for something that is not an address.
 * - `POST /inspect` {token} → `{name, email, expiresAt}`; 410 `reset_gone`
 * - `POST /complete` {token, password} → `{ok: true}`: sets the password, signs the person out
 *   everywhere; single use (guarded). A link the member asked for by email also marks the address
 *   verified; with a sender, the member is told by email. 400 `weak_password`, 410 `reset_gone`
 */

import type { AuditLog } from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import { actorIdForUser, type StaffService } from "../auth.ts";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { MailError, type MailSender } from "../mail.ts";
import { passwordChangedMail, resetMail } from "../mail-messages.ts";
import {
  hashToken,
  isToken,
  jsonBody,
  limitPublic,
  newToken,
  RESET_TOKEN_PREFIX,
  studioOrigin,
} from "../tokens.ts";
import { EMAIL } from "./invites.ts";
import { auditEvent, RESET_LINK_MINUTES } from "./members.ts";

/** RFC-0011: reset mails one address can receive per hour, whoever asks. */
export const RESET_MAILS_PER_HOUR = 3;

function gone() {
  return apiError(410, "reset_gone", "This reset link was used or has expired. Ask for a new one.");
}

function staffOf(c: Context<Env>): StaffService {
  const staff = c.get("staff");
  if (!staff) throw notFound("password resets are not enabled on this server");
  return staff;
}

async function usable(staff: StaffService, token: unknown) {
  if (!isToken(RESET_TOKEN_PREFIX, token)) throw gone();
  const hash = await hashToken(token);
  const reset = await staff.store.resetByHash(hash);
  if (!reset) throw gone();
  const member = await staff.store.member(reset.userId);
  // A link for someone who is no longer a member is dead.
  if (!member) throw gone();
  return { hash, reset, member };
}

/** Logs a failed mail by its code only: a body carries a one-time link. */
function logFailure(what: string) {
  return (e: unknown) => console.warn(`cloudhal: ${what} failed (${MailError.from(e).code})`);
}

/** The deferred half of `/request`: nothing in it changes the answer the caller got. */
async function mailResetLink(input: {
  staff: StaffService;
  mail: MailSender;
  audit: AuditLog | undefined;
  email: string;
  origin: string;
  now: Date;
}): Promise<void> {
  const { staff, email } = input;
  const perAddress = `cloudhal:reset-mail:${await hashToken(email)}`;
  if (!(await staff.store.hit(perAddress, 3_600_000, RESET_MAILS_PER_HOUR))) return;
  const user = await staff.userByEmail(email);
  const member = user ? await staff.store.member(user.id) : undefined;
  if (!member) return;
  const token = newToken(RESET_TOKEN_PREFIX);
  const expiresAt = new Date(input.now.getTime() + RESET_LINK_MINUTES * 60_000).toISOString();
  const reset = await staff.store.createReset({
    userId: member.userId,
    createdBy: member.userId,
    expiresAt,
    tokenHash: await hashToken(token),
  });
  await input.mail.send(
    resetMail({
      to: member.email,
      deployment: await staff.store.deploymentName(),
      name: member.name,
      url: `${input.origin}/reset-password#${token}`,
      expiresAt,
    }),
  );
  const actor: Actor = { kind: "human", id: actorIdForUser(member.userId), name: member.name };
  await auditEvent(input.audit, actor, "member.password-reset", {
    resetId: reset.id,
    userId: member.userId,
    expiresAt,
    via: "email",
  });
}

export function passwordResetRoutes(options: {
  studioOrigin?: string | undefined;
  trustedOrigins: ReadonlySet<string>;
}): Hono<Env> {
  return new Hono<Env>()
    .post("/request", async (c) => {
      const staff = staffOf(c);
      const mail = c.get("mail");
      if (!mail)
        throw apiError(
          404,
          "email_unavailable",
          "this server cannot send email; ask an administrator for a reset link",
        );
      await limitPublic(c, "reset-request");
      const raw = (await jsonBody(c)).email;
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (!EMAIL.test(email) || email.length > 254) throw badRequest("a valid email is required");
      c.get("defer")(
        mailResetLink({
          staff,
          mail,
          audit: c.get("audit"),
          email,
          origin: studioOrigin(c, options.studioOrigin, options.trustedOrigins),
          now: c.get("now")(),
        }).catch(logFailure("password reset mail")),
      );
      return c.json({ ok: true }, 202);
    })
    .post("/inspect", async (c) => {
      const staff = staffOf(c);
      await limitPublic(c, "reset");
      const { reset, member } = await usable(staff, (await jsonBody(c)).token);
      return c.json({ name: member.name, email: member.email, expiresAt: reset.expiresAt });
    })
    .post("/complete", async (c) => {
      const staff = staffOf(c);
      await limitPublic(c, "reset");
      const body = await jsonBody(c);
      const { hash, reset, member } = await usable(staff, body.token);
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
      if (!(await staff.store.claimReset(hash))) throw gone();
      await staff.setPassword(member.userId, password);
      await staff.revokeSessions(member.userId);
      // Only a member can ask for their own link (an Administrator never resets themself), and it
      // went to their address: opening it proves the address.
      const viaEmail = reset.createdBy === member.userId;
      if (viaEmail) await staff.markEmailVerified(member.userId);
      const actor: Actor = { kind: "human", id: actorIdForUser(member.userId), name: member.name };
      await auditEvent(c.get("audit"), actor, "member.password-reset-complete", {
        resetId: reset.id,
        userId: member.userId,
        issuedBy: reset.createdBy,
        ...(viaEmail ? { via: "email" } : {}),
      });
      const mail = c.get("mail");
      if (mail)
        c.get("defer")(
          staff.store
            .deploymentName()
            .then((deployment) =>
              mail.send(
                passwordChangedMail({
                  to: member.email,
                  deployment,
                  name: member.name,
                  at: c.get("now")().toISOString(),
                }),
              ),
            )
            .catch(logFailure("password changed notice")),
        );
      return c.json({ ok: true });
    });
}
