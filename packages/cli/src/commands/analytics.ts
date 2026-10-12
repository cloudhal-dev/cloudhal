/**
 * `cloudhal analytics status|rollup|seed|export` (RFC-0006 §11) and the local analytics of
 * `cloudhal studio` and `cloudhal mcp` (L3): raw events in the project's SQLite
 * (`analytics_events`, written by `cloudhal dev` with `analytics.dev` and by Node self-hosts),
 * read through `SqlAnalytics`, rolled up by the same `runRollups` as the admin Worker's cron.
 * `--remote` talks to the deployment's admin Worker with the deployment token.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type DemoNode, demoEvents, MAX_LIVE_DAYS } from "@cloudhal/analytics";
import {
  AnalyticsService,
  type AnalyticsStatus,
  rangeFromParams,
} from "@cloudhal/analytics/service";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import type { SqlDriver } from "@cloudhal/storage";
import {
  type AnalyticsConfig,
  analyticsDefaultsOf,
  analyticsEnabled,
  type ProjectConfig,
  readProjectConfig,
} from "../config.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

/** Default days of raw events kept in SQLite (`analytics.rawRetentionDays`). */
export const RAW_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * The project's local analytics: SQLite as both store and reader. `enabled` follows cloudhal.json
 * (Studio shows "not running" otherwise); `operator` forces the defaults on for CLI work on the
 * local data (seed, rollup) whatever the deployment default says.
 */
export function localAnalytics(
  sql: SqlDriver,
  cfg: Pick<ProjectConfig, "analytics">,
  options: { operator?: boolean; now?: () => Date } = {},
): AnalyticsService {
  const defaults = analyticsDefaultsOf(cfg);
  const on = analyticsEnabled(cfg);
  return new AnalyticsService({
    sql,
    store: on || options.operator ? "sql" : "none",
    live: new SqlAnalytics(sql),
    defaults: {
      enabled: options.operator ? true : defaults.enabled,
      uniqueVisitors: defaults.uniqueVisitors,
      vitalsOneIn: defaults.vitalsOneIn as 5,
    },
    ...(options.now ? { now: options.now } : {}),
    onError: (message, error) =>
      process.stderr.write(`analytics: ${message}: ${(error as Error)?.message ?? error}\n`),
  });
}

/**
 * The local job (`cloudhal studio`, hourly): roll up finished days of every site, then prune raw
 * events older than `rawRetentionDays`.
 */
export async function runLocalRollups(
  service: AnalyticsService,
  store: SiteGraphStore,
  sql: SqlDriver,
  analytics: AnalyticsConfig | undefined,
  options: { lookbackDays?: number; redo?: boolean } = {},
) {
  const siteIds = (await store.listSites()).map((s) => s.id);
  const lookback = options.lookbackDays ?? 7;
  const report = await service.rollup({
    siteIds,
    lookbackDays: lookback,
    maxSiteDays: lookback * Math.max(1, siteIds.length),
    ...(options.redo ? { redo: true } : {}),
  });
  const days = analytics?.rawRetentionDays ?? RAW_RETENTION_DAYS;
  const pruned = await new SqlAnalytics(sql).prune(
    new Date(service.now().getTime() - days * DAY_MS),
  );
  return { ...report, pruned };
}

