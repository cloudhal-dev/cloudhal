/**
 * RFC-0042 §4, #110: the list-value query compiler (`list-values/query-sql.ts`) — what it refuses,
 * how pages split into segments, and, on better-sqlite3, that every statement seeks
 * `entry_list_values_query` (the driver) and `entry_list_values_node` (the probes and the bodies
 * by id) and reads `nodes` by id: no scan of either table, whatever the operator, type or order.
 * The backfill's and the write paths' statements seek too, never walking a site's entries.
 */
import type {
  Actor,
  FieldCondition,
  FieldDefinition,
  FieldOrder,
  Site,
} from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { parseFieldQuery } from "../src/fields/index.ts";
import { CHUNK_SQL, ORIGINALS_SQL } from "../src/list-values/backfill.ts";
import { listFingerprint } from "../src/list-values/fingerprint.ts";
import { pageWindows } from "../src/list-values/query.ts";
import { type CompiledListQuery, compileListQuery } from "../src/list-values/query-sql.ts";
import {
  advanceStatement,
  passResetStatement,
  siteStateStatements,
  staleStateStatement,
  stateCheckStatement,
  stateIs,
} from "../src/list-values/state-sql.ts";
import { type NodeValues, nodeRowsStatements } from "../src/list-values/statements.ts";
import { tidyStatement } from "../src/list-values/tidy.ts";
import { hashIs } from "../src/node-sql.ts";
import { SiteGraphStore } from "../src/store.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const NOW = Date.parse("2026-11-05T20:00:00Z");
const L = (label: string) => ({ en: { label } });
const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  {
    key: "kind",
    type: "select",
    labels: L("Kind"),
    localized: false,
    multiple: true,
    options: [
      { value: "talk", labels: { en: "Talk" } },
      { value: "social", labels: { en: "Social" } },
    ],
  },
  { key: "venue", type: "text", labels: L("Venue"), localized: true },
  { key: "free", type: "boolean", labels: L("Free"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
];

describe("RFC-0042 §4 list-value query compiler", () => {
  let sql: BetterSqlite3Driver;
  let site: Site;

  beforeAll(async () => {
    sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const project = await store.createProject({
      name: "Plans",
      slug: "plans",
      ownerId: person.id,
      siteIds: [],
    });
    site = await store.createSite({
      projectId: project.id,
      name: "Plans",
      slug: "plans",
      defaultLocale: "en",
      locales: ["en", "tr"],
      domains: [],
      pageIds: [],
      theme: { name: "blog" },
      timeZone: "Europe/Istanbul",
      collections: {
        events: { fields: FIELDS, listFields: ["startsAt", "price", "kind", "venue"] },
        talks: { fields: FIELDS, listFields: ["free", "day", "price"], sort: "title" },
      },
    });
    for (let i = 0; i < 30; i++)
      await store.createContentEntry({
        siteId: site.id,
        collection: i % 2 ? "events" : "talks",
        slug: `e-${i}`,
        locale: "en",
        status: "published",
        title: `E ${i}`,
        body: { format: "markdown", value: "Body" },
        fields: {
          startsAt: { at: new Date(NOW + i * 3_600_000).toISOString(), timeZone: "UTC" },
          price: i % 7,
          kind: i % 3 ? ["talk"] : [],
          venue: `Hall ${i % 4}`,
          free: i % 2 === 0,
          day: "2026-11-05",
        },
        tags: [],
        author: person,
      } as never);
  });

  async function compile(
    collection: string,
    where: FieldCondition[],
    orderBy?: FieldOrder,
    extra: { locale?: string; status?: string[] } = {},
  ): Promise<CompiledListQuery | string> {
    const parsed = parseFieldQuery(site, collection, { where, ...(orderBy ? { orderBy } : {}) });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const settings = site.collections?.[collection];
    return compileListQuery({
      siteId: site.id,
      collection,
      fingerprint: await listFingerprint(site, collection),
      listFields: settings?.listFields ?? [],
      query: parsed.query,
      sort: settings?.sort ?? "newest",
      now: NOW,
      ...extra,
    });
  }

  async function plan(statement: { sql: string; params?: readonly unknown[] }) {
    const rows = await sql.all<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${statement.sql}`,
      statement.params as never,
    );
    return rows.map((r) => r.detail);
  }

  const probesOf = (all: string) =>
    all.match(/SEARCH p\d+ (EXISTS )?USING COVERING INDEX entry_list_values_node/g) ?? [];

  /** Every statement of the query: no table scan, the driver and probes on their indexes. */
  async function expectSeeks(compiled: CompiledListQuery | string, probes = 0) {
    if (typeof compiled === "string") throw new Error(compiled);
    const statements = [
      compiled.count,
      compiled.all,
      ...(compiled.matches ? [compiled.matches] : []),
      ...compiled.segments.map((s) => compiled.page(s, { limit: 20, offset: 0 })),
      ...compiled.segments.map((s) => compiled.page(s, { limit: 20, offset: 0, reverse: true })),
    ];
    for (const st of statements) {
      const details = await plan(st);
      const all = details.join("\n");
      expect(all).not.toMatch(/SCAN (d|n|p\d+|nodes|entry_list_values)\b/);
      expect(all).toMatch(/SEARCH d USING COVERING INDEX entry_list_values_query/);
      expect(probesOf(all)).toHaveLength(probes);
      if (st !== compiled.count && st !== compiled.matches)
        expect(all).toMatch(/SEARCH n USING INDEX sqlite_autoindex_nodes/);
    }
    // The window's bodies by id: one seek of the node index per id, never the query index.
    const bodies = (await plan(compiled.bodies(["a", "b"]))).join("\n");
    expect(bodies).not.toMatch(/SCAN (d|n|p\d+|nodes|entry_list_values)\b|entry_list_values_query/);
    expect(bodies).toMatch(/SEARCH d USING INDEX entry_list_values_node \(node_id=\? AND field=\?/);
    expect(bodies).toMatch(/SEARCH n USING INDEX sqlite_autoindex_nodes/);
    expect(probesOf(bodies)).toHaveLength(probes);
  }

  it("seeks the index for the bench query: a range on the field it is ordered by", async () => {
    const q = await compile("events", [{ field: "startsAt", op: "gte", value: "now" }], {
      field: "startsAt",
      direction: "asc",
    });
    await expectSeeks(q);
    if (typeof q === "string") return;
    const count = (await plan(q.count)).join("\n");
    expect(count).toMatch(
      /SEARCH d USING COVERING INDEX entry_list_values_query \(site_id=\? AND collection=\? AND field=\? AND has=\? AND num>\?\)/,
    );
  });

  it("seeks for text eq, select in, ne, an order alone, and probes the others", async () => {
    await expectSeeks(await compile("events", [{ field: "venue", op: "eq", value: "Hall 1" }]));
    await expectSeeks(await compile("events", [{ field: "kind", op: "eq", value: "talk" }]));
    await expectSeeks(
      await compile("events", [
        { field: "kind", op: "in", values: ["talk", "social"] },
        { field: "venue", op: "eq", value: "Hall 1" },
      ]),
      1,
    );
    await expectSeeks(await compile("events", [{ field: "price", op: "ne", value: "3" }]));
    await expectSeeks(await compile("events", [], { field: "price", direction: "desc" }));
    await expectSeeks(
      await compile(
        "talks",
        [
          { field: "free", op: "eq", value: "false" },
          { field: "day", op: "lte", value: "now" },
        ],
        { field: "price", direction: "asc" },
        { locale: "en", status: ["published"] },
      ),
      2,
    );
    await expectSeeks(await compile("events", [{ field: "kind", op: "ne", value: "talk" }]), 1);
  });

  it("orders a segment by the index when the directions agree (no sort but the outer page's)", async () => {
    const q = await compile("talks", [], { field: "price", direction: "asc" });
    if (typeof q === "string") throw new Error(q);
    const inner = (await plan(q.page("valued", { limit: 20, offset: 0 }))).join("\n");
    expect(inner).not.toMatch(/USE TEMP B-TREE FOR (ORDER BY|LAST|RIGHT)/);
  });

  it("reads an unordered page's ids in one statement, unsorted; an unpaged answer in one", async () => {
    const q = await compile("events", [{ field: "price", op: "gte", value: "3" }]);
    if (typeof q === "string") throw new Error(q);
    expect((await plan(q.matches as never)).join("\n")).not.toMatch(/TEMP B-TREE/);
    expect(q.all.sql).not.toMatch(/LIMIT/);
    const ordered = await compile("events", [], { field: "price", direction: "asc" });
    if (typeof ordered === "string") throw new Error(ordered);
    expect(ordered.matches).toBeUndefined();
    expect(await sql.all(q.ready.sql, q.ready.params as never)).toEqual([{ ok: 1 }]);
  });

  it("the backfill's and the write paths' statements seek, never walking the site's entries", async () => {
    const view = { siteId: site.id, collection: "events", fingerprint: "f", epoch: "e" };
    const rows = [{ field: "price", has: 1 as const, num: 1.5, text: null }];
    const values: NodeValues[] = [
      {
        id: "a",
        hash: "h",
        original: { id: "o", hash: "oh" },
        values: {
          nodeId: "a",
          collection: "events",
          locale: "en",
          status: "draft",
          tie: "t",
          rows,
        },
      },
    ];
    const anchor = hashIs("a", "h");
    const statements = {
      chunk: { sql: CHUNK_SQL, params: [site.id, "events:", "events;", 100] },
      originals: { sql: ORIGINALS_SQL, params: ['["o"]', site.id] },
      stale: staleStateStatement(view, { id: site.id, hash: "h" }, "t"),
      advance: advanceStatement({ ...view, cursor: null }, values, {
        cursor: "k",
        ready: false,
        at: "t",
      }),
      check: stateCheckStatement({
        siteId: site.id,
        seen: new Map([["events", "f"]]),
        own: { collection: "events", original: { id: "o", hash: "oh" } },
        translations: { group: "a", read: [{ id: "t1", hash: "th", collection: "talks" }] },
        anchor,
        at: "t",
      }),
      pass: passResetStatement({
        siteId: site.id,
        collection: "events",
        ids: ["a"],
        keys: ["price"],
        at: "t",
      }),
      tidy: tidyStatement([[site.id, "events", "h"]]),
    };
    const lists = [
      ...nodeRowsStatements(site.id, values, stateIs({ ...view, cursor: null })),
      ...siteStateStatements(
        site.id,
        new Map([
          ["events", "f"],
          ["posts", "none"],
        ]),
        { anchor, at: "t" },
      ),
    ];
    for (const [name, st] of [...Object.entries(statements), ...lists.map((x, i) => [`${i}`, x])]) {
      const all = (await plan(st as { sql: string; params?: readonly unknown[] })).join("\n");
      expect(all, `${name}\n${all}`).not.toMatch(
        /SCAN (nodes|n|o|s|t|v|entry_list_values|entry_list_state)\b|nodes_site_kind(_created)?\b/,
      );
    }
    expect((await plan(statements.originals)).join("\n")).toMatch(
      /SCAN j VIRTUAL TABLE[^\n]*\nSEARCH n USING INDEX sqlite_autoindex_nodes_1 \(id=\?\)/,
    );
  });

  it("leaves an ill-formed text operand to the evaluator", async () => {
    expect(await compile("events", [{ field: "venue", op: "eq", value: "\uD800" }])).toBe(
      "a string operand that is not well formed",
    );
  });

  it("splits a window into the valued and missing segments", () => {
    const sizes = [
      { segment: "valued" as const, size: 5 },
      { segment: "missing" as const, size: 3 },
    ];
    expect(pageWindows(sizes, 0, 2)).toEqual([
      { segment: "valued", size: 5, offset: 0, limit: 2, end: false },
    ]);
    expect(pageWindows(sizes, 4, 3)).toEqual([
      { segment: "valued", size: 5, offset: 4, limit: 1, end: true },
      { segment: "missing", size: 3, offset: 0, limit: 2, end: false },
    ]);
    expect(pageWindows(sizes, 6, undefined)).toEqual([
      { segment: "missing", size: 3, offset: 1, limit: 2, end: true },
    ]);
    expect(pageWindows(sizes, 8, 5)).toEqual([]);
    expect(pageWindows([{ segment: "all", size: 0 }], 0, 5)).toEqual([]);
  });
});
