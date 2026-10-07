import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Actor } from "@cloudhal/core-contracts";
import { type Auth, betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import type { Context } from "hono";
import type { ActorResolver } from "./context.ts";

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
  /** The underlying Better Auth instance (server API: `auth.api.*`). */
  readonly instance: Auth;
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
    plugins: [organization(), admin()],
  });
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

  const resolveActor: ActorResolver = async (c: Context): Promise<Actor | undefined> => {
    const session = await instance.api.getSession({ headers: c.req.raw.headers });
    if (!session) return undefined;
    const actor: Actor = {
      kind: "human",
      id: actorIdForUser(session.user.id),
      name: session.user.name,
    };
    return actor;
  };

  return {
    handler: (request) => instance.handler(request),
    resolveActor,
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
