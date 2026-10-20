/**
 * `PlaygroundSite` (RFC-0036 §1–§6): one SQLite-backed Durable Object per playground session. It
 * holds the session's whole Cloudhal — store, API and renderer — over `DoSqliteDriver`, seeds it
 * on first use, deletes everything at the TTL alarm or on Reset, and refuses requests past the
 * session's 2-hour cap even if the alarm never ran. The Worker in front has already checked the
 * cookie, the guard and the rate limits; this object trusts only its `SESSION_HEADER`.
 */
import { createApi } from "@cloudhal/api";
import { SiteGraphStore } from "@cloudhal/core-ts";
import {
  type BlobStore,
  FetcherBlobStore,
  LayeredBlobStore,
  SqlBlobStore,
} from "@cloudhal/storage";
import { DoSqliteDriver } from "@cloudhal/storage/do-sqlite";
import {
  DEFAULT_PLAYGROUND_LIMITS,
  type PlaygroundEnv,
  type PlaygroundLimits,
  type PlaygroundOptions,
  RESET_PATH,
  SESSION_HEADER,
  SITE_PREFIX,
} from "./playground-options.ts";
import { privateSiteResponse } from "./playground-render.ts";
import { sessionTime } from "./playground-session.ts";

const MINUTE = 60_000;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

interface Session {
  store: SiteGraphStore;
  sql: DoSqliteDriver;
  siteId: string;
  api: ReturnType<typeof createApi>;
}

/** The `PlaygroundSite` Durable Object class, as the Worker module exports it. */
export type PlaygroundSiteClass = new (
  state: DurableObjectState,
  env: PlaygroundEnv,
) => { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };

/** Builds the Durable Object class for `options` (exported by the Worker module as `PlaygroundSite`). */
export function playgroundSiteClass(options: PlaygroundOptions): PlaygroundSiteClass {
  const limits: PlaygroundLimits = { ...DEFAULT_PLAYGROUND_LIMITS, ...options.limits };

  return class PlaygroundSite {
    readonly state: DurableObjectState;
    readonly env: PlaygroundEnv;
    #session: Session | undefined;
    #expiresAt = 0;

    constructor(state: DurableObjectState, env: PlaygroundEnv) {
      this.state = state;
      this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/_count") return this.#count();
      const id = request.headers.get(SESSION_HEADER) ?? "";
      const created = sessionTime(id);
      if (created === undefined) return json(400, { error: "no_session" });
      if (url.pathname === RESET_PATH) {
        await this.#wipe();
        return new Response(null, { status: 204 });
      }
      const now = Date.now();
      if (now >= created + limits.maxMinutes * MINUTE) {
        // No resurrection: past the cap, even when the alarm did not run.
        await this.#wipe();
        return json(410, { error: "playground_expired" });
      }
      const session = await this.#open();
      this.#expiresAt = Math.min(
        now + limits.idleMinutes * MINUTE,
        created + limits.maxMinutes * MINUTE,
      );
      await this.state.storage.setAlarm(this.#expiresAt);
      const full = await fullResponse(request, url, session, limits);
      if (full) return full;
      if (url.pathname.startsWith("/api/") || url.pathname === "/mcp")
        return session.api.fetch(request);
      if (url.pathname.startsWith(SITE_PREFIX) || url.pathname.startsWith("/media/"))
        return renderSite(request, url, { session, options, state: this.state, env: this.env });
      return json(404, { error: "not_found" });
    }

    async alarm(): Promise<void> {
      await this.#wipe();
    }

    /** The daily session counter (an object named `daily:<UTC date>`). */
    async #count(): Promise<Response> {
      const count = ((await this.state.storage.get<number>("count")) ?? 0) + 1;
      await this.state.storage.put("count", count);
      if (count === 1) {
        const midnight = new Date();
        midnight.setUTCHours(24, 0, 0, 0);
        await this.state.storage.setAlarm(midnight.getTime() + MINUTE);
      }
      return json(200, { count });
    }

    async #wipe(): Promise<void> {
      this.#session = undefined;
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
    }

    /** The session's store, API and site; migrated and seeded on first use. */
    async #open(): Promise<Session> {
      if (this.#session) return this.#session;
      await this.state.blockConcurrencyWhile(async () => {
        if (this.#session) return;
        const sql = new DoSqliteDriver(this.state.storage);
        const own = new SqlBlobStore(sql, {
          maxBytes: limits.maxBlobBytes,
          maxObjectBytes: limits.maxObjectBytes,
        });
        const demo = options.demoMedia;
        const blobs: BlobStore = demo
          ? new LayeredBlobStore(
              new FetcherBlobStore(
                this.env.ASSETS,
                demo.prefix,
                demo.keys ? { keys: demo.keys } : {},
              ),
              own,
            )
          : own;
        const store = new SiteGraphStore({ sql, blobs });
        await store.init();
        let siteId = await this.state.storage.get<string>("siteId");
        if (!siteId) {
          siteId = (await options.seed(store)).siteId;
          await this.state.storage.put("siteId", siteId);
        }
        const api = createApi({
          store,
          defer: (task) => this.state.waitUntil(task.catch(() => {})),
          playground: {
            info: () => ({
              expiresAt: new Date(this.#expiresAt).toISOString(),
              resetUrl: RESET_PATH,
              deployUrl: options.deployUrl,
            }),
            maxBodyBytes: limits.maxBodyBytes,
          },
        });
        this.#session = { store, sql, siteId, api };
      });
      return this.#session as unknown as Session;
    }
  };
}

/** RFC-0036 §7: a full database or too many nodes refuse writes with 507. */
async function fullResponse(
  request: Request,
  url: URL,
  session: Session,
  limits: PlaygroundLimits,
): Promise<Response | undefined> {
  if (request.method === "GET" || request.method === "HEAD" || !url.pathname.startsWith("/api/"))
    return undefined;
  if (session.sql.databaseSize > limits.maxDatabaseBytes)
    return json(507, {
      error: "playground_full",
      message: "This playground is full. Reset to start over.",
    });
  if (request.method === "POST") {
    const row = await session.sql.get<{ n: number }>("SELECT count(*) AS n FROM nodes");
    if ((row?.n ?? 0) >= limits.maxNodes)
      return json(507, {
        error: "playground_full",
        message: "This playground holds no more items.",
      });
  }
  return undefined;
}

/** `/s/<session>/…` (and `/media/…`) through the deployment's renderer, kept private (§4). */
async function renderSite(
  request: Request,
  url: URL,
  scope: { session: Session; options: PlaygroundOptions; state: DurableObjectState; env: unknown },
): Promise<Response> {
  const { session, options, state } = scope;
  if (!options.render) return json(404, { error: "not_found" });
  const sitePath = url.pathname.startsWith(SITE_PREFIX);
  const prefix = sitePath ? url.pathname.split("/").slice(0, 3).join("/") : "";
  const inner = new URL(url);
  inner.pathname = url.pathname.slice(prefix.length) || "/";
  const ctx = {
    waitUntil: (p: Promise<unknown>) => state.waitUntil(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  const response = await options.render(new Request(inner, request), {
    store: session.store,
    siteId: session.siteId,
    env: scope.env,
    ctx,
  });
  return privateSiteResponse(
    response,
    prefix || `${SITE_PREFIX}${request.headers.get(SESSION_HEADER)}`,
  );
}
