/**
 * RFC-0045 §5: the picker's bounded search (`pickEntries`) on every driver: a keyset over
 * `nodes_site_kind_key`, `foldName` on both sides, `truncated` and a `cursor` when the row budget
 * ends first, so any matching entry is found by asking again. Node rows are inserted directly.
 */
import { migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, createMiniflareDoSqlite } from "@cloudhal/storage/testing";
import { afterAll, describe, expect, it } from "vitest";
import { PICK_RANGE_SQL, type PickQuery, pickEntries } from "../src/entry-pick.ts";

const SITE = "site_01HZX8K3QPICK";

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
let dosql: Awaited<ReturnType<typeof createMiniflareDoSqlite>> | undefined;
afterAll(async () => {
  await d1?.dispose();
  await dosql?.dispose();
});

const drivers: [string, () => Promise<SqlDriver>][] = [
  ["better-sqlite3", () => BetterSqlite3Driver.open(":memory:")],
  [
    "Cloudflare D1 (Miniflare)",
    async () => {
      d1 ??= await createMiniflareD1();
      return new D1Driver(d1.db);
    },
  ],
  [
    "Durable Object SQLite (Miniflare)",
    async () => {
      dosql ??= await createMiniflareDoSqlite();
      return dosql.driver(`pick-${Math.random().toString(36).slice(2)}`);
    },
  ],
];

let n = 0;
async function world(open: () => Promise<SqlDriver>) {
  const sql = await open();
  await migrate(sql, migrations);
  await sql.run("DELETE FROM nodes WHERE site_id = ?", [SITE]);
  const add = async (collection: string, slug: string, title: string, over: object = {}) => {
    n++;
    const id = `entry_PICK${String(n).padStart(8, "0")}`;
    const body = { id, collection, locale: "tr", slug, title, status: "draft", ...over };
    await sql.run(
      "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, 'contentEntry', ?, 0, ?, ?, 't', 't')",
      [id, SITE, `${collection}:tr:${slug}`, `h${n}`, JSON.stringify(body)],
    );
    return id;
  };
  return { sql, add };
}

describe.each(drivers)("pickEntries: %s", (_, open) => {
  it("finds an entry past the row budget by following the cursor", async () => {
    const { sql, add } = await world(open);
    for (let i = 0; i < 12; i++)
      await add("places", `a-${String(i).padStart(2, "0")}`, `Room ${i}`);
    const late = await add("places", "z-cicek", "Çiçek Pasajı");
    await add("places", "z-old", "Çiçek eski", { status: "archived" });
    await add("people", "b-cicek", "Çiçek Hanım");
    const query: PickQuery = { q: "ÇİÇEK", collections: ["places"], limit: 20, budget: 5 };
    const found: string[] = [];
    let pages = 0;
    for (let cursor: string | undefined; ; ) {
      const page = await pickEntries(sql, SITE, { ...query, cursor });
      pages++;
      found.push(...page.entries.map((e) => e.id));
      if (!page.cursor) break;
      expect(page.truncated).toBe(true);
      cursor = page.cursor;
    }
    expect(found).toEqual([late]);
    expect(pages).toBe(3);
  });

  it("stops at limit with a cursor, reads across collections, and matches nothing for punctuation", async () => {
    const { sql, add } = await world(open);
    const a = await add("halls", "one", "Main Hall");
    const b = await add("places", "two", "Side hall");
    const first = await pickEntries(sql, SITE, {
      q: "HALL",
      collections: ["places", "halls"],
      limit: 1,
    });
    expect(first.entries.map((e) => e.id)).toEqual([a]);
    expect(first.truncated).toBeUndefined();
    const second = await pickEntries(sql, SITE, {
      q: "HALL",
      collections: ["places", "halls"],
      limit: 1,
      cursor: first.cursor,
    });
    expect(second.entries.map((e) => e.id)).toEqual([b]);
    expect(second.entries[0]).toMatchObject({ collection: "places", locale: "tr", groupId: b });
    for (const q of ["#", "&", " ! "])
      expect(
        (await pickEntries(sql, SITE, { q, collections: ["places"], limit: 5 })).entries,
      ).toEqual([]);
    expect(
      (await pickEntries(sql, SITE, { q: "", collections: ["places"], limit: 5 })).entries,
    ).toHaveLength(1);
  });

  it("visits ranges in key order: post-x before post, news2 before news, with and without a locale", async () => {
    const { sql, add } = await world(open);
    const ids = new Set<string>();
    for (const c of ["post", "post-x", "news", "news2"]) {
      ids.add(await add(c, `${c}-a`, `Hall in ${c}`));
      ids.add(await add(c, `${c}-b`, `Other hall in ${c}`));
    }
    const collections = ["post", "post-x", "news", "news2"];
    for (const locale of [undefined, "tr"]) {
      const one = await pickEntries(sql, SITE, { q: "hall", collections, locale, limit: 20 });
      expect(new Set(one.entries.map((e) => e.id))).toEqual(ids);
      expect(one.cursor).toBeUndefined();
      // and across budget-truncated continuations, one row at a time
      const found: string[] = [];
      for (let cursor: string | undefined, guard = 0; guard < 50; guard++) {
        const page = await pickEntries(sql, SITE, {
          q: "hall",
          collections,
          locale,
          limit: 20,
          budget: 1,
          cursor,
        });
        found.push(...page.entries.map((e) => e.id));
        if (!page.cursor) break;
        cursor = page.cursor;
      }
      expect(new Set(found)).toEqual(ids);
      expect(found).toHaveLength(ids.size);
    }
  });
});

describe("pickEntries' query plan (better-sqlite3)", () => {
  it("reads each collection range through nodes_site_kind_key", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const plan = await sql.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${PICK_RANGE_SQL}`, [
      SITE,
      "places:",
      "",
      "places;",
      10,
    ]);
    expect(plan.map((p) => p.detail).join("\n")).toMatch(
      /USING INDEX nodes_site_kind_key \(site_id=\? AND kind=\? AND key>\? AND key<\?\)/,
    );
  });
});
