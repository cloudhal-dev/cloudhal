import { apiKey } from "@better-auth/api-key";
import {
  type AgentMode,
  activeElevation,
  clampMode,
  DEFAULT_AGENT_MODE,
  defaultScopes,
  elevationProblem,
  holds,
  isAgentMode,
  isKeyScope,
  isMoreAutonomous,
  KEY_SCOPES,
  type ModeElevation,
  modeCap,
  narrow,
  type OwnershipResolver,
  type PersonRef,
  type Principal,
  REMOTE_AGENT_MODES,
  type Role,
  roleScopes,
  type Scope,
  scopesAboveRole,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { type Auth, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import type { Context } from "hono";
import type { ActorResolver, PrincipalResolver } from "./context.ts";
import { type MemberRow, StaffStore } from "./staff.ts";

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
  readonly trustedOrigins?: readonly string[];
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
  /** The caller's keys; `all` lists every key (`agents:manage`). */
  list(input: { headers: Headers; all?: boolean }): Promise<AgentKeySummary[]>;
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

/**
 * Better Auth access control for the organization plugin: the five role names are registered so
 * the plugin accepts them. Its statements cover only membership; site permissions stay in
 * `ROLE_SCOPES` (RFC-0005 §11). The plugin's HTTP endpoints are not reachable (I3).
 */
const orgAc = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const);
const orgRoles = {
  owner: orgAc.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    ac: ["read"],
  }),
  administrator: orgAc.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    ac: ["read"],
  }),
  editor: orgAc.newRole({ invitation: ["create", "cancel"], ac: ["read"] }),
  author: orgAc.newRole({ ac: ["read"] }),
  contributor: orgAc.newRole({ ac: ["read"] }),
};

/** Migration 0012's invitation columns, declared so the adapter knows them. */
const INVITATION_FIELDS = {
  tokenHash: { type: "string", required: false, input: false, unique: true },
  delivery: { type: "string", required: false, input: false },
  acceptedUserId: { type: "string", required: false, input: false },
  acceptedAt: { type: "date", required: false, input: false },
  canceledBy: { type: "string", required: false, input: false },
  canceledAt: { type: "date", required: false, input: false },
} as const;

function createInstance(options: AuthOptions, staff: StaffStore) {
  const mode = signUpMode(options);
  return betterAuth({
    // biome-ignore lint/suspicious/noExplicitAny: Better Auth accepts several concrete DB handles
    database: options.database as any,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: [...(options.trustedOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      disableSignUp: mode === "closed",
      autoSignIn: true,
    },
    telemetry: { enabled: false },
    hooks: {
      // Checked before the endpoint runs (outside Better Auth's write transaction, which would
      // deadlock a second query on single-connection SQLite).
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.path.startsWith("/sign-up") || mode !== "first-user") return;
        const existing = await ctx.context.adapter.count({ model: "user" });
        if (existing > 0)
          throw new APIError("FORBIDDEN", {
            message:
              "Sign-up is closed: this Studio already has an owner. Ask an administrator for an invite.",
          });
        if (options.setupToken) {
          const given = ctx.headers?.get(SETUP_TOKEN_HEADER) ?? "";
          if (!constantTimeEqual(given, options.setupToken))
            throw new APIError("FORBIDDEN", {
              message:
                "Creating the owner account needs the setup link printed by `cloudhal deploy`.",
            });
        }
      }),
      // After the endpoint: the first account becomes the Owner in the same request; `open`
      // sign-ups join as Contributors (RFC-0005 §7.5). A sign-in without a membership is refused.
      after: createAuthMiddleware(async (ctx) => {
        const fresh = ctx.context.newSession;
        if (!fresh) return;
        if (ctx.path === "/sign-up/email") {
          await staff.joinAsOwnerOr(fresh.user.id, mode === "open" ? "contributor" : undefined);
          return;
        }
        if (ctx.path === "/sign-in/email" && !(await staff.member(fresh.user.id))) {
          await ctx.context.internalAdapter.deleteSession(fresh.session.token);
          throw new APIError("FORBIDDEN", { message: NOT_A_MEMBER_MESSAGE });
        }
      }),
    },
    ...(options.workers
      ? {
          rateLimit: { enabled: true, storage: "database" as const },
          advanced: {
            ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
            ...(options.workers.waitUntil
              ? { backgroundTasks: { handler: options.workers.waitUntil } }
              : {}),
          },
        }
      : {}),
    plugins: [
      // One organization per deployment (RFC-0005 §11). Used for its tables only: membership
      // changes go through Cloudhal's audited routes; the HTTP endpoints answer 404 (I3).
      organization({
        ac: orgAc,
        roles: orgRoles,
        creatorRole: "owner",
        allowUserToCreateOrganization: false,
        schema: { invitation: { additionalFields: INVITATION_FIELDS } },
      }),
      admin(),
      // Non-interactive credentials for agents/CI: `x-api-key` → `agent` actor (ADR-0011).
      apiKey({
        apiKeyHeaders: API_KEY_HEADER,
        enableMetadata: true,
        // The plugin's default (10 requests per key per day) would stall any real agent session.
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
      }),
    ],
  });
}