/** Starts the hourly local job; returns a stop function. Errors are logged, never thrown. */
export function startLocalRollups(
  service: AnalyticsService,
  local: LocalStore,
  analytics: AnalyticsConfig | undefined,
  log: (line: string) => void = (l) => process.stderr.write(`${l}\n`),
): () => void {
  const tick = () => {
    runLocalRollups(service, local.store, local.sql, analytics).catch((e) =>
      log(`analytics rollup failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  tick();
  const timer = setInterval(tick, 3_600_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export interface AnalyticsCliOptions extends SyncOptions {
  /** Talk to the deployment (deployment token) instead of the local SQLite. */
  readonly remote?: boolean;
}

async function withLocal<T>(
  projectDir: string,
  fn: (l: { cfg: ProjectConfig; local: LocalStore; service: AnalyticsService }) => Promise<T>,
  now?: () => Date,
): Promise<T> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    return await fn({
      cfg,
      local,
      service: localAnalytics(local.sql, cfg, { operator: true, ...(now ? { now } : {}) }),
    });
  } finally {
    await local.close();
  }
}

async function remoteJson<T>(
  options: SyncOptions,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const url = new URL(pathname.replace(":siteId", cfg.siteId), adminUrl);
  const res = await f(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${url.pathname} failed (${res.status}): ${brief(body)}`);
  return (res.headers.get("content-type")?.startsWith("text/csv") ? body : JSON.parse(body)) as T;
}

export interface LocalStatus extends AnalyticsStatus {
  /** Raw events in SQLite (local only). */
  readonly events?: number;
}

/** `cloudhal analytics status [--remote]`. */
export async function analyticsStatus(options: AnalyticsCliOptions): Promise<LocalStatus> {
  if (options.remote)
    return remoteJson<LocalStatus>(options, "/api/admin/sites/:siteId/analytics/status");
  return withLocal(options.projectDir, async ({ cfg, local }) => {
    // the deployment's view, not the operator's: enabled follows cloudhal.json
    const status = await localAnalytics(local.sql, cfg).status(cfg.siteId);
    const row = await local.sql.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM analytics_events WHERE site_id = ?",
      [cfg.siteId],
    );
    return { ...status, events: Number(row?.n ?? 0) };
  });
}

export function describeStatus(s: LocalStatus): string[] {
  const f = s.feature;
  return [
    `analytics: ${f.enabled ? "on" : "off"} for this deployment (store ${f.store}, reader ${f.reader}${f.rollups === "on-read" ? ", daily totals on read" : ""})`,
    `site ${s.siteId}: ${s.settings.enabled ? "on" : "off"}${s.settings.stored ? "" : " (deployment default)"} · unique visitors ${s.settings.uniqueVisitors ? "on" : "off"} · vitals ${s.settings.vitalsOneIn ? `1 in ${s.settings.vitalsOneIn}` : "off"}`,
    `daily totals through: ${s.lastRollup ? s.lastRollup.day : "none yet"}`,
    ...(s.budget ? [`live queries today: ${s.budget.used} of ${s.budget.limit}`] : []),
    ...(s.quota
      ? [
          `yesterday (${s.quota.day}): ${s.quota.pageviews} page views, about ${s.quota.requests} requests`,
        ]
      : []),
    ...(s.events !== undefined ? [`raw events in SQLite: ${s.events}`] : []),
  ];
}

export interface RollupCliOptions extends AnalyticsCliOptions {
  /** Days back from yesterday (default 7; at most 92, WAE keeps 3 months). */
  readonly days?: number;
  /** Local only: roll up days that are already done again. */
  readonly redo?: boolean;
}

export interface RollupCliResult {
  readonly done: number;
  readonly failed: readonly { day: string; error: string }[];
  readonly pending: number;
  readonly calls?: number;
  readonly pruned?: number;
}

/** `cloudhal analytics rollup [--days n] [--remote]`: backfill daily totals. */
export async function analyticsRollup(options: RollupCliOptions): Promise<RollupCliResult> {
  const days = options.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > MAX_LIVE_DAYS)
    throw new Error(`--days must be a whole number from 1 to ${MAX_LIVE_DAYS}`);
  if (options.remote) {
    if (options.redo) throw new Error("--redo works on the local data only");
    // A few site-days per request (Worker limits); repeat while days are pending.
    let done = 0;
    let calls = 0;
    const failed: { day: string; error: string }[] = [];
    let pending = 1;
    while (pending > 0 && calls < days + 5) {
      const r = await remoteJson<{
        done: { day: string }[];
        failed: { day: string; error: string }[];
        pending: number;
        reader: string;
      }>(options, "/api/admin/sites/:siteId/analytics/rollup", {
        method: "POST",
        body: JSON.stringify({ days, maxSiteDays: 3 }),
      });
      calls++;
      if (r.reader === "none")
        throw new Error(
          "the deployment records analytics but cannot read them (no Analytics SQL binding on this account yet); nothing to roll up",
        );
      done += r.done.length;
      failed.push(...r.failed);
      // failed days stay pending; stop rather than retry them forever
      pending = r.failed.length > 0 && r.done.length === 0 ? 0 : r.pending;
      options.log?.(`rolled up ${done} day(s), ${r.pending} pending`);
    }
    return { done, failed, pending, calls };
  }
  return withLocal(options.projectDir, async ({ cfg, local, service }) => {
    const r = await runLocalRollups(service, local.store, local.sql, cfg.analytics, {
      lookbackDays: days,
      ...(options.redo ? { redo: true } : {}),
    });
    return { done: r.done.length, failed: r.failed, pending: r.pending, pruned: r.pruned };
  });
}

