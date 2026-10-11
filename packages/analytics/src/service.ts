/**
 * `AnalyticsService` (RFC-0006 §7.7, §8, §9): the one object the admin Worker, the API, the MCP
 * tools and the CLI hand around. It wires the pieces of this package together for one deployment —
 * the composite read path, settings with CAS, the daily salt rule, the rollup job and the CSV export
 * of rollups — and reports what the deployment can do (`/api/instance` → `features.analytics`).
 * It holds plain values only between requests (ADR-0012), and is Worker-safe.
 */
import type { AnalyticsChannel, AnalyticsDevice } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { AnalyticsQueryError } from "./errors.ts";
import {
  type AnalyticsQuery,
  type AnalyticsReader,
  type AnalyticsResult,
  addDays,
  CHANNELS,
  COUNTRY_RE,
  DEVICES,
  type Filter,
  ID_RE,
  MAX_LIVE_DAYS,
  num,
  type ParsedRange,
  parseRange,
  type Range,
  startOfUtcDay,
  utcDay,
} from "./model.ts";
import { CompositeReader } from "./reader.ts";
import { MAX_ROLLUP_DAYS, RollupReader, type RollupReport, runRollups } from "./rollup.ts";
import {
  type AnalyticsDefaults,
  type AnalyticsSettings,
  type AnalyticsSettingsPatch,
  DEFAULT_ANALYTICS,
  type EffectiveAnalyticsSettings,
} from "./settings.ts";
import {
  deleteSalt,
  deleteSaltsBefore,
  getEffectiveSettings,
  lastRollup,
  putAnalyticsSettings,
  type RollupRun,
  readQueryBudget,
} from "./sql/state.ts";

/** Where this deployment records events: WAE (Cloudflare), SQLite (local, Node), or nowhere. */
export type AnalyticsStoreKind = "wae" | "sql" | "none";
/** How live events are read: the Analytics SQL binding, SQLite, or not at all ("can't read yet", A1). */
export type AnalyticsReaderKind = "binding" | "sql" | "none";

/** `/api/instance` → `features.analytics` (RFC-0006 §8). */
export interface AnalyticsFeature {
  /** The deployment records analytics (`analytics.enabled` in cloudhal.json; a store exists). */
  readonly enabled: boolean;
  readonly store: AnalyticsStoreKind;
  /** `none` while the store is written but cannot be read (no Analytics SQL binding). */
  readonly reader: AnalyticsReaderKind;
  /** How far back live data reaches (days). */
  readonly liveDays: number;
  /** Uncached live queries per UTC day; `null` when reads are not budgeted (SQLite). */
  readonly budget: number | null;
  /**
   * How finished days become daily totals: an hourly job (`scheduled`), or the first read that
   * finds a day missing (`on-read`: no cron trigger was available, RFC-0006 §11).
   */
  readonly rollups: "scheduled" | "on-read";
  /** Deployment defaults for sites without a settings row. */
  readonly defaults: AnalyticsDefaults;
}

/** The feature of a deployment without analytics (no service). */
export const ANALYTICS_OFF: AnalyticsFeature = {
  enabled: false,
  store: "none",
  reader: "none",
  liveDays: MAX_LIVE_DAYS,
  budget: null,
  rollups: "scheduled",
  defaults: DEFAULT_ANALYTICS,
};

export interface AnalyticsServiceOptions {
  /** The database holding the analytics tables (D1 or SQLite). */
  readonly sql: SqlDriver;
  readonly store: AnalyticsStoreKind;
  /**
   * Live reads for people and agents: a budgeted `WaeReader`, or `SqlAnalytics`. Omit when the
   * store cannot be read (`reader: "none"`); answers then come from rollups with `partial: true`.
   */
  readonly live?: AnalyticsReader | undefined;
  /** The rollup job's reader (exempt from the budget); defaults to `live`. */
  readonly source?: AnalyticsReader | undefined;
  readonly defaults?: AnalyticsDefaults | undefined;
  /** The daily live-query budget reported to Studio (`null`: not budgeted). */
  readonly budget?: number | null | undefined;
  readonly liveDays?: number | undefined;
  readonly rollups?: "scheduled" | "on-read" | undefined;
  readonly now?: (() => Date) | undefined;
  /** Purges a site's edge cache, so the script tag follows a settings change (the `SITE` binding). */
  readonly purgeSite?: ((siteId: string) => Promise<void>) | undefined;
  readonly onError?: ((message: string, error?: unknown) => void) | undefined;
}

