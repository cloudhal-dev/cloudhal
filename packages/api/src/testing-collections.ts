/**
 * Shared API suite for RFC-0040 step 2: the collection registry (`GET`), declaring and changing a
 * collection (`PUT /:key`, `site:settings`, with a dry run), undeclaring an empty one (`DELETE`),
 * and entries refused in a collection that is not in the registry. Runs against any
 * SiteGraphStore backend, like `testing.ts`.
 */
import type { Site } from "@cloudhal/core-contracts";
import { type CollectionInfo, type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };

type Json = Record<string, unknown>;

const EVENTS = { labels: { en: { singular: "Event", plural: "Events" } }, icon: "calendar" };

export function describeCollectionsApi(label: string, factory: ApiStoreFactory): void {
  describe(`API collections: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const site = async () => (await call(`/api/sites/${siteId}`)).body as unknown as Site;
    const list = async () =>
      (await call(`/api/sites/${siteId}/collections`)).body as unknown as CollectionInfo[];
    const put = async (key: string, settings: unknown, query = "") =>
      call(`/api/sites/${siteId}/collections/${key}${query}`, {
        method: "PUT",
        body: JSON.stringify({ settings, rev: (await site()).rev }),
      });
    const createEntry = (collection: string) =>
      call(`/api/sites/${siteId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          collection,
          slug: "first",
          locale: "en",
          status: "draft",
          title: "First",
          body: { format: "markdown", value: "Body" },
          fields: {},
          tags: [],
        }),
      });

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Kinds", slug: "kinds" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("lists the starter's posts as inferred, with counts", async () => {
      const [posts, ...rest] = await list();
      expect(rest).toEqual([]);
      expect(posts).toMatchObject({ key: "posts", declared: false, settings: {} });
      expect(Object.values(posts?.counts ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    });

    it("declares a collection; a dry run writes nothing", async () => {
      const dry = await put("events", EVENTS, "?dryRun=1");
      expect(dry.status, JSON.stringify(dry.body)).toBe(200);
      expect(dry.body.dryRun).toBe(true);
      expect((await site()).collections?.events).toBeUndefined();

      const saved = await put("events", EVENTS);
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect((await site()).collections?.events).toEqual(EVENTS);
      expect((await list()).map((c) => [c.key, c.declared])).toEqual([
        ["events", true],
        ["posts", false],
      ]);
    });

    it("refuses entries in an undeclared collection (422), accepts them once declared", async () => {
      const refused = await createEntry("jobs");
      expect(refused.status).toBe(422);
      expect(refused.body.error).toBe("collection_undeclared");
      expect((await put("jobs", {})).status).toBe(200);
      const created = await createEntry("jobs");
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    });

    it("refuses a collection whose default prefix overlaps another's or an archive (409)", async () => {
      expect((await put("posts", { permalink: "/blog/{slug}" })).status).toBe(200);
      const clash = await put("blog", {});
      expect(clash.status).toBe(409);
      expect(clash.body.error).toBe("path_conflict");
      expect(clash.body.message).toContain('"posts"');
      const archive = await put("tag", {});
      expect(archive.status).toBe(409);
      expect(archive.body.error).toBe("path_conflict");
      expect((await site()).collections?.blog).toBeUndefined();
    });

    it("undeclares an empty collection; one with entries is in use (409)", async () => {
      expect((await put("posts", { icon: "pen" })).status).toBe(200);
      expect((await put("team", {})).status).toBe(200);
      const inUse = await call(`/api/sites/${siteId}/collections/posts?rev=${(await site()).rev}`, {
        method: "DELETE",
      });
      expect(inUse.status).toBe(409);
      expect(inUse.body.error).toBe("collection_in_use");
      const gone = await call(`/api/sites/${siteId}/collections/team?rev=${(await site()).rev}`, {
        method: "DELETE",
      });
      expect(gone.status, JSON.stringify(gone.body)).toBe(200);
      expect(Object.keys((await site()).collections ?? {})).toEqual(["posts"]);
    });

    it("needs the site's current rev (409 on a stale one, 400 without)", async () => {
      const rev = (await site()).rev;
      expect((await put("events", EVENTS)).status).toBe(200);
      const stale = await call(`/api/sites/${siteId}/collections/team`, {
        method: "PUT",
        body: JSON.stringify({ settings: {}, rev }),
      });
      expect(stale.status).toBe(409);
      const missing = await call(`/api/sites/${siteId}/collections/team`, {
        method: "PUT",
        body: JSON.stringify({ settings: {} }),
      });
      expect(missing.status).toBe(400);
    });
  });
}
