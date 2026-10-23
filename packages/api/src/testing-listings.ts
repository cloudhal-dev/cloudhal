/**
 * Shared API suite for RFC-0042 step 2: `PUT /collections/:key` checks list fields, the expiry
 * field and the structured-data preset, and refuses dropping a list field sections use (409);
 * page writes check `contentList` `where`/`orderBy` (422); `GET /entries` takes `where`,
 * `orderBy`, `limit` and `cursor` with the injected clock as `now`, and answers as before without
 * them. Runs against any SiteGraphStore backend, like `testing.ts`.
 */
import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
type Json = Record<string, unknown>;
const L = (label: string) => ({ en: { label } });

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
  { key: "city", type: "text", labels: L("City"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
];
const EVENTS: CollectionSettings = {
  labels: { en: { singular: "Event", plural: "Events" } },
  fields: FIELDS,
  listFields: ["startsAt", "day", "price"],
  expiry: { field: "startsAt", action: "unlist" },
  structuredData: {
    type: "Event",
    properties: {
      startDate: { kind: "field", field: "startsAt" },
      "location.name": { kind: "field", field: "city" },
      "location.address.addressLocality": { kind: "field", field: "city" },
    },
  },
};
/** 2026-11-05 23:00 in Istanbul, 2026-11-06 10:00 in Kiritimati. */
const NOW = new Date("2026-11-05T20:00:00Z");
const at = (iso: string) => ({ at: iso, timeZone: "Europe/Istanbul" });

export function describeListingsApi(label: string, factory: ApiStoreFactory): void {
  describe(`API collections stage 3: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const site = async () => (await call(`/api/sites/${siteId}`)).body as unknown as Site;
    const put = async (settings: unknown) =>
      call(`/api/sites/${siteId}/collections/events`, {
        method: "PUT",
        body: JSON.stringify({ settings, rev: (await site()).rev }),
      });
    const entry = (slug: string, fields: Json) =>
      call(`/api/sites/${siteId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          collection: "events",
          slug,
          locale: "en",
          status: "draft",
          title: slug,
          body: { format: "markdown", value: "Body" },
          fields,
          tags: [],
        }),
      });
    const page = (sections: unknown[]) =>
      call(`/api/sites/${siteId}/pages`, {
        method: "POST",
        body: JSON.stringify({
          path: "/upcoming",
          title: "Upcoming",
          locale: "en",
          status: "draft",
          sections,
        }),
      });
    const list = (query: Record<string, unknown>) => {
      const q = new URLSearchParams({ collection: "events" });
      for (const [k, v] of Object.entries(query))
        q.set(k, typeof v === "string" ? v : JSON.stringify(v));
      return call(`/api/sites/${siteId}/entries?${q}`);
    };
    const slugs = (body: unknown) =>
      (Array.isArray(body) ? body : (body as { entries: Json[] }).entries).map((e) => e.slug);
    const issues = (body: Json) =>
      ((body.details as { issues?: { path: string; code: string }[] }).issues ?? []).map(
        (i) => `${i.path} ${i.code}`,
      );

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Stage 3", slug: "stage3" })).id;
      app = createApi({
        store,
        now: () => NOW,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    async function seeded() {
      expect((await put(EVENTS)).status).toBe(200);
      for (const [slug, fields] of [
        ["a", { startsAt: at("2026-11-05T16:30:00Z"), day: "2026-11-05", price: 10 }],
        ["b", { startsAt: at("2026-11-10T09:00:00Z"), day: "2026-11-10", price: 5 }],
        ["c", { price: 20 }],
      ] as const)
        expect((await entry(slug, fields)).status).toBe(201);
    }

    it("PUT /collections checks list fields, expiry and the preset", async () => {
      const unknown = await put({ ...EVENTS, listFields: ["nope"] });
      expect([unknown.status, unknown.body.error]).toEqual([422, "unknown_field"]);
      expect(issues(unknown.body)).toEqual(["collections/events/listFields/0 unknown_field"]);
      const expiry = await put({ ...EVENTS, expiry: { field: "city", action: "hide" } });
      expect([expiry.status, expiry.body.error]).toEqual([422, "invalid_expiry"]);
      const preset = await put({
        ...EVENTS,
        structuredData: {
          type: "Event",
          properties: { startDate: { kind: "field", field: "price" } },
        },
      });
      expect([preset.status, preset.body.error]).toEqual([422, "structured_data_invalid"]);
      expect(issues(preset.body)).toContain(
        "collections/events/structuredData/properties/startDate/field source_mismatch",
      );
      expect((await put(EVENTS)).status).toBe(200);
    });

    it("page writes check where/orderBy; list fields in use are kept (409)", async () => {
      expect((await put(EVENTS)).status).toBe(200);
      const section = {
        id: "sec_upcoming0001",
        kind: "contentList",
        collection: "events",
        limit: 6,
        sort: "newest",
      };
      const bad = await page([{ ...section, where: [{ field: "city", op: "eq", value: "x" }] }]);
      expect([bad.status, bad.body.error]).toEqual([422, "invalid_query"]);
      expect(issues(bad.body)).toEqual(["sections/0/where/0/field invalid_query"]);
      const good = await page([
        {
          ...section,
          where: [{ field: "startsAt", op: "gte", value: "now" }],
          orderBy: { field: "startsAt", direction: "asc" },
        },
      ]);
      expect(good.status, JSON.stringify(good.body)).toBe(201);
      const unlisted = await put({ ...EVENTS, listFields: ["day", "price"] });
      expect([unlisted.status, unlisted.body.error]).toEqual([409, "list_field_in_use"]);
      expect((unlisted.body.details as { pages: Json[] }).pages).toMatchObject([
        { path: "/upcoming" },
      ]);
    });

    it("GET /entries without the new parameters answers exactly as before", async () => {
      await seeded();
      const plain = await call(`/api/sites/${siteId}/entries?collection=events`);
      expect(plain.body).toEqual(
        JSON.parse(
          JSON.stringify(await store.listContentEntries(siteId, { collection: "events" })),
        ),
      );
    });

    it("GET /entries filters and sorts by list fields, with the clock as now", async () => {
      await seeded();
      const upcoming = await list({ where: [{ field: "startsAt", op: "gte", value: "now" }] });
      expect([upcoming.status, slugs(upcoming.body)]).toEqual([200, ["b"]]);
      const byPrice = await list({ orderBy: { field: "price", direction: "desc" } });
      expect(slugs(byPrice.body)).toEqual(["c", "a", "b"]);
      const byStart = await list({ orderBy: { field: "startsAt", direction: "asc" } });
      expect(slugs(byStart.body)).toEqual(["a", "b", "c"]);
      // `now` on a date field is today in the site's zone.
      const today = { where: [{ field: "day", op: "gte", value: "now" }] };
      expect(slugs((await list(today)).body).sort()).toEqual(["a", "b"]);
      const s = await site();
      const moved = await call(`/api/sites/${siteId}`, {
        method: "PUT",
        body: JSON.stringify({ ...s, timeZone: "Pacific/Kiritimati" }),
      });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      expect(slugs((await list(today)).body)).toEqual(["b"]);
    });

    it("GET /entries pages with limit and cursor", async () => {
      await seeded();
      const orderBy = { field: "startsAt", direction: "asc" };
      const first = await list({ orderBy, limit: "2" });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ total: 3 });
      expect(slugs(first.body)).toEqual(["a", "b"]);
      const cursor = first.body.nextCursor as string;
      expect(typeof cursor).toBe("string");
      const second = await list({ orderBy, limit: "2", cursor });
      expect(slugs(second.body)).toEqual(["c"]);
      expect(second.body.nextCursor).toBeUndefined();
      // Paging alone keeps the store's order.
      const unordered = await list({ limit: "1" });
      expect(unordered.body).toMatchObject({ total: 3 });
    });

    it("GET /entries refuses invalid queries as 422 invalid_query", async () => {
      await seeded();
      const cases: [Record<string, unknown>, string][] = [
        [{ where: "[{" }, "where invalid_query"],
        [{ where: { field: "price" } }, "where invalid_query"],
        [{ where: [{ field: "city", op: "eq", value: "x" }] }, "where/0/field invalid_query"],
        [{ where: [{ field: "price", op: "gt", value: "ten" }] }, "where/0/value invalid_query"],
        [{ orderBy: { field: "city", direction: "asc" } }, "orderBy/field invalid_query"],
        [{ limit: "0" }, "limit invalid_query"],
        [{ limit: "lots" }, "limit invalid_query"],
        [{ cursor: "abc" }, "cursor invalid_query"],
        [{ limit: "2", cursor: "%%%" }, "cursor invalid_query"],
      ];
      for (const [query, expected] of cases) {
        const r = await list(query);
        expect([r.status, r.body.error, issues(r.body)], JSON.stringify(query)).toEqual([
          422,
          "invalid_query",
          [expected],
        ]);
      }
      const noCollection = await call(
        `/api/sites/${siteId}/entries?where=${encodeURIComponent('[{"field":"price","op":"set"}]')}`,
      );
      expect([noCollection.status, issues(noCollection.body)]).toEqual([
        422,
        ["collection invalid_query"],
      ]);
    });
  });
}