export interface UpdateSettingsInput {
  readonly siteId: string;
  /** The `rev` the caller read (`0` while the site uses the deployment defaults). */
  readonly rev: number;
  readonly patch: AnalyticsSettingsPatch;
  /** Actor id recorded as `updated_by`. */
  readonly actorId: string;
}

export interface UpdateSettingsResult {
  readonly before: EffectiveAnalyticsSettings;
  readonly after: AnalyticsSettings;
  /** Today's salt was deleted (unique visitors turned off). */
  readonly saltDeleted: boolean;
  /** The site's cache was purged (enabled or vitals sampling changed); `false` when it failed. */
  readonly purged: boolean;
  /** What changed, `{field: {from, to}}` (the audit row). */
  readonly changes: Readonly<Record<string, { from: unknown; to: unknown }>>;
}

export interface QuotaEstimate {
  /** The UTC day estimated (yesterday). */
  readonly day: string;
  readonly pageviews: number;
  /** Requests the analytics script sent: one beacon per page view plus the vitals beacons. */
  readonly beacons: number;
  /**
   * Page loads (cached or not, each a Workers request) plus the beacons: what Studio compares
   * with Workers Free's 100,000 requests a day (RFC-0006 §10.1). An estimate.
   */
  readonly requests: number;
}

export interface AnalyticsStatus {
  readonly siteId: string;
  readonly feature: AnalyticsFeature;
  readonly settings: EffectiveAnalyticsSettings;
  /** The latest complete daily rollup (`null` before the first). */
  readonly lastRollup: { day: string; finishedAt: string | null; source: string } | null;
  /** Today's spend of the live-query budget; `null` when reads are not budgeted. */
  readonly budget: { day: string; used: number; limit: number; spent: boolean } | null;
  /** Yesterday's request estimate for the Free-plan warning; `null` when it could not be read. */
  readonly quota: QuotaEstimate | null;
}

/** The ranges agents and Studio name by preset. */
export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "12m"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const PRESET_DAYS: Record<RangePreset, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

/** A preset as a range of whole UTC days ending with today (today included, partial). */
export function presetRange(preset: RangePreset, now: Date = new Date()): Range {
  const end = addDays(startOfUtcDay(now), 1);
  return { from: utcDay(addDays(end, -PRESET_DAYS[preset])), to: utcDay(end) };
}

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === "string" && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** The period of the same length just before `range` ("compare with the previous period"). */
export function previousRange(range: Range): Range {
  const r = parseRange(range, MAX_ROLLUP_DAYS * 2);
  const len = r.to.getTime() - r.from.getTime();
  return { from: iso(new Date(r.from.getTime() - len)), to: iso(r.from) };
}

function iso(d: Date): string {
  const s = d.toISOString();
  return s.endsWith("T00:00:00.000Z") ? s.slice(0, 10) : s;
}

/**
 * Reads a range from request parameters: a `range` preset, or `from` and `to` (ISO dates or
 * instants, UTC, `to` exclusive). Defaults to the last 30 days. Throws `AnalyticsQueryError`.
 */
