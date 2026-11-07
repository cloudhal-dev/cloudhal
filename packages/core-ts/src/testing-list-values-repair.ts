/**
 * RFC-0042 §4, #110 behavioural suite, the review's repairs: the admin job's tidy never removes
 * rows of a collection listed while it ran; restores that bring back a whole earlier body (a
 * field operation's revert, `revertTagsToTerms`) never leave rows of the newer one behind; and
 * the backfill keeps to its statement budget, discovery included. Each ends with `expectExact`
 * and, where a list is involved, the pushdown against the in-memory oracle. Runs on
 * better-sqlite3, Miniflare D1 and Durable Object SQLite (`test/list-values.test.ts`).
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { describe, expect, it } from "vitest";
import { type FieldEntryListQuery, scanFieldQuery } from "./entry-query.ts";
import { parseFieldQuery } from "./fields/index.ts";
import {
  continueFieldOperation,
  revertFieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import { rebuildListValues } from "./list-values/backfill.ts";
import { queryListValues } from "./list-values/query.ts";
import type { SiteGraphStore } from "./store.ts";
import {
  EVENTS,
  FIELDS,
  type ListValuesFactory,
  listValuesKit,
  person,
  TALKS,
} from "./testing-list-values-kit.ts";
import { racingDriver } from "./testing-taxonomy.ts";

const NOW = Date.parse("2026-11-05T20:00:00Z");
const number = (key: string): FieldDefinition => ({
  key,
  type: "number",
  labels: { en: { label: key } },
  localized: false,
});
const NUMBERS: [FieldDefinition, ...FieldDefinition[]] = [
  number("a"),
  number("b"),
  number("c"),
  number("d"),
];

/** `sql`, counting every statement it runs (a batch counts each), as a tick meter does. */
function counting(sql: SqlDriver): { sql: SqlDriver; count: () => number; reset: () => void } {
  let n = 0;
  const driver: SqlDriver = {
    name: `${sql.name}+count`,
    get: async (q, p) => {
      n++;
      return sql.get(q, p);
    },
    all: async (q, p) => {
      n++;
      return sql.all(q, p);
    },
    run: async (q, p) => {
      n++;
      return sql.run(q, p);
    },
    batch: async (s) => {
      n += s.length;
      return sql.batch(s);
    },
    exec: (q) => sql.exec(q),
    close: async () => {},
  };
  return {
    sql: driver,
    count: () => n,
    reset: () => {
      n = 0;
    },
  };
}

