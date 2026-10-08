import { apiKey } from "@better-auth/api-key";
import {
  type AgentMode,
  ALL_SCOPES,
  DEFAULT_AGENT_MODE,
  defaultScopes,
  isAgentMode,
  type Principal,
  REMOTE_AGENT_MODES,
  type Scope,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { type Auth, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import type { Context } from "hono";
import type { ActorResolver, PrincipalResolver } from "./context.ts";

export interface AuthOptions {
  /** better-sqlite3 `Database`, `node:sqlite` `DatabaseSync`, or a Cloudflare `D1Database` binding. */
  readonly database: unknown;
  /** Browser-facing origin of the API, e.g. http://localhost:8787 or https://studio.example.com */
  readonly baseURL: string;
  readonly secret: string;
  readonly trustedOrigins?: readonly string[];
  /**
   * Who may create an account with email + password:
   * - `first-user` (default): only while no user exists — the first account is the owner, then
   *   sign-up closes. Every human gets full scopes, so an open sign-up on a public deployment would
   *   hand the site to anyone who finds it.
   * - `closed`: nobody (accounts are created by the owner / admin plugin).
   * - `open`: anybody (local development, demos).
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
}

export interface CloudhalAuth {
  readonly handler: (request: Request) => Promise<Response>;
  readonly resolveActor: ActorResolver;
  /** Actor + scopes: humans via session cookie get everything, API keys get their `cloudhal` permissions. */
  readonly resolvePrincipal: PrincipalResolver;
  /** The effective sign-up policy (`AuthOptions.signUp`). */
  readonly signUp: "first-user" | "closed" | "open";
  /** Agent credentials (API keys) owned by the signed-in human. */
  readonly agentKeys: AgentKeyService;
  /** The underlying Better Auth instance (server API: `auth.api.*`). */
  readonly instance: Auth;
}

export interface AgentKeySummary {
  id: string;
  name: string | null;
  /** First characters of the key, for recognition. */
  start: string | null;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string | null;
  enabled: boolean;
  /** How independently the agent works (ADR-0015). */
  mode: AgentMode;
}

export interface AgentKeyService {
  /** Mints a key for the caller's user; the plain key is returned exactly once. */
  /** `scopes` defaults to what the mode needs (`scopesForMode`). */
  create(input: {
    headers: Headers;
    name: string;
    mode?: AgentMode;
    scopes?: Scope[];
  }): Promise<AgentKeySummary & { key: string }>;
  /** Changes a key's mode; takes effect on the agent's next call. */
  setMode(input: { headers: Headers; id: string; mode: AgentMode }): Promise<AgentKeySummary>;
  list(input: { headers: Headers }): Promise<AgentKeySummary[]>;
  delete(input: { headers: Headers; id: string }): Promise<void>;
}

export function signUpMode(
  options: Pick<AuthOptions, "signUp" | "disableSignUp">,
): "first-user" | "closed" | "open" {
  if (options.signUp) return options.signUp;
  return options.disableSignUp ? "closed" : "first-user";
}

function createInstance(options: AuthOptions) {
  return betterAuth({
    // biome-ignore lint/suspicious/noExplicitAny: Better Auth accepts several concrete DB handles
    database: options.database as any,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: [...(options.trustedOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      disableSignUp: signUpMode(options) === "closed",
      autoSignIn: true,
    },
    telemetry: { enabled: false },
    // Checked before the endpoint runs (outside Better Auth's write transaction, which would
    // deadlock a second query on single-connection SQLite).
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.path.startsWith("/sign-up") || signUpMode(options) !== "first-user") return;
        const existing = await ctx.context.adapter.count({ model: "user" });
        if (existing > 0)
          throw new APIError("FORBIDDEN", {
            message: "Sign-up is closed: this Studio already has an owner. Ask them for access.",
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
      organization(),
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

/** Caller-facing auth failure (maps to 400/401 in the API). */
export class AuthError extends Error {
  override readonly name = "AuthError";
}

/** Scopes an API key may carry live under the `cloudhal` permission resource. */
export const API_KEY_PERMISSION_RESOURCE = "cloudhal";

interface ApiKeyRow {
  id: string;
  name?: string | null;
  start?: string | null;
  permissions?: Record<string, string[]> | null;
  createdAt: Date | string;
  expiresAt?: Date | string | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | string | null;
}

function modeOf(row: ApiKeyRow): AgentMode {
  let meta = row.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  const mode = (meta as Record<string, unknown> | null | undefined)?.mode;
  return isAgentMode(mode) ? mode : DEFAULT_AGENT_MODE;
}

interface VerifiedApiKey {
  valid: boolean;
  key: ApiKeyRow | null;
}

function toSummary(row: ApiKeyRow): AgentKeySummary {
  const iso = (d: Date | string | null | undefined) =>
    d == null ? null : typeof d === "string" ? d : d.toISOString();
  return {
    id: row.id,
    name: row.name ?? null,
    start: row.start ?? null,
    scopes: (row.permissions?.[API_KEY_PERMISSION_RESOURCE] ?? []) as Scope[],
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    expiresAt: iso(row.expiresAt),
    enabled: row.enabled !== false,
    mode: modeOf(row),
  };
}

/** Better Auth ids are base62; prefix them so they match the contracts' `Id` pattern. */
export function actorIdForUser(userId: string): string {
  const safe = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  return `user_${safe.length >= 6 ? safe : safe.padEnd(6, "0")}`;
}

/**
 * Builds the Better Auth instance for Cloudhal (ADR-0010): email+password, organization and admin
 * plugins; tables come from storage migration `0002_auth`.
 */
export function createAuth(options: AuthOptions): CloudhalAuth {
  const instance = createInstance(options);
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
      body: { keyId: string; userId: string; metadata: Record<string, unknown> };
    }): Promise<ApiKeyRow>;
    listApiKeys(input: { headers: Headers }): Promise<{ apiKeys: ApiKeyRow[]; total: number }>;
    deleteApiKey(input: { headers: Headers; body: { keyId: string } }): Promise<unknown>;
  };

  const agentKeys: AgentKeyService = {
    async create({ headers, name, mode = DEFAULT_AGENT_MODE, scopes: requested }) {
      const session = await instance.api.getSession({ headers });
      if (!session) throw new AuthError("sign in to create agent keys");
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      const scopes = requested ?? scopesForMode(mode);
      const bad = scopes.filter((s) => !ALL_SCOPES.includes(s));
      if (bad.length) throw new AuthError(`unknown scopes: ${bad.join(", ")}`);
      // Server-side call (no request/headers): permissions are a server-only property.
      const row = await api.createApiKey({
        body: {
          name,
          userId: session.user.id,
          permissions: { [API_KEY_PERMISSION_RESOURCE]: scopes },
          metadata: { mode },
        },
      });
      return { ...toSummary(row), key: row.key };
    },
    async setMode({ headers, id, mode }) {
      const session = await instance.api.getSession({ headers });
      if (!session) throw new AuthError("sign in to change agent keys");
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      const own = (await api.listApiKeys({ headers })).apiKeys.find((k) => k.id === id);
      if (!own) throw new AuthError("unknown agent key");
      const row = await api.updateApiKey({
        body: { keyId: id, userId: session.user.id, metadata: { mode } },
      });
      return toSummary(row);
    },
    async list({ headers }) {
      return (await api.listApiKeys({ headers })).apiKeys.map(toSummary);
    },
    async delete({ headers, id }) {
      await api.deleteApiKey({ headers, body: { keyId: id } });
    },
  };

  const resolvePrincipal: PrincipalResolver = async (
    c: Context,
  ): Promise<Principal | undefined> => {
    const key = c.req.header(API_KEY_HEADER);
    if (key) {
      const verified = await api.verifyApiKey({ body: { key } });
      if (!verified.valid || !verified.key) return undefined;
      const actor: Actor = {
        kind: "agent",
        id: `agent_${verified.key.id
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 32)
          .padEnd(6, "0")}`,
        name: verified.key.name ?? "API key",
      };
      const granted = verified.key.permissions?.[API_KEY_PERMISSION_RESOURCE];
      return {
        actor,
        scopes: granted ? (granted as Scope[]) : defaultScopes(actor),
        mode: modeOf(verified.key),
      };
    }
    const session = await instance.api.getSession({ headers: c.req.raw.headers });
    if (!session) return undefined;
    const actor: Actor = {
      kind: "human",
      id: actorIdForUser(session.user.id),
      name: session.user.name,
    };
    return { actor, scopes: defaultScopes(actor) };
  };
  const resolveActor: ActorResolver = async (c) => (await resolvePrincipal(c))?.actor;

  return {
    handler: (request) => instance.handler(request),
    resolveActor,
    resolvePrincipal,
    agentKeys,
    signUp: signUpMode(options),
    instance: instance as unknown as Auth,
  };
}