export function rangeFromParams(
  params: { range?: string | undefined; from?: string | undefined; to?: string | undefined },
  now: Date = new Date(),
  maxDays = MAX_ROLLUP_DAYS,
): Range {
  if (params.from !== undefined || params.to !== undefined) {
    if (params.range !== undefined)
      throw new AnalyticsQueryError("give either range or from and to, not both");
    if (!params.from || !params.to) throw new AnalyticsQueryError("from and to go together");
    const range = { from: params.from, to: params.to };
    parseRange(range, maxDays);
    return range;
  }
  if (params.range === undefined) return presetRange("30d", now);
  if (!isRangePreset(params.range))
    throw new AnalyticsQueryError(`range must be one of ${RANGE_PRESETS.join(", ")}`);
  return presetRange(params.range, now);
}

/**
 * Parses `filter=<dimension>:<value>` (RFC-0006 §9.2): at most one of `node:<Id>`,
 * `channel:<enum>`, `country:<ISO2>` and `device:<enum>`. Throws `AnalyticsQueryError`.
 */
export function parseFilterParam(value: string | undefined): Filter | undefined {
  if (value === undefined || value === "") return undefined;
  const at = value.indexOf(":");
  if (at < 1) throw new AnalyticsQueryError("filter must be <dimension>:<value>");
  const key = value.slice(0, at);
  const v = value.slice(at + 1);
  switch (key) {
    case "node":
      if (!ID_RE.test(v)) throw new AnalyticsQueryError("filter node must be an id");
      return { node: v };
    case "channel":
      if (!(CHANNELS as readonly string[]).includes(v))
        throw new AnalyticsQueryError(`filter channel must be one of ${CHANNELS.join(", ")}`);
      return { channel: v as AnalyticsChannel };
    case "country":
      if (!COUNTRY_RE.test(v))
        throw new AnalyticsQueryError("filter country must be an ISO 3166-1 alpha-2 code");
      return { country: v };
    case "device":
      if (!(DEVICES as readonly string[]).includes(v))
        throw new AnalyticsQueryError(`filter device must be one of ${DEVICES.join(", ")}`);
      return { device: v as AnalyticsDevice };
    default:
      throw new AnalyticsQueryError("filter takes node, channel, country or device");
  }
}

const SETTING_FIELDS = [
  "enabled",
  "uniqueVisitors",
  "vitalsOneIn",
  "rollupRetentionDays",
  "planHint",
] as const;

/** Reads of one site start an on-read rollup at most this often (per isolate). */
const ON_READ_EVERY_MS = 60_000;

export class AnalyticsService {
  readonly sql: SqlDriver;
  readonly #o: AnalyticsServiceOptions;
  readonly #reader: CompositeReader;
  /** Site id → when an on-read rollup last ran in this isolate (plain values only). */
  readonly #onRead = new Map<string, number>();