export const API_KEY_HEADER = "x-api-key";
export const SETUP_TOKEN_HEADER = "x-cloudhal-setup-token";

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}

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

/** Scopes an API key may carry live under the `cloudhal` permission resource. */
export const API_KEY_PERMISSION_RESOURCE = "cloudhal";

interface ApiKeyRow {
  id: string;
  name?: string | null;
  start?: string | null;
  referenceId?: string | null;
  permissions?: Record<string, string[]> | string | null;
  createdAt: Date | string;
  expiresAt?: Date | string | null;
  enabled?: boolean | number | null;
  metadata?: Record<string, unknown> | string | null;
}

function metadataOf(row: ApiKeyRow): Record<string, unknown> {
  let meta = row.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta) as Record<string, unknown>;
      // older rows were stringified twice
      if (typeof meta === "string") meta = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return meta && typeof meta === "object" ? meta : {};
}

function permissionsOf(row: ApiKeyRow): string[] | undefined {
  let perms = row.permissions;
  if (typeof perms === "string") {
    try {
      perms = JSON.parse(perms) as Record<string, string[]>;
    } catch {
      perms = null;
    }
  }
  const granted = perms && typeof perms === "object" ? perms[API_KEY_PERMISSION_RESOURCE] : null;
  return Array.isArray(granted) ? granted : undefined;
}

function modeOf(row: ApiKeyRow): AgentMode {
  const mode = metadataOf(row).mode;
  return isAgentMode(mode) ? mode : DEFAULT_AGENT_MODE;
}

/** Better Auth revives ISO strings in metadata as `Date`s; summaries and checks use ISO strings. */
function isoOf(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return typeof value === "string" ? value : undefined;
}

/** The key's elevation if one is in force at `now`. */
function elevationOf(row: ApiKeyRow, now: Date): ModeElevation | undefined {
  const raw = metadataOf(row).elevation as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object" || !isAgentMode(raw.mode)) return undefined;
  const until = isoOf(raw.until);
  if (!until) return undefined;
  const elevation: ModeElevation = {
    mode: raw.mode,
    until,
    grantedBy: typeof raw.grantedBy === "string" ? raw.grantedBy : "",
    grantedAt: isoOf(raw.grantedAt) ?? "",
    ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
  };
  return activeElevation(modeOf(row), elevation, now);
}

interface VerifiedApiKey {
  valid: boolean;
  key: ApiKeyRow | null;
}

/** The agent actor id an API key's calls are recorded under. */
export function agentIdForKey(keyId: string): string {
  return `agent_${keyId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32)
    .padEnd(6, "0")}`;
}

