/**
 * RFC-0042 §4 "Indexing: none in stage 3" — the trigger for a side table: a list of a
 * 10,000-entry collection by field, measured on SQLite and on D1 (Miniflare). The RFC's threshold
 * (open question 10): more than 50 ms CPU or more than 10,000 rows read per list means
 * `entry_list_values` lands; below it, in-memory evaluation over today's collection scan stays.
 *
 * Not part of `pnpm test` (it seeds 10,000 entries): `pnpm --filter @cloudhal/astro-renderer
 * bench:lists`. It prints a table and fails only when a path crosses the threshold.
 *
 * - CPU is this process's (`process.cpuUsage`): the store's SQL on SQLite, the evaluator, JSON
 *   parsing. On D1 the database runs in workerd, so CPU here is what a Worker spends besides D1.
 * - Rows: rows the driver returned (SQLite) and D1's own `meta.rows_read` (D1).
 */
import type { Site } from "@cloudhal/core-contracts";
import {
  GATES_ENFORCED,
  queryContentEntries,
  SiteGraphStore,
  seedStarterSite,
} from "@cloudhal/core-ts";
import { MemoryBlobStore, type SqlDriver, type SqlValue } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import { afterAll, describe, expect, it } from "vitest";
import type { FieldEntryQuery } from "../src/entry-query.ts";
import { LiveSource, SnapshotSource } from "../src/source.ts";

const N = Number(process.env.BENCH_ENTRIES ?? 10_000);
const RUNS = Number(process.env.BENCH_RUNS ?? 10);
const CPU_LIMIT_MS = 50;
const ROWS_LIMIT = 10_000;
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const DAY = 86_400_000;
const author = { kind: "human" as const, id: "user_bench0000001", name: "Bench" };

const QUERY = {
  collection: "events",
  where: [{ field: "startsAt", op: "gte", value: "now" }],
  orderBy: { field: "startsAt", direction: "asc" },
  limit: 20,
} satisfies FieldEntryQuery;

/** Counts rows: returned rows, or D1's `rows_read` when the driver reports it. */
class Counting implements SqlDriver {
  readonly name: string;
  readonly inner: SqlDriver;
  readonly d1: D1Database | undefined;
  rows = 0;
  constructor(inner: SqlDriver, d1?: D1Database) {
    this.name = inner.name;
    this.inner = inner;
    this.d1 = d1;
  }
  async get<T extends Record<string, unknown>>(sql: string, params?: readonly SqlValue[]) {
    const all = await this.all<T>(sql, params);
    return all[0];
  }
  async all<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []) {
    if (this.d1) {
      const res = await this.d1
        .prepare(sql)
        .bind(...params)
        .all<T>();
      this.rows += (res.meta as { rows_read?: number }).rows_read ?? res.results.length;
      return res.results;
    }
    const out = await this.inner.all<T>(sql, params);
    this.rows += out.length;
    return out;
  }
  run(sql: string, params?: readonly SqlValue[]) {
    return this.inner.run(sql, params);
  }
  batch(statements: Parameters<SqlDriver["batch"]>[0]) {
    return this.inner.batch(statements);
  }
  exec(sql: string) {
    return this.inner.exec(sql);
  }
  close() {
    return this.inner.close();
  }
}

