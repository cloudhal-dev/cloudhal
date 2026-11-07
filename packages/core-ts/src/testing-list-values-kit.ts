/**
 * RFC-0042 §4, #110: what the `entry_list_values` behavioural suites share — a fresh store per
 * test on the factory's backend, a site with two listed collections, entries and translations,
 * and `expectExact`, which recomputes every entry's rows from the nodes (the evaluator's
 * resolution) and compares them, as a multiset, with the table (and the listed collections'
 * states with their fingerprints). `listValuesKit` registers its hooks in the calling `describe`.
 */
import type {
  Actor,
  CollectionSettings,
  ContentEntry,
  FieldDefinition,
  FieldOption,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, expect } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { listedCollections, listFingerprint } from "./list-values/fingerprint.ts";
import { listValueRows, originalIdOf } from "./list-values/rows.ts";
import { SiteGraphStore } from "./store.ts";

export const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const KINDS: [FieldOption, ...FieldOption[]] = [
  { value: "talk", labels: { en: "Talk" } },
  { value: "workshop", labels: { en: "Workshop" } },
  { value: "social", labels: { en: "Social" } },
];

export const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  {
    key: "kind",
    type: "select",
    labels: L("Kind"),
    localized: false,
    options: KINDS,
    multiple: true,
  },
  { key: "venue", type: "text", labels: L("Venue"), localized: true },
  { key: "day", type: "date", labels: L("Day"), localized: true },
  { key: "free", type: "boolean", labels: L("Free"), localized: false },
  { key: "notes", type: "richText", labels: L("Notes"), localized: true },
];
export const EVENTS: CollectionSettings = {
  fields: FIELDS,
  listFields: ["startsAt", "price", "kind", "venue"],
};
export const TALKS: CollectionSettings = {
  fields: FIELDS,
  listFields: ["price", "free", "day"],
  sort: "title",
};
export const at = (iso: string) => ({ at: iso, timeZone: "Europe/Istanbul" });

export interface ListValuesFactory {
  create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>;
  dispose?(): Promise<void>;
}

/** A driver that records every statement it runs (to see what a write sent). */
export function recording(sql: SqlDriver, seen: string[]): SqlDriver {
  return {
    name: `${sql.name}+rec`,
    get: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) =>
      sql.get<T>(q, p),
    all: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) =>
      sql.all<T>(q, p),
    run: (q: string, p?: readonly SqlValue[]) => {
      seen.push(q);
      return sql.run(q, p);
    },
    batch: (s: readonly SqlStatement[]) => {
      seen.push(...s.map((x) => x.sql));
      return sql.batch(s);
    },
    exec: (q: string) => sql.exec(q),
    close: async () => {},
  };
}

type StateRow = { fingerprint: string; epoch: string; ready: number; cursor: string | null };

export interface ListValuesKit {
  /** This test's driver, blobs and store (new in every test). */
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly store: SiteGraphStore;
  /** A store over `driver` with the suite's clock and gates. */
  open(driver: SqlDriver): SiteGraphStore;
  setup(collections?: Record<string, CollectionSettings>): Promise<Site>;
  entry(
    site: Site,
    slug: string,
    fields: Record<string, unknown>,
    extra?: Partial<ContentEntry>,
    on?: SiteGraphStore,
  ): Promise<ContentEntry>;
  translate(site: Site, original: ContentEntry, over: Partial<ContentEntry>): Promise<ContentEntry>;
  fresh(site: Site): Promise<Site>;
  get(id: string): Promise<ContentEntry>;
  hashOf(id: string): Promise<string>;
  state(siteId: string, collection: string): Promise<StateRow | undefined>;
  expectExact(siteId: string, options?: { ready?: boolean }): Promise<void>;
}