export interface SeedCliOptions {
  readonly projectDir: string;
  /** Days of demo traffic before today (default 30). */
  readonly days?: number;
  /** Average page views per day (default 120). */
  readonly views?: number;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

/** The site's published pages, articles and public archives, most important first. */
async function publishedNodes(store: SiteGraphStore, siteId: string): Promise<DemoNode[]> {
  const [pages, entries, terms, taxonomies] = await Promise.all([
    store.listPages(siteId),
    store.listContentEntries(siteId, { status: ["published"] }),
    store.listTerms(siteId),
    store.listTaxonomies(siteId),
  ]);
  const tax = new Map(taxonomies.map((t) => [t.id, t]));
  const home = pages.filter((p) => p.status === "published" && p.path === "/");
  return [
    ...home.map((p) => ({
      nodeId: p.id,
      nodeKind: "page" as const,
      path: p.path,
      locale: p.locale,
    })),
    ...entries.map((e) => ({
      nodeId: e.id,
      nodeKind: "entry" as const,
      path: `/${e.collection}/${e.slug}`,
      locale: e.locale,
    })),
    ...pages
      .filter((p) => p.status === "published" && p.path !== "/")
      .map((p) => ({ nodeId: p.id, nodeKind: "page" as const, path: p.path, locale: p.locale })),
    ...terms.flatMap((t) => {
      const x = tax.get(t.taxonomyId);
      return x?.archive.enabled && t.status === "active" && t.visibility === "public"
        ? [{ nodeId: t.id, nodeKind: "archive" as const, path: `${x.archive.basePath}/${t.slug}` }]
        : [];
    }),
  ];
}

/** `cloudhal analytics seed [--days 30]`: realistic demo data in the local SQLite only. */
export async function analyticsSeed(
  options: SeedCliOptions,
): Promise<{ events: number; nodes: number; rolledUp: number }> {
  const days = options.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("--days must be a whole number from 1 to 365");
  return withLocal(
    options.projectDir,
    async ({ cfg, local, service }) => {
      const nodes = await publishedNodes(local.store, cfg.siteId);
      if (nodes.length === 0)
        throw new Error(
          "nothing is published yet: publish the site (cloudhal snapshot --publish) first",
        );
      const settings = await service.settings(cfg.siteId);
      const events = demoEvents({
        siteId: cfg.siteId,
        nodes,
        days,
        now: service.now(),
        ...(options.views !== undefined ? { viewsPerDay: options.views } : {}),
        vitalsOneIn: settings.vitalsOneIn || 5,
        uniqueVisitors: settings.uniqueVisitors,
      });
      await new SqlAnalytics(local.sql).insertMany(events);
      const r = await runLocalRollups(service, local.store, local.sql, cfg.analytics, {
        lookbackDays: Math.min(days, MAX_LIVE_DAYS),
        redo: true,
      });
      options.log?.(
        `seeded ${events.length} demo events over ${days} day(s) on ${nodes.length} node(s); ${r.done.length} day(s) rolled up`,
      );
      if (!analyticsEnabled(cfg))
        options.log?.(
          'analytics are off in cloudhal.json; set "analytics": { "enabled": true } to see them in cloudhal studio',
        );
      return { events: events.length, nodes: nodes.length, rolledUp: r.done.length };
    },
    options.now,
  );
}

export interface ExportCliOptions extends AnalyticsCliOptions {
  readonly from?: string;
  readonly to?: string;
  /** Write to this file instead of returning the CSV. */
  readonly out?: string;
}

/** `cloudhal analytics export --from --to [--remote] [--out file]`: daily totals as CSV. */
export async function analyticsExport(options: ExportCliOptions): Promise<string> {
  const params = { from: options.from, to: options.to };
  const range = rangeFromParams(params);
  const csv = options.remote
    ? await remoteJson<string>(
        options,
        `/api/admin/sites/:siteId/analytics/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      )
    : await withLocal(options.projectDir, ({ cfg, service }) =>
        service.exportCsv(cfg.siteId, range),
      );
  if (options.out) await writeFile(path.resolve(options.projectDir, options.out), csv);
  return csv;
}
