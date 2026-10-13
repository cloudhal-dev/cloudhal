import type {
  ApprovalStore,
  AuditLog,
  LoadedSkill,
  OwnershipResolver,
  PolicyEngine,
  Principal,
} from "@cloudhal/agent-runtime";
import type { AnalyticsService } from "@cloudhal/analytics/service";
import type { Actor } from "@cloudhal/core-contracts";
import type { SiteGraphStore, StoragePair } from "@cloudhal/core-ts";
import type { SchedulerControl } from "@cloudhal/core-ts/releases";
import type { CommentsDeps } from "@cloudhal/mcp-server/comments";
import type { SchedulesDeps } from "@cloudhal/mcp-server/schedules";
import type { MediaToolOptions } from "@cloudhal/mcp-server/tools";
import type { Context } from "hono";
import type { AgentKeyService, StaffService } from "./auth.ts";
import type { MailSender } from "./mail.ts";
import type { UploadSecret } from "./uploads.ts";

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
  /** Out-of-band approvals for agents' gated calls; also mounts `/api/sites/:id/approvals`. */
  readonly approvals?: ApprovalStore | undefined;
  readonly legacy?: "stateless" | "reject" | undefined;
  /** Same secret as `ApiDeps.preview`: lets `preview_page` return signed links to the deployed site. */
  readonly previewSecret?: string | undefined;
  /** Media settings for the asset tools (fetch transport, host lists; RFC-0004). */
  readonly media?: MediaToolOptions | undefined;
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
  /**
   * Extra origins (besides this server's own) allowed to make cookie-authenticated, state-changing
   * requests, e.g. the Studio dev server. Same-origin requests are always allowed.
   */
  readonly trustedOrigins?: readonly string[];
  /** Only answer requests whose Host is one of these (e.g. localhost when auth is off). */
  readonly allowedHosts?: readonly string[];
  /** When true (default), mutating routes require an actor. */
  readonly requireAuth?: boolean;
  /** Clock for time-based answers such as `/api/notifications` (tests). */
  readonly now?: () => Date;
  /**
   * Staff roles and invites (RFC-0005), from `createAuth(...).staff`. When present, a person's
   * scopes come from their membership role and `/api/members`, `/api/invites` and
   * `/api/password-reset` are mounted; when absent (auth-less servers, tests) every person is `*`.
   */
  readonly staff?: StaffService;
  /** Optional email delivery: invites (RFC-0005 §7.2) and reset links (RFC-0011). */
  readonly mail?: MailSender;
  /**
   * Runs work after the response (Workers: `ctx.waitUntil`). Default: started, not awaited. The
   * email reset request sends this way, so its answer takes as long for members as for anyone.
   */
  readonly defer?: (task: Promise<unknown>) => void;
  /** Origin of the Studio that serves `/invite` and `/reset-password` (default: the request's). */
  readonly studioOrigin?: string;
  /**
   * Site analytics (RFC-0006): mounts `/api/sites/:id/analytics/*`, the deploy-token rollup routes
   * and the MCP analytics tools, and fills `/api/instance` → `features.analytics`.
   */
  readonly analytics?: AnalyticsService;
  /**
   * Reader comments (RFC-0007): mounts `/api/sites/:id/comments/*`, comment threads, commenters
   * and bans, the MCP comment tools, the comment notifications and `features.comments`.
   */
  readonly comments?: CommentsDeps;
  /**
   * Schedules (RFC-0008): mounts the schedule routes (`/api/sites/:id/schedule`, releases, gates,
   * automations, runs, settings) and `/api/scheduler`, the MCP schedule tools and automation runs,
   * the schedule notifications and `features.schedules`. Releases go through core-ts's
   * `ReleaseService` ("Publish now" purges with `schedules.purge`); `scheduler` below is its ticker
   * unless `schedules.scheduler` names another.
   */
  readonly schedules?: SchedulesDeps;
  /**
   * The scheduler (RFC-0008 §8): its mode and a poke that wakes it earlier (alarm and Node
   * tickers), and a tick on demand for `cloudhal schedules run-due --remote`. The release routes
   * and tools (rollout steps 7–8) read it as `c.get("scheduler")`.
   */
  readonly scheduler?: SchedulerControl;
}

export type Env = {
  Variables: {
    actor: Actor | undefined;
    /** Resolved once per request (API-key verification counts against the key's rate limit). */
    principal: Principal | undefined;
    store: SiteGraphStore;
    audit: AuditLog | undefined;
    previewSecret: string | undefined;
    approvals: ApprovalStore | undefined;
    /** Grants an agent's elevation request when a person approves it (ADR-0016). */
    agentKeys: AgentKeyService | undefined;
    /** Membership (RFC-0005); undefined without a membership source. */
    staff: StaffService | undefined;
    /** Who owns what (the person behind an agent). */
    ownership: OwnershipResolver;
    /** The MCP tools' policies, for "could the approver make this call?" (RFC-0005 §6). */
    policy: () => PolicyEngine;
    mail: MailSender | undefined;
    defer: (task: Promise<unknown>) => void;
    now: () => Date;
    /** Signs upload tickets (RFC-0004 §5.5): the preview secret, the MCP state key, or random. */
    uploadSecret: UploadSecret;
    /** Site analytics (RFC-0006); undefined on servers without it. */
    analytics: AnalyticsService | undefined;
    /** Reader comments (RFC-0007); undefined on servers without them. */
    comments: CommentsDeps | undefined;
    /** Schedules (RFC-0008); undefined on servers without them. */
    schedules: SchedulesDeps | undefined;
    /** The scheduler (RFC-0008); undefined on servers without one. */
    scheduler: SchedulerControl | undefined;
  };
};
