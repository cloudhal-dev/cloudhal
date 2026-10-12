/**
 * Shared suites for the analytics tables (RFC-0006 §7.4–§7.5), run on SQLite and Miniflare D1:
 * settings CAS, the daily salt and the query budget (`describeAnalyticsStateSuite`), and
 * `runRollups` with `RollupReader` (`describeRollupSuite`): idempotence, partial failure,
 * `(other)` rows, retention and salts.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { migrate, migrations, type SqlDriver, type SqlStatement } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsSettingsConflictError } from "./errors.ts";
import { FIXTURE_EVENTS, FIXTURE_OTHER_SITE, FIXTURE_SITE, NODE_A } from "./fixtures.ts";
import type { AnalyticsQuery } from "./model.ts";
import { OTHER_KEY, RollupReader, runRollups, writeDailyRows } from "./rollup.ts";
import {
  deleteSaltsBefore,
  doneRollupDays,
  getEffectiveSettings,
  getOrCreateSalt,
  getRollupRuns,
  putAnalyticsSettings,
  readQueryBudget,
  SqlQueryBudget,
} from "./sql/state.ts";
import { SqlAnalytics } from "./sql/store.ts";

export interface SqlFactory {
  create(): Promise<SqlDriver>;
  dispose?(): Promise<void>;
}

async function fresh(sql: SqlDriver): Promise<void> {
  await dropAllTables(sql);
  await migrate(sql, migrations);
}

export function describeAnalyticsStateSuite(label: string, factory: SqlFactory): void {
  // D1 through Miniflare is slow on a loaded machine; these suites do many round trips
  describe(`analytics state: ${label}`, { timeout: 120_000 }, () => {
    let sql: SqlDriver;
    const now = new Date("2026-10-09T10:00:00Z");

    beforeEach(async () => {
      sql = await factory.create();
      await fresh(sql);
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    it("settings default without a row, then CAS on rev", async () => {
      const defaults = { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 as const };
      const initial = await getEffectiveSettings(sql, FIXTURE_SITE, defaults);
      expect(initial).toMatchObject({
        enabled: true,
        uniqueVisitors: false,
        rev: 0,
        stored: false,
      });
      const first = await putAnalyticsSettings(sql, {
        siteId: FIXTURE_SITE,
        rev: 0,
        patch: { uniqueVisitors: true, rollupRetentionDays: 365 },
        actorId: "user_01HZX8K3Q9CD",
        now,
        defaults,
      });
      expect(first.after).toMatchObject({
        enabled: true,
        uniqueVisitors: true,
        vitalsOneIn: 5,
        rollupRetentionDays: 365,
        planHint: null,
        rev: 1,
      });
      expect(first.before.uniqueVisitors).toBe(false);
      // a second "first write" loses
      await expect(
        putAnalyticsSettings(sql, {
          siteId: FIXTURE_SITE,
          rev: 0,
          patch: { enabled: false },
          actorId: "user_01HZX8K3Q9CD",
          now,
          defaults,
        }),
      ).rejects.toBeInstanceOf(AnalyticsSettingsConflictError);
      const second = await putAnalyticsSettings(sql, {
        siteId: FIXTURE_SITE,
        rev: 1,
        patch: { vitalsOneIn: 0, planHint: "free", rollupRetentionDays: null },
        actorId: "user_01HZX8K3Q9CD",
        now,
      });
      expect(second.after).toMatchObject({ vitalsOneIn: 0, planHint: "free", rev: 2 });
      expect(second.after.rollupRetentionDays).toBeNull();
      await expect(
        putAnalyticsSettings(sql, {
          siteId: FIXTURE_SITE,
          rev: 1,
          patch: { enabled: false },
          actorId: "user_01HZX8K3Q9CD",
          now,
        }),
      ).rejects.toBeInstanceOf(AnalyticsSettingsConflictError);
      const stored = await getEffectiveSettings(sql, FIXTURE_SITE, defaults);
      expect(stored).toMatchObject({ enabled: true, vitalsOneIn: 0, rev: 2, stored: true });
      await expect(
        putAnalyticsSettings(sql, {
          siteId: FIXTURE_SITE,
          rev: 2,
          patch: { vitalsOneIn: 3 },
          actorId: "user_01HZX8K3Q9CD",
          now,
        }),
      ).rejects.toThrow(/vitalsOneIn/);
    });

    it("one salt per day, agreed by concurrent creators, deleted after the day", async () => {
      const a = "a".repeat(64);
      const b = "b".repeat(64);
      const [x, y] = await Promise.all([
        getOrCreateSalt(sql, "2026-10-09", { random: () => a }),
        getOrCreateSalt(sql, "2026-10-09", { random: () => b }),
      ]);
      expect(x).toBe(y);
      expect([a, b]).toContain(x);
      await getOrCreateSalt(sql, "2026-10-08");
      expect(await deleteSaltsBefore(sql, "2026-10-09")).toBe(1);
      expect(await getOrCreateSalt(sql, "2026-10-09", { random: () => b })).toBe(x);
    });

    it("the query budget counts to its limit and then refuses", async () => {
      const budget = new SqlQueryBudget(sql, { limit: 3 });
      const results = [];
      for (let i = 0; i < 5; i++) results.push(await budget.take(now));
      expect(results).toEqual([true, true, true, false, false]);
      expect(await readQueryBudget(sql, "2026-10-09")).toBe(3);
      // another isolate sees the spent budget too
      expect(await new SqlQueryBudget(sql, { limit: 3 }).take(now)).toBe(false);
      // a new UTC day starts over
      expect(await budget.take(new Date("2026-10-10T00:00:01Z"))).toBe(true);
    });
  });
}

/** A driver whose `batch` fails on chosen calls (partial-failure tests). */
export function failingBatches(inner: SqlDriver, failOn: (call: number) => boolean): SqlDriver {
  let call = 0;
  return {
    name: inner.name,
    get: (s, p) => inner.get(s, p),
    all: (s, p) => inner.all(s, p),
    run: (s, p) => inner.run(s, p),
    exec: (s) => inner.exec(s),
    close: () => inner.close(),
    batch: async (statements: readonly SqlStatement[]) => {
      call++;
      if (failOn(call)) throw new Error(`injected failure of batch ${call}`);
      return inner.batch(statements);
    },
  };
}

