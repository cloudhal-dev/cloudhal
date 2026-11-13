/**
 * RFC-0045 §2.4, rollout step 7: the one-time per-site `entry_refs` rebuild (`rebuildEntryRefs`).
 * Its rows equal the writer's and the import rebuild's (a running rename and a held old-shape value
 * included), it resumes by cursor, removes orphans of its own site only, skips a node a writer
 * moved meanwhile (R17), and a definitions change between its read and its batch fails the chunk.
 * It waits while a text ↔ reference conversion runs (rows decide what phase B accepted), and no
 * statement grows with the site's `collections`, so a large site still finishes on Workers Free.
 * Runs on every backend (`describeSiteGraphStore`); the types are enabled with
 * `SiteGraphStoreOptions.fieldTypes`.
 */
import type { Actor, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import {
  continueFieldOperation,
  type FieldOperation,
  runFieldOperation,
} from "./fields-operations/index.ts";
import { rebuildEntryRefs } from "./references/rebuild-job.ts";
import { SiteGraphStore } from "./store.ts";
import { rebuildingImport } from "./testing-reimport.ts";
import { racingDriver, type SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const ENABLED = { supported: () => true };

const VENUE = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
} as FieldDefinition;
const SPEAKERS = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: true,
  fields: [
    { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
    { key: "name", type: "text", labels: L("Name") },
  ],
} as FieldDefinition;
const HOSTS = {
  key: "hosts",
  type: "reference",
  labels: L("Hosts"),
  localized: false,
  collections: ["places"],
  multiple: true,
} as FieldDefinition;

type Row = { n: string; t: string; f: string; k: string; s: number; st: string };

export function entryRefsJobSuite(ctx: SuiteContext): void {
  describe("RFC-0045 §2.4 step 7: the one-time entry_refs rebuild job", () => {
    let n = 0;
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 13, 12, 0, tick++));
    const store = () =>
      new SiteGraphStore({
        sql: ctx.sql(),
        blobs: ctx.blobs(),
        now,
        gates: GATES_ENFORCED,
        fieldTypes: ENABLED,
      });

    async function world(collections: Site["collections"]): Promise<Site> {
      n++;
      const project = await store().createProject({
        name: "Refs job",
        slug: `refs-job-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store().createSite({
        projectId: project.id,
        name: "Refs job",
        slug: `refs-job-site-${n}`,
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        ...(collections ? { collections } : {}),
      });
    }
    const events = () =>
      world({ events: { fields: [VENUE, SPEAKERS] }, places: {}, talks: { fields: [HOSTS] } });
    const entry = (site: Site, collection: string, over: Partial<ContentEntry> = {}) =>
      store().createContentEntry({
        siteId: site.id,
        collection,
        slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: `A ${collection}`,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...over,
      } as never);
    const fresh = async (e: ContentEntry) => (await store().getContentEntry(e.id)) as ContentEntry;
    /** Every row of the site, `source_status` included. */
    const rows = async (siteId: string): Promise<Row[]> =>
      (
        await ctx
          .sql()
          .all<Row>(
            "SELECT source_id AS n, target_id AS t, field AS f, root_key AS k, shared AS s, source_status AS st FROM entry_refs WHERE site_id = ? ORDER BY source_id, field, target_id",
            [siteId],
          )
      ).map((r) => ({ ...r, s: Number(r.s) }));
    /** The site's rows gone and its job state with them: what the job finds on a stale index. */
    const forget = async (siteId: string) => {
      await ctx.sql().run("DELETE FROM entry_refs WHERE site_id = ?", [siteId]);
      await ctx.sql().run("DELETE FROM entry_refs_state WHERE site_id = ?", [siteId]);
    };
    const state = (siteId: string) =>
      ctx
        .sql()
        .get<{ cursor: string | null; done: number }>(
          "SELECT cursor, done FROM entry_refs_state WHERE site_id = ?",
          [siteId],
        );

    /** A site with three places and four events referencing them, published and draft. */
    async function populated() {
      const site = await events();
      const [p, q, r] = [
        await entry(site, "places", { title: "P", slug: "p" }),
        await entry(site, "places", { title: "Q", slug: "q" }),
        await entry(site, "places", { title: "R", slug: "r" }),
      ];
      const evs: ContentEntry[] = [];
      for (const [i, [venue, people]] of (
        [
          [p, [q, r]],
          [q, [p]],
          [r, []],
          [p, [r, q]],
        ] as const
      ).entries())
        evs.push(
          await entry(site, "events", {
            slug: `event-${i}`,
            status: i % 2 === 0 ? "published" : "draft",
            fields: {
              venue: venue.id,
              ...(people.length
                ? { speakers: people.map((x) => ({ person: x.id, name: `N ${x.title}` })) }
                : {}),
            },
          }),
        );
      await entry(site, "talks", { slug: "talk", fields: { hosts: [q.id, r.id] } });
      return { site, places: [p, q, r] as const, events: evs };
    }

    it("writes the writer's rows, resumes by cursor, and is done once per site", async () => {
      const { site } = await populated();
      const written = await rows(site.id);
      expect(written.length).toBeGreaterThan(5);
      await forget(site.id);

      // two entries a run: the cursor moves and the next run goes on from it
      const budget = { entries: 2, ms: 60_000 };
      const first = await rebuildEntryRefs(ctx.sql(), { siteId: site.id, budget });
      expect(first.sites).toEqual([{ siteId: site.id, done: false, written: 2, reason: "budget" }]);
      expect(first.exhausted).toBe(true);
      const after = await state(site.id);
      expect(after?.cursor).toMatch(/^events:en:event-1$/);
      expect(Number(after?.done)).toBe(0);
      const partial = await rows(site.id);
      expect(partial.length).toBeGreaterThan(0);
      expect(partial.length).toBeLessThan(written.length);

      let runs = 1;
      for (;;) {
        const r = await rebuildEntryRefs(ctx.sql(), { siteId: site.id, budget });
        runs++;
        if (r.sites[0]?.done) break;
        expect(runs).toBeLessThan(10);
      }
      expect(runs).toBeGreaterThan(2);
      expect(await rows(site.id)).toEqual(written);
      expect(Number((await state(site.id))?.done)).toBe(1);

      // done: never read again, even when its rows go missing later
      await ctx.sql().run("DELETE FROM entry_refs WHERE site_id = ?", [site.id]);
      expect((await rebuildEntryRefs(ctx.sql(), { siteId: site.id })).sites).toEqual([]);
      expect(await rows(site.id)).toEqual([]);
    });

    it("statement budgets cut a chunk short and count every statement", async () => {
      const { site } = await populated();
      const written = await rows(site.id);
      await forget(site.id);
      let issued = 0;
      const counted: SqlDriver = {
        ...ctx.sql(),
        name: "counted",
        get: (q, p) => {
          issued++;
          return ctx.sql().get(q, p);
        },
        all: (q, p) => {
          issued++;
          return ctx.sql().all(q, p);
        },
        run: (q, p) => {
          issued++;
          return ctx.sql().run(q, p);
        },
        batch: (s) => {
          issued += s.length;
          return ctx.sql().batch(s);
        },
      };
      for (let i = 0; i < 20; i++) {
        issued = 0;
        const r = await rebuildEntryRefs(counted, {
          siteId: site.id,
          budget: { entries: 100, ms: 60_000, statements: 7 },
        });
        expect(issued).toBeLessThanOrEqual(7);
        if (r.sites[0]?.done) break;
      }
      expect(await rows(site.id)).toEqual(written);
    });

    it("removes the rows of nodes that no longer exist, of its own site only", async () => {
      const { site, places } = await populated();
      const other = await events();
      const written = await rows(site.id);
      const ghost = (siteId: string, source: string) =>
        ctx
          .sql()
          .run(
            "INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status) VALUES (?, ?, ?, 'events', 'venue', 'venue', 1, 'published')",
            [siteId, places[0].id, source],
          );
      await ghost(site.id, "entry_01HZX8K3Q9GHOST000000000A");
      await ghost(other.id, "entry_01HZX8K3Q9GHOST000000000B");
      await ctx.sql().run("DELETE FROM entry_refs_state WHERE site_id = ?", [site.id]);

      expect((await rebuildEntryRefs(ctx.sql(), { siteId: site.id })).sites[0]?.done).toBe(true);
      expect(await rows(site.id)).toEqual(written);
      // the other site's orphan waits for that site's own run
      expect((await rows(other.id)).map((r) => r.n)).toEqual(["entry_01HZX8K3Q9GHOST000000000B"]);
      await rebuildEntryRefs(ctx.sql(), { siteId: other.id });
      expect(await rows(other.id)).toEqual([]);
    });

    it("R17: a referrer written between the job's read and its batch keeps its fresh rows; the moved node is skipped", async () => {
      const { site, places, events: evs } = await populated();
      const target = evs[1] as ContentEntry;
      await forget(site.id);
      const raced = racingDriver(
        ctx.sql(),
        async () => {
          // the writer moves the node after the job read it: new venue, new rows
          await store().updateContentEntry({
            ...(await fresh(target)),
            status: "published",
            fields: { venue: places[2].id },
          });
        },
        (q) => q.includes("INSERT INTO entry_refs_state"),
      );
      const r = await rebuildEntryRefs(raced, { siteId: site.id });
      expect(r.sites[0]?.done).toBe(true);
      // the writer's rows stand, not the job's stale ones (venue Q, a draft)
      expect((await rows(site.id)).filter((x) => x.n === target.id)).toEqual([
        { n: target.id, t: places[2].id, f: "venue", k: "venue", s: 1, st: "published" },
      ]);
      // every other node got its rows, and they are what a writer writes
      const now = await rows(site.id);
      await forget(site.id);
      for (const e of evs) await store().updateContentEntry({ ...(await fresh(e)), title: "Re" });
      for (const e of await store().listContentEntries(site.id))
        if (e.collection === "talks")
          await store().updateContentEntry({ ...(await fresh(e)), title: "Re" });
      expect(await rows(site.id)).toEqual(now);
    });

    it("a definitions change between the read and the batch fails the chunk, which is read again", async () => {
      const { site } = await populated();
      const written = await rows(site.id);
      await forget(site.id);
      const after: { changes: number | undefined; rows: number }[] = [];
      const raced = racingDriver(
        ctx.sql(),
        async () => {
          const s = (await store().getSite(site.id)) as Site;
          const fields: [FieldDefinition, ...FieldDefinition[]] = [
            ...(s.collections?.events?.fields ?? []),
            { key: "room", type: "text", labels: L("Room"), localized: true },
          ];
          await store().updateSite({
            ...s,
            collections: { ...s.collections, events: { ...s.collections?.events, fields } },
          });
        },
        (q) => q.includes("INSERT INTO entry_refs_state"),
      );
      const observed: SqlDriver = {
        ...raced,
        batch: async (s: readonly SqlStatement[]) => {
          const results = await raced.batch(s);
          const count = await ctx
            .sql()
            .get<{ c: number }>("SELECT count(*) AS c FROM entry_refs WHERE site_id = ?", [
              site.id,
            ]);
          after.push({ changes: results.at(-1)?.changes, rows: Number(count?.c ?? 0) });
          return results;
        },
      };
      const r = await rebuildEntryRefs(observed, { siteId: site.id });
      expect(r.sites[0]?.done).toBe(true);
      // the first chunk's batch wrote nothing, not even the cursor
      expect(after[0]).toEqual({ changes: 0, rows: 0 });
      expect(after.length).toBeGreaterThan(1);
      expect(await rows(site.id)).toEqual(written);
    });

    it("rows equal the writer's and the import rebuild's: a running rename and a held old-shape value", async () => {
      const { site, places, events: evs } = await populated();
      const [, q] = places;
      const talk = (await store().listContentEntries(site.id)).find(
        (e) => e.collection === "talks",
      ) as ContentEntry;
      const start = (op: FieldOperation) =>
        runFieldOperation(store(), site.id, op, { actor: person, budget: { entries: 0 } });
      // a rename runs on events (no entry rewritten), a reshape on talks
      await start({ op: "rename_field", collection: "events", from: "venue", to: "place" });
      await start({
        op: "change_field_type",
        collection: "talks",
        key: "hosts",
        type: "repeater",
        subFields: [
          { key: "person", type: "reference", labels: L("Person"), collections: ["places"] },
        ] as never,
      });
      // one event written under the marker (its new key), the talk holding an old-shape value
      // (its stored id keeps its row through the write, `oldShapePairs`)
      await store().updateContentEntry({ ...(await fresh(evs[0] as ContentEntry)), title: "W" });
      await ctx
        .sql()
        .run("UPDATE nodes SET body = json_set(body, '$.fields.hosts', json(?)) WHERE id = ?", [
          JSON.stringify([q.id, 5]),
          talk.id,
        ]);
      await store().updateContentEntry({
        ...(await fresh(talk)),
        title: "Held",
        status: "published",
      });
      const writer = await rows(site.id);
      expect(writer.some((r) => r.n === talk.id && r.t === q.id && r.st === "published")).toBe(
        true,
      );
      expect(writer.some((r) => r.k === "venue")).toBe(true);
      expect(writer.some((r) => r.k === "place")).toBe(true);

      await forget(site.id);
      expect((await rebuildEntryRefs(ctx.sql(), { siteId: site.id })).sites[0]?.done).toBe(true);
      expect(await rows(site.id)).toEqual(writer);

      await rebuildingImport(
        { sql: ctx.sql(), blobs: ctx.blobs() },
        { siteId: site.id, fieldTypes: ENABLED, addNode: () => entry(site, "places") },
      );
      expect(await rows(site.id)).toEqual(writer);
    });
    it("waits while a text → reference conversion runs: rows phase B accepted stay, then it finishes", async () => {
      const site = await world({
        events: {
          fields: [{ key: "venue", type: "text", labels: L("Venue"), localized: false }],
        },
        places: {},
      });
      const hall = await entry(site, "places", { title: "Main Hall", slug: "main-hall" });
      const evs = [
        await entry(site, "events", { slug: "a", fields: { venue: "Main Hall" } }),
        await entry(site, "events", { slug: "b", fields: { venue: "Main Hall" } }),
      ];
      const started = await runFieldOperation(
        store(),
        site.id,
        {
          op: "change_field_type",
          collection: "events",
          key: "venue",
          type: "reference",
          collections: ["places"],
        },
        { actor: person, budget: { entries: 1 } },
      );
      expect(started.done).toBe(false);
      // phase B accepted one entry's value: its row is what tells phase C it is converted
      const accepted = await rows(site.id);
      expect(accepted).toEqual([
        expect.objectContaining({ t: hall.id, f: "venue", k: "venue", s: 1 }),
      ]);
      expect(evs.map((e) => e.id)).toContain(accepted[0]?.n);

      const waiting = await rebuildEntryRefs(ctx.sql(), { siteId: site.id });
      expect(waiting.sites).toEqual([
        { siteId: site.id, done: false, written: 0, reason: "operation_running" },
      ]);
      expect(await rows(site.id)).toEqual(accepted);
      expect(await state(site.id)).toBeUndefined();

      const done = await continueFieldOperation(store(), site.id, started.operationId, {
        actor: person,
      });
      expect(done.done).toBe(true);
      const converted = await rows(site.id);
      expect(converted).toHaveLength(2);
      expect((await rebuildEntryRefs(ctx.sql(), { siteId: site.id })).sites[0]?.done).toBe(true);
      expect(await rows(site.id)).toEqual(converted);
    });

    it("a collections body over 90 KB and an entry with 20 references finish on the Free budget", async () => {
      // 20 select fields of 50 options with 100-character labels: about 130 KB of collections
      const options = Array.from({ length: 50 }, (_, i) => ({
        value: `o${i}`,
        labels: { en: `${"x".repeat(96)}${String(i).padStart(4, "0")}` },
      }));
      const selects = Array.from({ length: 20 }, (_, i) => ({
        key: `s${i}`,
        type: "select",
        labels: { en: { label: `Select ${i}`, help: "h".repeat(300) } },
        localized: false,
        options,
      })) as unknown as FieldDefinition[];
      const many = { ...HOSTS, maxItems: 50 } as FieldDefinition;
      const site = await world({
        places: {},
        talks: { fields: [many] },
        notes: { fields: selects as [FieldDefinition, ...FieldDefinition[]] },
      });
      expect(new TextEncoder().encode(JSON.stringify(site.collections)).length).toBeGreaterThan(
        90_000,
      );
      const places: ContentEntry[] = [];
      for (let i = 0; i < 20; i++)
        places.push(await entry(site, "places", { title: `Place ${i}`, slug: `place-${i}` }));
      const talk = await entry(site, "talks", {
        slug: "big",
        status: "published",
        fields: { hosts: places.map((p) => p.id) },
      });
      const written = await rows(site.id);
      expect(written.filter((r) => r.n === talk.id)).toHaveLength(20);
      await forget(site.id);

      let issued = 0;
      let largest = 0;
      const size = (q: string, p: readonly unknown[] = []) =>
        new TextEncoder().encode(q + p.map((x) => String(x ?? "")).join("")).length;
      const counted: SqlDriver = {
        ...ctx.sql(),
        name: "free",
        get: (q, p) => {
          issued++;
          return ctx.sql().get(q, p);
        },
        all: (q, p) => {
          issued++;
          return ctx.sql().all(q, p);
        },
        run: (q, p) => {
          issued++;
          largest = Math.max(largest, size(q, p));
          return ctx.sql().run(q, p);
        },
        batch: (st) => {
          issued += st.length;
          for (const x of st) largest = Math.max(largest, size(x.sql, x.params));
          return ctx.sql().batch(st);
        },
      };
      const free = { entries: 200, ms: 60_000, statements: 12 };
      let runs = 0;
      for (; runs < 5; runs++) {
        issued = 0;
        const r = await rebuildEntryRefs(counted, { siteId: site.id, budget: free });
        expect(issued).toBeLessThanOrEqual(12);
        if (r.sites[0]?.done) break;
      }
      expect(runs).toBeLessThan(5);
      expect(largest).toBeLessThan(90_000);
      expect(await rows(site.id)).toEqual(written);
    });
  });
}
