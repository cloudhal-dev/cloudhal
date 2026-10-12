/**
 * Node-only auth helpers (SQLite file + on-disk secret). Kept out of `./auth` so Worker bundles
 * never see `better-sqlite3` or `node:fs`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type CloudhalAuth, createAuth } from "./auth.ts";

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
  const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
  const database = new mod.default(path.join(options.dataDir, "data.db"));
  database.pragma("journal_mode = WAL");
  const secret = process.env.BETTER_AUTH_SECRET ?? (await loadOrCreateSecret(options.dataDir));
  return createAuth({
    database,
    // Membership and invites run guarded statements on the same connection (RFC-0005).
    sql: new BetterSqlite3Driver(database),
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
