/**
 * Node-only auth helpers (SQLite file + on-disk secret). Kept out of `./auth` so Worker bundles
 * never see `better-sqlite3` or `node:fs`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type CloudhalAuth, createAuth, trustedOriginsWithOwn } from "./auth.ts";
import { CLIENT_ADDRESS_HEADER } from "./tokens.ts";

/**
 * Node helper for `cloudhal studio`: opens the project's SQLite file for Better Auth and keeps a
 * per-project secret in `<dataDir>/auth-secret` so sessions survive restarts.
 */
export async function createAuthFor(options: {
  dataDir: string;
  baseURL: string;
  trustedOrigins?: readonly string[];
  /**
   * Also trust the origin each request was made to (`trustedOriginsWithOwn`): a Studio served
   * without a public origin, reached at whatever address the browser used (#165). `"loopback"`:
   * only when that origin names this machine (a server listening on loopback).
   */
  trustRequestOrigin?: boolean | "any" | "loopback" | undefined;
  /**
   * The token the first account must present while nobody has one (`AuthOptions.setupToken`), so
   * a fresh Studio on a network cannot be claimed by whoever reaches it first (#165).
   */
  setupToken?: string | undefined;
  /** `"always"` runs Better Auth's Origin check under `NODE_ENV=test` (`AuthOptions.originCheck`). */
  originCheck?: "always" | undefined;
}): Promise<CloudhalAuth> {
  const mod = await import("better-sqlite3");
  const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
  const database = new mod.default(path.join(options.dataDir, "data.db"));
  database.pragma("journal_mode = WAL");
  const secret = process.env.BETTER_AUTH_SECRET ?? (await loadOrCreateSecret(options.dataDir));
  const origins = options.trustedOrigins ?? [];
  return createAuth({
    database,
    // Membership and invites run guarded statements on the same connection (RFC-0005).
    sql: new BetterSqlite3Driver(database),
    baseURL: options.baseURL,
    secret,
    trustedOrigins: options.trustRequestOrigin
      ? trustedOriginsWithOwn(origins, { loopbackOnly: options.trustRequestOrigin === "loopback" })
      : origins,
    setupToken: options.setupToken,
    // `serveNode` writes the client's address here; Better Auth's own default is X-Forwarded-For.
    clientAddressHeader: CLIENT_ADDRESS_HEADER,
    originCheck: options.originCheck,
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