export function listValuesRepairSuite(label: string, factory: ListValuesFactory): void {
  describe(`RFC-0042 §4 list values, repairs: ${label}`, () => {
    const k = listValuesKit(factory);
    const { setup, entry, fresh, get, state, expectExact } = k;

    /** The pushdown answers `q` and equals the evaluator over the store's scan. */
    async function expectOracle(site: Site, q: FieldEntryListQuery & { collection: string }) {
      const now = await fresh(site);
      const parsed = parseFieldQuery(now, q.collection, q);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      const pushed = await queryListValues(k.sql, now, { ...q, query: parsed.query });
      expect(pushed, JSON.stringify(q)).toBeDefined();
      expect(pushed).toEqual(await scanFieldQuery(k.store, now, parsed.query, q));
    }

    const rowsOf = async (siteId: string, collection: string) =>
      (
        await k.sql.all("SELECT 1 FROM entry_list_values WHERE site_id = ? AND collection = ?", [
          siteId,
          collection,
        ])
      ).length;

    it("tidy keeps the rows of a collection listed and rebuilt while the job ran", async () => {
      const site = await setup({ events: EVENTS, posts: { fields: FIELDS }, gone: TALKS });
      for (let i = 0; i < 3; i++) await entry(site, `p${i}`, { price: i }, { collection: "posts" });
      for (let i = 0; i < 2; i++) await entry(site, `g${i}`, { price: i }, { collection: "gone" });
      const before = await fresh(site);
      await k.store.updateSite({
        ...before,
        collections: { ...before.collections, gone: { fields: FIELDS } },
      });
      expect(await rowsOf(site.id, "gone")).toBe(6);
      // The job read the site with `posts` unlisted; a Studio save lists it (and settles it)
      // just before the tidy statement runs.
      const racing = racingDriver(
        k.sql,
        async () => {
          const s = await fresh(site);
          await k.store.updateSite({
            ...s,
            collections: { ...s.collections, posts: { fields: FIELDS, listFields: ["price"] } },
          });
        },
        (q) => /DELETE FROM entry_list_values WHERE rowid IN/.test(q),
      );
      await rebuildListValues(racing, { tidy: true });
      expect(await state(site.id, "posts")).toMatchObject({ ready: 1 });
      expect(await rowsOf(site.id, "posts")).toBe(3);
      const again = await rebuildListValues(k.sql, { tidy: true });
      expect(again.tidied).toBe(6);
      await expectExact(site.id);
      await expectOracle(site, {
        collection: "posts",
        where: [{ field: "price", op: "gte", value: "1" }],
        now: NOW,
      });
    });

    it("a field operation's revert that restores an edited listed value rebuilds its rows", async () => {
      const site = await setup();
      for (let i = 0; i < 3; i++) await entry(site, `e${i}`, { price: i, day: "2026-11-05" });
      // An operation on an unlisted field, cut short by its budget.
      const half = await runFieldOperation(
        k.store,
        site.id,
        { op: "rename_field", collection: "events", from: "day", to: "date" },
        { actor: person, budget: { entries: 1, ms: 60_000 } },
      );
      expect(half.done).toBe(false);
      // Meanwhile an editor changes a listed value of an entry the operation has not reached.
      const last = (await k.store.listContentEntries(site.id, "events")).find(
        (e) => e.slug === "e2",
      );
      const edited = await get(last?.id as string);
      await k.store.updateContentEntry({ ...edited, fields: { ...edited.fields, price: 20 } });
      const done = await continueFieldOperation(k.store, site.id, half.operationId, {
        actor: person,
      });
      expect(done.done).toBe(true);
      await expectExact(site.id);
      // The revert puts the earlier body back, with its earlier `price`.
      await revertFieldOperation(k.store, site.id, done.operationId, { actor: person });
      expect((await get(edited.id)).fields?.price).toBe(2);
      await expectExact(site.id);
      for (const value of ["2", "20"])
        await expectOracle(site, {
          collection: "events",
          where: [{ field: "price", op: "eq", value }],
          now: NOW,
        });
    });

    it("a tags revert leaves an entry edited during the migration as edited", async () => {
      const site = await setup();
      await entry(site, "a", { price: 1 }, { tags: ["x"] });
      const b = await entry(site, "b", { price: 2 }, { tags: ["y"] });
      // The edit lands after the before-snapshot, before the migration's entry batch.
      const racing: SiteGraphStore = k.open(
        racingDriver(
          k.sql,
          async () => {
            await k.store.updateContentEntry({ ...(await get(b.id)), fields: { price: 9 } });
          },
          (q) => /^UPDATE nodes/.test(q),
        ),
      );
      const run = await racing.migrateTagsToTerms(site.id, person);
      expect(run.skipped.map((s) => s.entryId)).toEqual([b.id]);
      const rv = await k.store.revertTagsToTerms(site.id, run.migrationId, { actor: person });
      expect(rv).toMatchObject({ restored: 1, edited: [b.id] });
      expect((await get(b.id)).fields?.price).toBe(9);
      await expectExact(site.id);
      await expectOracle(site, {
        collection: "events",
        where: [{ field: "price", op: "gte", value: "2" }],
        now: NOW,
      });
    });

    it("the backfill keeps to its statement budget; discovery is two statements", async () => {
      const site = await setup({
        events: EVENTS,
        talks: TALKS,
        nums: {
          fields: NUMBERS,
          listFields: ["a", "b", "c", "d"],
        },
      });
      const other = await setup({ events: EVENTS, talks: TALKS, more: TALKS });
      // Four decimals an entry: 50 entries need three INSERTs.
      for (let i = 0; i < 50; i++) {
        const x = i + 0.5;
        await entry(site, `n${i}`, { a: x, b: x / 3, c: -x, d: x * 1.1 }, { collection: "nums" });
      }
      await entry(other, "o", { price: 1.5 });
      const counted = counting(k.sql);
      const idle = await rebuildListValues(counted.sql, {
        budget: { entries: 200, ms: 60_000, statements: 7 },
      });
      expect(counted.count()).toBe(2);
      expect(idle.collections.every((c) => c.ready)).toBe(true);
      expect(idle.collections).toHaveLength(6);

      await k.sql.run("DELETE FROM entry_list_state");
      await k.sql.run("DELETE FROM entry_list_values");
      const written: number[] = [];
      for (let run = 0; run < 30; run++) {
        counted.reset();
        const r = await rebuildListValues(counted.sql, {
          budget: { entries: 200, ms: 60_000, statements: 7 },
          start: run,
        });
        expect(counted.count(), `run ${run}`).toBeLessThanOrEqual(7);
        written.push(...r.collections.filter((c) => c.collection === "nums").map((c) => c.written));
        if (!r.exhausted && r.collections.every((c) => c.ready)) break;
      }
      // A chunk of 50 needs five statements with its advance; four were left: it was cut at 40.
      expect(written).toContain(40);
      await expectExact(site.id);
      await expectExact(other.id);
      await expectOracle(site, {
        collection: "nums",
        where: [{ field: "a", op: "gte", value: "10" }],
        orderBy: { field: "b", direction: "desc" },
        limit: 5,
        now: NOW,
      });
    });
  });
}
