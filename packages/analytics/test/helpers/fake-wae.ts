/**
 * A fake of Workers Analytics Engine for Node tests: `writeDataPoint` stores points in SQLite, and
 * `query` runs the Analytics SQL API dialect our compiler emits against them, with the dialect's
 * functions (`countIf`, `sumIf`, `quantileWeighted`, `toStartOfHour`, `toStartOfDay`, `APPROX_MAX`)
 * registered as SQLite functions. It also enforces what the real API would refuse or what Cloudhal
 * must never do: exact `MIN`/`MAX`, a query without `index1` or a lower time bound, any use of
 * `"sampleInterval"`. Numbers come back as strings, as 64-bit integers do over JSON.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import Database from "better-sqlite3";
import { isoInstant, weightedP75 } from "../../src/model.ts";
import { toDataPoint, type WaeDataPoint } from "../../src/wae/layout.ts";
import type { WaeSqlBinding } from "../../src/wae/reader.ts";

const BLOBS = Array.from({ length: 20 }, (_, i) => `blob${i + 1}`);
const DOUBLES = Array.from({ length: 20 }, (_, i) => `double${i + 1}`);

/** `2026-10-09T08:00:00Z` → `2026-10-09 08:00:00` (ClickHouse-style output). */
const chTime = (iso: string) => iso.replace("T", " ").replace(/(\.\d+)?Z$/, "");

export class SqlApiError extends Error {
  override readonly name = "AnalyticsSQLAPIError";
  readonly retryable: boolean;
  readonly remote = true;
  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

export class FakeWae implements WaeSqlBinding {
  readonly db: Database.Database;
  readonly dataset: string;
  readonly queries: string[] = [];
  /** The timestamp `writeDataPoint` stamps (WAE uses the write time). */
  clock: () => Date = () => new Date();

  constructor(dataset: string) {
    this.dataset = dataset;
    this.db = new Database(":memory:");
    this.db.exec(
      `CREATE TABLE points (index1 TEXT, timestamp TEXT, "sampleInterval" REAL, ${BLOBS.map((b) => `${b} TEXT DEFAULT ''`).join(", ")}, ${DOUBLES.map((d) => `${d} REAL DEFAULT 0`).join(", ")})`,
    );
    const agg = <T>(
      name: string,
      start: () => T,
      step: (acc: T, ...args: unknown[]) => T,
      result: (acc: T) => unknown,
    ) =>
      this.db.aggregate(name, {
        start,
        step: step as (acc: T, ...a: unknown[]) => T,
        result: result as (acc: T) => number,
      });
    agg(
      "countIf",
      () => 0,
      (n, c) => n + (c ? 1 : 0),
      (n) => n,
    );
    agg(
      "sumIf",
      () => 0,
      (n, x, c) => n + (c ? Number(x) : 0),
      (n) => n,
    );
    agg(
      "quantileWeighted",
      () => ({ level: 0.75, xs: [] as { x: number; w: number }[] }),
      (acc, level, x, w) => {
        acc.level = Number(level);
        acc.xs.push({ x: Number(x), w: Number(w) });
        return acc;
      },
      (acc) => (acc.level === 0.75 ? weightedP75(acc.xs) : null),
    );
    agg(
      "APPROX_MAX",
      () => null as string | null,
      (m, v) => (m === null || String(v) > m ? String(v) : m),
      (m) => (m === null ? null : chTime(m)),
    );
    this.db.function(
      "toStartOfHour",
      (t: unknown) => `${String(t).slice(0, 10)} ${String(t).slice(11, 13)}:00:00`,
    );
    this.db.function("toStartOfDay", (t: unknown) => `${String(t).slice(0, 10)} 00:00:00`);
  }

  /** The site Worker's binding. */
  readonly binding = {
    writeDataPoint: (point?: WaeDataPoint) => this.insert(point ?? {}, isoInstant(this.clock())),
  };

  insert(point: WaeDataPoint, timestamp: string): void {
    const blobs = (point.blobs ?? []).map((b) => (typeof b === "string" ? b : ""));
    const doubles = point.doubles ?? [];
    const cols = ["index1", "timestamp", '"sampleInterval"'];
    const vals: unknown[] = [String(point.indexes?.[0] ?? ""), timestamp, 1];
    blobs.forEach((b, i) => {
      cols.push(`blob${i + 1}`);
      vals.push(b);
    });
    doubles.forEach((d, i) => {
      cols.push(`double${i + 1}`);
      vals.push(d);
    });
    this.db
      .prepare(`INSERT INTO points (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .run(...vals);
  }

  /** Loads stored events at their own timestamps (whole seconds, as WAE literals compare). */
  load(events: readonly AnalyticsEvent[]): void {
    for (const e of events) this.insert(toDataPoint(e), isoInstant(new Date(e.timestamp)));
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(request: {
    query: string;
  }): Promise<{ data: T[]; rows: number; statistics: unknown }> {
    const q = request.query;
    this.queries.push(q);
    const table = `events.analyticsEngine."${this.dataset}"`;
    if (!q.includes(`FROM ${table}`)) throw new SqlApiError("unknown dataset");
    if (/(^|[^_])\b(MIN|MAX)\s*\(/i.test(q.replace(/APPROX_(MIN|MAX)/g, "")))
      throw new SqlApiError(
        "Exact aggregates are not supported on sampled datasets. Use APPROX_MIN",
      );
    if (!/index1 = '/.test(q) || !/timestamp >= '/.test(q))
      throw new SqlApiError("query must be bounded by index1 and a lower time bound");
    if (/sampleInterval/i.test(q)) throw new Error("Cloudhal must never weight by sampleInterval");
    const sql = q.replace(`FROM ${table}`, "FROM points");
    const rows = this.db.prepare(sql).all() as Record<string, unknown>[];
    const data = rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]),
      ),
    ) as T[];
    return {
      data,
      rows: data.length,
      statistics: { elapsed_ms: 1, rows_read: 4_500_000, bytes_read: 0 },
    };
  }
}
