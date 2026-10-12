/**
 * The Cloudhal admin Worker (ADR-0012): one origin for the Studio SPA (static assets), the HTTP
 * API, Better Auth and the MCP endpoint — all over the deployment's D1 database and R2 bucket.
 *
 * After every publish/rollback it purges the site Worker's edge cache through the `SITE` service
 * binding (cache purges are scoped to the Worker that cached the responses): only the tags of what
 * changed between the previously live snapshot and the new one (`purge.ts`), everything when that
 * cannot be worked out.
 *
 * Site analytics (RFC-0006 §7.5, §8): with `CLOUDHAL_ANALYTICS_DATASET` set the deployment records to
 * Workers Analytics Engine; Studio and MCP read it through the `ANALYTICS_SQL` binding (no API
 * token), and the hourly `scheduled` handler rolls finished days into D1 and deletes old salts. A
 * missing binding means the "can't read yet" state (`reader: "none"`), never a crash.
 *
 * Reader comments (RFC-0007 step 5, `comments.ts`): with `CLOUDHAL_COMMENTS_KEY` (the site Worker's
 * secret) the API and MCP serve comments; moderation queues comment cache tags, which the flusher
 * sends through `SITE` within the purge budget publishes share (every purge request is logged in
 * `cache_purge_log`): takedowns 2 s after the write, normal tags 20 s later, and on any later
 * admin request whose queue is due; the hourly job applies retention, purges threads that closed by
 * time and deletes old salts.
 *
 * Secrets: BETTER_AUTH_SECRET, MCP_STATE_KEY, CLOUDHAL_PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN,
 * CLOUDHAL_DEPLOY_TOKEN, CLOUDHAL_COMMENTS_KEY (all ≥ 32 chars; `cloudhal deploy` generates them).
 */
import {
  ApprovalStore,
  AuditLog,
  type LoadedSkill,
  type SkillSource,
  skillFromSource,
} from "@cloudhal/agent-runtime";
import { type AnalyticsDefaults, parseAnalyticsDefaults } from "@cloudhal/analytics";
import { AnalyticsService } from "@cloudhal/analytics/service";
import { SqlQueryBudget } from "@cloudhal/analytics/sql";
import { DATASET_RE, WaeReader } from "@cloudhal/analytics/wae";
import { createApi } from "@cloudhal/api";
import { type CloudhalAuth, createAuth } from "@cloudhal/api/auth";
import { PURGE_LIMITS } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import {
  adminComments,
  type CommentsEnv,
  commentsHourlyDue,
  commentsOn,
  flushCommentPurges,
  runCommentsHourly,
} from "./comments.ts";
import { siteGateSupport } from "./features.ts";
import { purgeSiteCache } from "./purge.ts";

export interface AdminEnv extends CommentsEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  ASSETS?: Fetcher;
  SITE?: Fetcher;
  BETTER_AUTH_SECRET: string;
  MCP_STATE_KEY: string;
  CLOUDHAL_PREVIEW_SECRET?: string;
  CLOUDHAL_PURGE_TOKEN?: string;
  CLOUDHAL_DEPLOY_TOKEN?: string;
  /** One-time token the first account must present (see `cloudhal deploy` output). */
  CLOUDHAL_SETUP_TOKEN?: string;
  /** `first-user` (default: only the owner can sign up), `closed` or `open`. */
  CLOUDHAL_SIGNUP?: string;
  /** Reads Workers Analytics Engine (RFC-0006 §7.3); absent: analytics recorded but not readable. */
  ANALYTICS_SQL?: AnalyticsSQLBinding;
  /** `<deployment>_events`; set by `cloudhal deploy` when `analytics.enabled` (absent: no analytics). */
  CLOUDHAL_ANALYTICS_DATASET?: string;
  /** Uncached live analytics queries per UTC day (default 8000, §7.7). */
  CLOUDHAL_ANALYTICS_BUDGET?: string;
  /** Deployment defaults for sites without a settings row (compact JSON from cloudhal.json). */
  CLOUDHAL_ANALYTICS_DEFAULTS?: string;
  /** `off` when the deploy had to go without the hourly cron trigger: daily totals roll up on read. */
  CLOUDHAL_ANALYTICS_CRON?: string;
}

/** Default daily budget of uncached live queries: 80 % of WAE Free's 10,000 (§7.7, A2). */
export const DEFAULT_ANALYTICS_BUDGET = 8000;

const PURGE_URL = "https://site.internal/__cloudhal/purge";

/**
 * `CLOUDHAL_ANALYTICS_DEFAULTS` as the Site Worker reads it (`deploymentDefaults` in the renderer):
 * cloudhal.json's `analytics` block, in which `enabled` defaults to `true`.
 */
