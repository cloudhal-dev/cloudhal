/**
 * Shared API suite for RFC-0038 step 3: a collection's permalink is set through the site update
 * (`PUT /api/sites/:id`, `site:settings`), leaves a prefix redirect behind, and an overlap is a
 * clear 409. Runs against any SiteGraphStore backend, like `testing.ts`.
 */
import type { Redirect, Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };

type Json = Record<string, unknown>;

export function describePermalinkApi(label: string, factory: ApiStoreFactory): void {
  describe(`API collection permalinks: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const site = async () => (await call(`/api/sites/${siteId}`)).body as unknown as Site;
    const putSite = (body: Site) =>
      call(`/api/sites/${siteId}`, { method: "PUT", body: JSON.stringify(body) });

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Links", slug: "links" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("sets /blog/{slug} for posts and leaves a permanent prefix redirect", async () => {
      const before = await site();
      const saved = await putSite({
        ...before,
        collections: { posts: { permalink: "/blog/{slug}" } },
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect((saved.body as unknown as Site).collections).toEqual({
        posts: { permalink: "/blog/{slug}" },
      });
      expect((await site()).collections?.posts?.permalink).toBe("/blog/{slug}");

      const list = await call(`/api/sites/${siteId}/redirects`);
      const moved = (list.body as unknown as Redirect[]).filter((r) => r.from === "/posts");
      expect(moved.map((r) => [r.from, r.to, r.match, r.status])).toEqual([
        ["/posts", "/blog", "prefix", 301],
      ]);

      // Back to the default: the setting goes, the redirect that would loop goes with it.
      const { collections: _drop, ...rest } = await site();
      const reset = await putSite(rest as Site);
      expect(reset.status, JSON.stringify(reset.body)).toBe(200);
      expect((reset.body as unknown as Site).collections?.posts).toBeUndefined();
      const after = (await call(`/api/sites/${siteId}/redirects`)).body as unknown as Redirect[];
      expect(after.some((r) => r.from === "/posts" && r.to === "/blog")).toBe(false);
    });

    it("refuses an overlap with a page (409 path_conflict) and a reserved prefix (409 reserved_path)", async () => {
      const current = await site();
      const clash = await putSite({
        ...current,
        collections: { posts: { permalink: "/about/{slug}" } },
      });
      expect(clash.status).toBe(409);
      expect(clash.body.error).toBe("path_conflict");
      expect(clash.body.message).toContain("/about");

      const archive = await putSite({
        ...current,
        collections: { posts: { permalink: "/tag/{slug}" } },
      });
      expect(archive.status).toBe(409);
      expect(archive.body.error).toBe("path_conflict");

      const reserved = await putSite({
        ...current,
        collections: { posts: { permalink: "/search/{slug}" } },
      });
      expect(reserved.status).toBe(409);
      expect(reserved.body.error).toBe("reserved_path");

      // Nothing was written.
      expect((await site()).collections).toBeUndefined();
      const list = (await call(`/api/sites/${siteId}/redirects`)).body as unknown as Redirect[];
      expect(list.some((r) => r.from === "/posts")).toBe(false);
    });

    it("rejects a template outside the schema's pattern (400 validation)", async () => {
      const r = await putSite({
        ...(await site()),
        collections: { posts: { permalink: "/Blog/{slug}/" } },
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("validation");
    });
  });
}
