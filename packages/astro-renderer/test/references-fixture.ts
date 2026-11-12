/**
 * RFC-0045 step 3 renderer fixture: a site with references and repeaters, enabled on a store of
 * its own (`SiteGraphStoreOptions.fieldTypes`, as the shared suites do; production refuses them).
 * The store's clock is `T − 24h`; views are taken at `T`.
 *
 * - `places` (no fields): `hall` (en, with a published Turkish member `salon`), `stage` (en
 *   only), `annex` (a draft), `vault` (archived after `night` chose it), `cellar` (embargoed until
 *   `T + 1h`);
 * - `people` (`bio`, `mentor` a reference to people): `ada`, `alan` (mentor: ada), `grace` (draft);
 * - `events`: `venue` (to places, `localized: false`), `sponsor` (to people, `localized: true`),
 *   `speakers` (a repeater of person and talk, `localized: false`), `related` (several events):
 *   `launch` names hall, ada, alan, grace twice (one item holds only her) and meetup; its Turkish
 *   translation `lansman` inherits venue, speakers and related and holds its own sponsor (alan);
 *   `meetup` names `launch` back (a cycle); `gig` names cellar; `night` names vault; `party` is a
 *   draft naming hall; `talk` holds a localized sponsor (ada) that its translation `konusma`
 *   inherits (`shared = 2`);
 * - `fests` (venue turned non-localized by `flipToShared`, sponsor localized): `fest` (stage,
 *   ada) is embargoed until `T + 1h`; its published translation `senlik` holds its own copy of the
 *   venue (hall), which its page shows only while `fest` is hidden, and inherits ada only after;
 * - an edition site (`de`): `halle` (a member of hall's group), `start` (an edition member of
 *   launch naming hall's group) and `baslangic`, a same-site translation of `start` (an edition
 *   chain: it inherits nothing and holds its own venue).
 */
