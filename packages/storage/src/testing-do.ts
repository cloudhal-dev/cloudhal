/**
 * Test harness for `DoSqliteDriver` (RFC-0036 §2 invariant 6). A Miniflare Worker holds a test-only,
 * SQLite-backed Durable Object that runs the real driver on its own `ctx.storage`; from Node, every
 * `SqlDriver` call is one request to that object. Suites written for any `SqlDriver` (the storage
 * conformance suite, core-ts's behavioural suite) thereby run against Durable Object SQLite.
 */
import {
  BlobIntegrityError,
  type RunResult,
  type SqlDriver,
  type SqlStatement,
  type SqlValue,
  StorageError,
  StorageLimitError,
} from "./types.ts";

const WORKER = `
import { DurableObject } from "cloudflare:workers";
import { DoSqliteDriver } from "./sql/do-sqlite.EXT";
const b64 = (u) => { let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const revive = (_k, v) => (v && typeof v === "object" && typeof v.$b === "string" ? unb64(v.$b) : v);
const encode = (v) => JSON.stringify(v ?? null, (_k, x) => (x instanceof Uint8Array ? { $b: b64(x) } : x));
export class TestDb extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.driver = new DoSqliteDriver(ctx.storage); }
  async fetch(req) {
    const { op, args } = JSON.parse(await req.text(), revive);
    try {
      return new Response(encode({ ok: await this.driver[op](...args) }));
    } catch (e) {
      return new Response(encode({ error: { name: e.name, message: e.message } }));
    }
  }
}
export default {
  fetch(req, env) {
    const db = new URL(req.url).searchParams.get("db") ?? "default";
    return env.DB.get(env.DB.idFromName(db)).fetch(req);
  },
};
`;

const ERRORS: Record<string, new (message: string) => Error> = {
  StorageError,
  StorageLimitError,
  BlobIntegrityError,
};

const toB64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const encode = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? { $b: toB64(x) } : x));
const revive = (_k: string, v: unknown) =>
  v && typeof v === "object" && typeof (v as { $b?: unknown }).$b === "string"
    ? new Uint8Array(Buffer.from((v as { $b: string }).$b, "base64"))
    : v;

type Dispatch = (
  url: string,
  init: { method: string; body: string },
) => Promise<{ text(): Promise<string> }>;

/** Node-side `SqlDriver` whose every call runs `DoSqliteDriver` inside the test Durable Object. */
class RemoteDoSqliteDriver implements SqlDriver {
  readonly name = "do-sqlite";
  readonly #dispatch: Dispatch;
  readonly #db: string;

  constructor(dispatch: Dispatch, db: string) {
    this.#dispatch = dispatch;
    this.#db = db;
  }

  async #call<T>(op: string, args: unknown[]): Promise<T> {
    const res = await this.#dispatch(`http://do.test/?db=${encodeURIComponent(this.#db)}`, {
      method: "POST",
      body: encode({ op, args }),
    });
    const out = JSON.parse(await res.text(), revive) as {
      ok?: T;
      error?: { name: string; message: string };
    };
    if (out.error) {
      const E = ERRORS[out.error.name] ?? Error;
      throw new E(out.error.message);
    }
    return out.ok as T;
  }

  async get<T extends Record<string, unknown>>(sql: string, params?: readonly SqlValue[]) {
    return (await this.#call<T | null>("get", [sql, params ?? []])) ?? undefined;
  }
  all<T extends Record<string, unknown>>(sql: string, params?: readonly SqlValue[]) {
    return this.#call<T[]>("all", [sql, params ?? []]);
  }
  run(sql: string, params?: readonly SqlValue[]) {
    return this.#call<RunResult>("run", [sql, params ?? []]);
  }
  batch(statements: readonly SqlStatement[]) {
    return this.#call<RunResult[]>("batch", [statements]);
  }
  async exec(sql: string) {
    await this.#call("exec", [sql]);
  }
  async close() {}
}

/**
 * Spins up a Miniflare Worker with a SQLite-backed Durable Object running `DoSqliteDriver`.
 * `driver(db)` returns a driver for the object named `db` (a fresh, empty database per name).
 */
export async function createMiniflareDoSqlite(): Promise<{
  driver(db?: string): SqlDriver;
  dispose(): Promise<void>;
}> {
  const { Miniflare } = await import("miniflare");
  const { readFile } = await import("node:fs/promises");
  const { stripTypeScriptTypes } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  // Sources in the repo are TypeScript; the published package carries compiled JavaScript.
  const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const load = async (rel: string) => {
    const text = await readFile(fileURLToPath(new URL(rel, import.meta.url).href), "utf8");
    return ext === "ts" ? stripTypeScriptTypes(text) : text;
  };
  const root = fileURLToPath(new URL(".", import.meta.url).href);
  const mf = new Miniflare({
    compatibilityDate: "2026-07-01",
    modulesRoot: root,
    modules: [
      { type: "ESModule", path: `${root}worker.js`, contents: WORKER.replace("EXT", ext) },
      {
        type: "ESModule",
        path: `${root}sql/do-sqlite.${ext}`,
        contents: await load(`./sql/do-sqlite.${ext}`),
      },
      { type: "ESModule", path: `${root}types.${ext}`, contents: await load(`./types.${ext}`) },
    ],
    durableObjects: { DB: { className: "TestDb", useSQLite: true } },
  });
  await mf.ready;
  const dispatch: Dispatch = (url, init) => mf.dispatchFetch(url, init);
  return {
    driver: (db = "default") => new RemoteDoSqliteDriver(dispatch, db),
    dispose: () => mf.dispose(),
  };
}
