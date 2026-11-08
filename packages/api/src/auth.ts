import type { Auth } from "better-auth";
import { createAgentGrantService } from "./auth/agent-grants.ts";
import { createAgentKeyService } from "./auth/agent-keys.ts";
import { authDeps } from "./auth/deps.ts";
import { createOauthClient } from "./auth/oauth-clients.ts";
import { createPrincipalResolver } from "./auth/principal.ts";
import { createStaffService } from "./auth/staff.ts";
import { type AuthOptions, type CloudhalAuth, signUpMode } from "./auth/types.ts";
import type { ActorResolver } from "./context.ts";

export {
  type AgentGrantService,
  type AgentGrantSummary,
  type ConsentInfo,
  type ConsentScope,
  consentScopes,
} from "./auth/agent-grants.ts";
export { agentIdForGrant } from "./auth/grants.ts";
export { actorIdForUser, agentIdForKey, agentKeyStateFromSql } from "./auth/key-rows.ts";
export {
  type McpOauthServerOptions,
  mcpOauthFor,
  OAUTH_SCOPES,
  oauthEndpoints,
} from "./auth/oauth.ts";
export {
  ADDABLE_KEY_SCOPES,
  AGENT_KEY_RATE_LIMIT,
  type AgentKeyService,
  type AgentKeySummary,
  API_KEY_HEADER,
  API_KEY_PERMISSION_RESOURCE,
  AuthError,
  type AuthOptions,
  type CloudhalAuth,
  type KeyNarrowing,
  NOT_A_MEMBER_MESSAGE,
  type OauthServer,
  SETUP_TOKEN_HEADER,
  type StaffService,
  signUpMode,
  type TrustedOriginsFn,
  trustedOriginsWithOwn,
} from "./auth/types.ts";

/**
 * Builds the Better Auth instance for Cloudhal (ADR-0010): email+password, organization and admin
 * plugins; tables come from storage migrations `0002_auth` and `0012_roles`.
 */
export function createAuth(options: AuthOptions): CloudhalAuth {
  const d = authDeps(options);
  const resolvePrincipal = createPrincipalResolver(d);
  const resolveActor: ActorResolver = async (c) => (await resolvePrincipal(c))?.actor;
  return {
    handler: (request) => d.instance.handler(request),
    resolveActor,
    resolvePrincipal,
    agentKeys: createAgentKeyService(d),
    staff: createStaffService(d),
    signUp: signUpMode(options),
    instance: d.instance as unknown as Auth,
    ...(d.endpoints && options.mcpOauth
      ? {
          oauth: {
            issuer: d.endpoints.issuer,
            resource: options.mcpOauth.resource,
            grants: createAgentGrantService(d),
            // RFC 8414: the server-only `getOAuthServerConfig` endpoint; `createApi` serves it.
            metadata: async () =>
              (await (
                d.instance.api as unknown as {
                  getOAuthServerConfig(): Promise<Record<string, unknown>>;
                }
              ).getOAuthServerConfig()) ?? {},
            createClient: (input) => createOauthClient(d, input),
          },
        }
      : {}),
  };
}
