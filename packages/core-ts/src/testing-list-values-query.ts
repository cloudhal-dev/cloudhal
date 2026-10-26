/**
 * RFC-0042 §4, #110 property suite: `queryContentEntries` answered from `entry_list_values` is
 * the in-memory evaluator's answer (`scanFieldQuery`, the oracle), on random sites, data and
 * queries. Seeded (`mulberry32`), so a failure names its seed and query. Each seed builds a site
 * in a random zone with two collections listing four random fields of every type (and a random
 * sort), writes originals and translations (in their collection and another, localized values
 * present or falling back), then alternates rounds of random writes (values, status, title,
 * `publishedAt` ties, collection and locale moves, deletes, settings that make stored values
 * unreadable) with random queries: up to four conditions of every operator, `now`, orderBy in
 * both directions, status and locale prefilters, limits and offsets. The pushdown must answer
 * (except for an operand SQL cannot compare exactly) and equal the oracle; so must
 * `queryContentEntries`. Also: what makes it fall back. Runs on better-sqlite3, Miniflare D1 and
 * Durable Object SQLite (`test/list-values-query.test.ts`).
 */
import type {
  Actor,
  CollectionSettings,
  ContentEntry,
  FieldCondition,
  FieldDefinition,
  FieldOrder,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlValue } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { type FieldEntryListQuery, queryContentEntries, scanFieldQuery } from "./entry-query.ts";
import { parseFieldQuery } from "./fields/index.ts";
import { rebuildListValues } from "./list-values/backfill.ts";
import { listedCollections, listFingerprint } from "./list-values/fingerprint.ts";
import { queryListValues } from "./list-values/query.ts";
import { makeJpeg } from "./media/fixtures.ts";
import { SiteGraphStore } from "./store.ts";
import type { ListValuesFactory } from "./testing-list-values.ts";
import {
  type Gen,
  mulberry32,
  pick,
  randomCollections,
  randomFields,
  randomQuery,
  type World,
} from "./testing-list-values-random.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
/** 2026-11-05 23:00 in Istanbul, 2026-11-06 10:00 in Kiritimati. */
const NOW = Date.parse("2026-11-05T20:00:00Z");
const SEEDS = [11, 23, 37, 41];
const ORIGINALS = 36;
const TRANSLATIONS = 14;
const ROUNDS = 3;
const MUTATIONS = 12;
const QUERIES = 50;
/** A seed takes ~5 s locally and over 30 s on a 4-vCPU CI runner with other packages testing. */
const SEED_TIMEOUT = 180_000;
const STATUSES = ["draft", "review", "published", "archived"] as const;
const TITLES = ["Alpha", "alpha", "Été", "𝒜lpha", "x", "￿z", "Zeta", "Ａ", "b"];
const PUBLISHED = ["2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z", undefined];

/** A driver that runs `hook` once, before the first read `when` matches (to race a read). */
function beforeRead(
  sql: SqlDriver,
  when: (q: string) => boolean,
  hook: () => Promise<unknown>,
): SqlDriver {
  let fired = false;
  return {
    name: `${sql.name}+race`,
    get: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) =>
      sql.get<T>(q, p),
    all: async <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) => {
      if (!fired && when(q)) {
        fired = true;
        await hook();
      }
      return sql.all<T>(q, p);
    },
    run: (q: string, p?: readonly SqlValue[]) => sql.run(q, p),
    batch: (s) => sql.batch(s),
    exec: (q: string) => sql.exec(q),
    close: async () => {},
  };
}

/** A page statement of the count-then-page shape (ordered and paged). */
const isPage = (q: string) => q.includes("LIMIT ? OFFSET ?") && q.includes("entry_list_values");
/** The bodies-by-id statement (unordered and paged). */
const isBodies = (q: string) => q.includes("CROSS JOIN entry_list_values d ON d.node_id");

/** A driver that records the reads it runs. */
function watching(sql: SqlDriver, reads: string[]): SqlDriver {
  return {
    name: `${sql.name}+watch`,
    get: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) => {
      reads.push(q);
      return sql.get<T>(q, p);
    },
    all: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) => {
      reads.push(q);
      return sql.all<T>(q, p);
    },
    run: (q: string, p?: readonly SqlValue[]) => sql.run(q, p),
    batch: (s) => sql.batch(s),
    exec: (q: string) => sql.exec(q),
    close: async () => {},
  };
}