interface Sample {
  readonly backend: string;
  readonly path: string;
  readonly cpuMs: number;
  readonly wallMs: number;
  readonly rows: number;
  readonly matched: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

async function measure(
  backend: string,
  path: string,
  counter: Counting,
  run: () => Promise<{ total: number }>,
): Promise<Sample> {
  const cpu: number[] = [];
  const wall: number[] = [];
  const rows: number[] = [];
  let matched = 0;
  for (let i = 0; i < RUNS; i++) {
    counter.rows = 0;
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    matched = (await run()).total;
    wall.push(performance.now() - t0);
    const c = process.cpuUsage(c0);
    cpu.push((c.user + c.system) / 1000);
    rows.push(counter.rows);
  }
  return { backend, path, cpuMs: median(cpu), wallMs: median(wall), rows: median(rows), matched };
}

/** A site with `events` (list fields, an expiry) and N published events on SQLite. */
async function seedSqlite(): Promise<{ store: SiteGraphStore; site: Site; sql: SqlDriver }> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({
    sql,
    blobs: new MemoryBlobStore(),
    gates: GATES_ENFORCED,
    now: () => new Date(NOW - 30 * DAY),
  });
  await store.init();
  const seeded = await seedStarterSite(store, { name: "Bench", slug: "bench" });
  const L = (label: string) => ({ en: { label } });
  const site = await store.updateSite({
    ...seeded,
    collections: {
      ...seeded.collections,
      events: {
        fields: [
          { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
          { key: "endsAt", type: "datetime", labels: L("Ends"), localized: false },
          { key: "price", type: "number", labels: L("Price"), localized: false },
          { key: "venue", type: "text", labels: L("Venue"), localized: true },
        ],
        listFields: ["startsAt", "price"],
        expiry: { field: "endsAt", action: "unlist" },
      },
    },
  });
  const [hello] = await store.listContentEntries(site.id, "posts");
  for (let i = 0; i < N; i++) {
    const starts = NOW + (i - N / 2) * 3_600_000;
    await store.createContentEntry({
      siteId: site.id,
      collection: "events",
      slug: `event-${i}`,
      locale: "en",
      status: "published",
      title: `Event ${i}`,
      summary: `A summary of event number ${i}, long enough to look like a real one.`,
      body: { format: "markdown", value: `The body of event ${i}. `.repeat(20) },
      fields: {
        startsAt: { at: new Date(starts).toISOString(), timeZone: "Europe/Istanbul" },
        endsAt: { at: new Date(starts + 7_200_000).toISOString(), timeZone: "Europe/Istanbul" },
        price: i % 500,
        venue: `Hall ${i % 37}`,
      },
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author,
    } as never);
  }
  return { store, site, sql };
}

const samples: Sample[] = [];

async function runPaths(backend: string, store: SiteGraphStore, counter: Counting, siteId: string) {
  // Today's scan without field conditions, for comparison: what every list already costs.
  samples.push(
    await measure(backend, "store listContentEntries (today, no where)", counter, async () => ({
      total: (await store.listContentEntries(siteId, { collection: "events" })).length,
    })),
  );
  samples.push(
    await measure(backend, "store queryContentEntries (API)", counter, () =>
      queryContentEntries(store, siteId, { ...QUERY, now: NOW }),
    ),
  );
  const live = new LiveSource(store, siteId, { includeDrafts: false, now: () => NOW });
  samples.push(
    await measure(backend, "LiveSource.queryEntries", counter, () => live.queryEntries(QUERY)),
  );
  const snap = await store.createSnapshot(siteId, { actor: author, reason: "manual" });
  counter.rows = 0;
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  const source = (await SnapshotSource.open(store, snap.id)).at(NOW);
  const first = await source.queryEntries(QUERY);
  const c = process.cpuUsage(c0);
  samples.push({
    backend,
    path: "SnapshotSource cold (load + list)",
    cpuMs: (c.user + c.system) / 1000,
    wallMs: performance.now() - t0,
    rows: counter.rows,
    matched: first.total,
  });
  samples.push(
    await measure(backend, "SnapshotSource warm (per request)", counter, () => {
      const at = source.at(NOW + 1);
      return at.queryEntries(QUERY);
    }),
  );
}

describe(`listing a ${N}-entry collection by field (RFC-0042 §4)`, () => {
  let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
  afterAll(async () => {
    await d1?.dispose();
  });

  it("stays under the side-table threshold on SQLite and D1", async () => {
    const t0 = performance.now();
    const { store, site, sql } = await seedSqlite();
    console.log(
      `seeded ${N} entries on SQLite in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    const counter = new Counting(sql);
    const counted = new SiteGraphStore({ sql: counter, blobs: store.blobs, gates: GATES_ENFORCED });
    await runPaths("sqlite", counted, counter, site.id);

    // The same site on D1 (Miniflare): copied with a bundle import.
    d1 = await createMiniflareD1();
    const d1sql = new D1Driver(d1.db);
    const target = new SiteGraphStore({
      sql: d1sql,
      blobs: new MemoryBlobStore(),
      gates: GATES_ENFORCED,
    });
    await target.init();
    // A bundle import is one atomic batch (≤ 1,000 nodes): copy the node rows in chunks instead.
    const rows = await sql.all<Record<string, SqlValue>>("SELECT * FROM nodes WHERE site_id = ?", [
      site.id,
    ]);
    const cols = Object.keys(rows[0] ?? {});
    const insert = `INSERT INTO nodes (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    for (let i = 0; i < rows.length; i += 50)
      await d1sql.batch(
        rows.slice(i, i + 50).map((r) => ({ sql: insert, params: cols.map((c) => r[c] ?? null) })),
      );
    const d1counter = new Counting(d1sql, d1.db);
    const d1store = new SiteGraphStore({
      sql: d1counter,
      blobs: target.blobs,
      gates: GATES_ENFORCED,
    });
    await runPaths("d1 (miniflare)", d1store, d1counter, site.id);

    console.table(
      samples.map((s) => ({
        backend: s.backend,
        path: s.path,
        "cpu ms": s.cpuMs.toFixed(1),
        "wall ms": s.wallMs.toFixed(1),
        "rows read": s.rows,
        matched: s.matched,
      })),
    );
    // Per request, the paths that run on every view: the warm snapshot list, and the API list.
    for (const s of samples) {
      expect(s.matched, `${s.backend} ${s.path}`).toBeGreaterThan(0);
      if (s.path.startsWith("SnapshotSource warm"))
        expect(s.cpuMs, `${s.backend} ${s.path} cpu`).toBeLessThan(CPU_LIMIT_MS);
    }
    expect(ROWS_LIMIT).toBe(10_000);
  });
});
