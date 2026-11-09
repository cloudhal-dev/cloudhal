import type {
  AgentMode,
  ModeElevation,
  OwnershipResolver,
  Role,
  Scope,
} from "@cloudhal/agent-runtime";
import type { SqlDriver } from "@cloudhal/storage";
import type { Auth } from "better-auth";
import type { ActorResolver, PrincipalResolver } from "../context.ts";
import type { StaffStore } from "../staff.ts";
import type { AgentGrantService } from "./agent-grants.ts";
import type { AuthLog, McpOauthServerOptions } from "./oauth.ts";

export interface AuthOptions {
  /** better-sqlite3 `Database`, `node:sqlite` `DatabaseSync`, or a Cloudflare `D1Database` binding. */
  readonly database: unknown;
  /**
   * The same database as a Cloudhal `SqlDriver` (membership, invites and guarded batches; RFC-0005).
   * Required: without it every signed-in person would hold `*`.
   */
  readonly sql: SqlDriver;
  /** Browser-facing origin of the API, e.g. http://localhost:8787 or https://studio.example.com */
  readonly baseURL: string;
  readonly secret: string;
  /**
   * Origins browsers may make cookie-bearing requests from, besides `baseURL`'s. A function is
   * asked per request (and once at start-up, without one): `trustedOriginsWithOwn` adds the origin
   * the request was made to, for a Studio reached at whatever address the browser used (#165).
   */
  readonly trustedOrigins?: readonly string[] | TrustedOriginsFn;
  /**
   * The request header that carries the client's address, for Better Auth's rate limits and the
   * `ipAddress` of sessions. On Node it is `CLIENT_ADDRESS_HEADER` (`@cloudhal/api/node`), which
   * `serveNode` writes from the socket or the trusted proxy's last hop; with `workers` it is
   * `cf-connecting-ip`. Unset, Better Auth reads `X-Forwarded-For`, which any client can send.
   */
  readonly clientAddressHeader?: string | undefined;
  /**
   * `"always"` runs Better Auth's Origin check under `NODE_ENV=test` too, where Better Auth skips
   * it by default; for tests of the check itself.
   */
  readonly originCheck?: "always" | undefined;
  /**
   * Who may create an account with email + password:
   * - `first-user` (default): only while no user exists — the first account is the Owner, then
   *   sign-up closes; everyone else joins through an invite (RFC-0005 §7).
   * - `closed`: nobody (accounts come from invites only).
   * - `open`: anybody (local development, demos); new accounts join as Contributors.
   */
  readonly signUp?: "first-user" | "closed" | "open";
  /**
   * With `first-user`: the first account must present this token (header `x-cloudhal-setup-token`),
   * so whoever finds a fresh deployment's Studio first cannot claim it. `cloudhal deploy` prints a
   * one-time setup link. Ignored once an owner exists.
   */
  readonly setupToken?: string | undefined;
  /** @deprecated use `signUp: "closed"`. */
  readonly disableSignUp?: boolean;
  /**
   * Cloudflare Workers settings: the client IP header (`cf-connecting-ip`), `waitUntil` for
   * background work, and D1-backed rate limiting (the in-memory limiter is per isolate there).
   */
  readonly workers?: {
    readonly waitUntil?: (promise: Promise<unknown>) => void;
  };
  /** Clock for time-boxed elevations and invites (tests). */
  readonly now?: () => Date;
  /**
   * RFC-0044 Phase 2: run the OAuth 2.1 authorization server for remote MCP clients. Its issuer is
   * `baseURL`'s origin plus `/api/auth`, so `baseURL` must be the stable public origin (on Node,
   * `cloudhal studio --base-url`); `resource` is the `/mcp` URL tokens are bound to. Unset, the
   * deployment has no authorization server and `/mcp` takes keys and sessions only.
   */
  readonly mcpOauth?: McpOauthServerOptions | undefined;
  /** Where Better Auth's log lines go (default: the console, errors and warnings only). */
  readonly log?: AuthLog | undefined;
  /** Requests one API key may make per window (default 600 per minute); see `resolvePrincipal`. */
  readonly agentKeyRateLimit?: { readonly windowMs: number; readonly max: number };
}