export function listValuesQuerySuite(label: string, factory: ListValuesFactory): void {
  describe(`RFC-0042 §4 list-value queries equal the evaluator: ${label}`, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let store: SiteGraphStore;
    let tick = 0;
    let n = 0;

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      await dropAllTables(sql);
      tick = 0;
      store = new SiteGraphStore({
        sql,
        blobs,
        now: () => new Date(Date.UTC(2026, 9, 26, 9, 0, 0, tick++ * 250)),
        gates: GATES_ENFORCED,
      });
      await store.init();
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    async function setup(collections: Record<string, CollectionSettings>, zone: string) {
      n++;
      const project = await store.createProject({
        name: "Query",
        slug: `query-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store.createSite({
        projectId: project.id,
        name: "Query",
        slug: `query-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr", "de"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        timeZone: zone,
        collections,
      });
    }

    const fresh = async (siteId: string) => (await store.getSite(siteId)) as Site;
    const hashOf = async (id: string) =>
      (await sql.get<{ hash: string }>("SELECT hash FROM nodes WHERE id = ?", [id]))?.hash;

    /** Every listed collection is ready under the current fingerprint (writes and settles kept it). */
    async function expectReady(siteId: string) {
      const site = await fresh(siteId);
      for (const c of listedCollections(site)) {
        const state = await sql.get<{ fingerprint: string; ready: number }>(
          "SELECT fingerprint, ready FROM entry_list_state WHERE site_id = ? AND collection = ?",
          [siteId, c],
        );
        expect(state, c).toEqual({ fingerprint: await listFingerprint(site, c), ready: 1 });
      }
    }

    function draft(world: World, g: Gen, over: Partial<ContentEntry>) {
      const collection = over.collection ?? pick(g, ["events", "talks"]);
      const status = pick(g, STATUSES);
      const publishedAt = pick(g, PUBLISHED);
      return {
        siteId: world.site.id,
        collection,
        slug: `e-${world.slugs++}`,
        locale: "en",
        status,
        title: `${pick(g, TITLES)}${g() < 0.5 ? "" : " 2"}`,
        body: { format: "markdown", value: "Body" },
        fields: randomFields(g, world, collection),
        tags: [],
        author: person,
        ...(publishedAt ? { publishedAt } : {}),
        ...over,
      };
    }

    async function translate(world: World, g: Gen, original: ContentEntry) {
      const translation = {
        group: original.id,
        method: "human",
        source: {
          id: original.id,
          locale: original.locale,
          rev: original.rev,
          hash: (await hashOf(original.id)) as string,
        },
      } as Translation;
      const collection = g() < 0.7 ? original.collection : pick(g, ["events", "talks"]);
      const fields = randomFields(g, world, collection, { absent: 0.5, translation: true });
      return store.createContentEntry({
        ...draft(world, g, { collection }),
        slug: original.slug,
        locale: pick(g, ["tr", "de"]),
        fields,
        translation,
      } as never);
    }

    async function populate(world: World, g: Gen) {
      const originals: ContentEntry[] = [];
      for (let i = 0; i < ORIGINALS; i++)
        originals.push(await store.createContentEntry(draft(world, g, {}) as never));
      let made = 0;
      for (let i = 0; i < TRANSLATIONS; i++)
        // A locale its group already has is refused (RFC-0033's index): try another original.
        made += await translate(world, g, pick(g, originals)).then(
          () => 1,
          () => 0,
        );
      expect(made).toBeGreaterThan(TRANSLATIONS / 2);
    }

    /** One random write; refused ones (a key or translation locale taken) change nothing. */
    async function mutate(world: World, g: Gen) {
      const rows = await sql.all<{ body: string }>(
        "SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry' ORDER BY id",
        [world.site.id],
      );
      const e = JSON.parse(pick(g, rows).body) as ContentEntry;
      const r = g();
      if (r < 0.1) return store.deleteContentEntry(e);
      const next: ContentEntry = { ...e };
      const translation = e.translation !== undefined && e.translation.group !== e.id;
      if (r < 0.45) next.fields = randomFields(g, world, e.collection, { translation });
      else if (r < 0.55) next.status = pick(g, STATUSES);
      else if (r < 0.65) next.title = pick(g, TITLES);
      else if (r < 0.75) next.publishedAt = pick(g, PUBLISHED.slice(0, 2)) as string;
      else if (r < 0.88) next.collection = e.collection === "events" ? "talks" : "events";
      else next.locale = pick(g, ["en", "tr", "de"]);
      return store.updateContentEntry(next);
    }

    /** Settings that make stored values unreadable, or list other fields (a rebuild). */
    async function reshape(world: World, g: Gen) {
      const site = await fresh(world.site.id);
      const collections = randomCollections(g, world, site.collections ?? {});
      world.site = await store.updateSite({ ...site, collections });
    }

    async function check(world: World, q: FieldEntryListQuery & { collection: string }) {
      const what = JSON.stringify({ seed: world.seed, ...q });
      const site = await fresh(world.site.id);
      const parsed = parseFieldQuery(site, q.collection, q);
      if (!parsed.ok) throw new Error(`${what}: ${JSON.stringify(parsed.issues)}`);
      const oracle = await scanFieldQuery(store, site, parsed.query, q);
      const pushed = await queryListValues(sql, site, { ...q, query: parsed.query });
      const exact = (q.where ?? []).every((c) => c.value?.isWellFormed() ?? true);
      if (exact) expect(pushed, what).toBeDefined();
      else expect(pushed, what).toBeUndefined();
      const ids = (r: { entries: ContentEntry[] }) => r.entries.map((e) => e.id);
      if (pushed) {
        expect([ids(pushed), pushed.total], what).toEqual([ids(oracle), oracle.total]);
        expect(pushed.entries, what).toEqual(oracle.entries);
      }
      expect(await queryContentEntries(store, site.id, q), what).toEqual(oracle);
      return oracle.total;
    }

    for (const seed of SEEDS)
      it(
        `seed ${seed}: random data and queries`,
        async () => {
          const g = mulberry32(seed);
          const zone = pick(g, ["UTC", "Europe/Istanbul", "Pacific/Kiritimati"]);
          const proto: World = { seed, site: undefined as never, slugs: 0, image: "", now: NOW };
          const site = await setup(randomCollections(g, proto, {}), zone);
          const { asset: image } = await store.ingestAsset({
            siteId: site.id,
            bytes: makeJpeg({ width: 8, height: 8 }),
            filename: "p.jpg",
            uploadedBy: person,
            source: { kind: "upload" },
          });
          const world: World = { ...proto, site, image: image.id };
          await populate(world, g);
          let matched = 0;
          for (let round = 0; round < ROUNDS; round++) {
            for (let i = 0; i < MUTATIONS; i++) await mutate(world, g).catch(() => undefined);
            if (round > 0) await reshape(world, g);
            await expectReady(site.id);
            world.site = await fresh(site.id);
            const entries = await store.listContentEntries(site.id);
            for (let i = 0; i < QUERIES; i++)
              matched += await check(world, randomQuery(g, world, entries));
          }
          expect(matched).toBeGreaterThan(0);
        },
        SEED_TIMEOUT,
      );

    it("falls back while a collection is not ready, and when a read races a write", async () => {
      const fields: [FieldDefinition, ...FieldDefinition[]] = [
        { key: "n", type: "number", labels: { en: { label: "N" } }, localized: false },
      ];
      const site = await setup({ events: { fields, listFields: ["n"] } }, "UTC");
      const g = mulberry32(5);
      const world: World = { seed: 5, site, slugs: 0, image: "", now: NOW };
      const add = () =>
        store.createContentEntry(draft(world, g, { collection: "events", fields: {} }) as never);
      for (let i = 0; i < 6; i++) await add();
      const where: FieldCondition[] = [{ field: "n", op: "unset" }];
      // The three statement shapes: count then page (the window reaches its segment's end), the
      // matches' ids then the window's bodies, and one statement for an unpaged answer.
      const paged = { where, orderBy: { field: "n", direction: "asc" }, limit: 10 } as const;
      const byIds = { where, limit: 4 };
      const unpaged = { where };
      const shapes = [paged, byIds, unpaged];
      const run = (driver: SqlDriver, shape: Omit<FieldEntryListQuery, "now">) => {
        const q = { collection: "events", ...shape, now: NOW };
        const parsed = parseFieldQuery(site, "events", q);
        if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
        return queryListValues(driver, site, { ...q, query: parsed.query });
      };
      const answers = async (driver: SqlDriver) => {
        const out = [];
        for (const shape of shapes) out.push(await run(driver, shape));
        return out;
      };
      for (const a of await answers(sql)) expect(a).toBeDefined();
      // A write between the count and the page, inside the window: the count no longer holds.
      expect(await run(beforeRead(sql, isPage, add), paged)).toBeUndefined();
      // An entry of the window stops matching between the ids and the bodies.
      const stops = async () => {
        const [first] = await store.listContentEntries(site.id, "events");
        await store.updateContentEntry({ ...(first as ContentEntry), fields: { n: 1 } });
      };
      expect(await run(beforeRead(sql, isBodies, stops), byIds)).toBeUndefined();
      // Readiness lost between the statements, or before the only one.
      const reset = () =>
        sql.run("UPDATE entry_list_state SET ready = 0 WHERE site_id = ?", [site.id]);
      expect(await run(beforeRead(sql, isPage, reset), paged)).toBeUndefined();
      await rebuildListValues(sql, { siteId: site.id });
      expect(await run(beforeRead(sql, isBodies, reset), byIds)).toBeUndefined();
      for (const a of await answers(sql)) expect(a).toBeUndefined();
      await rebuildListValues(sql, { siteId: site.id });
      for (const a of await answers(sql)) expect(a).toBeDefined();
      await sql.run("UPDATE entry_list_state SET fingerprint = 'x' WHERE site_id = ?", [site.id]);
      for (const a of await answers(sql)) expect(a).toBeUndefined();
      for (const shape of shapes) {
        const q = { collection: "events", ...shape, now: NOW };
        const parsed = parseFieldQuery(site, "events", q);
        if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
        const oracle = await scanFieldQuery(store, site, parsed.query, q);
        expect(oracle.total).toBeGreaterThan(0);
        expect(await queryContentEntries(store, site.id, q)).toEqual(oracle);
      }
    });

    it("a term filter, and an ill-formed text operand, run on the evaluator", async () => {
      const where: FieldCondition[] = [{ field: "t", op: "eq", value: "\uD800x" }];
      const orderBy: FieldOrder = { field: "n", direction: "asc" };
      const fields: [FieldDefinition, ...FieldDefinition[]] = [
        { key: "t", type: "text", labels: { en: { label: "T" } }, localized: false },
        { key: "n", type: "number", labels: { en: { label: "N" } }, localized: false },
      ];
      const site = await setup({ events: { fields, listFields: ["t", "n"] } }, "UTC");
      const g = mulberry32(9);
      const world: World = { seed: 9, site, slugs: 0, image: "", now: NOW };
      for (const t of ["\uD800x", "a", "\uD800x"])
        await store.createContentEntry(
          draft(world, g, { collection: "events", fields: { t, n: world.slugs } }) as never,
        );
      const q = { collection: "events", where, orderBy, now: NOW };
      const parsed = parseFieldQuery(site, "events", q);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      expect(await queryListValues(sql, site, { ...q, query: parsed.query })).toBeUndefined();
      const r = await queryContentEntries(store, site.id, q);
      expect(r.total).toBe(2);
      expect(r).toEqual(await scanFieldQuery(store, site, parsed.query, q));
      // A term filter: the store's scan compiles it; the table is not read.
      const reads: string[] = [];
      const watched = new SiteGraphStore({
        sql: watching(sql, reads),
        blobs,
        gates: GATES_ENFORCED,
      });
      const filtered = {
        ...q,
        where: [{ field: "n", op: "gte", value: "1" }],
        filter: "collection:events",
      } as const;
      const fp = parseFieldQuery(site, "events", filtered);
      if (!fp.ok) throw new Error(JSON.stringify(fp.issues));
      const viaFilter = await queryContentEntries(watched, site.id, filtered);
      expect(viaFilter.total).toBe(2);
      expect(viaFilter).toEqual(await scanFieldQuery(store, site, fp.query, filtered));
      expect(reads.some((x) => x.includes("entry_list_values"))).toBe(false);
    });
  });
}