export function analyticsDefaults(json: string | undefined): AnalyticsDefaults {
  let parsed: unknown;
  try {
    parsed = json ? JSON.parse(json) : {};
  } catch {
    parsed = {};
  }
  const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return parseAnalyticsDefaults({ enabled: true, ...o });
}

/**
 * The deployment's analytics (RFC-0006 §8) from its bindings and vars. Plain construction, no I/O,
 * so it is built per request or scheduled run (ADR-0012: nothing but plain values is cached).
 */
export function adminAnalytics(
  env: AdminEnv,
  sql: SqlDriver,
  options: { now?: () => Date; log?: (line: string) => void } = {},
): AnalyticsService {
  const dataset = env.CLOUDHAL_ANALYTICS_DATASET;
  const on = typeof dataset === "string" && DATASET_RE.test(dataset);
  const budgetVar = Number(env.CLOUDHAL_ANALYTICS_BUDGET);
  const budget =
    Number.isInteger(budgetVar) && budgetVar >= 0 ? budgetVar : DEFAULT_ANALYTICS_BUDGET;
  const binding = on ? env.ANALYTICS_SQL : undefined;
  const log = options.log ?? ((line: string) => console.log(line));
  const onError = (message: string, error?: unknown) =>
    log(`${message}: ${error instanceof Error ? error.message : String(error ?? "")}`);
  const site = env.SITE;
  const token = env.CLOUDHAL_PURGE_TOKEN;
  return new AnalyticsService({
    sql,
    store: on ? "wae" : "none",
    ...(binding && on
      ? {
          live: new WaeReader(binding, {
            dataset,
            budget: new SqlQueryBudget(sql, { limit: budget }),
            onError,
          }),
          // The rollup job's own reads are exempt from the budget (§7.7).
          source: new WaeReader(binding, { dataset, onError }),
        }
      : {}),
    defaults: analyticsDefaults(env.CLOUDHAL_ANALYTICS_DEFAULTS),
    budget: on ? budget : null,
    rollups: env.CLOUDHAL_ANALYTICS_CRON === "off" ? "on-read" : "scheduled",
    ...(options.now ? { now: options.now } : {}),
    // The script tag lives in cached HTML: a settings change purges the site's whole cache (§5.1).
    ...(site && token
      ? {
          purgeSite: async (siteId: string) => {
            const res = await site.fetch(PURGE_URL, {
              method: "POST",
              headers: { authorization: `Bearer ${token}` },
            });
            await logPurge(sql, "analytics");
            log(`purge everything after analytics settings of ${siteId}: ${res.status}`);
            if (!res.ok) throw new Error(`purge failed: ${res.status}`);
          },
        }
      : {}),
    onError,
  });
}