/** The default per-key request budget: generous for an agent session, a brake on a runaway loop. */
export const AGENT_KEY_RATE_LIMIT = { windowMs: 60_000, max: 600 } as const;

/** Better Auth's dynamic `trustedOrigins`: the list for one request (none at start-up). */
export type TrustedOriginsFn = (request: Request | undefined) => string[] | Promise<string[]>;

/**
 * Trusted origins that also accept the origin a request was made to (its scheme and `Host`;
 * behind a trusted proxy the forwarded ones), as the API's own CSRF check does. A Studio served
 * without a public origin (`cloudhal studio --host 0.0.0.0` and no `--base-url`) is then reachable
 * at whatever address the browser used instead of refusing every sign-in with `INVALID_ORIGIN`
 * (#165). A page on another origin still fails: browsers never let it choose the `Host`. With
 * `loopbackOnly` the request's origin counts only when its host is `localhost` or a literal loopback
 * address such as `127.0.0.1` or `[::1]` (a server listening on loopback; a DNS name rebound to it
 * is not trusted).
 */
export function trustedOriginsWithOwn(
  origins: readonly string[],
  options: { readonly loopbackOnly?: boolean } = {},
): TrustedOriginsFn {
  return (request) => {
    const own = request ? originOf(request.url) : undefined;
    const counts = own !== undefined && (!options.loopbackOnly || isLoopbackOrigin(own));
    return counts ? [...origins, own] : [...origins];
  };
}

