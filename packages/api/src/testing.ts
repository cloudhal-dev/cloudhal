/** Shared API test suite — runs against any SiteGraphStore backend. */
import type { ContentEntry, Page, Site, Snapshot } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";

export interface ApiStoreFactory {
  create(): Promise<SiteGraphStore>;
  dispose?(): Promise<void>;
}

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };

export function describeApi(label: string, factory: ApiStoreFactory): void {
  describe(`API: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const json = async (res: Response) => ({
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    });
    const call = async (path: string, init?: RequestInit) =>
      json(await app.request(path, { headers: { "content-type": "application/json" }, ...init }));

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "API Site", slug: "api-site" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    const auth = { headers: { "content-type": "application/json", "x-test-user": "1" } };

    it("health is public; sites require an actor", async () => {
      expect((await call("/api/health")).body).toEqual({ ok: true });
      expect((await call("/api/sites")).status).toBe(401);
      expect((await call("/api/me")).status).toBe(401);
      // Without a membership source a person holds every scope (RFC-0005 I1).
      expect((await call("/api/me", auth)).body).toMatchObject({
        actor: human,
        role: null,
        member: true,
        scopes: ["*"],
        can: { "publish.any": true, "ownership.transfer": true },
      });
      const sites = await call("/api/sites", auth);
      expect(sites.status).toBe(200);
      expect((sites.body as Site[]).map((s) => s.id)).toEqual([siteId]);
    });

    it("pages: create, read, CAS update (409 on stale), delete", async () => {
      const created = await call(`/api/sites/${siteId}/pages`, {
        ...auth,
        method: "POST",
        body: JSON.stringify({
          path: "/news",
          title: "News",
          locale: "en",
          status: "draft",
          sections: [],
        }),
      });
      expect(created.status).toBe(201);
      const { page } = created.body as { page: Page; site: Site };
      expect(page.path).toBe("/news");

      const updated = await call(`/api/sites/${siteId}/pages/${page.id}`, {
        ...auth,
        method: "PUT",
        body: JSON.stringify({ ...page, title: "News v2" }),
      });
      expect(updated.status).toBe(200);
      expect((updated.body as Page).rev).toBe(1);

      const stale = await call(`/api/sites/${siteId}/pages/${page.id}`, {
        ...auth,
        method: "PUT",
        body: JSON.stringify({ ...page, title: "stale" }),
      });
      expect(stale.status).toBe(409);
      expect((stale.body as { error: string }).error).toBe("conflict");

      const invalid = await call(`/api/sites/${siteId}/pages/${page.id}`, {
        ...auth,
        method: "PUT",
        body: JSON.stringify({ ...page, rev: 1, path: "bad path" }),
      });
      expect(invalid.status).toBe(400);
      expect((invalid.body as { error: string }).error).toBe("validation");

      const del = await call(`/api/sites/${siteId}/pages/${page.id}?rev=1`, {
        ...auth,
        method: "DELETE",
      });
      expect(del.status).toBe(200);
      expect((await call(`/api/sites/${siteId}/pages/${page.id}`, auth)).status).toBe(404);
    });

    it("article workflow: draft → review → published → snapshot → publish → build-visible", async () => {
      // The starter's category taxonomy is required: a review/published entry needs a primary one.
      const news = (await store.getTermBySlug(siteId, "category", "news")) as { id: string };
      const created = await call(`/api/sites/${siteId}/entries`, {
        ...auth,
        method: "POST",
        body: JSON.stringify({
          collection: "posts",
          slug: "studio-article",
          locale: "en",
          status: "draft",
          title: "Written in Studio",
          body: { format: "markdown", value: "# Hi" },
          fields: {},
          tags: [],
          terms: { category: { ids: [news.id], primary: news.id } },
        }),
      });
      expect(created.status).toBe(201);
      let entry = created.body as ContentEntry;
      // Without the category, publishing is refused as a 422 (RFC-0002 invariant 2), never a 500.
      const { terms: _terms, ...uncategorised } = entry;
      const refused = await call(`/api/sites/${siteId}/entries/${entry.id}`, {
        ...auth,
        method: "PUT",
        body: JSON.stringify({ ...uncategorised, status: "review" }),
      });
      expect(refused.status).toBe(422);
      expect((refused.body as { error: string }).error).toBe("required_term");
      expect(entry.author).toEqual(human);

      for (const status of ["review", "published"] as const) {
        const r = await call(`/api/sites/${siteId}/entries/${entry.id}`, {
          ...auth,
          method: "PUT",
          body: JSON.stringify({ ...entry, status }),
        });
        expect(r.status).toBe(200);
        entry = r.body as ContentEntry;
      }
      expect(entry.status).toBe("published");
      expect(entry.rev).toBe(2);

      const snap = await call(`/api/sites/${siteId}/snapshots`, {
        ...auth,
        method: "POST",
        body: JSON.stringify({ label: "Studio publish", publish: true }),
      });
      expect(snap.status).toBe(201);
      const { snapshot, site } = snap.body as { snapshot: Snapshot; site: Site };
      expect(snapshot.actor).toEqual(human);
      expect(site.publishedSnapshotId).toBe(snapshot.id);
      expect(snapshot.nodes.some((n) => n.id === entry.id)).toBe(true);

      const list = await call(`/api/sites/${siteId}/snapshots`, auth);
      expect((list.body as Snapshot[])[0]?.id).toBe(snapshot.id);

      // A second snapshot, then rollback to the first via the API.
      const snap2 = await call(`/api/sites/${siteId}/snapshots`, {
        ...auth,
        method: "POST",
        body: JSON.stringify({ publish: true }),
      });
      const second = (snap2.body as { snapshot: Snapshot }).snapshot;
      const diff = await call(
        `/api/sites/${siteId}/snapshots/${snapshot.id}/diff/${second.id}`,
        auth,
      );
      expect(diff.status).toBe(200);
      const rb = await call(`/api/sites/${siteId}/snapshots/${snapshot.id}/rollback`, {
        ...auth,
        method: "POST",
      });
      expect(rb.status).toBe(200);
      expect((rb.body as { site: Site }).site.publishedSnapshotId).toBe(snapshot.id);
      const bad = await call(`/api/sites/${siteId}/snapshots/${second.id}/rollback`, {
        ...auth,
        method: "POST",
      });
      expect(bad.status).toBe(400);
    });

    it("unknown routes and ids are 404", async () => {
      expect((await call("/api/nope", auth)).status).toBe(404);
      expect((await call(`/api/sites/site_doesnotexist1`, auth)).status).toBe(404);
      expect((await call(`/api/sites/${siteId}/entries/entry_nope00001`, auth)).status).toBe(404);
    });
  });
}