/** Records one purge request in the budget comments share with publishing (RFC-0007 §8.4). */
async function logPurge(sql: SqlDriver, source: string): Promise<void> {
  try {
    await new SqlCommentStore(sql).purgeQueue.log(source);
  } catch {
    // the log is a budget hint: never fail a purge over it
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AdminWorkerOptions {
  /** Skills exposed over MCP (bundled at deploy time). */
  skills?: SkillSource[];
  log?: (line: string) => void;
}

const WORKER_PATHS = /^\/(api\/|mcp(\/|$)|\.well-known\/)/;

function required(env: AdminEnv, key: keyof AdminEnv): string {
  const value = env[key];
  if (typeof value !== "string" || value.length < 32)
    throw new Error(`secret ${key} is missing or shorter than 32 characters`);
  return value;
}

export function createAdminWorker(options: AdminWorkerOptions = {}) {
  const skills: LoadedSkill[] = (options.skills ?? []).map((s) => skillFromSource(s));
  const log = options.log ?? ((line: string) => console.log(line));
  // Only plain values survive between requests. Workers do not let one request await I/O started
  // by another (it hangs), so no promise, auth instance or binding wrapper is cached here.
  let migrated = false;
  /** When this isolate last ran the comments job on a request (no cron trigger); a plain number. */
  let lastCommentsHourly = 0;
  /** The site Worker confirmed it enforces time gates (RFC-0008 §7.7); a plain boolean. */
  let gatesConfirmed = false;
  const ensureMigrated = async (sql: SqlDriver) => {
    if (migrated) return;
    try {
      await migrate(sql, migrations);
    } catch {
      // A concurrent request or isolate applied them first; a second pass sees them as done.
      await migrate(sql, migrations);
    }
    migrated = true;
  };

  return {
    async fetch(request: Request, env: AdminEnv, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      // The assets layer answers existing files before the Worker runs, so a request for a file
      // under /assets/ that reaches us is missing (e.g. a chunk from an older Studio build). Answer
      // 404, never the SPA shell: an HTML 200 for a script URL can be cached and shadow the real
      // file once it exists.
      if (url.pathname.startsWith("/assets/"))
        return new Response("not found", {
          status: 404,
          headers: { "content-type": "text/plain", "cache-control": "no-store" },
        });
      if (!WORKER_PATHS.test(url.pathname)) {
        // A client-side route (/sites/…, /login, …): answer with the Studio shell.
        if (!env.ASSETS) return new Response("not found", { status: 404 });
        return env.ASSETS.fetch(new Request(new URL("/", url), { headers: request.headers }));
      }

      const sql = new D1Driver(env.DB);
      const blobs = new R2BlobStore(env.BLOBS);
      await ensureMigrated(sql);

      // A takedown (RFC-0004 §4.6) purges the asset's media URLs at once, not at the next publish.
      const purgeTags = async (tags: string[], what: string) => {
        if (!env.SITE || !env.CLOUDHAL_PURGE_TOKEN) return;
        const res = await env.SITE.fetch("https://site.internal/__cloudhal/purge", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.CLOUDHAL_PURGE_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ tags }),
        });
        await logPurge(sql, "media");
        log(`purge after ${what}: ${res.status} ${await res.text()}`);
      };
      // RFC-0007 §8.4: comment purges go through the queue; the flusher shares the budget.
      const siteBinding = env.SITE;
      const purgeToken = env.CLOUDHAL_PURGE_TOKEN;
      const flush = (siteId?: string) =>
        siteBinding && purgeToken
          ? flushCommentPurges({
              store: new SqlCommentStore(sql),
              fetch: (u, init) =>
                siteBinding.fetch(u, init as never) as unknown as Promise<Response>,
              token: purgeToken,
              siteId,
              log,
            }).catch((e) => {
              log(`comments purge flush failed: ${e instanceof Error ? e.message : String(e)}`);
            })
          : Promise.resolve();
      const comments = await adminComments(env, sql, {
        // takedowns after a 2 s micro-batch, normal changes after 20 s (V5: waitUntil keeps it alive)
        wake: (siteId, priority) =>
          ctx.waitUntil(
            sleep(
              priority === "takedown"
                ? PURGE_LIMITS.takedownMicrobatchMs
                : PURGE_LIMITS.normalDelayMs,
            ).then(() => flush(siteId)),
          ),
        ...(siteBinding && purgeToken
          ? {
              purgeSite: async (siteId: string) => {
                const res = await siteBinding.fetch(PURGE_URL, {
                  method: "POST",
                  headers: { authorization: `Bearer ${purgeToken}` },
                });
                await logPurge(sql, "comments");
                log(`purge everything for comments of ${siteId}: ${res.status}`);
                if (!res.ok) throw new Error(`purge failed: ${res.status}`);
              },
            }
          : {}),
      });
      // Every admin request also flushes what is due (Studio polls every 15–60 s).
      if (comments) ctx.waitUntil(flush());
      const store: SiteGraphStore = new SiteGraphStore({
        sql,
        blobs,
        // S15: `availability` is refused until the site Worker says it enforces gates.
        gates: siteGateSupport({
          fetch: siteBinding
            ? (u, init) => siteBinding.fetch(u, init as never) as unknown as Promise<Response>
            : undefined,
          token: purgeToken,
          confirmed: () => gatesConfirmed,
          remember: () => {
            gatesConfirmed = true;
          },
          log,
        }),
        onPublished: async (site, change) => {
          const binding = env.SITE;
          if (!binding || !env.CLOUDHAL_PURGE_TOKEN) return;
          // Only what changed between the snapshot that was live and the new one (RFC-0002 §7).
          const result = await purgeSiteCache({
            fetch: (url, init) => binding.fetch(url, init as never) as unknown as Promise<Response>,
            token: env.CLOUDHAL_PURGE_TOKEN,
            store,
            change,
            log: (line) => log(`${site.id}: ${line}`),
            onRequest: () => logPurge(sql, "publish"),
          });
          log(
            `purge after publishing ${site.id} (${change.from ?? "nothing"} → ${change.to ?? "nothing"}): ${result.mode}, ${result.tags.length} tag(s), ${result.requests} request(s)`,
          );
        },
        onMediaPurged: async (siteId, assetIds) =>
          purgeTags(
            assetIds.map((id) => `cloudhal-asset-${id}`),
            `taking down media of ${siteId}`,
          ),
        onHookError: (e) => log(`purge failed: ${e instanceof Error ? e.message : String(e)}`),
      });
      // No cron trigger (the account had no free slot, `CLOUDHAL_COMMENTS_CRON=off`): the hourly
      // comments job runs after an admin request instead, at most once an hour per isolate
      // (RFC-0007 §8.5, as analytics roll up on read). Bounded and idempotent like the cron run.
      if (comments && commentsHourlyDue(env, Date.now(), lastCommentsHourly)) {
        lastCommentsHourly = Date.now();
        const now = new Date(lastCommentsHourly);
        ctx.waitUntil(
          runCommentsHourly({ graph: store, store: comments.store, now })
            .then((c) =>
              log(
                `comments hourly (on request): ${c.sites} site(s), ${c.retained} row(s) past retention${c.more ? " (more next run)" : ""}, ${c.closed} thread(s) closed`,
              ),
            )
            .catch((e) =>
              log(`comments hourly failed: ${e instanceof Error ? e.message : String(e)}`),
            ),
        );
      }

      // Per request: Better Auth keeps request-scoped state (background tasks, plugin promises),
      // and its construction does no I/O.
      const auth: CloudhalAuth = createAuth({
        database: env.DB,
        sql,
        baseURL: url.origin,
        secret: required(env, "BETTER_AUTH_SECRET"),
        signUp:
          env.CLOUDHAL_SIGNUP === "open" || env.CLOUDHAL_SIGNUP === "closed"
            ? env.CLOUDHAL_SIGNUP
            : "first-user",
        setupToken: env.CLOUDHAL_SETUP_TOKEN,
        workers: { waitUntil: (p) => ctx.waitUntil(p) },
      });
      const audit = new AuditLog(sql);
      const approvals = new ApprovalStore(sql);
      const app = createApi({
        store,
        resolveActor: auth.resolveActor,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        audit,
        mcp: {
          stateKey: required(env, "MCP_STATE_KEY"),
          audit,
          skills,
          previewSecret: env.CLOUDHAL_PREVIEW_SECRET,
          approvals,
          // Remote clients must speak the stateless 2026-07-28 protocol or be served statelessly.
          legacy: "stateless",
          // fetch_asset_url never reaches this Worker's own host (Studio, API, purge); each site's
          // domains are refused too. Workers cannot pin DNS: see `workersTransport` (RFC-0004 §5.7).
          media: { blockedHosts: [url.hostname] },
        },
        ...(env.CLOUDHAL_PREVIEW_SECRET
          ? { preview: { secret: env.CLOUDHAL_PREVIEW_SECRET } }
          : {}),
        ...(env.CLOUDHAL_DEPLOY_TOKEN
          ? { admin: { deployToken: env.CLOUDHAL_DEPLOY_TOKEN, storage: { sql, blobs } } }
          : {}),
        analytics: adminAnalytics(env, sql, { log }),
        ...(comments ? { comments } : {}),
      });
      return app.fetch(request, env, ctx);
    },

    /**
     * The hourly job (RFC-0006 §7.5, cron `17 * * * *`): migrations as on the fetch path, salts
     * before today deleted, at most one finished site-day rolled up from WAE into D1, retention.
     * Then reader comments (RFC-0007 §8.5, §9.3): retention, threads closed by time, old monthly
     * salts, and a purge flush as the backstop. Bounded work per invocation; a missed run is
     * caught up by the next ones.
     */
    async scheduled(
      controller: ScheduledController,
      env: AdminEnv,
      _ctx: ExecutionContext,
    ): Promise<void> {
      const sql = new D1Driver(env.DB);
      await ensureMigrated(sql);
      const now = new Date(controller.scheduledTime || Date.now());
      const analytics = adminAnalytics(env, sql, { now: () => now, log });
      const store = new SiteGraphStore({ sql, blobs: new R2BlobStore(env.BLOBS) });
      const siteIds = (await store.listSites()).map((s) => s.id);
      const report = await analytics.rollup({ siteIds });
      const failed = report.failed.map((f) => `${f.siteId} ${f.day}: ${f.error}`);
      log(
        `analytics rollup (${analytics.feature().reader}): ${report.done.length} site-day(s) done, ${report.pending} pending, ${report.saltsDeleted} salt(s) deleted, ${report.retained} row(s) past retention${failed.length ? `; failed: ${failed.join("; ")}` : ""}`,
      );
      if (commentsOn(env)) {
        try {
          const comments = new SqlCommentStore(sql);
          const c = await runCommentsHourly({ graph: store, store: comments, now });
          log(
            `comments hourly: ${c.sites} site(s), ${c.retained} row(s) past retention${c.more ? " (more next run)" : ""}, ${c.deletedEntries} of deleted entries, ${c.closed} thread(s) closed, ${c.salts} salt(s) deleted`,
          );
          const site = env.SITE;
          if (site && env.CLOUDHAL_PURGE_TOKEN) {
            const f = await flushCommentPurges({
              store: comments,
              fetch: (u, init) => site.fetch(u, init as never) as unknown as Promise<Response>,
              token: env.CLOUDHAL_PURGE_TOKEN,
              now: () => now,
              log,
            });
            log(
              `comments purge backstop: ${f.sent.length} request(s), ${f.failed} failed${f.takedownWaiting ? ", a takedown is waiting" : ""}`,
            );
          }
        } catch (e) {
          log(`comments hourly failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    },
  };
}