/** `localhost` or a literal loopback address (127.0.0.0/8, `[::1]`, `[::ffff:7f00:1]`); never a DNS name. */
function isLoopbackOrigin(origin: string): boolean {
  const host = new URL(origin).hostname;
  return (
    host === "localhost" ||
    host === "[::1]" ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host) ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export interface CloudhalAuth {
  readonly handler: (request: Request) => Promise<Response>;
  readonly resolveActor: ActorResolver;
  /**
   * Actor + scopes (RFC-0005 I1): a person's scopes come from their membership role, read on every
   * request; an API key's are narrowed to its creator's current role.
   */
  readonly resolvePrincipal: PrincipalResolver;
  /** The effective sign-up policy (`AuthOptions.signUp`). */
  readonly signUp: "first-user" | "closed" | "open";
  /** Agent credentials (API keys) owned by the signed-in person. */
  readonly agentKeys: AgentKeyService;
  /** Members, invites and password resets (RFC-0005). */
  readonly staff: StaffService;
  /** The underlying Better Auth instance (server API: `auth.api.*`). */
  readonly instance: Auth;
  /**
   * RFC-0044 Phase 2, with `AuthOptions.mcpOauth`: the authorization server. Pass it to
   * `createApi` as `oauthServer` and its `issuer`/`resource` as `mcp.oauth`.
   */
  readonly oauth?: OauthServer | undefined;
}

/** What `createApi` needs of the authorization server (RFC-0044 §2, §4). */
export interface OauthServer {
  readonly issuer: string;
  readonly resource: string;
  readonly grants: AgentGrantService;
  /** The RFC 8414 authorization server metadata document. */
  readonly metadata: () => Promise<Record<string, unknown>>;
  /** RFC-0044 §3: which ways clients may register here (Studio's setup notes, §11). */
  readonly registration: { readonly cimd: boolean; readonly dcr: boolean };
  /**
   * RFC-0044 §3, with DCR on: registers a public client for an anonymous caller (the body as sent,
   * the caller's address for the rate limit); throws `RegistrationError`. Absent with DCR off.
   */
  readonly register?:
    | ((input: {
        readonly text: string;
        readonly address: string;
      }) => Promise<Record<string, unknown>>)
    | undefined;
}

export interface AgentKeySummary {
  id: string;
  name: string | null;
  /** First characters of the key, for recognition. */
  start: string | null;
  /** The scopes stored on the key. */
  scopes: Scope[];
  /** What the key can do right now: its scopes narrowed to its creator's current role (I5). */
  effectiveScopes: Scope[];
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
  /** The key's own mode: how independently the agent works (ADR-0015). */
  mode: AgentMode;
  /** A time-boxed elevation in force right now (ADR-0016); absent when none or expired. */
  elevation?: ModeElevation;
  /** The mode the agent's next call runs in: the elevation's while it lasts, else `mode`. */
  effectiveMode: AgentMode;
  /** The agent actor id its calls are recorded under. */
  agentId: string;
  /** Who created the key (listed with `all`, for Administrators). */
  owner?: { userId: string; name: string | null; role: Role | null };
  /** RFC-0008 §11.2: the automation this key belongs to (it works only inside its runs). */
  automationId?: string;
}

export interface AgentKeyService {
  /**
   * Mints a key for the caller; the plain key is returned exactly once. `scopes` defaults to what
   * the mode needs (`scopesForMode`) narrowed to the caller's role; explicit scopes must fit the
   * role (`scope_above_role`), and the mode the role's cap (`mode_above_role`).
   */
  create(input: {
    headers: Headers;
    name: string;
    mode?: AgentMode;
    scopes?: Scope[];
    /**
     * RFC-0008 §11.2: mint an automation's key (metadata `{ automationId, purpose: "automation" }`):
     * it works only inside that automation's run windows.
     */
    automationId?: string;
  }): Promise<AgentKeySummary & { key: string }>;
  /** Changes one of the caller's keys' mode; takes effect on the agent's next call. */
  setMode(input: { headers: Headers; id: string; mode: AgentMode }): Promise<AgentKeySummary>;
  /**
   * Lets one of the caller's keys work in a more autonomous mode for `minutes` (ADR-0016). Only the
   * creator grants (RFC-0005 §5.2), never above their role's cap.
   */
  elevate(input: {
    headers: Headers;
    id: string;
    mode: AgentMode;
    minutes: number;
    reason?: string | undefined;
  }): Promise<AgentKeySummary>;
  /** Ends an elevation early: the creator's own key, or any key with `agents:manage`. */
  endElevation(input: { headers: Headers; id: string }): Promise<AgentKeySummary>;
  /**
   * Adds read-only scopes that did not exist when the key was made (`ADDABLE_KEY_SCOPES`, RFC-0006
   * §9.1 "Allow analytics", RFC-0007 §10.1 "Allow comments"): the creator's own key, or any key
   * with `agents:manage`. The scope must
   * fit both the caller's and the key creator's role (`scope_above_role`): keys stay narrowed to
   * their creator (RFC-0005 I5). `added` is empty when the key already held every scope.
   */
  addScopes(input: {
    headers: Headers;
    id: string;
    scopes: Scope[];
  }): Promise<{ key: AgentKeySummary; added: Scope[] }>;
  /** The caller's keys; `all` lists every key (`agents:manage`). */
  list(input: { headers: Headers; all?: boolean }): Promise<AgentKeySummary[]>;
  /**
   * A key's state now, server-side, for the scheduler's re-check of `auto` releases (RFC-0008
   * §10.6): enabled, its creator's role (`null` once they left) and the mode its next call runs in.
   */
  state?(
    keyId: string,
  ): Promise<{ enabled: boolean; creatorRole: Role | null; effectiveMode: AgentMode } | undefined>;
  /** Revokes a key: the caller's own, or any key with `agents:manage`. */
  delete(input: { headers: Headers; id: string }): Promise<AgentKeySummary | undefined>;
}

/** How demotion rewrote one key (RFC-0005 §5.3, audited as `agent-key.narrow`). */
export interface KeyNarrowing {
  keyId: string;
  name: string | null;
  scopes: { from: Scope[]; to: Scope[] };
  mode: { from: AgentMode; to: AgentMode };
  elevationEnded: boolean;
}

/** Membership operations that need Better Auth (accounts, passwords, sessions, keys). */
export interface StaffService {
  readonly store: StaffStore;
  readonly ownership: OwnershipResolver;
  readonly minPasswordLength: number;
  readonly maxPasswordLength: number;
  /** The signed-in user of a request, if any (no membership check). */
  sessionUserId(headers: Headers): Promise<string | undefined>;
  userByEmail(email: string): Promise<{ id: string; name: string; email: string } | undefined>;
  /** Checks a user's password the way sign-in does. */
  verifyPassword(userId: string, password: string): Promise<boolean>;
  /** Creates an account server-side (admin plugin `createUser`): sign-up stays closed. */
  createUser(input: {
    email: string;
    name: string;
    password: string;
    emailVerified: boolean;
  }): Promise<{ id: string; name: string; email: string }>;
  markEmailVerified(userId: string): Promise<void>;
  /** Signs a user in; the returned headers carry the session cookie. */
  signIn(email: string, password: string): Promise<Headers>;
  revokeSessions(userId: string): Promise<void>;
  setPassword(userId: string, password: string): Promise<void>;
  /** Rewrites a person's keys for their new role (scopes, mode, elevation). */
  narrowKeys(userId: string, role: Role): Promise<KeyNarrowing[]>;
}

export function signUpMode(
  options: Pick<AuthOptions, "signUp" | "disableSignUp">,
): "first-user" | "closed" | "open" {
  if (options.signUp) return options.signUp;
  return options.disableSignUp ? "closed" : "first-user";
}

export const NOT_A_MEMBER_MESSAGE =
  "Your access was removed. Ask an administrator for a new invite.";

export const API_KEY_HEADER = "x-api-key";

/** `/api/admin/*` takes `Authorization: Bearer <CLOUDHAL_DEPLOY_TOKEN>`, never an agent key. */
const DEPLOY_TOKEN_PATHS = /^\/api\/admin(\/|$)/;

/**
 * The agent key a request carries: `x-api-key`, else `Authorization: Bearer <key>` (what most MCP
 * clients and Codex's `bearer_token_env_var` send). On the deployment-token routes the bearer is the
 * deploy token, so it is not read as a key there.
 */
export function agentKeyFrom(headers: Headers, path: string): string | undefined {
  const key = headers.get(API_KEY_HEADER);
  if (key) return key;
  if (DEPLOY_TOKEN_PATHS.test(path)) return undefined;
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(headers.get("authorization") ?? "")?.[1];
  return bearer || undefined;
}
export const SETUP_TOKEN_HEADER = "x-cloudhal-setup-token";

/**
 * Caller-facing auth failure. Defaults to 400 `auth`; `status` and `code` refine it (e.g. 400
 * `mode_above_role`, 403 `missing_scope`, 404 `not_found`).
 */
export class AuthError extends Error {
  override readonly name = "AuthError";
  readonly status: 400 | 401 | 403 | 404 | 409;
  readonly code: string;
  constructor(
    message: string,
    options: { status?: 400 | 401 | 403 | 404 | 409; code?: string } = {},
  ) {
    super(message);
    this.status = options.status ?? 400;
    this.code = options.code ?? "auth";
  }
}

/**
 * Scopes a person may add to an existing key (`PATCH /api/agent-keys/:id {addScopes}`). Only
 * read-only scopes that new keys get by default but older keys lack — "Allow analytics"
 * (RFC-0006 §9.1) and "Allow comments" (RFC-0007 §10.1; reader text reaches the agent as
 * untrusted data, never an email) — and only within the caller's and the key creator's role, so a
 * Contributor's key never gets them. Everything else stays fixed at creation (RFC-0005: promotions
 * never silently empower agents).
 */
export const ADDABLE_KEY_SCOPES: readonly Scope[] = [
  "analytics:read",
  "comments:read",
  // RFC-0008 §10.1: "Allow schedules" (read-only: the calendar, releases, automations, runs).
  "schedules:read",
];

/** Scopes an API key may carry live under the `cloudhal` permission resource. */
export const API_KEY_PERMISSION_RESOURCE = "cloudhal";
