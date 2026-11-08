/**
 * RFC-0044 Phase 2: what `authDeps` adds when the deployment runs the authorization server: the
 * issuer and resource, the access-token verifier `/mcp` uses (§5), and the provider-side cleanup
 * of a revoked connection (§2 "Revocation").
 */
import type { JWK } from "jose";
import type { StaffStore } from "../staff.ts";
import { createAccessTokenVerifier } from "./access-token.ts";
import type { GrantStore } from "./grants.ts";
import { oauthEndpoints } from "./oauth.ts";
import type { TokenPrincipalDeps } from "./token-principal.ts";
import type { AuthOptions } from "./types.ts";

interface AdapterWrites {
  deleteMany(input: { model: string; where: { field: string; value: unknown }[] }): Promise<number>;
  updateMany(input: {
    model: string;
    where: { field: string; value: unknown }[];
    update: Record<string, unknown>;
  }): Promise<number>;
}

export interface OauthDepsInput {
  readonly options: AuthOptions;
  readonly api: { getJwks(): Promise<{ keys: JWK[] }> };
  readonly context: () => Promise<{ adapter: AdapterWrites }>;
  readonly grants: GrantStore;
  readonly staffStore: StaffStore;
  readonly keyLimit: { readonly windowMs: number; readonly max: number };
  readonly now: () => Date;
}

export function oauthDeps(input: OauthDepsInput) {
  const { options, api, context, grants, staffStore, keyLimit, now } = input;
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
  /** The provider's consent and refresh tokens for (member, client). */
  const revokeProviderGrant = async (userId: string, clientId: string) => {
    if (!endpoints) return;
    const { adapter } = await context();
    const where = [
      { field: "clientId", value: clientId },
      { field: "userId", value: userId },
    ];
    await adapter.deleteMany({ model: "oauthConsent", where });
    await adapter.updateMany({ model: "oauthRefreshToken", where, update: { revoked: now() } });
  };
  return { endpoints, tokens, revokeProviderGrant };
}
