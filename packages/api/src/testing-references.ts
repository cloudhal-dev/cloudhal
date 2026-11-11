/**
 * Shared API suite for RFC-0045 rollout step 2: the entry picker, an entry's referrers, and the
 * status codes of the reference refusals on the entry routes. The types stay refused in
 * production; the suite wraps the factory's storage in a store with `fieldTypes`.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
const L = (label: string) => ({ en: { label } });
type Json = Record<string, unknown>;

export function describeReferencesApi(label: string, factory: ApiStoreFactory): void {
  describe(`API references (RFC-0045 step 2): ${label}`, () => {
    let store: SiteGraphStore;
    let site: Site;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };
    const entry = (collection: string, over: Partial<ContentEntry> = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection,
        slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: "Untitled",
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: human,
        ...over,
      } as never);

    beforeEach(async () => {
      const base = await factory.create();
      store = new SiteGraphStore({
        sql: base.sql,
        blobs: base.blobs,
        fieldTypes: { supported: () => true },
      });
      const project = await store.createProject({
        name: "Refs",
        slug: `refs-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: human.id,
        siteIds: [],
      });
      site = await store.createSite({
        projectId: project.id,
        name: "Refs",
        slug: `refs-${Math.random().toString(36).slice(2, 8)}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: {
          places: {},
          events: {
            fields: [
              {
                key: "venue",
                type: "reference",
                labels: L("Venue"),
                localized: false,
                collections: ["places"],
              },
            ],
          },
        },
      });
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("picks entries of the allowed collections by a substring, never archived ones", async () => {
      const main = await entry("places", { title: "Main Hall", slug: "main-hall" });
      await entry("places", { title: "Old hall", status: "archived" });
      await entry("places", { title: "Garden" });
      await entry("events", { title: "Hall party" });
      const picked = await call(`/api/sites/${site.id}/entries/pick?collections=places&q=HALL`);
      expect(picked.status, JSON.stringify(picked.body)).toBe(200);
      expect(picked.body.entries).toEqual([
        {
          groupId: main.id,
          id: main.id,
          title: "Main Hall",
          collection: "places",
          status: "draft",
          locale: "en",
        },
      ]);
      const long = await call(
        `/api/sites/${site.id}/entries/pick?collections=places&q=${"a".repeat(100_001)}`,
      );
      expect(long.status).toBe(400);
      expect((await call(`/api/sites/${site.id}/entries/pick`)).status).toBe(400);
      expect(
        (await call("/api/sites/site_01HZX8K3QNONE/entries/pick?collections=places")).status,
      ).toBe(404);
    });

    it("lists referrers with the members that show their value, and refuses what strands them", async () => {
      const hall = await entry("places", { title: "Main Hall" });
      const event = await entry("events", {
        title: "Launch",
        status: "published",
        fields: { venue: hall.id },
      });
      const refs = await call(`/api/sites/${site.id}/entries/${hall.id}/references`);
      expect(refs.status, JSON.stringify(refs.body)).toBe(200);
      expect(refs.body.groupId).toBe(hall.id);
      const [first] = refs.body.referrers as { id: string; field: string; shownBy: unknown[] }[];
      expect(first).toMatchObject({ id: event.id, field: "venue", shownBy: [] });
      const del = await call(`/api/sites/${site.id}/entries/${hall.id}?rev=${hall.rev}`, {
        method: "DELETE",
      });
      expect(del.status).toBe(409);
      expect(del.body.error).toBe("entry_referenced");
      const bad = await call(`/api/sites/${site.id}/entries/${event.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...event, fields: { venue: "entry_01HZX8K3QGONE" } }),
      });
      expect(bad.status).toBe(422);
      expect(bad.body.error).toBe("unknown_entry");
    });
  });
}
