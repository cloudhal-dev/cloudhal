/**
 * RFC-0044 Phase 2: what Cloudhal checks before the provider's own endpoints run.
 *
 * - `/oauth2/authorize`: the provider skips its consent page when a stored consent covers the
 *   request. That memory must never outlive Cloudhal's grant: without a live `agent_grants` row
 *   for the member and client, or when the member's current role would give a requested scope
 *   that the grant does not hold (a promotion, then a step-up), the stored consent is deleted so
 *   the member sees Studio's consent screen again.
 *   The request's parameters are read from the query, or from the form body of a POST, as the
 *   provider reads them.
 * - `/oauth2/token`: no DPoP in v1 (ADR-0010), so a `DPoP` proof is refused (400) instead of
 *   minting a sender-constrained token `/mcp` would not check, or falling back to Bearer. A refresh
 *   token is refused when its family began before the live grant (a revoke, then a reconnect: the
 *   old family never mints tokens for the new grant) and 90 days after its family began (§2
 *   "90 d absolute"), however often it was rotated. A family is every refresh token of one
 *   authorization code (`authorizationCodeId`, kept through rotation); it begins with the first.
 */
import { holds, isKeyScope, narrow, roleScopes } from "@cloudhal/agent-runtime";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { StaffStore } from "../staff.ts";
import type { GrantStore } from "./grants.ts";
import { hashToken } from "./oauth.ts";

/** §2: a refresh token family's absolute lifetime, from its first refresh token. */
export const REFRESH_FAMILY_MAX_MS = 90 * 24 * 60 * 60_000;

export interface OauthHookDeps {
  readonly grants: GrantStore;
  readonly staff: StaffStore;
  readonly now: () => Date;
}

type Where = { field: string; value: unknown }[];
interface HookContext {
  path?: string | undefined;
  method?: string | undefined;
  query?: Record<string, unknown> | undefined;
  body?: Record<string, unknown> | undefined;
  headers?: Headers | undefined;
  context: {
    adapter: {
      findOne<T>(input: { model: string; where: Where }): Promise<T | null>;
      findMany<T>(input: {
        model: string;
        where: Where;
        limit?: number | undefined;
        sortBy?: { field: string; direction: "asc" | "desc" } | undefined;
      }): Promise<T[]>;
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
  const params = (ctx.method === "POST" ? ctx.body : ctx.query) ?? {};
  const clientId = params.client_id;
  if (typeof clientId !== "string" || !clientId) return;
  const session = await getSessionFromCtx(ctx as never).catch(() => null);
  if (!session) return;
  const scope = typeof params.scope === "string" ? params.scope : "";
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

interface RefreshRow {
  userId: string;
  clientId: string;
  authorizationCodeId?: string | null;
  createdAt: Date | string | number;
}

const refused = (description: string) =>
  new APIError("BAD_REQUEST", { error: "invalid_grant", error_description: description });

/** When a refresh token's family began: its chain's first `createdAt` (ms). */
async function familyStart(ctx: HookContext, row: RefreshRow): Promise<number> {
  if (!row.authorizationCodeId) return new Date(row.createdAt).getTime();
  const [first] = await ctx.context.adapter.findMany<RefreshRow>({
    model: "oauthRefreshToken",
    where: [{ field: "authorizationCodeId", value: row.authorizationCodeId }],
    sortBy: { field: "createdAt", direction: "asc" },
    limit: 1,
  });
  return new Date((first ?? row).createdAt).getTime();
}

async function checkTokenRequest(ctx: HookContext, d: OauthHookDeps): Promise<void> {
  if (ctx.headers?.get("dpop"))
    throw new APIError("BAD_REQUEST", {
      error: "invalid_dpop_proof",
      error_description: DPOP_REFUSED,
    });
  const body = ctx.body ?? {};
  if (body.grant_type !== "refresh_token" || typeof body.refresh_token !== "string") return;
  const row = await ctx.context.adapter.findOne<RefreshRow>({
    model: "oauthRefreshToken",
    where: [{ field: "token", value: await hashToken(body.refresh_token) }],
  });
  if (!row) return; // the provider answers an unknown token itself
  const began = await familyStart(ctx, row);
  const grant = await d.grants.live(row.userId, row.clientId);
  // Seconds: the provider stamps refresh rows at second resolution, the grant to the millisecond.
  if (!grant || began < Math.floor(Date.parse(grant.createdAt) / 1000) * 1000)
    throw refused("this connection was revoked; authorize it again");
  if (d.now().getTime() - began > REFRESH_FAMILY_MAX_MS)
    throw refused("this connection is older than 90 days; authorize it again");
}

/** The `error_description` of a refused DPoP proof: a 400, never a fallback to Bearer. */
export const DPOP_REFUSED = "DPoP is not supported by this server; use a bearer token";
