import type { Auth } from "better-auth";
import { createAgentKeyService } from "./auth/agent-keys.ts";
import { authDeps } from "./auth/deps.ts";
import { createPrincipalResolver } from "./auth/principal.ts";
import { createStaffService } from "./auth/staff.ts";
import { type AuthOptions, type CloudhalAuth, signUpMode } from "./auth/types.ts";
import type { ActorResolver } from "./context.ts";

export { actorIdForUser, agentIdForKey, agentKeyStateFromSql } from "./auth/key-rows.ts";
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
  SETUP_TOKEN_HEADER,
  type StaffService,
  signUpMode,
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
  };
}
