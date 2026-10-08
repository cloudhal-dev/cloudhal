import type { AuditLog, LoadedSkill, Principal } from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import type { SiteGraphStore, StoragePair } from "@cloudhal/core-ts";
import type { Context } from "hono";
import type { AgentKeyService } from "./auth.ts";

/** Resolves who is calling: a session cookie, an API key, … Returns undefined for anonymous. */
export type ActorResolver = (c: Context) => Promise<Actor | undefined>;
/** Like `ActorResolver` but with the caller's scopes (used by the MCP endpoint). */
export type PrincipalResolver = (c: Context) => Promise<Principal | undefined>;

export interface McpMountOptions {
  /** HMAC key (≥ 32 bytes) shared by every instance, so approval state round-trips. */
  readonly stateKey: Uint8Array | string;
  readonly audit?: AuditLog | undefined;
  readonly skills?: LoadedSkill[] | undefined;
  readonly previewBaseUrl?: string | undefined;
  readonly confirmTokenFallback?: boolean | undefined;
  readonly legacy?: "stateless" | "reject" | undefined;
  /** Same secret as `ApiDeps.preview`: lets `preview_page` return signed links to the deployed site. */
  readonly previewSecret?: string | undefined;
}

export interface ApiDeps {
  readonly store: SiteGraphStore;
  /** Auth is pluggable; when absent, every request is anonymous (tests, local scripts). */
  readonly resolveActor?: ActorResolver;
  /** When absent, principals derive from `resolveActor` with the actor kind's default scopes. */
  readonly resolvePrincipal?: PrincipalResolver;
  /** Mounts the MCP server at `/mcp` (ADR-0011). */
  readonly mcp?: McpMountOptions;
  /** Enables `/api/sites/:id/activity` (the agent/human audit trail). */
  readonly audit?: AuditLog;
  /** Enables `/api/sites/:id/preview-links` (signed links to drafts/snapshots on the deployed site). */
  readonly preview?: { readonly secret: string };
  /**
   * Mounts `/api/admin/*` (site bundle export/import for `cloudhal push`/`pull`) behind this
   * deployment token. Needs the raw storage the store was built on.
   */
  readonly admin?: { readonly deployToken: string; readonly storage: StoragePair };
  /** Reported by `/api/instance` (who may create accounts). */
  readonly signUp?: "first-user" | "closed" | "open";
  /** Mounts `/api/agent-keys` (create/list/delete API keys for agents). */
  readonly agentKeys?: AgentKeyService;
  /** Extra fetch handler mounted at `/api/auth/*` (Better Auth). */
  readonly authHandler?: (request: Request) => Promise<Response>;
  /** When true (default), mutating routes require an actor. */
  readonly requireAuth?: boolean;
}

export type Env = {
  Variables: {
    actor: Actor | undefined;
    /** Resolved once per request (API-key verification counts against the key's rate limit). */
    principal: Principal | undefined;
    store: SiteGraphStore;
    audit: AuditLog | undefined;
    previewSecret: string | undefined;
  };
};