  constructor(options: AnalyticsServiceOptions) {
    this.sql = options.sql;
    this.#o = options;
    this.#reader = new CompositeReader({
      rollups: new RollupReader(options.sql),
      ...(options.live ? { live: options.live } : {}),
      now: () => this.now(),
      liveDays: options.liveDays ?? MAX_LIVE_DAYS,
    });
  }

  now(): Date {
    return this.#o.now?.() ?? new Date();
  }

  get defaults(): AnalyticsDefaults {
    return this.#o.defaults ?? DEFAULT_ANALYTICS;
  }

  feature(): AnalyticsFeature {
    const live = this.#o.live;
    const store = this.#o.store;
    return {
      enabled: store !== "none",
      store,
      reader: !live || store === "none" ? "none" : live.kind === "wae" ? "binding" : "sql",
      liveDays: this.#o.liveDays ?? MAX_LIVE_DAYS,
      budget: this.#o.budget ?? null,
      rollups: this.#o.rollups ?? "scheduled",
      defaults: this.defaults,
    };
  }

  /** The settings that apply to a site now (its row, or the deployment defaults). */
  settings(siteId: string): Promise<EffectiveAnalyticsSettings> {
    return getEffectiveSettings(this.sql, siteId, this.defaults);
  }

  /** The composite read path (rollups for complete days, the rest live). */
  get reader(): AnalyticsReader {
    return this.#reader;
  }

  /** Answers one query of the model; runs an on-read rollup first when no cron does it. */
  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    await this.#rollupOnRead(q.siteId);
    return this.#reader.query(q);
  }

  async #rollupOnRead(siteId: string): Promise<void> {
    if (this.#o.rollups !== "on-read" || !this.#source()) return;
    const last = this.#onRead.get(siteId);
    const now = this.now().getTime();
    if (last !== undefined && now - last < ON_READ_EVERY_MS) return;
    this.#onRead.set(siteId, now);
    try {
      // Bounded work per read: a few site-days; the next reads catch up the rest.
      await this.rollup({ siteIds: [siteId], maxSiteDays: 2 });
    } catch (error) {
      this.#o.onError?.("analytics on-read rollup failed", error);
    }
  }

  #source(): AnalyticsReader | undefined {
    return this.#o.source ?? this.#o.live;
  }

  /**
   * Writes a site's settings (CAS on `rev`). Turning unique visitors off deletes today's salt —
   * the deployment's only one, so every site's hashes start over for the rest of the UTC day
   * (RFC-0006 §6.2; see the implementation notes). Changing `enabled` or `vitalsOneIn` purges the
   * site's cache so the script tag follows.
   */
  async updateSettings(input: UpdateSettingsInput): Promise<UpdateSettingsResult> {
    const now = this.now();
    const { before, after } = await putAnalyticsSettings(this.sql, {
      siteId: input.siteId,
      rev: input.rev,
      patch: input.patch,
      actorId: input.actorId,
      now,
      defaults: this.defaults,
    });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of SETTING_FIELDS)
      if (before[f] !== after[f]) changes[f] = { from: before[f], to: after[f] };
    let saltDeleted = false;
    if (before.uniqueVisitors && !after.uniqueVisitors) {
      await deleteSalt(this.sql, utcDay(now));
      saltDeleted = true;
    }
    let purged = false;
    if ((changes.enabled || changes.vitalsOneIn) && this.#o.purgeSite) {
      try {
        await this.#o.purgeSite(input.siteId);
        purged = true;
      } catch (error) {
        this.#o.onError?.("analytics settings purge failed", error);
      }
    }
    return { before, after, saltDeleted, purged, changes };
  }

  /**
   * One run of the rollup job (§7.5): old salts are deleted; up to `maxSiteDays` finished site-days
   * are rolled up from the raw store. Without a readable store only the salts are handled.
   */
  async rollup(options: {
    siteIds: readonly string[];
    lookbackDays?: number;
    maxSiteDays?: number;
    redo?: boolean;
  }): Promise<RollupReport> {
    const now = this.now();
    const source = this.#source();
    if (!source || this.#o.store === "none") {
      const saltsDeleted = await deleteSaltsBefore(this.sql, utcDay(startOfUtcDay(now)));
      return { saltsDeleted, done: [], failed: [], pending: 0, retained: 0 };
    }
    return runRollups({
      reader: source,
      sql: this.sql,
      siteIds: options.siteIds,
      now,
      defaults: this.defaults,
      ...(options.lookbackDays !== undefined ? { lookbackDays: options.lookbackDays } : {}),
      ...(options.maxSiteDays !== undefined ? { maxSiteDays: options.maxSiteDays } : {}),
      ...(options.redo ? { redo: true } : {}),
      source: this.#o.store === "wae" ? "wae" : "sql",
    });
  }

  /** Yesterday's request estimate (§10.1), from rollups when the day is done, else live. */
  async quota(siteId: string): Promise<QuotaEstimate | null> {
    const today = startOfUtcDay(this.now());
    const range = { from: utcDay(addDays(today, -1)), to: utcDay(today) };
    try {
      const [summary, vitals] = await Promise.all([
        this.query({ kind: "summary", siteId, range }),
        this.query({ kind: "vitals", siteId, range }),
      ]);
      const settings = await this.settings(siteId);
      const samples = Math.max(0, ...vitals.data.metrics.map((m) => m.samples));
      const vitalsBeacons =
        settings.vitalsOneIn > 0 ? Math.round(samples / settings.vitalsOneIn) : 0;
      const pageviews = summary.data.pageviews;
      const beacons = pageviews + vitalsBeacons;
      return { day: range.from, pageviews, beacons, requests: pageviews + beacons };
    } catch (error) {
      this.#o.onError?.("analytics quota estimate failed", error);
      return null;
    }
  }

  /** What Studio's Analytics screen and `cloudhal analytics status` show. */
  async status(siteId: string): Promise<AnalyticsStatus> {
    const feature = this.feature();
    const [settings, last] = await Promise.all([
      this.settings(siteId),
      lastRollup(this.sql, siteId),
    ]);
    let budget: AnalyticsStatus["budget"] = null;
    if (feature.budget !== null) {
      const day = utcDay(this.now());
      const used = await readQueryBudget(this.sql, day);
      budget = { day, used, limit: feature.budget, spent: used >= feature.budget };
    }
    return {
      siteId,
      feature,
      settings,
      lastRollup: last ? rollupInfo(last) : null,
      budget,
      quota: feature.enabled ? await this.quota(siteId) : null,
    };
  }

  /** Site-level CSV of the daily rollups in a range (complete, rolled-up days only; §11, OQ 11). */
  async exportCsv(siteId: string, range: Range): Promise<string> {
    return dailyRowsCsv(
      await exportDailyRows(this.sql, siteId, parseRange(range, MAX_ROLLUP_DAYS)),
    );
  }
}