export function describeRollupSuite(label: string, factory: SqlFactory): void {
  // D1 through Miniflare is slow on a loaded machine; these suites do many round trips
  describe(`analytics rollups: ${label}`, { timeout: 120_000 }, () => {
    let sql: SqlDriver;
    let raw: SqlAnalytics;
    const now = new Date("2026-10-09T05:17:00Z");
    const defaults = { enabled: true, uniqueVisitors: true, vitalsOneIn: 5 as const };
    const FULL = { from: "2026-10-07", to: "2026-10-09" };

    beforeEach(async () => {
      sql = await factory.create();
      await fresh(sql);
      raw = new SqlAnalytics(sql);
      await raw.insertMany(FIXTURE_EVENTS);
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    async function rollAll(driver: SqlDriver = sql, extra: { redo?: boolean } = {}) {
      return runRollups({
        reader: raw,
        sql: driver,
        siteIds: [FIXTURE_SITE],
        now,
        defaults,
        lookbackDays: 2,
        maxSiteDays: 10,
        ...extra,
      });
    }

    it("rolls up the finished days and answers like the raw store", async () => {
      const report = await rollAll();
      expect(report.failed).toEqual([]);
      expect(report.done.map((d) => d.day)).toEqual(["2026-10-07", "2026-10-08"]);
      expect(report.pending).toBe(0);
      const rollups = new RollupReader(sql);
      for (const q of [
        { kind: "summary", siteId: FIXTURE_SITE, range: FULL },
        { kind: "summary", siteId: FIXTURE_SITE, range: FULL, filter: { node: NODE_A } },
        { kind: "series", siteId: FIXTURE_SITE, range: FULL, interval: "day" },
        { kind: "top", siteId: FIXTURE_SITE, range: FULL, dimension: "node", limit: 10 },
        { kind: "top", siteId: FIXTURE_SITE, range: FULL, dimension: "channel", limit: 10 },
        { kind: "renders", siteId: FIXTURE_SITE, range: FULL, statuses: "crawlers", limit: 10 },
        { kind: "renders", siteId: FIXTURE_SITE, range: FULL, statuses: "redirects", limit: 10 },
      ] as AnalyticsQuery[]) {
        const fromRollups = await rollups.query(q);
        expect(fromRollups.source).toBe("rollups");
        const live = await raw.query(q);
        // rollups keep visitors and renders only on the total; filtered summaries report none
        const want =
          q.kind === "summary" && q.filter
            ? { ...(live.data as object), visitors: null, renders: null }
            : live.data;
        expect(fromRollups.data).toEqual(want);
      }
      // render errors lose the referring page in rollups and are keyed by status + path
      const errors = await rollups.query({
        kind: "renders",
        siteId: FIXTURE_SITE,
        range: FULL,
        statuses: "errors",
        limit: 10,
      });
      expect(errors.data.rows).toEqual([
        { path: "/wp-login.php", status: 404, refPath: null, hits: 20, lastSeen: null },
        { path: "/posts/ferry-x", status: 404, refPath: null, hits: 3, lastSeen: null },
        { path: "/posts/b", status: 500, refPath: null, hits: 1, lastSeen: null },
      ]);
      // vitals: daily p75 merged by samples (estimated), counts exact
      const vitals = await rollups.query({ kind: "vitals", siteId: FIXTURE_SITE, range: FULL });
      expect(vitals.estimated).toBe(true);
      const lcp = vitals.data.metrics.find((m) => m.metric === "lcp");
      expect(lcp).toMatchObject({ samples: 16, good: 6, poor: 5 });
    });

    it("writes (other) rows so every dimension adds up to the total", async () => {
      await rollAll();
      const rows = await sql.all<{ dim: string; key: string; pageviews: number; visits: number }>(
        "SELECT dim, key, pageviews, visits FROM analytics_daily WHERE site_id = ? AND day = ? ORDER BY dim, key",
        [FIXTURE_SITE, "2026-10-07"],
      );
      const total = rows.find((r) => r.dim === "total");
      expect(total).toMatchObject({ key: "all", pageviews: 6, visits: 5 });
      for (const dim of ["node", "refHost", "channel", "utmSource", "country", "device", "os"]) {
        const sum = rows.filter((r) => r.dim === dim).reduce((n, r) => n + r.pageviews, 0);
        expect(sum, dim).toBe(6);
      }
      expect(rows.find((r) => r.dim === "refHost" && r.key === OTHER_KEY)).toMatchObject({
        pageviews: 3,
        visits: 2,
      });
      expect(rows.find((r) => r.dim === "utmSource" && r.key === OTHER_KEY)).toMatchObject({
        pageviews: 5,
        visits: 4,
      });
      expect(rows.some((r) => r.dim === "node" && r.key === OTHER_KEY)).toBe(false);
      const visitors = await sql.get<{ visitors: number | null }>(
        "SELECT visitors FROM analytics_daily WHERE site_id = ? AND day = ? AND dim = 'total'",
        [FIXTURE_SITE, "2026-10-07"],
      );
      expect(visitors?.visitors).toBe(3);
      // people's HTML 200 renders (the estimated cache-hit ratio) sit beside the total
      expect(rows.find((r) => r.dim === "renders")).toMatchObject({ key: "all" });
      const renders = await sql.get<{ hits: number }>(
        "SELECT hits FROM analytics_daily WHERE site_id = ? AND day = ? AND dim = 'renders'",
        [FIXTURE_SITE, "2026-10-07"],
      );
      expect(renders?.hits).toBe(2);
      // a day rolled up before renders were kept has no row: the count is unknown, not 0
      await sql.run(
        "DELETE FROM analytics_daily WHERE site_id = ? AND day = ? AND dim = 'renders'",
        [FIXTURE_SITE, "2026-10-08"],
      );
      const partial = await new RollupReader(sql).query({
        kind: "summary",
        siteId: FIXTURE_SITE,
        range: FULL,
      });
      expect(partial.data).toMatchObject({ pageviews: 10, renders: null });
    });

    it("is idempotent: a second run has nothing to do, a redo writes the same rows", async () => {
      await rollAll();
      const snapshot = async () =>
        sql.all("SELECT * FROM analytics_daily WHERE site_id = ? ORDER BY day, dim, key", [
          FIXTURE_SITE,
        ]);
      const before = await snapshot();
      const again = await rollAll();
      expect(again.done).toEqual([]);
      expect(again.pending).toBe(0);
      const redo = await rollAll(sql, { redo: true });
      expect(redo.done).toHaveLength(2);
      expect(await snapshot()).toEqual(before);
    });

    it("rolls one site-day per call by default, oldest first, only for sites that are on", async () => {
      const report = await runRollups({
        reader: raw,
        sql,
        siteIds: [FIXTURE_SITE, FIXTURE_OTHER_SITE],
        now,
        defaults: { ...defaults, enabled: false },
      });
      expect(report.done).toEqual([]);
      await putAnalyticsSettings(sql, {
        siteId: FIXTURE_SITE,
        rev: 0,
        patch: { enabled: true },
        actorId: "user_01HZX8K3Q9CD",
        now,
      });
      const one = await runRollups({
        reader: raw,
        sql,
        siteIds: [FIXTURE_SITE, FIXTURE_OTHER_SITE],
        now,
      });
      expect(one.done.map((d) => [d.siteId, d.day])).toEqual([[FIXTURE_SITE, "2026-10-02"]]);
      expect(one.pending).toBe(6);
    });

    it("a failed batch leaves the day not done; the next run repairs it", async () => {
      // the 2026-10-07 day of a site with many nodes needs several batches
      const many: AnalyticsEvent[] = [];
      for (let i = 0; i < 150; i++)
        many.push({
          schemaVersion: 1,
          kind: "pageview",
          siteId: FIXTURE_SITE,
          timestamp: `2026-10-07T15:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
          path: `/posts/p${i}`,
          nodeId: `entry_01HZXMANY${String(i).padStart(3, "0")}`,
          nodeKind: "entry",
          channel: "direct",
          entrance: true,
          device: "desktop",
          browser: "chrome",
          os: "windows",
          navType: "navigate",
        });
      await raw.insertMany(many);
      const flaky = failingBatches(sql, (call) => call === 2);
      const report = await runRollups({
        reader: raw,
        sql: flaky,
        siteIds: [FIXTURE_SITE],
        now,
        defaults,
        lookbackDays: 2,
        maxSiteDays: 1,
      });
      expect(report.failed).toHaveLength(1);
      expect(report.failed[0]?.day).toBe("2026-10-07");
      const runs = await getRollupRuns(sql, FIXTURE_SITE, "2026-10-07", "2026-10-07");
      expect(runs[0]?.state).toBe("failed");
      // the first batch landed, but rollups ignore a day that is not done
      const partial = await sql.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM analytics_daily WHERE site_id = ? AND day = ?",
        [FIXTURE_SITE, "2026-10-07"],
      );
      expect(partial?.n).toBeGreaterThan(0);
      const rollups = new RollupReader(sql);
      const dayOne = { from: "2026-10-07", to: "2026-10-08" };
      expect(
        (await rollups.query({ kind: "summary", siteId: FIXTURE_SITE, range: dayOne })).data,
      ).toEqual({ pageviews: 0, visits: 0, visitors: null, renders: 0 });
      // the next run picks the never-attempted day first, then retries the failed one
      const next = await runRollups({
        reader: raw,
        sql,
        siteIds: [FIXTURE_SITE],
        now,
        defaults,
        lookbackDays: 2,
        maxSiteDays: 2,
      });
      expect(next.done.map((d) => d.day)).toEqual(["2026-10-08", "2026-10-07"]);
      expect(await doneRollupDays(sql, FIXTURE_SITE, "2026-10-07", "2026-10-08")).toEqual(
        new Set(["2026-10-07", "2026-10-08"]),
      );
      expect(
        (await rollups.query({ kind: "summary", siteId: FIXTURE_SITE, range: dayOne })).data,
      ).toEqual((await raw.query({ kind: "summary", siteId: FIXTURE_SITE, range: dayOne })).data);
    });

    it("applies the retention setting and deletes old salts", async () => {
      await rollAll();
      await writeDailyRows(
        sql,
        FIXTURE_SITE,
        "2026-09-01",
        [
          {
            dim: "total",
            key: "all",
            pageviews: 1,
            visits: 1,
            visitors: null,
            hits: null,
            value: null,
            samples: null,
            good: null,
            poor: null,
          },
        ],
        { source: "sql", now },
      );
      await getOrCreateSalt(sql, "2026-10-08");
      await getOrCreateSalt(sql, "2026-10-09");
      await putAnalyticsSettings(sql, {
        siteId: FIXTURE_SITE,
        rev: 0,
        patch: { rollupRetentionDays: 2 },
        actorId: "user_01HZX8K3Q9CD",
        now,
        defaults,
      });
      const report = await rollAll();
      expect(report.saltsDeleted).toBe(1);
      expect(report.retained).toBeGreaterThan(0);
      const days = await sql.all<{ day: string }>(
        "SELECT DISTINCT day FROM analytics_daily WHERE site_id = ? ORDER BY day",
        [FIXTURE_SITE],
      );
      expect(days.map((d) => d.day)).toEqual(["2026-10-07", "2026-10-08"]);
      const salts = await sql.all<{ day: string }>("SELECT day FROM analytics_salts");
      expect(salts.map((s) => s.day)).toEqual(["2026-10-09"]);
    });

    it("prunes raw events past their retention", async () => {
      expect(await raw.prune(new Date("2026-10-08T00:00:00Z"))).toBeGreaterThan(0);
      const r = await raw.query({ kind: "summary", siteId: FIXTURE_SITE, range: FULL });
      expect(r.data.pageviews).toBe(4);
    });
  });
}