import type {
  Actor,
  ContentEntry,
  FieldDefinition,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import { canonicalJson, GATES_ENFORCED, nodeHash, SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";

export const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (en: string) => ({ en: { label: en } });
export const HOUR = 3_600_000;
export const T = Date.UTC(2026, 10, 12, 9, 0, 0);

const VENUE: FieldDefinition = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
};
const SPONSOR: FieldDefinition = {
  key: "sponsor",
  type: "reference",
  labels: L("Sponsor"),
  localized: true,
  collections: ["people"],
};
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [
    { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
    { key: "talk", type: "text", labels: L("Talk") },
  ],
};
const RELATED: FieldDefinition = {
  key: "related",
  type: "reference",
  labels: L("Related"),
  localized: false,
  multiple: true,
  collections: ["events"],
};
const MENTOR: FieldDefinition = {
  key: "mentor",
  type: "reference",
  labels: L("Mentor"),
  localized: false,
  collections: ["people"],
};

export const COLLECTIONS: NonNullable<Site["collections"]> = {
  events: { fields: [VENUE, SPONSOR, SPEAKERS, RELATED] },
  fests: { fields: [{ ...VENUE, localized: true } as FieldDefinition, SPONSOR] },
  places: {},
  people: { fields: [{ key: "bio", type: "text", labels: L("Bio"), localized: true }, MENTOR] },
};

/**
 * A field turned non-localized with the translations' copies still stored: the state between a
 * `set_field_localized` true → false's phase A (the definition and `entry_refs.shared`) and the
 * phase B that deletes the copies, written directly as the operation's own batches would (the
 * store refuses such a copy on a write, and the operation tools need rollout step 4).
 */
async function flipToShared(
  store: SiteGraphStore,
  siteId: string,
  collection: string,
  key: string,
): Promise<void> {
  const site = (await store.getSite(siteId)) as Site;
  const c = site.collections?.[collection];
  const fields = (c?.fields ?? []).map((d) => (d.key === key ? { ...d, localized: false } : d));
  const next = {
    ...site,
    collections: { ...site.collections, [collection]: { ...c, fields } },
    rev: site.rev + 1,
  } as Site;
  await store.sql.run("UPDATE nodes SET rev = ?, hash = ?, body = ? WHERE id = ?", [
    next.rev,
    await nodeHash(next),
    canonicalJson(next),
    site.id,
  ]);
  await store.sql.run(
    "UPDATE entry_refs SET shared = 1 WHERE site_id = ? AND source_collection = ? AND root_key = ?",
    [siteId, collection, key],
  );
}

export interface RefsWorld {
  store: SiteGraphStore;
  site: Site;
  edition: Site;
  e: Record<string, ContentEntry>;
}

export async function refsWorld(
  options: {
    fallback?: "none" | "default-with-notice";
    routing?: "prefix-except-default" | "prefix-all";
    /** Every write at the same instant: equal `publishedAt`s everywhere (order ties). */
    sameInstant?: boolean;
  } = {},
): Promise<RefsWorld> {
  let tick = 0;
  const step = options.sameInstant ? 0 : 1000;
  const store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
    now: () => new Date(T - 24 * HOUR + tick++ * step),
    gates: GATES_ENFORCED,
    fieldTypes: { supported: () => true },
  });
  await store.init();
  const project = await store.createProject({
    name: "Refs",
    slug: "refs",
    ownerId: person.id,
    siteIds: [],
  });
  const site = await store.createSite({
    projectId: project.id,
    name: "Refs",
    slug: "refs",
    defaultLocale: "en",
    locales: ["en", "tr"],
    domains: [],
    pageIds: [],
    theme: { name: "blog" },
    collections: COLLECTIONS,
    ...(options.fallback || options.routing
      ? {
          localization: {
            ...(options.fallback ? { fallback: options.fallback } : {}),
            ...(options.routing ? { routing: options.routing } : {}),
          },
        }
      : {}),
  });
  const edition = await store.createSite({
    projectId: project.id,
    name: "Refs DE",
    slug: "refs-de",
    defaultLocale: "de",
    locales: ["de", "tr"],
    domains: [],
    pageIds: [],
    theme: { name: "blog" },
    collections: COLLECTIONS,
  });
  const make = (s: Site, collection: string, slug: string, over: Partial<ContentEntry> = {}) =>
    store.createContentEntry({
      siteId: s.id,
      collection,
      slug,
      locale: s.defaultLocale,
      status: "published",
      title: `Title ${slug}`,
      summary: `About ${slug}`,
      body: { format: "markdown", value: "Body" },
      fields: {},
      tags: [],
      author: person,
      ...over,
    } as never) as Promise<ContentEntry>;
  const translate = async (
    of: ContentEntry,
    slug: string,
    over: Partial<ContentEntry> = {},
    into?: Site,
  ) => {
    const source = { id: of.id, locale: of.locale, rev: of.rev, hash: await nodeHash(of) };
    const translation: Translation = into
      ? { group: of.id, method: "human", source: { ...source, siteId: of.siteId } }
      : { group: of.translation?.group ?? of.id, method: "human", source };
    return make(into ?? site, of.collection, slug, {
      locale: into ? into.defaultLocale : "tr",
      translation,
      ...over,
    });
  };
  /** A translation inside the edition site (an edition chain): same-site, so no `siteId`. */
  const translateIn = async (
    of: ContentEntry,
    s: Site,
    slug: string,
    over: Partial<ContentEntry>,
  ) => {
    const source = { id: of.id, locale: of.locale, rev: of.rev, hash: await nodeHash(of) };
    return make(s, of.collection, slug, {
      locale: "tr",
      translation: { group: of.translation?.group ?? of.id, method: "human", source },
      ...over,
    });
  };
  const e: Record<string, ContentEntry> = {};
  e.hall = await make(site, "places", "hall");
  e.hallTr = await translate(e.hall, "salon");
  e.stage = await make(site, "places", "stage");
  e.annex = await make(site, "places", "annex", { status: "draft" });
  e.vault = await make(site, "places", "vault");
  e.cellar = await make(site, "places", "cellar", {
    availability: { from: new Date(T + HOUR).toISOString() },
  });
  e.ada = await make(site, "people", "ada", { fields: { bio: "Counts" } });
  e.alan = await make(site, "people", "alan", { fields: { bio: "Machines", mentor: e.ada.id } });
  e.grace = await make(site, "people", "grace", { status: "draft" });
  e.launch = await make(site, "events", "launch", {
    fields: {
      venue: e.hall.id,
      sponsor: e.ada.id,
      speakers: [
        { person: e.alan.id, talk: "Keynote" },
        { person: e.grace.id, talk: "Hidden" },
        { person: e.grace.id },
      ],
    },
  });
  e.meetup = await make(site, "events", "meetup", {
    fields: { venue: e.stage.id, related: [e.launch.id] },
  });
  e.launch = await store.updateContentEntry({
    ...e.launch,
    fields: { ...e.launch.fields, related: [e.meetup.id] },
  });
  e.launchTr = await translate(e.launch, "lansman", { fields: { sponsor: e.alan.id } });
  e.party = await make(site, "events", "party", { status: "draft", fields: { venue: e.hall.id } });
  e.gig = await make(site, "events", "gig", {
    fields: { venue: e.cellar.id, related: [e.launch.id] },
  });
  // archive after the referrer chose it: an archived target stays in the referrer's values
  e.night = await make(site, "events", "night", { fields: { venue: e.vault.id } });
  e.vault = await store.updateContentEntry({ ...e.vault, status: "archived" });
  e.hallDe = await translate(e.hall, "halle", {}, edition);
  e.launchDe = await translate(e.launch, "start", { fields: { venue: e.hall.id } }, edition);
  e.launchDeTr = await translateIn(e.launchDe, edition, "baslangic", {
    fields: { venue: e.hall.id },
  });
  // a localized value held by the original: one translation inherits it, one holds its own
  e.talk = await make(site, "events", "talk", { fields: { sponsor: e.ada.id } });
  e.talkTr = await translate(e.talk, "konusma");
  // an original gated out at T; its translation holds its own copy of a venue that turns
  // non-localized below, and inherits the localized sponsor only while the original is shown
  e.fest = await make(site, "fests", "fest", {
    availability: { from: new Date(T + HOUR).toISOString() },
    fields: { venue: e.stage.id, sponsor: e.ada.id },
  });
  e.festTr = await translate(e.fest, "senlik", { fields: { venue: e.hall.id } });
  await flipToShared(store, site.id, "fests", "venue");
  return { store, site: (await store.getSite(site.id)) as Site, edition, e };
}