/** The scopes stored on a key (legacy keys without permissions get the agent defaults). */
function storedScopes(row: ApiKeyRow): Scope[] {
  const granted = permissionsOf(row);
  const agent: Actor = { kind: "agent", id: agentIdForKey(row.id) };
  return (granted ?? defaultScopes(agent)).filter(isKeyScope);
}

/** `role`: the creator's current role; `null` when they are no longer a member (the key is dead). */
function toSummary(row: ApiKeyRow, now: Date, role: Role | null | undefined): AgentKeySummary {
  const iso = (d: Date | string | null | undefined) =>
    d == null ? null : typeof d === "string" ? d : d.toISOString();
  const mode = modeOf(row);
  const elevation = elevationOf(row, now);
  const scopes = storedScopes(row);
  const cap = role ? modeCap(role) : "auto";
  const effective = elevation?.mode ?? mode;
  return {
    id: row.id,
    name: row.name ?? null,
    start: row.start ?? null,
    scopes,
    effectiveScopes: role ? narrow(scopes, roleScopes(role)) : role === undefined ? scopes : [],
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    expiresAt: iso(row.expiresAt),
    enabled: row.enabled !== false && row.enabled !== 0,
    mode,
    ...(elevation ? { elevation } : {}),
    effectiveMode: clampMode(effective, cap),
    agentId: agentIdForKey(row.id),
  };
}

/** Better Auth ids are base62; prefix them so they match the contracts' `Id` pattern. */
export function actorIdForUser(userId: string): string {
  const safe = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  return `user_${safe.length >= 6 ? safe : safe.padEnd(6, "0")}`;
}

function personRef(member: MemberRow): PersonRef {
  return {
    id: actorIdForUser(member.userId),
    userId: member.userId,
    role: member.role,
    name: member.name,
  };
}

/**
 * Builds the Better Auth instance for Cloudhal (ADR-0010): email+password, organization and admin
 * plugins; tables come from storage migrations `0002_auth` and `0012_roles`.
 */
