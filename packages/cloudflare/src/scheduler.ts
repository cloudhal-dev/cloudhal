/**
 * The scheduler on Cloudflare (RFC-0008 §8.2–§8.7). One `runDue` per tick, whatever woke it:
 *
 * - **cron** (`* * * * *`, `CLOUDHAL_SCHEDULER=cron`, the default): the admin Worker's
 *   `scheduled` handler, `controller.scheduledTime` as the tick's `now`;
 * - **alarm** (`CLOUDHAL_SCHEDULER=alarm`, when Cloudflare refused the cron trigger): the
 *   SQLite-backed `SchedulerClock` Durable Object. It holds no state: `alarm()` runs a tick, never
 *   throws, and re-arms at `min(nextWakeAt, now + 1 h)` (`now + 1 s` while there is more). Pokes
 *   (`POST /poke {at}`) move the alarm earlier when a release or an automation becomes due sooner;
 *   cron ignores them;
 * - **request** (every mode): an admin request reads the heartbeat at most once a minute per
 *   isolate and, when it is more than two minutes behind, runs a tick in `waitUntil` (and re-arms
 *   the clock in alarm mode). A safety net, never the scheduler.
 *
 * The analytics rollup and the comments job are `SystemJobDefinition`s behind `system_jobs`
 * watermarks (every hour at :17), with today's code and log lines; `schedules.retention` runs daily.
 * Their statements count against the tick (`wrapCounting`) without being refused.
 *
 * A published release's purge plan goes through the site Worker like a publish's, logged in the
 * shared purge budget (`cache_purge_log`, source `schedules`); when the bucket is empty the tags
 * go into the comment purge queue (tag-generic) and the outcome records `deferred`.
 *
 * Legacy: a deployment configured before RFC-0008 without a cron slot carries
 * `CLOUDHAL_ANALYTICS_CRON=off` / `CLOUDHAL_COMMENTS_CRON=off`; both read as `alarm` until the next
 * `cloudhal deploy` removes them.
 */
import { releaseApprovalCheck } from "@cloudhal/api";
import { PURGE_LIMITS } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { type CachePurgePlan, SiteGraphStore, siteCacheTag } from "@cloudhal/core-ts";
import {
  type BuiltinInputs,
  type NotFoundAnalytics,
  notFoundFromAnalytics,
} from "@cloudhal/core-ts/automations";
import {
  CRON_RUNTIME,
  type ReleasePurge,
  type ReleasePurger,
  runScheduledTick,
  type SchedulerMode,
  type SchedulerRuntime,
} from "@cloudhal/core-ts/releases";
import {
  backstopDue,
  dailyAt,
  HOUR_MS,
  hourlyAt,
  type SystemJobDefinition,
  TICK_BUDGETS,
  type TickBudget,
  type TickReport,
  type TickTrigger,
} from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { flushCommentPurges, runCommentsHourly } from "./comments.ts";
import { PURGE_MAX_REQUESTS, PURGE_TAGS_PER_REQUEST } from "./purge.ts";

/** What the scheduler reads from the admin Worker's environment. */
export interface SchedulerEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  SITE?: Fetcher;
  CLOUDHAL_PURGE_TOKEN?: string;
  /** The `SchedulerClock` Durable Object namespace (declared by every deploy, §8.3). */
  SCHEDULER_CLOCK?: DurableObjectNamespace;
  /** `cron` (default) or `alarm` (`cloudhal deploy` sets it when the cron trigger was refused). */
  CLOUDHAL_SCHEDULER?: string;
  /** `paid` lifts the per-tick budget to Workers Paid's (§8.2); default `free`. */
  CLOUDHAL_TICK_BUDGET?: string;
  /** The site the site Worker serves (the feed check fetches only that site's feed). */
  CLOUDHAL_SITE_ID?: string;
  /** `off`: automations stop; releases and gates are unaffected (§11.6). */
  CLOUDHAL_AUTOMATIONS?: string;
  /** Legacy (before RFC-0008): `off` meant "no cron slot", read as `alarm`. */
  CLOUDHAL_ANALYTICS_CRON?: string;
  /** Legacy (before RFC-0008): `off` meant "no cron slot", read as `alarm`. */
  CLOUDHAL_COMMENTS_CRON?: string;
}

