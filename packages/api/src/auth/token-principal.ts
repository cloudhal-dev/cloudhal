/**
 * RFC-0044 §5: an OAuth access token becomes the same `Principal` an agent key produces, so the
 * policy engine, the audit log, approvals, modes, elevations and `forSite` do not know which one
 * they got (invariant 5). The invariants, as tests cite them:
 *
 * 1. Never more than a key of the same member would hold: key scopes only, capped by the grant
 *    (narrowed at consent) and narrowed again to the member's current role on every call.
 * 2. No membership, no principal (401 with the challenge), whatever the token says.
 * 3. `aud` must be this deployment's `/mcp` resource and `iss` its issuer (`access-token.ts`).
 * 4. A revoked grant refuses the token at its next call; a removed member refuses every grant.
 * 6. A token never sets `local`.
 */
import {
  clampMode,
  isMoreAutonomous,
  modeCap,
  narrow,
  type Principal,
  roleScopes,
} from "@cloudhal/agent-runtime";
import { HTTPException } from "hono/http-exception";
import type { StaffStore } from "../staff.ts";
import type { AccessTokenVerifier } from "./access-token.ts";
import { agentIdForGrant, type GrantStore, grantElevation } from "./grants.ts";
import { personRef } from "./key-rows.ts";

export interface TokenPrincipalDeps {
  readonly verify: AccessTokenVerifier;
  readonly grants: GrantStore;
  readonly staffStore: StaffStore;
  readonly keyLimit: { readonly windowMs: number; readonly max: number };
  readonly now: () => Date;
}

/**
 * The principal of a bearer access token, or `undefined` (→ 401 `invalid_token`); always
 * `undefined` on a deployment without the authorization server (`d` absent).
 */
export async function tokenPrincipal(
  d: TokenPrincipalDeps | undefined,
  token: string,
): Promise<Principal | undefined> {
  if (!d) return undefined;
  const claims = await d.verify(token);
  if (!claims) return undefined;
  const grant = await d.grants.live(claims.sub, claims.clientId);
  // inv. 4: revoked, consent never went through Studio, or the token belongs to an earlier
  // grant of the same member and client (revoked, then connected again).
  if (!grant || grant.id !== claims.grantId) return undefined;
  // The same fixed window as a key (`rate_limits`), per connection.
  if (!(await d.staffStore.hit(`cloudhal:grant:${grant.id}`, d.keyLimit.windowMs, d.keyLimit.max)))
    throw new HTTPException(429, {
      res: Response.json(
        {
          error: "rate_limited",
          message: `this connection made more than ${d.keyLimit.max} requests in ${Math.round(d.keyLimit.windowMs / 1000)} s; wait and try again`,
        },
        { status: 429, headers: { "retry-after": String(Math.ceil(d.keyLimit.windowMs / 1000)) } },
      ),
    });
  const member = await d.staffStore.member(claims.sub);
  if (!member) return undefined; // inv. 2
  // inv. 1: what the token says, capped by the grant (`narrow` keeps a grant's `:own` variant),
  // then by the member's role now.
  const keyScopes = narrow(claims.scopes, grant.scopes);
  const scopes = narrow(keyScopes, roleScopes(member.role));
  const cap = modeCap(member.role);
  const base = clampMode(grant.mode, cap);
  const raw = grantElevation(grant, d.now());
  const elevation = raw && !isMoreAutonomous(raw.mode, cap) ? raw : undefined;
  await d.grants.touch(grant);
  return {
    actor: { kind: "agent", id: agentIdForGrant(grant.id), name: grant.clientName },
    scopes,
    mode: elevation?.mode ?? base,
    ...(elevation ? { elevation: { from: base, until: elevation.until } } : {}),
    grantId: grant.id,
    // RFC-0034 A2: `forSite` narrows these per site, as for keys.
    keyScopes,
    person: personRef(member),
  };
}
