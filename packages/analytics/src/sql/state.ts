/**
 * Accessors for the analytics tables of migration `0014_analytics` (RFC-0006 §6.2, §7.4–§7.7):
 * per-site settings (CAS on `rev`), the daily salt, the rollup-run ledger and the query budget.
 * Every write is one statement or one atomic `batch()`; there are no interactive transactions
 * (AGENTS.md rule 4).
 */
import type { SqlDriver } from "@cloudhal/storage";
import { AnalyticsSettingsConflictError } from "../errors.ts";
import { num, type QueryBudget, utcDay } from "../model.ts";
import {
  type AnalyticsDefaults,
  type AnalyticsSettings,
  type AnalyticsSettingsPatch,
  assertSettingsPatch,
  DEFAULT_ANALYTICS,
  type EffectiveAnalyticsSettings,
  effectiveSettings,
  type PlanHint,
  type VitalsOneIn,
} from "../settings.ts";
import { randomSalt } from "../visitor.ts";

// ───────────────────────────── settings ─────────────────────────────

interface SettingsRow extends Record<string, unknown> {
  site_id: string;
  enabled: number;
  unique_visitors: number;
  vitals_one_in: number;
  rollup_retention_days: number | null;
  plan_hint: string | null;
  rev: number;
  updated_at: string;
  updated_by: string;
}

