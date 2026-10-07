import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { apiKey } from "@better-auth/api-key";
import { ALL_SCOPES, defaultScopes, type Principal, type Scope } from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { type Auth, betterAuth } from "better-auth";
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
  /** Close public sign-up (invite-only). Default: open. */
  readonly disableSignUp?: boolean;
}

export interface CloudhalAuth {
  readonly handler: (request: Request) => Promise<Response>;
  readonly resolveActor: ActorResolver;
  /** Actor + scopes: humans via session cookie get everything, API keys get their `cloudhal` permissions. */
  readonly resolvePrincipal: PrincipalResolver;
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
}

export interface AgentKeyService {
  /** Mints a key for the caller's user; the plain key is returned exactly once. */
  create(input: {
    headers: Headers;
    name: string;
    scopes: Scope[];
  }): Promise<AgentKeySummary & { key: string }>;
  list(input: { headers: Headers }): Promise<AgentKeySummary[]>;
  delete(input: { headers: Headers; id: string }): Promise<void>;
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
      disableSignUp: options.disableSignUp ?? false,
      autoSignIn: true,
    },
    telemetry: { enabled: false },
    plugins: [
      organization(),
      admin(),
      // Non-interactive credentials for agents/CI: `x-api-key` → `agent` actor (ADR-0011).
      apiKey({ apiKeyHeaders: API_KEY_HEADER, enableMetadata: true }),
    ],
  });
}

export const API_KEY_HEADER = "x-api-key";

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
      body: { name: string; userId: string; permissions: Record<string, string[]> };
    }): Promise<ApiKeyRow & { key: string }>;
    listApiKeys(input: { headers: Headers }): Promise<{ apiKeys: ApiKeyRow[]; total: number }>;
    deleteApiKey(input: { headers: Headers; body: { keyId: string } }): Promise<unknown>;
  };

  const agentKeys: AgentKeyService = {
    async create({ headers, name, scopes }) {
      const session = await instance.api.getSession({ headers });
      if (!session) throw new AuthError("sign in to create agent keys");
      const bad = scopes.filter((s) => !ALL_SCOPES.includes(s));
      if (bad.length) throw new AuthError(`unknown scopes: ${bad.join(", ")}`);
      // Server-side call (no request/headers): permissions are a server-only property.
      const row = await api.createApiKey({
        body: {
          name,
          userId: session.user.id,
          permissions: { [API_KEY_PERMISSION_RESOURCE]: scopes },
        },
      });
      return { ...toSummary(row), key: row.key };
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
      return { actor, scopes: granted ? (granted as Scope[]) : defaultScopes(actor) };
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
    instance: instance as unknown as Auth,
  };
}

/**
 * Node helper for `cloudhal studio`: opens the project's SQLite file for Better Auth and keeps a
 * per-project secret in `<dataDir>/auth-secret` so sessions survive restarts.
 */
export async function createAuthFor(options: {
  dataDir: string;
  baseURL: string;
  trustedOrigins?: readonly string[];
}): Promise<CloudhalAuth> {
  const mod = await import("better-sqlite3");
  const database = new mod.default(path.join(options.dataDir, "data.db"));
  database.pragma("journal_mode = WAL");
  const secret = process.env.BETTER_AUTH_SECRET ?? (await loadOrCreateSecret(options.dataDir));
  return createAuth({
    database,
    baseURL: options.baseURL,
    secret,
    trustedOrigins: options.trustedOrigins ?? [],
  });
}

async function loadOrCreateSecret(dataDir: string): Promise<string> {
  const file = path.join(dataDir, "auth-secret");
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, `${secret}\n`, { mode: 0o600 });
    return secret;
  }
}