/** The clock's one instance (`getByName("clock")`, §8.3). */
export const CLOCK_NAME = "clock";
const CLOCK_URL = "https://scheduler-clock.internal";
const PURGE_URL = "https://site.internal/__cloudhal/purge";

/** `CLOUDHAL_SCHEDULER`, else the legacy `*_CRON=off` vars as `alarm`, else `cron`. */
export function schedulerMode(env: SchedulerEnv): "cron" | "alarm" {
  if (env.CLOUDHAL_SCHEDULER === "alarm" || env.CLOUDHAL_SCHEDULER === "cron")
    return env.CLOUDHAL_SCHEDULER;
  if (env.CLOUDHAL_ANALYTICS_CRON === "off" || env.CLOUDHAL_COMMENTS_CRON === "off") return "alarm";
  return "cron";
}

/** The per-tick budget: Workers Free unless the deployment says it is on Paid. */
export function tickBudget(env: SchedulerEnv): TickBudget {
  return env.CLOUDHAL_TICK_BUDGET === "paid" ? TICK_BUDGETS.paid : TICK_BUDGETS.free;
}

function clockStub(env: SchedulerEnv): DurableObjectStub | undefined {
  const ns = env.SCHEDULER_CLOCK;
  return ns ? ns.get(ns.idFromName(CLOCK_NAME)) : undefined;
}