/** The rows `listValueRows` gives every entry of the site, as comparable strings. */
async function wantedRows(kit: ListValuesKit, site: Site): Promise<string[]> {
  const nodes = await kit.sql.all<{ created_at: string; body: string }>(
    "SELECT created_at, body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'",
    [site.id],
  );
  const entries = nodes.map((r) => ({
    created: r.created_at,
    entry: JSON.parse(r.body) as ContentEntry,
  }));
  const byId = new Map(entries.map((e) => [e.entry.id, e.entry]));
  const want: string[] = [];
  for (const { created, entry: e } of entries) {
    const groupId = originalIdOf(e);
    const v = listValueRows(site, e, groupId ? byId.get(groupId) : undefined);
    for (const r of v?.rows ?? [])
      want.push(
        [
          e.id,
          v?.collection,
          r.field,
          r.has,
          r.num,
          r.text,
          v?.tie,
          created,
          e.locale,
          e.status,
        ].join("|"),
      );
  }
  return want;
}

async function storedRows(sql: SqlDriver, siteId: string): Promise<string[]> {
  const rows = await sql.all<Record<string, SqlValue>>(
    "SELECT node_id, collection, field, has, num, text, tie, created, locale, status FROM entry_list_values WHERE site_id = ?",
    [siteId],
  );
  const columns = ["node_id", "collection", "field", "has", "num", "text", "tie", "created"];
  return rows.map((r) => [...columns, "locale", "status"].map((c) => r[c]).join("|"));
}

export function listValuesKit(factory: ListValuesFactory): ListValuesKit {
  let sql: SqlDriver;
  let blobs: BlobStore;
  let store: SiteGraphStore;
  let tick = 0;
  let n = 0;
  const open = (driver: SqlDriver) =>
    new SiteGraphStore({
      sql: driver,
      blobs,
      now: () => new Date(Date.UTC(2026, 9, 26, 9, 0, tick++)),
      gates: GATES_ENFORCED,
    });

  beforeEach(async () => {
    ({ sql, blobs } = await factory.create());
    await dropAllTables(sql);
    tick = 0;
    store = open(sql);
    await store.init();
  });

  afterAll(async () => {
    await sql?.close();
    await factory.dispose?.();
  });

  const kit: ListValuesKit = {
    get sql() {
      return sql;
    },
    get blobs() {
      return blobs;
    },
    get store() {
      return store;
    },
    open,
    async setup(collections = { events: EVENTS, talks: TALKS }) {
      n++;
      const project = await store.createProject({
        name: "Lists",
        slug: `lists-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store.createSite({
        projectId: project.id,
        name: "Lists",
        slug: `lists-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr", "de"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        timeZone: "Europe/Istanbul",
        collections,
      });
    },
    entry: (site, slug, fields, extra = {}, on = store) =>
      on.createContentEntry({
        siteId: site.id,
        collection: "events",
        slug,
        locale: "en",
        status: "draft",
        title: slug,
        body: { format: "markdown", value: "Body" },
        fields,
        tags: [],
        author: person,
        ...extra,
      } as never),
    async translate(site, original, over) {
      const translation = {
        group: original.id,
        method: "human",
        source: {
          id: original.id,
          locale: original.locale,
          rev: original.rev,
          hash: await kit.hashOf(original.id),
        },
      } as Translation;
      const extra = { locale: "tr", title: `${original.title}-tr`, translation, ...over };
      return kit.entry(site, original.slug, {}, extra);
    },
    fresh: async (site) => (await store.getSite(site.id)) as Site,
    get: async (id) => (await store.getContentEntry(id)) as ContentEntry,
    hashOf: async (id) =>
      (await sql.get<{ hash: string }>("SELECT hash FROM nodes WHERE id = ?", [id]))
        ?.hash as string,
    state: (siteId, collection) =>
      sql.get<StateRow>(
        "SELECT fingerprint, epoch, ready, cursor FROM entry_list_state WHERE site_id = ? AND collection = ?",
        [siteId, collection],
      ),
    async expectExact(siteId, options = {}) {
      const site = (await store.getSite(siteId)) as Site;
      expect((await storedRows(sql, siteId)).sort()).toEqual((await wantedRows(kit, site)).sort());
      if (options.ready === false) return;
      for (const c of listedCollections(site))
        expect(await kit.state(siteId, c), c).toMatchObject({
          fingerprint: await listFingerprint(site, c),
          ready: 1,
        });
    },
  };
  return kit;
}
