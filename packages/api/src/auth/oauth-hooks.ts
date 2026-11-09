/**
 * RFC-0044 Phase 2: what Cloudhal checks before the provider's own endpoints run.
 *
 * - `/oauth2/authorize`: the provider skips its consent page when a stored consent covers the
 *   request. That memory must never outlive Cloudhal's grant: without a live `agent_grants` row
 *   for the member and client, or when the member's current role would give a requested scope
 *   that the grant does not hold (a promotion, then a step-up), the stored consent is deleted so
 *   the member sees Studio's consent screen again.
 * - `/oauth2/token`: no DPoP in v1 (ADR-0010), so a `DPoP` proof is refused instead of minting a
 *   sender-constrained token `/mcp` would not check; and a refresh token family ends 90 days after
 *   the member authenticated for it (§2 "90 d absolute"), however often it was rotated.
 */
import { holds, isKeyScope, narrow, roleScopes } from "@cloudhal/agent-runtime";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { StaffStore } from "../staff.ts";
import type { GrantStore } from "./grants.ts";
import { hashToken } from "./oauth.ts";

/** §2: a refresh token family's absolute lifetime, from the authentication it began with. */
export const REFRESH_FAMILY_MAX_MS = 90 * 24 * 60 * 60_000;

export interface OauthHookDeps {
  readonly grants: GrantStore;
  readonly staff: StaffStore;
  readonly now: () => Date;
}

type Where = { field: string; value: unknown }[];
interface HookContext {
  path?: string | undefined;
  query?: Record<string, unknown> | undefined;
  body?: Record<string, unknown> | undefined;
  headers?: Headers | undefined;
  context: {
    adapter: {
      findOne<T>(input: { model: string; where: Where }): Promise<T | null>;
      deleteMany(input: { model: string; where: Where }): Promise<number>;
    };
  };
}

/** Runs the checks for `ctx.path`; throws the OAuth error the provider would. */
export async function oauthBeforeHook(ctx: HookContext, d: OauthHookDeps): Promise<void> {
  if (ctx.path === "/oauth2/authorize") return forgetStaleConsent(ctx, d);
  if (ctx.path === "/oauth2/token") return checkTokenRequest(ctx, d);
}

/** True when the provider's stored consent may no longer stand in for Studio's screen. */
export async function consentIsStale(
  d: OauthHookDeps,
  input: { userId: string; clientId: string; requested: readonly string[] },
): Promise<boolean> {
  const grant = await d.grants.live(input.userId, input.clientId);
  if (!grant) return true;
  const member = await d.staff.member(input.userId);
  if (!member) return true;
  const held = roleScopes(member.role);
  return input.requested.filter(isKeyScope).some((scope) => {
    const given = narrow([scope], held)[0];
    return given !== undefined && !holds(grant.scopes, given);
  });
}

async function forgetStaleConsent(ctx: HookContext, d: OauthHookDeps): Promise<void> {
  const clientId = ctx.query?.client_id;
  if (typeof clientId !== "string" || !clientId) return;
  const session = await getSessionFromCtx(ctx as never).catch(() => null);
  if (!session) return;
  const scope = typeof ctx.query?.scope === "string" ? ctx.query.scope : "";
  const requested = scope.split(" ").filter(Boolean);
  if (!(await consentIsStale(d, { userId: session.user.id, clientId, requested }))) return;
  await ctx.context.adapter.deleteMany({
    model: "oauthConsent",
    where: [
      { field: "clientId", value: clientId },
      { field: "userId", value: session.user.id },
    ],
  });
}

async function checkTokenRequest(ctx: HookContext, d: OauthHookDeps): Promise<void> {
  if (ctx.headers?.get("dpop"))
    throw new APIError("BAD_REQUEST", {
      error: "invalid_dpop_proof",
      error_description: "DPoP is not supported by this server; use a bearer token",
    });
  const body = ctx.body ?? {};
  if (body.grant_type !== "refresh_token" || typeof body.refresh_token !== "string") return;
  const row = await ctx.context.adapter.findOne<{ authTime?: Date | string | number | null }>({
    model: "oauthRefreshToken",
    where: [{ field: "token", value: await hashToken(body.refresh_token) }],
  });
  const began = row?.authTime == null ? Number.NaN : new Date(row.authTime).getTime();
  if (!Number.isNaN(began) && d.now().getTime() - began > REFRESH_FAMILY_MAX_MS)
    throw new APIError("BAD_REQUEST", {
      error: "invalid_grant",
      error_description: "this connection is older than 90 days; authorize it again",
    });
}
