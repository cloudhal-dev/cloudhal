/**
 * `/api/password-reset` — redeeming an Administrator-issued one-time reset link (RFC-0005 open
 * question 6; issued by `POST /api/members/:userId/password-reset`). Public, JSON only (415), 10
 * per minute per IP (429); the token travels in the link's fragment and in POST bodies only.
 *
 * - `POST /inspect` {token} → `{name, email, expiresAt}`; 410 `reset_gone`
 * - `POST /complete` {token, password} → `{ok: true}`: sets the password, signs the person out
 *   everywhere; single use (guarded). 400 `weak_password`, 410 `reset_gone`
 */
import type { Actor } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import { actorIdForUser, type StaffService } from "../auth.ts";
import type { Env } from "../context.ts";
import { apiError, notFound } from "../errors.ts";
import { hashToken, isToken, jsonBody, limitPublic, RESET_TOKEN_PREFIX } from "../tokens.ts";
import { auditEvent } from "./members.ts";

function gone() {
  return apiError(
    410,
    "reset_gone",
    "This reset link was used or has expired. Ask an administrator for a new one.",
  );
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

export const passwordResetRoutes: Hono<Env> = new Hono<Env>()
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
    const actor: Actor = { kind: "human", id: actorIdForUser(member.userId), name: member.name };
    await auditEvent(c.get("audit"), actor, "member.password-reset-complete", {
      resetId: reset.id,
      userId: member.userId,
      issuedBy: reset.createdBy,
    });
    return c.json({ ok: true });
  });