function rollupInfo(r: RollupRun) {
  return { day: r.day, finishedAt: r.finishedAt, source: r.source };
}

// ───────────────────────────── export ─────────────────────────────

export interface ExportedDailyRow {
  readonly day: string;
  readonly dim: string;
  readonly key: string;
  readonly pageviews: number;
  readonly visits: number;
  readonly visitors: number | null;
  readonly hits: number | null;
  readonly value: number | null;
  readonly samples: number | null;
  readonly good: number | null;
  readonly poor: number | null;
}

/** Rolled-up rows of the complete UTC days in `range` (days whose run is `done`), ordered. */
export async function exportDailyRows(
  sql: SqlDriver,
  siteId: string,
  range: ParsedRange,
): Promise<ExportedDailyRow[]> {
  const start = startOfUtcDay(range.from);
  const first = start.getTime() === range.from.getTime() ? start : addDays(start, 1);
  const end = startOfUtcDay(range.to);
  const rows = await sql.all<Record<string, unknown>>(
    `SELECT day, dim, key, pageviews, visits, visitors, hits, value, samples, good, poor
     FROM analytics_daily
     WHERE site_id = ? AND day >= ? AND day < ?
       AND day IN (SELECT day FROM analytics_rollup_runs WHERE site_id = ? AND state = 'done' AND day >= ? AND day < ?)
     ORDER BY day, dim, key`,
    [siteId, utcDay(first), utcDay(end), siteId, utcDay(first), utcDay(end)],
  );
  const opt = (v: unknown) => (v === null || v === undefined ? null : num(v));
  return rows.map((r) => ({
    day: String(r.day),
    dim: String(r.dim),
    key: String(r.key),
    pageviews: num(r.pageviews),
    visits: num(r.visits),
    visitors: opt(r.visitors),
    hits: opt(r.hits),
    value: opt(r.value),
    samples: opt(r.samples),
    good: opt(r.good),
    poor: opt(r.poor),
  }));
}

const CSV_COLUMNS = [
  "day",
  "dim",
  "key",
  "pageviews",
  "visits",
  "visitors",
  "hits",
  "value",
  "samples",
  "good",
  "poor",
] as const;

/**
 * RFC 4180 CSV with a header row. Keys are visitor-controlled for some dimensions (requested paths,
 * hostnames, UTM tokens): every field that could start a spreadsheet formula is prefixed with `'`.
 */
export function dailyRowsCsv(rows: readonly ExportedDailyRow[]): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => cell(r[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
