/**
 * RFC-0045 step 3 on every backend (`describeSiteGraphStore`): the live renderer's reads,
 * `getGroupMembers` (the membership rule, by site) and `referrerCandidates` (`entry_refs` by
 * `(site_id, target_id)`, holders plus same-site members inheriting by the `shared` rule, and the
 * originals of holders that are translations). Run on SQLite, Miniflare D1 and Durable Object
 * SQLite, since workerd's SQLite rejects some queries better-sqlite3 accepts. The types stay
 * refused in production; this suite enables them on a store of its own.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { nodeHash } from "./hash.ts";
import { getGroupMembers, referrerCandidates } from "./references/reads.ts";
import { SiteGraphStore } from "./store.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (label: string) => ({ en: { label } });

const COLLECTIONS: NonNullable<Site["collections"]> = {
  events: {
    fields: [
      {
        key: "venue",
        type: "reference",
        labels: L("Venue"),
        localized: false,
        collections: ["places"],
      },
      {
        key: "sponsor",
        type: "reference",
        labels: L("Sponsor"),
        localized: true,
        collections: ["people"],
      },
    ],
  },
  places: {},
  people: {},
};

export function referenceReadsSuite(ctx: SuiteContext): void {
  describe("RFC-0045 step 3: the live renderer's reads", () => {
    let n = 0;
    const store = () =>
      new SiteGraphStore({
        sql: ctx.sql(),
        blobs: ctx.blobs(),
        gates: GATES_ENFORCED,
        fieldTypes: { supported: () => true },
      });
    const site = async (projectId: string, slug: string, defaultLocale = "en") =>
      store().createSite({
        projectId,
        name: slug,
        slug,
        defaultLocale,
        locales: [defaultLocale, "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: COLLECTIONS,
      });
    const entry = (s: Site, collection: string, over: Partial<ContentEntry> = {}) =>
      store().createContentEntry({
        siteId: s.id,
        collection,
        slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
        locale: s.defaultLocale,
        status: "published",
        title: `A ${collection}`,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...over,
      } as never) as Promise<ContentEntry>;
    const translate = async (e: ContentEntry, into: Site, over: Partial<ContentEntry> = {}) => {
      const source = { id: e.id, locale: e.locale, rev: e.rev, hash: await nodeHash(e) };
      const cross = into.id !== e.siteId;
      return entry(into, e.collection, {
        locale: cross ? into.defaultLocale : "tr",
        translation: {
          group: e.translation?.group ?? e.id,
          method: "human",
          source: cross ? { ...source, siteId: e.siteId } : source,
        },
        ...over,
      });
    };

    async function world() {
      n++;
      const project = await store().createProject({
        name: "Reads",
        slug: `reads-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      const a = await site(project.id, `reads-a-${n}`);
      const de = await site(project.id, `reads-de-${n}`, "de");
      const hall = await entry(a, "places");
      const hallTr = await translate(hall, a);
      const hallDe = await translate(hall, de);
      const ada = await entry(a, "people");
      const alan = await entry(a, "people");
      const launch = await entry(a, "events", { fields: { venue: hall.id, sponsor: ada.id } });
      const launchTr = await translate(launch, a, { fields: { sponsor: alan.id } });
      const draft = await entry(a, "events", { status: "draft", fields: { venue: hallTr.id } });
      const launchDe = await translate(launch, de, { fields: { venue: hall.id } });
      return { a, de, hall, hallTr, hallDe, ada, alan, launch, launchTr, draft, launchDe };
    }
    const ids = (list: readonly ContentEntry[]) => list.map((e) => e.id).sort();

    it("reads a group's members of this site only, by the membership rule", async () => {
      const w = await world();
      const got = await getGroupMembers(ctx.sql(), w.a.id, [
        w.hall.id,
        w.ada.id,
        "entry_NONE000000",
      ]);
      expect(ids(got.get(w.hall.id) ?? [])).toEqual(ids([w.hall, w.hallTr]));
      expect(ids(got.get(w.ada.id) ?? [])).toEqual([w.ada.id]);
      expect(got.get("entry_NONE000000")).toEqual([]);
      // a member's own id is not a group: hallTr's group is hall's
      expect((await getGroupMembers(ctx.sql(), w.a.id, [w.hallTr.id])).get(w.hallTr.id)).toEqual(
        [],
      );
      // the edition site sees its own member of the same group, and nothing of site A
      const de = await getGroupMembers(ctx.sql(), w.de.id, [w.hall.id]);
      expect(ids(de.get(w.hall.id) ?? [])).toEqual([w.hallDe.id]);
      expect((await getGroupMembers(ctx.sql(), w.a.id, [])).size).toBe(0);
    });

    it("finds referrer candidates by the shared rule, with the originals they resolve through", async () => {
      const w = await world();
      // venue is shared (1): the translation inherits it; the draft holds its own (canonical) row
      const venue = await referrerCandidates(ctx.sql(), w.a.id, w.hall.id);
      expect(ids(venue.candidates)).toEqual(ids([w.launch, w.launchTr, w.draft]));
      // sponsor is localized (2): the translation holds its own value, so it does not inherit ada
      const ada = await referrerCandidates(ctx.sql(), w.a.id, w.ada.id);
      expect(ids(ada.candidates)).toEqual([w.launch.id]);
      // a holder that is a translation comes with its original
      const alan = await referrerCandidates(ctx.sql(), w.a.id, w.alan.id);
      expect(ids(alan.candidates)).toEqual([w.launchTr.id]);
      expect(alan.byId.get(w.launch.id)?.id).toBe(w.launch.id);
      // the edition's member holds its own row there and pins nothing in site A
      const de = await referrerCandidates(ctx.sql(), w.de.id, w.hall.id);
      expect(ids(de.candidates)).toEqual([w.launchDe.id]);
      expect([...de.byId.values()].every((e) => e.siteId === w.de.id)).toBe(true);
      expect((await referrerCandidates(ctx.sql(), w.a.id, w.launch.id)).candidates).toEqual([]);
    });
  });
}