export function createAuth(options: AuthOptions): CloudhalAuth {
  const now = options.now ?? (() => new Date());
  const staffStore = new StaffStore(options.sql, now);
  const instance = createInstance(options, staffStore);
  const api = instance.api as unknown as {
    verifyApiKey(input: { body: { key: string } }): Promise<VerifiedApiKey>;
    createApiKey(input: {
      body: {
        name: string;
        userId: string;
        permissions: Record<string, string[]>;
        metadata?: Record<string, unknown>;
      };
    }): Promise<ApiKeyRow & { key: string }>;
    updateApiKey(input: {
      body: {
        keyId: string;
        userId: string;
        metadata?: Record<string, unknown>;
        permissions?: Record<string, string[]>;
      };
    }): Promise<ApiKeyRow>;
    createUser(input: {
      body: { email: string; password: string; name: string; data?: Record<string, unknown> };
    }): Promise<{ user: { id: string; name: string; email: string } }>;
    signInEmail(input: {
      body: { email: string; password: string };
      returnHeaders: true;
    }): Promise<{ headers: Headers; response: unknown }>;
  };
  type AdapterLike = {
    findMany<T>(input: {
      model: string;
      where?: { field: string; value: unknown }[];
      limit?: number;
    }): Promise<T[]>;
    findOne<T>(input: {
      model: string;
      where: { field: string; value: unknown }[];
    }): Promise<T | null>;
    delete(input: { model: string; where: { field: string; value: unknown }[] }): Promise<void>;
  };
  type AuthContextLike = {
    adapter: AdapterLike;
    password: {
      hash(password: string): Promise<string>;
      verify(input: { hash: string; password: string }): Promise<boolean>;
    };
    internalAdapter: {
      deleteUserSessions(userId: string): Promise<void>;
      findCredentialAccount(userId: string): Promise<{ password?: string | null } | null>;
      updatePassword(userId: string, hash: string): Promise<void>;
      createAccount(input: Record<string, unknown>): Promise<unknown>;
      findUserByEmail(
        email: string,
      ): Promise<{ user: { id: string; name: string; email: string } } | null>;
      updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
    };
  };
  const context = () => (instance as unknown as { $context: Promise<AuthContextLike> }).$context;

  const keyById = async (id: string) =>
    (await context()).adapter.findOne<ApiKeyRow>({
      model: "apikey",
      where: [{ field: "id", value: id }],
    });
  const keysOf = async (userId: string) =>
    (await context()).adapter.findMany<ApiKeyRow>({
      model: "apikey",
      where: [{ field: "referenceId", value: userId }],
      limit: 500,
    });

  /** The signed-in person and their membership (refuses non-members). */
  const caller = async (headers: Headers, message: string) => {
    const session = await instance.api.getSession({ headers });
    if (!session) throw new AuthError(message, { status: 401, code: "unauthorized" });
    const member = await staffStore.member(session.user.id);
    if (!member) throw new AuthError(NOT_A_MEMBER_MESSAGE, { status: 403, code: "not_a_member" });
    return { userId: session.user.id, member };
  };

  /** One of the caller's own keys, or with `manage` any key when the role holds agents:manage. */
  const keyFor = async (headers: Headers, id: string, manage: boolean) => {
    const who = await caller(headers, "sign in to change agent keys");
    const key = await keyById(id);
    if (!key) throw new AuthError("unknown agent key", { status: 404, code: "not_found" });
    if (key.referenceId === who.userId) return { who, key, own: true };
    const canManage = manage && roleScopesHold(who.member.role, "agents:manage");
    // Someone else's key is invisible without agents:manage (no existence oracle).
    if (!canManage) throw new AuthError("unknown agent key", { status: 404, code: "not_found" });
    return { who, key, own: false };
  };

  const capProblem = (role: Role, mode: AgentMode) => {
    const cap = modeCap(role);
    if (isMoreAutonomous(mode, cap))
      throw new AuthError(`your role allows keys up to ${cap.toUpperCase()} mode`, {
        code: "mode_above_role",
      });
  };

  const agentKeys: AgentKeyService = {
    async create({ headers, name, mode = DEFAULT_AGENT_MODE, scopes: requested }) {
      const who = await caller(headers, "sign in to create agent keys");
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      capProblem(who.member.role, mode);
      const role = who.member.role;
      let scopes: Scope[];
      if (requested) {
        const bad = requested.filter((s) => !isKeyScope(s));
        if (bad.length)
          throw new AuthError(
            `unknown scopes: ${bad.join(", ")} (keys can hold ${KEY_SCOPES.join(", ")})`,
          );
        const above = scopesAboveRole(requested, role);
        if (above.length)
          throw new AuthError(`your role cannot give a key ${above.join(", ")}`, {
            code: "scope_above_role",
          });
        scopes = [...new Set(requested)];
      } else scopes = narrow(scopesForMode(mode), roleScopes(role));
      // Server-side call (no request/headers): permissions are a server-only property.
      const row = await api.createApiKey({
        body: {
          name,
          userId: who.userId,
          permissions: { [API_KEY_PERMISSION_RESOURCE]: scopes },
          metadata: { mode },
        },
      });
      await staffStore.recordAgent(agentIdForKey(row.id), who.userId, row.id);
      return { ...toSummary(row, now(), role), key: row.key };
    },
    async setMode({ headers, id, mode }) {
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      const { who, key } = await keyFor(headers, id, false);
      capProblem(who.member.role, mode);
      // An elevation stays in force unless the key's own mode now reaches it.
      const elevation = elevationOf(key, now());
      const keep = elevation && isMoreAutonomous(elevation.mode, mode) ? { elevation } : {};
      const row = await api.updateApiKey({
        body: { keyId: id, userId: who.userId, metadata: { mode, ...keep } },
      });
      return toSummary(row, now(), who.member.role);
    },
    async elevate({ headers, id, mode, minutes, reason }) {
      // Only the key's creator grants an elevation (RFC-0005 §5.2, open question 12).
      const { who, key } = await keyFor(headers, id, false);
      const base = modeOf(key);
      const problem = elevationProblem(base, mode, minutes);
      if (problem) throw new AuthError(problem);
      capProblem(who.member.role, mode);
      const at = now();
      const elevation: ModeElevation = {
        mode,
        until: new Date(at.getTime() + minutes * 60_000).toISOString(),
        grantedBy: actorIdForUser(who.userId),
        grantedAt: at.toISOString(),
        ...(reason?.trim() ? { reason: reason.trim().slice(0, 200) } : {}),
      };
      const row = await api.updateApiKey({
        body: { keyId: id, userId: who.userId, metadata: { mode: base, elevation } },
      });
      return toSummary(row, now(), who.member.role);
    },
    async endElevation({ headers, id }) {
      const { key } = await keyFor(headers, id, true);
      const creator = key.referenceId as string;
      const row = await api.updateApiKey({
        body: { keyId: id, userId: creator, metadata: { mode: modeOf(key) } },
      });
      return toSummary(row, now(), (await staffStore.member(creator))?.role ?? null);
    },
    async list({ headers, all }) {
      const who = await caller(headers, "sign in to list agent keys");
      const at = now();
      if (!all) {
        const rows = await keysOf(who.userId);
        return rows
          .map((row) => toSummary(row, at, who.member.role))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      if (!roleScopesHold(who.member.role, "agents:manage"))
        throw new AuthError("listing every key needs agents:manage", {
          status: 403,
          code: "missing_scope",
        });
      const members = new Map((await staffStore.list()).map((m) => [m.userId, m]));
      const rows = await (await context()).adapter.findMany<ApiKeyRow>({
        model: "apikey",
        limit: 1000,
      });
      return rows
        .map((row) => {
          const owner = members.get(row.referenceId ?? "");
          return {
            ...toSummary(row, at, owner?.role ?? null),
            owner: {
              userId: row.referenceId ?? "",
              name: owner?.name ?? null,
              role: owner?.role ?? null,
            },
          };
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async delete({ headers, id }) {
      const { key } = await keyFor(headers, id, true);
      const summary = toSummary(
        key,
        now(),
        (await staffStore.member(key.referenceId ?? ""))?.role ?? null,
      );
      await (await context()).adapter.delete({
        model: "apikey",
        where: [{ field: "id", value: id }],
      });
      return summary;
    },
  };

  const ownership: OwnershipResolver = {
    async personOf(actor) {
      if (actor.kind === "human") return actor.id;
      if (actor.kind !== "agent") return undefined;
      const userId = await staffStore.userOfAgent(actor.id);
      return userId ? actorIdForUser(userId) : undefined;
    },
  };

  const staff: StaffService = {
    store: staffStore,
    ownership,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    async sessionUserId(headers) {
      return (await instance.api.getSession({ headers }))?.user.id;
    },
    async userByEmail(email) {
      const found = await (await context()).internalAdapter.findUserByEmail(email.toLowerCase());
      return found
        ? { id: found.user.id, name: found.user.name, email: found.user.email }
        : undefined;
    },
    async verifyPassword(userId, password) {
      const ctx = await context();
      const account = await ctx.internalAdapter.findCredentialAccount(userId);
      if (!account?.password) return false;
      return ctx.password.verify({ hash: account.password, password });
    },
    async createUser({ email, name, password, emailVerified }) {
      const { user } = await api.createUser({
        body: { email, password, name, data: { emailVerified } },
      });
      return { id: user.id, name: user.name, email: user.email };
    },
    async markEmailVerified(userId) {
      await (await context()).internalAdapter.updateUser(userId, { emailVerified: true });
    },
    async signIn(email, password) {
      const { headers } = await api.signInEmail({ body: { email, password }, returnHeaders: true });
      return headers;
    },
    async revokeSessions(userId) {
      await (await context()).internalAdapter.deleteUserSessions(userId);
    },
    async setPassword(userId, password) {
      const ctx = await context();
      const hash = await ctx.password.hash(password);
      if (await ctx.internalAdapter.findCredentialAccount(userId))
        await ctx.internalAdapter.updatePassword(userId, hash);
      else
        await ctx.internalAdapter.createAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: hash,
        });
    },
    async narrowKeys(userId, role) {
      const out: KeyNarrowing[] = [];
      const cap = modeCap(role);
      const at = now();
      for (const key of await keysOf(userId)) {
        const from = storedScopes(key);
        const to = narrow(from, roleScopes(role));
        const mode = modeOf(key);
        const nextMode = clampMode(mode, cap);
        const elevation = elevationOf(key, at);
        const elevationEnded = elevation !== undefined && isMoreAutonomous(elevation.mode, cap);
        const scopesChanged =
          to.length !== from.length || to.some((s, i) => s !== from[i]) || !permissionsOf(key);
        if (!scopesChanged && nextMode === mode && !elevationEnded) continue;
        await api.updateApiKey({
          body: {
            keyId: key.id,
            userId,
            permissions: { [API_KEY_PERMISSION_RESOURCE]: to },
            metadata: {
              mode: nextMode,
              ...(elevation && !elevationEnded ? { elevation } : {}),
            },
          },
        });
        out.push({
          keyId: key.id,
          name: key.name ?? null,
          scopes: { from, to },
          mode: { from: mode, to: nextMode },
          elevationEnded,
        });
      }
      return out;
    },
  };

  const resolvePrincipal: PrincipalResolver = async (
    c: Context,
  ): Promise<Principal | undefined> => {
    const key = c.req.header(API_KEY_HEADER);
    if (key) {
      const verified = await api.verifyApiKey({ body: { key } });
      if (!verified.valid || !verified.key) return undefined;
      // An agent never exceeds its creator (I5): no creator membership, no key.
      const creator = verified.key.referenceId
        ? await staffStore.member(verified.key.referenceId)
        : undefined;
      if (!creator) return undefined;
      const actor: Actor = {
        kind: "agent",
        id: agentIdForKey(verified.key.id),
        name: verified.key.name ?? "API key",
      };
      const scopes = narrow(storedScopes(verified.key), roleScopes(creator.role));
      // The mode is worked out on every call, so an elevation ends on time by itself (ADR-0016),
      // and never above the creator's cap (I6).
      const cap = modeCap(creator.role);
      const base = clampMode(modeOf(verified.key), cap);
      const raw = elevationOf(verified.key, now());
      const elevation = raw && !isMoreAutonomous(raw.mode, cap) ? raw : undefined;
      return {
        actor,
        scopes,
        mode: elevation?.mode ?? base,
        ...(elevation ? { elevation: { from: base, until: elevation.until } } : {}),
        keyId: verified.key.id,
        person: personRef(creator),
      };
    }
    const session = await instance.api.getSession({ headers: c.req.raw.headers });
    if (!session) return undefined;
    const actor: Actor = {
      kind: "human",
      id: actorIdForUser(session.user.id),
      name: session.user.name,
    };
    const member = await staffStore.member(session.user.id);
    // No membership, no scopes (I1): only /api/me, /api/auth/* and the invite routes answer.
    if (!member) return { actor, scopes: [] };
    return { actor, scopes: roleScopes(member.role), person: personRef(member) };
  };
  const resolveActor: ActorResolver = async (c) => (await resolvePrincipal(c))?.actor;

  return {
    handler: (request) => instance.handler(request),
    resolveActor,
    resolvePrincipal,
    agentKeys,
    staff,
    signUp: signUpMode(options),
    instance: instance as unknown as Auth,
  };
}

function roleScopesHold(role: Role, scope: Scope): boolean {
  return holds(roleScopes(role), scope);
}
