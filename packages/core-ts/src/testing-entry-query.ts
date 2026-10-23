/**
 * RFC-0042 step 2 behavioural suite: `queryContentEntries`, a collection's entries filtered and
 * sorted by its list fields with the shared evaluator over resolved values — operators by type,
 * `now` (injected) on datetime and date fields in the site's zone, missing values last, ties on
 * the collection's sort, paging, translations reading their original's non-localized values, and
 * `invalid_query`. Called by `describeSiteGraphStore`, so it runs on every storage backend.
 */
import type {
  Actor,
  ContentEntry,
  FieldCondition,
  FieldOrder,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { type FieldEntryListQuery, queryContentEntries } from "./entry-query.ts";
import { InvariantError } from "./errors.ts";
import type { SiteGraphStore } from "./store.ts";
import { STAGE3_EVENTS } from "./testing-listings.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
/** 2026-11-05 23:00 in Istanbul, 2026-11-06 10:00 in Kiritimati. */
const NOW = Date.parse("2026-11-05T20:00:00Z");
const at = (iso: string) => ({ at: iso, timeZone: "Europe/Istanbul" });

export function entryQuerySuite(ctx: SuiteContext): void {
  describe("RFC-0042 §4 entry queries by list field", () => {
    let n = 0;
    const store = (): SiteGraphStore => ctx.store();

    async function world() {
      n++;
      const project = await store().createProject({
        name: "Query",
        slug: `query-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      const site = await store().createSite({
        projectId: project.id,
        name: "Query",
        slug: `query-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        timeZone: "Europe/Istanbul",
        collections: { events: STAGE3_EVENTS },
      });
      const entry = (slug: string, fields: Record<string, unknown>, extra = {}) =>
        store().createContentEntry({
          siteId: site.id,
          collection: "events",
          slug,
          locale: "en",
          status: "published",
          title: slug,
          body: { format: "markdown", value: "Body" },
          fields,
          tags: [],
          author: person,
          ...extra,
        } as never);
      const a = await entry(
        "a",
        {
          startsAt: at("2026-11-05T16:30:00Z"),
          price: 10,
          eventStatus: "scheduled",
          day: "2026-11-05",
        },
        { publishedAt: "2026-10-01T00:00:00.000Z" },
      );
      const b = await entry(
        "b",
        {
          startsAt: at("2026-11-10T09:00:00Z"),
          price: 5,
          eventStatus: "cancelled",
          day: "2026-11-10",
        },
        { publishedAt: "2026-10-03T00:00:00.000Z" },
      );
      const c = await entry("c", { price: 20 }, { publishedAt: "2026-10-04T00:00:00.000Z" });
      const d = await entry(
        "d",
        { startsAt: at("2026-11-01T09:00:00Z"), price: 10, day: "2026-11-01" },
        { publishedAt: "2026-10-02T00:00:00.000Z" },
      );
      return { site, a, b, c, d };
    }
    const slugs = (r: { entries: ContentEntry[] }) => r.entries.map((e) => e.slug);
    const query = (
      site: Site,
      where?: FieldCondition[],
      orderBy?: FieldOrder,
      extra: Partial<FieldEntryListQuery> = {},
    ) =>
      queryContentEntries(store(), site.id, {
        collection: "events",
        now: NOW,
        ...(where ? { where } : {}),
        ...(orderBy ? { orderBy } : {}),
        ...extra,
      });
    async function refused(p: Promise<unknown>) {
      try {
        await p;
      } catch (e) {
        if (!(e instanceof InvariantError)) throw e;
        const issues = (e.details.issues ?? []) as { path: string }[];
        return `${e.code} ${issues.map((i) => i.path).join(",")}`;
      }
      throw new Error("expected a rejection");
    }

    it("without where/orderBy answers exactly what listContentEntries does", async () => {
      const { site } = await world();
      const plain = await store().listContentEntries(site.id, { collection: "events" });
      const r = await query(site);
      expect(r.entries).toEqual(plain);
      expect(r.total).toBe(4);
    });

    it("filters by type: datetime against now, numbers, selects, set and unset", async () => {
      const { site } = await world();
      const upcoming = { field: "startsAt", op: "gte", value: "now" } as const;
      expect(slugs(await query(site, [upcoming]))).toEqual(["b"]);
      expect(
        slugs(
          await query(site, [{ field: "startsAt", op: "lte", value: "2026-11-05T19:30:00+03:00" }]),
        ),
      ).toEqual(["a", "d"]);
      expect(slugs(await query(site, [{ field: "price", op: "lte", value: "10" }])).sort()).toEqual(
        ["a", "b", "d"],
      );
      expect(
        slugs(await query(site, [{ field: "eventStatus", op: "eq", value: "cancelled" }])),
      ).toEqual(["b"]);
      // `ne` is "not eq": entries without a value match it.
      expect(
        slugs(await query(site, [{ field: "eventStatus", op: "ne", value: "cancelled" }])).sort(),
      ).toEqual(["a", "c", "d"]);
      expect(
        slugs(
          await query(site, [
            { field: "eventStatus", op: "in", values: ["scheduled", "cancelled"] },
          ]),
        ).sort(),
      ).toEqual(["a", "b"]);
      expect(slugs(await query(site, [{ field: "startsAt", op: "unset" }]))).toEqual(["c"]);
      // Conditions are ANDed.
      expect(
        slugs(
          await query(site, [
            { field: "startsAt", op: "set" },
            { field: "price", op: "eq", value: "10" },
          ]),
        ).sort(),
      ).toEqual(["a", "d"]);
    });

    it("`now` on a date field is today in the site's zone", async () => {
      const { site } = await world();
      const today = [{ field: "day", op: "gte", value: "now" }] as FieldCondition[];
      expect(slugs(await query(site, today)).sort()).toEqual(["a", "b"]);
      const s = (await store().getSite(site.id)) as Site;
      await store().updateSite({ ...s, timeZone: "Pacific/Kiritimati" });
      expect(slugs(await query(site, today))).toEqual(["b"]);
      expect(slugs(await query(site, [{ field: "day", op: "eq", value: "2026-11-05" }]))).toEqual([
        "a",
      ]);
    });

    it("orders by a field, missing values last, ties on the collection's sort", async () => {
      const { site } = await world();
      const asc = await query(site, undefined, { field: "startsAt", direction: "asc" });
      expect(slugs(asc)).toEqual(["d", "a", "b", "c"]);
      const desc = await query(site, undefined, { field: "startsAt", direction: "desc" });
      expect(slugs(desc)).toEqual(["b", "a", "d", "c"]);
      // a and d cost 10: the collection's sort (newest) puts d (published later) first.
      const price = await query(site, undefined, { field: "price", direction: "asc" });
      expect(slugs(price)).toEqual(["b", "d", "a", "c"]);
      const s = (await store().getSite(site.id)) as Site;
      const events = { ...s.collections?.events, sort: "oldest" } as never;
      await store().updateSite({ ...s, collections: { ...s.collections, events } });
      const oldest = await query(site, undefined, { field: "price", direction: "asc" });
      expect(slugs(oldest)).toEqual(["b", "a", "d", "c"]);
    });

    it("pages with limit and offset; total counts every match", async () => {
      const { site } = await world();
      const order = { field: "startsAt", direction: "asc" } as const;
      const first = await query(site, undefined, order, { limit: 3 });
      expect([slugs(first), first.total]).toEqual([["d", "a", "b"], 4]);
      const second = await query(site, undefined, order, { limit: 3, offset: 3 });
      expect([slugs(second), second.total]).toEqual([["c"], 4]);
      const filtered = await query(site, [{ field: "price", op: "eq", value: "10" }], order, {
        limit: 1,
      });
      expect([slugs(filtered), filtered.total]).toEqual([["d"], 2]);
    });

    it("a translation reads its original's non-localized values", async () => {
      const { site, a } = await world();
      const member = (await store().translationGroup(site, a.id)).members.find(
        (m) => m.id === a.id,
      );
      const translation = {
        group: a.id,
        method: "human",
        source: { id: a.id, locale: "en", rev: a.rev, hash: member?.hash as string },
      } as Translation;
      await store().createContentEntry({
        siteId: site.id,
        collection: "events",
        slug: "a",
        locale: "tr",
        status: "draft",
        title: "a-tr",
        body: { format: "markdown", value: "Gövde" },
        fields: { venue: "Salon" },
        tags: [],
        author: person,
        translation,
      } as never);
      const tr = await query(site, [{ field: "price", op: "eq", value: "10" }], undefined, {
        locale: "tr",
      });
      expect(tr.entries.map((e) => e.title)).toEqual(["a-tr"]);
    });

    it("refuses invalid queries as invalid_query with paths", async () => {
      const { site } = await world();
      expect(await refused(query(site, [{ field: "city", op: "eq", value: "x" }]))).toBe(
        "invalid_query where/0/field",
      );
      expect(await refused(query(site, [{ field: "price", op: "gt", value: "ten" }]))).toBe(
        "invalid_query where/0/value",
      );
      expect(
        await refused(
          queryContentEntries(store(), site.id, {
            now: NOW,
            where: [{ field: "price", op: "set" }],
          }),
        ),
      ).toBe("invalid_query collection");
      expect(await refused(query(site, undefined, undefined, { limit: 101 }))).toBe(
        "invalid_query limit",
      );
      expect(
        await refused(query(site, undefined, { field: "eventStatus", direction: "asc" })),
      ).toBe("invalid_query orderBy/field");
    });
  });
}