function toSettings(r: SettingsRow): AnalyticsSettings {
  return {
    siteId: r.site_id,
    enabled: num(r.enabled) === 1,
    uniqueVisitors: num(r.unique_visitors) === 1,
    vitalsOneIn: num(r.vitals_one_in) as VitalsOneIn,
    rollupRetentionDays: r.rollup_retention_days === null ? null : num(r.rollup_retention_days),
    planHint: r.plan_hint === "free" || r.plan_hint === "paid" ? (r.plan_hint as PlanHint) : null,
    rev: num(r.rev),
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

/** The stored row of a site, or `undefined` (the deployment default applies). */
export async function getAnalyticsSettings(
  sql: SqlDriver,
  siteId: string,
): Promise<AnalyticsSettings | undefined> {
  const row = await sql.get<SettingsRow>("SELECT * FROM analytics_settings WHERE site_id = ?", [
    siteId,
  ]);
  return row ? toSettings(row) : undefined;
}

/** What applies to a site now. Throws when the table is missing (callers fail closed). */
export async function getEffectiveSettings(
  sql: SqlDriver,
  siteId: string,
  defaults: AnalyticsDefaults = DEFAULT_ANALYTICS,
): Promise<EffectiveAnalyticsSettings> {
  return effectiveSettings(siteId, await getAnalyticsSettings(sql, siteId), defaults);
}

/** Effective settings of many sites at once (the rollup job). */
export async function listEffectiveSettings(
  sql: SqlDriver,
  siteIds: readonly string[],
  defaults: AnalyticsDefaults = DEFAULT_ANALYTICS,
): Promise<EffectiveAnalyticsSettings[]> {
  const rows = new Map<string, AnalyticsSettings>();
  for (let i = 0; i < siteIds.length; i += 90) {
    const chunk = siteIds.slice(i, i + 90);
    const found = await sql.all<SettingsRow>(
      `SELECT * FROM analytics_settings WHERE site_id IN (${chunk.map(() => "?").join(", ")})`,
      chunk,
    );
    for (const r of found) rows.set(r.site_id, toSettings(r));
  }
  return siteIds.map((id) => effectiveSettings(id, rows.get(id), defaults));
}

export interface PutSettingsInput {
  readonly siteId: string;
  /** The `rev` the caller read (`0` when no row was stored). */
  readonly rev: number;
  readonly patch: AnalyticsSettingsPatch;
  readonly actorId: string;
  readonly now: Date;
  readonly defaults?: AnalyticsDefaults;
}

export interface PutSettingsResult {
  readonly before: EffectiveAnalyticsSettings;
  readonly after: AnalyticsSettings;
}

/**
 * Writes a site's settings with compare-and-swap on `rev` (one guarded statement): the first write
 * inserts the row with `rev` 1 starting from the defaults; later writes need the current `rev`.
 * A stale `rev` raises `AnalyticsSettingsConflictError` and changes nothing.
 */
export async function putAnalyticsSettings(
  sql: SqlDriver,
  input: PutSettingsInput,
): Promise<PutSettingsResult> {
  assertSettingsPatch(input.patch);
  const defaults = input.defaults ?? DEFAULT_ANALYTICS;
  const before = await getEffectiveSettings(sql, input.siteId, defaults);
  if (before.rev !== input.rev) throw new AnalyticsSettingsConflictError();
  const p = input.patch;
  const next = {
    enabled: p.enabled ?? before.enabled,
    uniqueVisitors: p.uniqueVisitors ?? before.uniqueVisitors,
    vitalsOneIn: (p.vitalsOneIn ?? before.vitalsOneIn) as VitalsOneIn,
    rollupRetentionDays:
      p.rollupRetentionDays === undefined ? before.rollupRetentionDays : p.rollupRetentionDays,
    planHint: p.planHint === undefined ? before.planHint : p.planHint,
  };
  const stamp = input.now.toISOString();
  const values = [
    next.enabled ? 1 : 0,
    next.uniqueVisitors ? 1 : 0,
    next.vitalsOneIn,
    next.rollupRetentionDays,
    next.planHint,
    stamp,
    input.actorId,
  ];
  const res =
    input.rev === 0
      ? await sql.run(
          `INSERT INTO analytics_settings (enabled, unique_visitors, vitals_one_in, rollup_retention_days, plan_hint, updated_at, updated_by, site_id, rev)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT (site_id) DO NOTHING`,
          [...values, input.siteId],
        )
      : await sql.run(
          `UPDATE analytics_settings SET enabled = ?, unique_visitors = ?, vitals_one_in = ?, rollup_retention_days = ?, plan_hint = ?, updated_at = ?, updated_by = ?, rev = rev + 1
           WHERE site_id = ? AND rev = ?`,
          [...values, input.siteId, input.rev],
        );
  if (res.changes !== 1) throw new AnalyticsSettingsConflictError();
  return {
    before,
    after: {
      siteId: input.siteId,
      ...next,
      rev: input.rev + 1,
      updatedAt: stamp,
      updatedBy: input.actorId,
    },
  };
}

/** Deleting a site deletes its settings, rollups and runs (its WAE events expire by themselves). */
export async function deleteSiteAnalytics(sql: SqlDriver, siteId: string): Promise<void> {
  await sql.batch([
    { sql: "DELETE FROM analytics_settings WHERE site_id = ?", params: [siteId] },
    { sql: "DELETE FROM analytics_daily WHERE site_id = ?", params: [siteId] },
    { sql: "DELETE FROM analytics_rollup_runs WHERE site_id = ?", params: [siteId] },
    { sql: "DELETE FROM analytics_events WHERE site_id = ?", params: [siteId] },
  ]);
}

// ───────────────────────────── salts ─────────────────────────────

const SALT_RE = /^[0-9a-f]{64}$/;

/**
 * The deployment's salt for a UTC day: the first caller inserts a random one (`INSERT OR IGNORE`)
 * and everyone reads the stored row back, so concurrent isolates agree.
 *
 * The same atomic `batch()` deletes every salt of an earlier day, so a salt never outlives its day
 * by more than the first hashed page view of the next one — also on deployments without the hourly
 * job (`CLOUDHAL_ANALYTICS_CRON=off`), where the cron's own deletion never runs (RFC-0006 §6.2).
 */
export async function getOrCreateSalt(
  sql: SqlDriver,
  day: string,
  options: { now?: Date; random?: () => string } = {},
): Promise<string> {
  const candidate = (options.random ?? randomSalt)();
  if (!SALT_RE.test(candidate)) throw new Error("a salt is 64 lower-case hex characters");
  await sql.batch([
    {
      sql: "INSERT OR IGNORE INTO analytics_salts (day, salt, created_at) VALUES (?, ?, ?)",
      params: [day, candidate, (options.now ?? new Date()).toISOString()],
    },
    { sql: "DELETE FROM analytics_salts WHERE day < ?", params: [day] },
  ]);
  const row = await sql.get<{ salt: string }>("SELECT salt FROM analytics_salts WHERE day = ?", [
    day,
  ]);
  if (!row) throw new Error("analytics salt was not stored");
  return row.salt;
}

/** Deletes every salt before `day` (the hourly job passes today). Returns rows removed. */
export async function deleteSaltsBefore(sql: SqlDriver, day: string): Promise<number> {
  return (await sql.run("DELETE FROM analytics_salts WHERE day < ?", [day])).changes;
}

/** Deletes one day's salt (unique visitors turned off). */
export async function deleteSalt(sql: SqlDriver, day: string): Promise<void> {
  await sql.run("DELETE FROM analytics_salts WHERE day = ?", [day]);
}

/** A per-isolate memo of today's salt for the beacon handler (`BeaconContext.salt`). */
export function createSaltProvider(sql: SqlDriver): (day: string) => Promise<string> {
  let memo: { day: string; salt: Promise<string> } | undefined;
  return (day) => {
    if (memo?.day !== day) {
      const salt = getOrCreateSalt(sql, day);
      memo = { day, salt };
      salt.catch(() => {
        if (memo?.salt === salt) memo = undefined;
      });
    }
    return memo.salt;
  };
}

// ───────────────────────────── query budget ─────────────────────────────

/** Uncached live queries counted for a UTC day. */
export async function readQueryBudget(sql: SqlDriver, day: string): Promise<number> {
  const row = await sql.get<{ queries: number }>(
    "SELECT queries FROM analytics_query_budget WHERE day = ?",
    [day],
  );
  return num(row?.queries);
}

/** Drops budget rows before `day`. */
export async function pruneQueryBudget(sql: SqlDriver, day: string): Promise<number> {
  return (await sql.run("DELETE FROM analytics_query_budget WHERE day < ?", [day])).changes;
}

/**
 * The daily budget in `analytics_query_budget` (§7.7): each `take` is one guarded upsert that
 * counts the query only while the day is under `limit`. Once refused, the isolate stops asking
 * until the next UTC day.
 */
export class SqlQueryBudget implements QueryBudget {
  readonly #sql: SqlDriver;
  readonly limit: number;
  #spentDay: string | undefined;

  constructor(sql: SqlDriver, options: { limit: number }) {
    this.#sql = sql;
    this.limit = options.limit;
  }

  async take(now: Date): Promise<boolean> {
    const day = utcDay(now);
    if (this.limit <= 0 || this.#spentDay === day) return false;
    const res = await this.#sql.run(
      `INSERT INTO analytics_query_budget (day, queries) VALUES (?, 1)
       ON CONFLICT (day) DO UPDATE SET queries = queries + 1 WHERE queries < ?`,
      [day, this.limit],
    );
    if (res.changes === 1) return true;
    this.#spentDay = day;
    return false;
  }
}

// ───────────────────────────── rollup runs ─────────────────────────────

export type RollupRunState = "running" | "done" | "failed";

export interface RollupRun {
  readonly siteId: string;
  readonly day: string;
  readonly state: RollupRunState;
  readonly rows: number | null;
  readonly source: string;
  readonly error: string | null;
  readonly finishedAt: string | null;
}

/** Runs of a site between two days (inclusive), oldest first. */
export async function getRollupRuns(
  sql: SqlDriver,
  siteId: string,
  fromDay: string,
  toDay: string,
): Promise<RollupRun[]> {
  const rows = await sql.all<Record<string, unknown>>(
    "SELECT * FROM analytics_rollup_runs WHERE site_id = ? AND day >= ? AND day <= ? ORDER BY day",
    [siteId, fromDay, toDay],
  );
  return rows.map((r) => ({
    siteId: String(r.site_id),
    day: String(r.day),
    state: String(r.state) as RollupRunState,
    rows: r.rows === null ? null : num(r.rows),
    source: String(r.source),
    error: r.error === null ? null : String(r.error),
    finishedAt: r.finished_at === null ? null : String(r.finished_at),
  }));
}

/** Days (inclusive bounds) whose rollup is complete. */
export async function doneRollupDays(
  sql: SqlDriver,
  siteId: string,
  fromDay: string,
  toDay: string,
): Promise<Set<string>> {
  const rows = await sql.all<{ day: string }>(
    "SELECT day FROM analytics_rollup_runs WHERE site_id = ? AND day >= ? AND day <= ? AND state = 'done'",
    [siteId, fromDay, toDay],
  );
  return new Set(rows.map((r) => r.day));
}

/** The latest complete rollup of a site (the status route's "last updated"). */
export async function lastRollup(sql: SqlDriver, siteId: string): Promise<RollupRun | undefined> {
  const r = await sql.get<Record<string, unknown>>(
    "SELECT * FROM analytics_rollup_runs WHERE site_id = ? AND state = 'done' ORDER BY day DESC LIMIT 1",
    [siteId],
  );
  if (!r) return undefined;
  return {
    siteId: String(r.site_id),
    day: String(r.day),
    state: "done",
    rows: r.rows === null ? null : num(r.rows),
    source: String(r.source),
    error: null,
    finishedAt: r.finished_at === null ? null : String(r.finished_at),
  };
}