/** Moves the clock's alarm to `at` when that is sooner (or arms a lost one). Never throws. */
export async function pokeClock(
  env: SchedulerEnv,
  at: string | number,
  log: (line: string) => void = () => {},
): Promise<void> {
  const stub = clockStub(env);
  if (!stub) return;
  try {
    const res = await stub.fetch(`${CLOCK_URL}/poke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: typeof at === "number" ? at : Date.parse(at) }),
    });
    await res.body?.cancel();
  } catch (e) {
    log(`scheduler clock poke failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The ticker as the API sees it (`ApiDeps.scheduler`): alarm mode pokes the clock. */
export function schedulerRuntime(
  env: SchedulerEnv,
  log: (line: string) => void = () => {},
): SchedulerRuntime {
  const mode: SchedulerMode = schedulerMode(env);
  if (mode !== "alarm") return CRON_RUNTIME;
  return { mode, poke: (at) => pokeClock(env, at, log) };
}

// ───────────────────────────── purge ─────────────────────────────

/**
 * Sends a published release's stored purge plan through the site Worker (≤ 3 tag requests, else
 * one "purge everything"), each request logged in `cache_purge_log` (source `schedules`). A failed
 * request (`success: false` is a 502 from the site Worker: the bucket is empty) puts what is left
 * into the purge queue and answers `deferred`; `wake` asks for a flush once the tags are ripe.
 */
export function releasePurger(
  env: SchedulerEnv,
  sql: SqlDriver,
  o: { log?: (line: string) => void; wake?: (siteId: string) => void } = {},
): ReleasePurger {
  const log = o.log ?? (() => {});
  return async (siteId: string, plan: CachePurgePlan): Promise<ReleasePurge> => {
    const site = env.SITE;
    const token = env.CLOUDHAL_PURGE_TOKEN;
    if (!site || !token) return "none";
    const queue = new SqlCommentStore(sql).purgeQueue;
    const defer = async (tags: readonly string[], why: string): Promise<ReleasePurge> => {
      try {
        await queue.enqueue(siteId, tags, "normal");
        o.wake?.(siteId);
        log(`schedules purge for ${siteId} deferred (${why}): ${tags.length} tag(s) queued`);
        return "deferred";
      } catch (e) {
        log(`schedules purge for ${siteId} failed: ${e instanceof Error ? e.message : String(e)}`);
        return "failed";
      }
    };
    const send = async (tags?: readonly string[]): Promise<boolean> => {
      let ok = false;
      try {
        const res = await site.fetch(PURGE_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            ...(tags ? { "content-type": "application/json" } : {}),
          },
          ...(tags ? { body: JSON.stringify({ tags }) } : {}),
        });
        ok = res.ok;
        await res.body?.cancel();
      } finally {
        try {
          await queue.log("schedules");
        } catch {
          // the log is a budget hint: never fail a purge over it
        }
      }
      return ok;
    };
    const everything =
      plan.mode === "everything" || plan.tags.length > PURGE_TAGS_PER_REQUEST * PURGE_MAX_REQUESTS;
    if (everything) {
      const ok = await send().catch(() => false);
      return ok ? "everything" : defer([siteCacheTag(siteId)], "the purge budget is empty");
    }
    if (plan.tags.length === 0) return "none";
    for (let i = 0; i < plan.tags.length; i += PURGE_TAGS_PER_REQUEST) {
      const batch = plan.tags.slice(i, i + PURGE_TAGS_PER_REQUEST);
      const ok = await send(batch).catch(() => false);
      if (!ok) return defer(plan.tags.slice(i), "the purge budget is empty");
    }
    return "tags";
  };
}

// ───────────────────────────── system jobs ─────────────────────────────

/** What the analytics rollup needs (the admin Worker passes `adminAnalytics`). */
export type AnalyticsRollup = (
  sql: SqlDriver,
  now: Date,
) => {
  rollup(o: { siteIds: string[] }): Promise<{
    readonly done: readonly unknown[];
    readonly pending: number;
    readonly saltsDeleted: number;
    readonly retained: number;
    readonly failed: readonly { siteId: string; day: string; error: string }[];
  }>;
  feature(): { reader: string; enabled?: boolean };
  /** Analytics' `renders` report (the broken-link sweep's 404 rows, RFC-0008 §11.1). */
  query?: NotFoundAnalytics["query"];
};

/**
 * The deployment's periodic jobs (§8.2): today's hourly code behind watermarks, with today's log
 * lines; `comments.hourly` only where comments are on.
 */
export function adminSystemJobs(
  env: SchedulerEnv,
  sql: SqlDriver,
  o: {
    analytics: AnalyticsRollup;
    commentsOn: boolean;
    log: (line: string) => void;
  },
): SystemJobDefinition[] {
  const { log } = o;
  const graph = () => new SiteGraphStore({ sql, blobs: new R2BlobStore(env.BLOBS) });
  const jobs: SystemJobDefinition[] = [
    {
      name: "analytics.rollup",
      cost: 20,
      next: hourlyAt(17),
      async run({ now }) {
        const analytics = o.analytics(sql, now);
        const siteIds = (await graph().listSites()).map((s) => s.id);
        const report = await analytics.rollup({ siteIds });
        const failed = report.failed.map((f) => `${f.siteId} ${f.day}: ${f.error}`);
        log(
          `analytics rollup (${analytics.feature().reader}): ${report.done.length} site-day(s) done, ${report.pending} pending, ${report.saltsDeleted} salt(s) deleted, ${report.retained} row(s) past retention${failed.length ? `; failed: ${failed.join("; ")}` : ""}`,
        );
      },
    },
    {
      name: "schedules.retention",
      cost: 3,
      next: dailyAt(3, 27),
      async run({ now }) {
        const r = await new SqlScheduleStore(sql).applyRetention(now.toISOString());
        if (r.runs + r.releases > 0)
          log(`schedules retention: ${r.runs} run(s), ${r.releases} release(s) deleted`);
      },
    },
  ];
  if (o.commentsOn)
    jobs.push({
      name: "comments.hourly",
      cost: 20,
      next: hourlyAt(17),
      async run({ now }) {
        const comments = new SqlCommentStore(sql);
        const c = await runCommentsHourly({ graph: graph(), store: comments, now });
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
      },
    });
  return jobs;
}

// ───────────────────────────── built-in jobs ─────────────────────────────

const SITE_ORIGIN = "https://site.internal";

/**
 * Fetches the site's own `/rss.xml` or `/sitemap.xml` through the `SITE` binding, as readers get
 * them (RFC-0008 §11.1 `feed-check`). The site Worker serves one site (`CLOUDHAL_SITE_ID`): for
 * any other site of the deployment the answer is undefined (not served from here).
 */
export function siteDocumentFetcher(
  env: SchedulerEnv,
): NonNullable<BuiltinInputs["fetchDocument"]> | undefined {
  const site = env.SITE;
  if (!site) return undefined;
  return async ({ siteId, path }) => {
    if (env.CLOUDHAL_SITE_ID && env.CLOUDHAL_SITE_ID !== siteId) return undefined;
    const res = await site.fetch(`${SITE_ORIGIN}${path}`, {
      headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.1" },
    });
    const contentType = res.headers.get("content-type");
    return {
      status: res.status,
      ...(contentType ? { contentType } : {}),
      body: await res.text(),
    };
  };
}

/** What the admin Worker adds for the built-in jobs: analytics' 404 rows and the feed fetcher. */
export function adminBuiltinInputs(
  env: SchedulerEnv,
  analytics: ReturnType<AnalyticsRollup> | undefined,
): BuiltinInputs {
  const query = analytics?.query;
  const fetchDocument = siteDocumentFetcher(env);
  return {
    ...(analytics && query
      ? {
          notFound: notFoundFromAnalytics({
            feature: () => ({ enabled: analytics.feature().enabled === true }),
            query: (q) => query.call(analytics, q),
          }),
        }
      : {}),
    ...(fetchDocument ? { fetchDocument } : {}),
  };
}

// ───────────────────────────── one tick ─────────────────────────────

export interface AdminTickOptions {
  readonly trigger: TickTrigger;
  readonly now: Date;
  readonly log: (line: string) => void;
  readonly analytics: AnalyticsRollup;
  readonly commentsOn: boolean;
  /** Keeps a deferred purge's flush alive after the tick (the handler's `waitUntil`). */
  readonly waitUntil?: ((p: Promise<unknown>) => void) | undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One tick of the admin Worker (cron, alarm, request backstop or the operator's run-due). */
export function runAdminTick(env: SchedulerEnv, o: AdminTickOptions): Promise<TickReport> {
  const sql = new D1Driver(env.DB);
  const mode = schedulerMode(env);
  const flush = (siteId: string) => {
    const site = env.SITE;
    const token = env.CLOUDHAL_PURGE_TOKEN;
    if (!o.waitUntil || !site || !token) return;
    o.waitUntil(
      sleep(PURGE_LIMITS.normalDelayMs + 500)
        .then(() =>
          flushCommentPurges({
            store: new SqlCommentStore(sql),
            fetch: (u, init) => site.fetch(u, init as never) as unknown as Promise<Response>,
            token,
            siteId,
            log: o.log,
          }),
        )
        .catch((e) =>
          o.log(`schedules purge flush failed: ${e instanceof Error ? e.message : String(e)}`),
        ),
    );
  };
  const blobs = new R2BlobStore(env.BLOBS);
  return runScheduledTick({
    sql,
    blobs,
    now: o.now,
    trigger: o.trigger,
    // cron wakes every minute anyway; the clock and the backstop compute the next wake
    wake: mode === "cron" ? "minute" : "computed",
    budget: tickBudget(env),
    log: o.log,
    systemJobs: ({ counted }) =>
      adminSystemJobs(env, counted, {
        analytics: o.analytics,
        commentsOn: o.commentsOn,
        log: o.log,
      }),
    purge: ({ counted }) => releasePurger(env, counted, { log: o.log, wake: flush }),
    automationsEnabled: env.CLOUDHAL_AUTOMATIONS !== "off",
    // RFC-0008 §11.1: the built-in jobs read analytics' 404 rows and the site's own feed.
    builtinInputs: ({ counted }) => adminBuiltinInputs(env, o.analytics(counted, o.now)),
    // RFC-0008 §10.6: the approver may still approve it, an auto release's key still holds.
    checkApproval: releaseApprovalCheck({ sql, graph: new SiteGraphStore({ sql, blobs }) }),
  });
}

/** Isolate-local state of the request backstop: plain numbers only (ADR-0012). */
export interface BackstopState {
  lastCheck: number;
  lastRun: number;
}

/** How often an isolate reads the heartbeat, and runs at most one backstop tick (§8.6). */
export const BACKSTOP_EVERY_MS = 60_000;

/**
 * The request backstop (§8.6): at most once a minute per isolate, read the heartbeat; if it is
 * more than two minutes behind, run a tick (`request`) — and in alarm mode re-arm the clock.
 * Returns the promise for `waitUntil`, or undefined when nothing is to be done.
 */
export function requestBackstop(
  env: SchedulerEnv,
  state: BackstopState,
  o: Omit<AdminTickOptions, "trigger" | "now"> & { now?: () => number },
): Promise<void> | undefined {
  const clock = o.now ?? (() => Date.now());
  const t = clock();
  if (t - state.lastCheck < BACKSTOP_EVERY_MS) return undefined;
  state.lastCheck = t;
  return (async () => {
    const heartbeat = await new SqlScheduleStore(new D1Driver(env.DB)).heartbeat();
    if (!backstopDue(heartbeat, clock())) return;
    if (clock() - state.lastRun < BACKSTOP_EVERY_MS) return;
    state.lastRun = clock();
    if (schedulerMode(env) === "alarm") await pokeClock(env, clock(), o.log);
    o.log(
      `schedules backstop: the scheduler's last tick was ${heartbeat ? heartbeat.at : "never"}; running one on this request`,
    );
    await runAdminTick(env, { ...o, trigger: "request", now: new Date(clock()) });
  })().catch((e) =>
    o.log(`schedules backstop failed: ${e instanceof Error ? e.message : String(e)}`),
  );
}

// ───────────────────────────── the clock ─────────────────────────────

/**
 * How the clock re-arms after a tick (§8.3): `now + 1 s` while there is more, else the next wake,
 * at most an hour away (a safety alarm), never in the past.
 */
export function nextAlarm(report: TickReport | undefined, now: number): number {
  if (!report) return now + 60_000; // a failed tick: try again in a minute
  if (report.more) return now + 1_000;
  const wake = report.nextWakeAt ? Date.parse(report.nextWakeAt) : Number.NaN;
  const next = Number.isFinite(wake) ? Math.min(wake, now + HOUR_MS) : now + HOUR_MS;
  return Math.max(next, now + 1_000);
}

/**
 * Builds the `SchedulerClock` Durable Object class (SQLite-backed, one instance named "clock").
 * `tick` runs one admin tick; the admin Worker module passes its own (migrations, analytics,
 * comments). Kept as a factory so the class needs no `cloudflare:workers` import and its logic is
 * testable on Node.
 */
export function schedulerClockClass(
  tick: (
    env: SchedulerEnv,
    o: { now: Date; waitUntil: (p: Promise<unknown>) => void },
  ) => Promise<TickReport>,
  log: (line: string) => void = (l) => console.log(l),
) {
  return class SchedulerClock {
    readonly state: DurableObjectState;
    readonly env: SchedulerEnv;

    constructor(state: DurableObjectState, env: SchedulerEnv) {
      this.state = state;
      this.env = env;
    }

    /** `POST /poke {at}` moves the alarm earlier (or arms it); `GET /alarm` reads it. */
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/poke") {
        const body = (await request.json().catch(() => ({}))) as { at?: unknown };
        const at = typeof body.at === "number" && Number.isFinite(body.at) ? body.at : Date.now();
        return Response.json({ alarm: await this.poke(at) });
      }
      if (request.method === "GET" && url.pathname === "/alarm")
        return Response.json({ alarm: await this.state.storage.getAlarm() });
      return new Response("not found", { status: 404 });
    }

    /** Moves the alarm to `at` when that is sooner than the armed one (never into the past). */
    async poke(at: number): Promise<number> {
      const t = Math.max(at, Date.now());
      const current = await this.state.storage.getAlarm();
      if (current === null || t < current) {
        await this.state.storage.setAlarm(t);
        return t;
      }
      return current;
    }

    /** Runs a tick and always re-arms; never throws (a thrown alarm is retried only six times). */
    async alarm(): Promise<void> {
      const started = Date.now();
      let report: TickReport | undefined;
      try {
        report = await tick(this.env, {
          now: new Date(started),
          waitUntil: (p) => this.state.waitUntil(p),
        });
      } catch (e) {
        log(`scheduler clock tick failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        await this.state.storage.setAlarm(nextAlarm(report, Date.now()));
      } catch (e) {
        log(`scheduler clock could not re-arm: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
}
