/**
 * RFC-0042 §4, #110 behavioural suite: `entry_list_values` stays exact through every write path
 * (entry create, update, moves and delete; translations and their originals; site settings;
 * field operations; import; site delete), races degrade readiness instead of leaving stale rows,
 * and the backfill resumes, serializes and starts over as its state row says. `expectExact`
 * (`testing-list-values-kit.ts`) recomputes every entry's rows from the nodes and compares them
 * with the table. Runs on better-sqlite3, Miniflare D1 and Durable Object SQLite
 * (`test/list-values.test.ts`); the repairs of #110's review are `testing-list-values-repair.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  continueFieldOperation,
  revertFieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import { rebuildListValues } from "./list-values/backfill.ts";
import { deleteSiteData } from "./site-delete.ts";
import { exportSite, importSite } from "./sync.ts";
import {
  at,
  EVENTS,
  FIELDS,
  type ListValuesFactory,
  listValuesKit,
  person,
  recording,
  TALKS,
} from "./testing-list-values-kit.ts";
import { racingDriver } from "./testing-taxonomy.ts";

export type { ListValuesFactory } from "./testing-list-values-kit.ts";

export function listValuesSuite(label: string, factory: ListValuesFactory): void {
  describe(`RFC-0042 §4 list values: ${label}`, () => {
    const k = listValuesKit(factory);
    const { open, setup, entry, translate, fresh, get, hashOf, state, expectExact } = k;

    it("a new site's listed collections are ready, and entry writes keep their rows", async () => {
      const site = await setup({ events: EVENTS, talks: TALKS, posts: { fields: FIELDS } });
      expect(await state(site.id, "events")).toMatchObject({ ready: 1, cursor: null });
      expect(await state(site.id, "posts")).toBeUndefined();
      const a = await entry(site, "a", {
        startsAt: at("2026-11-05T16:30:00Z"),
        price: 10,
        kind: ["talk", "social"],
        venue: "Hall",
      });
      const b = await entry(
        site,
        "b",
        { price: 2.5, venue: "x".repeat(101) },
        { status: "published" },
      );
      await expectExact(site.id);
      const a2 = await k.store.updateContentEntry({
        ...a,
        fields: { ...a.fields, price: 11, kind: [] },
        status: "published",
      });
      await k.store.updateContentEntry({
        ...b,
        title: "B!",
        publishedAt: "2026-01-01T00:00:00.000Z",
      });
      await expectExact(site.id);
      const moved = await k.store.updateContentEntry({
        ...a2,
        collection: "talks",
        fields: { price: 4, free: true, day: "2026-11-05" },
      });
      await expectExact(site.id);
      const unlisted = await k.store.updateContentEntry({ ...moved, collection: "posts" });
      await expectExact(site.id);
      await k.store.updateContentEntry({ ...unlisted, collection: "events", locale: "de" });
      await expectExact(site.id);
      await k.store.deleteContentEntry(await get(b.id));
      await expectExact(site.id);
      expect(
        (await k.sql.all("SELECT 1 FROM entry_list_values WHERE node_id = ?", [b.id])).length,
      ).toBe(0);
    });

    it("an original's values reach its translations' rows, in its collection and another", async () => {
      const site = await setup();
      const o = await entry(site, "o", { price: 10, free: true, venue: "Hall", day: "2026-11-05" });
      const tr = await translate(site, o, { fields: { venue: "Salon" } });
      const de = await translate(site, o, { locale: "de", collection: "talks", title: "Zeta" });
      await expectExact(site.id);
      const rowOf = async (id: string, field: string) =>
        k.sql.get<{ num: number | null }>(
          "SELECT num FROM entry_list_values WHERE node_id = ? AND field = ? AND has < 2",
          [id, field],
        );
      expect(await rowOf(tr.id, "price")).toEqual({ num: 10 });
      const o2 = await k.store.updateContentEntry({
        ...(await get(o.id)),
        fields: { ...o.fields, price: 12 },
      });
      expect(await rowOf(tr.id, "price")).toEqual({ num: 12 });
      expect(await rowOf(de.id, "price")).toEqual({ num: 12 });
      await k.store.updateContentEntry({ ...(await get(de.id)), fields: { day: "2027-01-01" } });
      await k.store.updateContentEntry({ ...(await get(tr.id)), fields: { venue: "Sahne" } });
      await expectExact(site.id);
      await k.store.deleteContentEntry(await get(o2.id));
      expect(await rowOf(tr.id, "price")).toEqual({ num: null });
      await expectExact(site.id);
    });

    it("settings changes reset readiness and the inline backfill makes it exact", async () => {
      const site = await setup({ events: { fields: FIELDS }, talks: TALKS, gone: TALKS });
      for (let i = 0; i < 5; i++)
        await entry(
          site,
          `e${i}`,
          { price: i, kind: ["workshop"], venue: `v${i}` },
          { title: `t${4 - i}` },
        );
      await expectExact(site.id);
      const listed = await k.store.updateSite({
        ...(await fresh(site)),
        collections: { events: EVENTS, talks: TALKS, gone: TALKS },
      });
      await expectExact(site.id);
      const before = await state(site.id, "events");
      await k.store.updateSite({
        ...listed,
        collections: {
          ...listed.collections,
          events: { ...EVENTS, listFields: ["venue", "kind", "price", "startsAt"] },
        },
      });
      expect(await state(site.id, "events")).toEqual(before);
      const sorted = await k.store.updateSite({
        ...(await fresh(site)),
        collections: { ...(await fresh(site)).collections, events: { ...EVENTS, sort: "title" } },
      });
      expect((await state(site.id, "events"))?.epoch).not.toBe(before?.epoch);
      await expectExact(site.id);
      const { gone: _gone, ...rest } = sorted.collections ?? {};
      const unlisted = { ...rest, events: { fields: FIELDS } };
      await k.store.updateSite({ ...sorted, collections: unlisted });
      expect(await state(site.id, "events")).toBeUndefined();
      expect(await state(site.id, "gone")).toBeUndefined();
      expect(await state(site.id, "talks")).toMatchObject({ ready: 1 });
    });

    it("the backfill resumes within its budget, from no state row (a site from before 0029)", async () => {
      const site = await setup();
      for (let i = 0; i < 23; i++)
        await entry(site, `e${String(i).padStart(2, "0")}`, { price: i + 0.25, kind: ["talk"] });
      await k.sql.run("DELETE FROM entry_list_state WHERE site_id = ?", [site.id]);
      await k.sql.run("UPDATE entry_list_values SET num = 99 WHERE site_id = ?", [site.id]);
      let calls = 0;
      for (;;) {
        calls++;
        const r = await rebuildListValues(k.sql, {
          siteId: site.id,
          budget: { entries: 7, ms: 60_000 },
        });
        if (!r.exhausted) break;
        expect((await state(site.id, "events"))?.ready).toBe(0);
      }
      expect(calls).toBeGreaterThanOrEqual(4);
      await expectExact(site.id);
      const again = await rebuildListValues(k.sql, { siteId: site.id });
      expect(again.collections.every((c) => c.ready && c.written === 0)).toBe(true);
    });

    it("binds decimals exactly, over a chunk's parameter limit", async () => {
      const site = await setup({ events: EVENTS });
      const odd = [1e-300, 5e-324, 0.1 + 0.2, 1.7976931348623157e308, -1.7976931348623157e308, -0];
      for (const [i, price] of odd.entries()) await entry(site, `odd-${i}`, { price });
      for (let i = 0; i < 90; i++)
        await entry(site, `d-${String(i).padStart(2, "0")}`, { price: i / 7 });
      await expectExact(site.id);
      const back = await k.sql.all<{ num: number }>(
        "SELECT num FROM entry_list_values e JOIN nodes n ON n.id = e.node_id WHERE e.field = 'price' AND n.key LIKE 'events:en:odd-%' ORDER BY n.key",
      );
      expect(back.map((r) => r.num)).toEqual(odd.map((x) => (x === 0 ? 0 : x)));
      await k.sql.run("DELETE FROM entry_list_state WHERE site_id = ?", [site.id]);
      await rebuildListValues(k.sql, { siteId: site.id });
      await expectExact(site.id);
    });

    it("a field operation on a listed field resets the collection; done, it is ready again", async () => {
      const site = await setup();
      const o = await entry(site, "o", { price: 1, venue: "Hall" });
      await translate(site, o, { fields: { venue: "Salon" } });
      // In another collection, reading the original's `price` under its own definition.
      const de = await translate(site, o, { locale: "de", collection: "talks", title: "Zeta" });
      for (let i = 0; i < 3; i++) await entry(site, `e${i}`, { price: i, venue: `v${i}` });
      const quiet = await state(site.id, "events");
      const talks = await state(site.id, "talks");
      const price = async () =>
        k.sql.get<{ has: number }>(
          "SELECT has FROM entry_list_values WHERE node_id = ? AND field = 'price'",
          [de.id],
        );
      expect(await price()).toEqual({ has: 1 });
      await runFieldOperation(
        k.store,
        site.id,
        { op: "rename_field", collection: "events", from: "notes", to: "remarks" },
        { actor: person },
      );
      expect(await state(site.id, "events")).toEqual(quiet);
      expect(await state(site.id, "talks")).toEqual(talks);
      const half = await runFieldOperation(
        k.store,
        site.id,
        { op: "rename_field", collection: "events", from: "price", to: "cost" },
        { actor: person, budget: { entries: 1, ms: 60_000 } },
      );
      expect(half.done).toBe(false);
      expect((await state(site.id, "events"))?.ready).toBe(0);
      const skipped = await rebuildListValues(k.sql, { siteId: site.id });
      expect(skipped.collections.find((c) => c.collection === "events")?.reason).toBe(
        "operation_running",
      );
      const done = await continueFieldOperation(k.store, site.id, half.operationId, {
        actor: person,
      });
      expect(done.done).toBe(true);
      expect((await fresh(site)).collections?.events?.listFields).toContain("cost");
      // Phase B moved the original's `price` away: the pass reset `talks`, the settle rebuilt it.
      expect((await state(site.id, "talks"))?.epoch).not.toBe(talks?.epoch);
      expect(await price()).toEqual({ has: 0 });
      await expectExact(site.id);
      await revertFieldOperation(k.store, site.id, done.operationId, { actor: person });
      expect(await price()).toEqual({ has: 1 });
      await expectExact(site.id);
      await runFieldOperation(
        k.store,
        site.id,
        { op: "set_field_localized", collection: "events", key: "venue", localized: false },
        { actor: person },
      );
      await expectExact(site.id);
    });

    it("a translation's write racing its original's degrades, and the backfill repairs", async () => {
      const site = await setup();
      const o = await entry(site, "o", { price: 1, venue: "Hall" });
      const tr = await translate(site, o, { fields: { venue: "Salon" } });
      const original = open(
        racingDriver(k.sql, async () => {
          await k.store.updateContentEntry({ ...(await get(tr.id)), title: "moved first" });
        }),
      );
      await original.updateContentEntry({
        ...(await get(o.id)),
        fields: { price: 2, venue: "Hall" },
      });
      expect((await state(site.id, "events"))?.ready).toBe(0);
      await rebuildListValues(k.sql, { siteId: site.id });
      await expectExact(site.id);
      const translation = open(
        racingDriver(k.sql, async () => {
          await k.store.updateContentEntry({
            ...(await get(o.id)),
            fields: { price: 3, venue: "Hall" },
          });
        }),
      );
      await translation.updateContentEntry({ ...(await get(tr.id)), fields: { venue: "Sahne" } });
      expect((await state(site.id, "events"))?.ready).toBe(0);
      await rebuildListValues(k.sql, { siteId: site.id });
      await expectExact(site.id);
    });

    it("a write planned before listFields were added degrades the collection", async () => {
      const site = await setup({ events: { fields: FIELDS }, talks: TALKS });
      const late = open(
        racingDriver(k.sql, async () => {
          await k.store.updateSite({
            ...(await fresh(site)),
            collections: { events: EVENTS, talks: TALKS },
          });
        }),
      );
      await entry(site, "late", { price: 5 }, {}, late);
      expect((await state(site.id, "events"))?.ready).toBe(0);
      await rebuildListValues(k.sql, { siteId: site.id });
      await expectExact(site.id);
    });

    it("source-forward on an original's write keeps the collection ready", async () => {
      const site = await setup();
      const o = await entry(site, "o", { price: 1, venue: "Hall" });
      const tr = await translate(site, o, { fields: { venue: "Salon" } });
      const before = await state(site.id, "events");
      await k.store.updateContentEntry({
        ...(await get(o.id)),
        fields: { price: 7, venue: "Hall" },
      });
      expect((await get(tr.id)).translation?.source?.hash).toBe(await hashOf(o.id));
      expect(await state(site.id, "events")).toMatchObject({ epoch: before?.epoch, ready: 1 });
      await expectExact(site.id);
    });

    describe("the backfill against concurrent work", () => {
      const listWrite = (q: string) => /^\s*DELETE FROM entry_list_values WHERE node_id IN/.test(q);

      async function stale(count: number) {
        const site = await setup();
        const ids: string[] = [];
        for (let i = 0; i < count; i++)
          ids.push((await entry(site, `e${String(i).padStart(3, "0")}`, { price: i })).id);
        await k.sql.run("DELETE FROM entry_list_state WHERE site_id = ?", [site.id]);
        return { site, ids };
      }

      it("rereads a chunk whose entry a writer changed", async () => {
        const { site, ids } = await stale(5);
        const racing = racingDriver(
          k.sql,
          async () => {
            await k.store.updateContentEntry({
              ...(await get(ids[1] as string)),
              fields: { price: 50 },
            });
          },
          listWrite,
        );
        const r = await rebuildListValues(racing, { siteId: site.id });
        expect(r.collections.find((c) => c.collection === "events")).toMatchObject({
          ready: true,
          written: 5,
        });
        await expectExact(site.id);
      });

      it("lets one of two runners write", async () => {
        const { site } = await stale(4);
        const racing = racingDriver(
          k.sql,
          async () => {
            await rebuildListValues(k.sql, { siteId: site.id });
          },
          listWrite,
        );
        const r = await rebuildListValues(racing, { siteId: site.id });
        expect(r.collections.find((c) => c.collection === "events")).toMatchObject({
          ready: true,
          written: 0,
        });
        await expectExact(site.id);
      });

      it("starts over when the definitions change mid-run", async () => {
        const { site } = await stale(4);
        const racing = racingDriver(
          k.sql,
          async () => {
            const s = await fresh(site);
            await k.store.updateSite({
              ...s,
              collections: { ...s.collections, events: { ...EVENTS, sort: "oldest" } },
            });
          },
          listWrite,
        );
        const r = await rebuildListValues(racing, { siteId: site.id });
        expect(r.collections.find((c) => c.collection === "events")?.reason).toBe("changed");
        // The site write's own settle rebuilt `events`; the run's site is stale for `talks`.
        expect((await state(site.id, "events"))?.ready).toBe(1);
        await rebuildListValues(k.sql, { siteId: site.id });
        await expectExact(site.id);
      });
    });

    it("import resets and rebuilds the rows; an unchanged import sends none", async () => {
      const site = await setup();
      const o = await entry(site, "o", { price: 1, kind: ["talk"], venue: "Hall" });
      await translate(site, o, { fields: { venue: "Salon" } });
      await entry(site, "p", { price: 2 }, { collection: "talks", title: "P" });
      const bundle = await exportSite({ sql: k.sql, blobs: k.blobs }, site.id);
      await deleteSiteData({ sql: k.sql, blobs: k.blobs }, site.id);
      expect(
        (await k.sql.all("SELECT 1 FROM entry_list_values WHERE site_id = ?", [site.id])).length,
      ).toBe(0);
      expect(
        (await k.sql.all("SELECT 1 FROM entry_list_state WHERE site_id = ?", [site.id])).length,
      ).toBe(0);
      await importSite({ sql: k.sql, blobs: k.blobs }, bundle);
      await expectExact(site.id);
      const seen: string[] = [];
      await importSite({ sql: recording(k.sql, seen), blobs: k.blobs }, bundle);
      expect(seen.some((q) => q.includes("entry_list"))).toBe(false);
      await k.store.updateContentEntry({
        ...(await get(o.id)),
        fields: { price: 9, kind: [], venue: "Hall" },
      });
      await importSite({ sql: k.sql, blobs: k.blobs }, bundle, { mode: "replace" });
      await expectExact(site.id);
    });
  });
}
