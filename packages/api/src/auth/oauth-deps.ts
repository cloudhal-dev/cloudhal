/**
 * RFC-0044 Phase 2: what `authDeps` adds when the deployment runs the authorization server: the
 * issuer and resource, the access-token verifier `/mcp` uses (§5), and the client-address header
 * the consent forward keeps.
 */
import type { JWK } from "jose";
import type { StaffStore } from "../staff.ts";
import { createAccessTokenVerifier } from "./access-token.ts";
import type { GrantStore } from "./grants.ts";
import { oauthEndpoints } from "./oauth.ts";
import type { TokenPrincipalDeps } from "./token-principal.ts";
import type { AuthOptions } from "./types.ts";

export interface OauthDepsInput {
  readonly options: AuthOptions;
  readonly api: { getJwks(): Promise<{ keys: JWK[] }> };
  readonly grants: GrantStore;
  readonly staffStore: StaffStore;
  readonly keyLimit: { readonly windowMs: number; readonly max: number };
  readonly now: () => Date;
}

export function oauthDeps(input: OauthDepsInput) {
  const { options, api, grants, staffStore, keyLimit, now } = input;
  const endpoints = options.mcpOauth ? oauthEndpoints(options.baseURL) : undefined;
  const tokens: TokenPrincipalDeps | undefined =
    endpoints && options.mcpOauth
      ? {
          verify: createAccessTokenVerifier({
            issuer: endpoints.issuer,
            audience: options.mcpOauth.resource,
            jwks: () => api.getJwks(),
            now,
          }),
          grants,
          staffStore,
          keyLimit,
          now,
        }
      : undefined;
  // The runtime's trusted client-address header (as `createInstance` reads it): the consent
  // forward carries it, so Better Auth's rate limit counts per client, not in one shared bucket.
  const addressHeader = options.workers ? "cf-connecting-ip" : options.clientAddressHeader;
  return { endpoints, tokens, addressHeader };
}
