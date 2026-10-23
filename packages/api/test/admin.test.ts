/** `cloudhal push`/`pull` endpoints and the /mcp origin guard. */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { makePng } from "@cloudhal/core-ts/media/fixtures";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "../src/app.ts";

const TOKEN = "deploy-token-for-tests-0123456789abcdef";
const human = { kind: "human" as const, id: "user_admin000001", name: "Halil" };

async function backend() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  return { sql, blobs, store };
}

describe("admin domains endpoint", () => {
  it("makes a hostname primary behind the deploy token, keeping others as secondary", async () => {
    const b = await backend();
    const site = await seedStarterSite(b.store, { name: "Domains", slug: "domains" });
    await b.store.updateSite({
      ...site,
      domains: [{ hostname: "domains.acme.workers.dev", primary: true }],
    });
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const put = (body: unknown, token = TOKEN) =>
      app.request(`/api/admin/sites/${site.id}/domains`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await put({ primary: "news.example.com" }, "nope")).status).toBe(401);
    expect((await put({ primary: "not a host" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    const res = await put({ primary: "https://News.Example.com/" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      changed: true,
      domains: [
        { hostname: "news.example.com", primary: true },
        { hostname: "domains.acme.workers.dev", primary: false },
      ],
    });
    expect(
      ((await (await put({ primary: "news.example.com" })).json()) as { changed: boolean }).changed,
    ).toBe(false);
    expect(
      (
        await app.request("/api/admin/sites/site_missing000001/domains", {
          method: "PUT",
          headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ primary: "a.example.com" }),
        })
      ).status,
    ).toBe(404);
  });
});

describe("admin search reindex (RFC-0019 §3)", () => {
  it("rebuilds the index from the live snapshot behind the deploy token", async () => {
    const b = await backend();
    const site = await seedStarterSite(b.store, { name: "Search", slug: "search" });
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const reindex = (token = TOKEN, siteId = site.id) =>
      app.request(`/api/admin/sites/${siteId}/search/reindex`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await reindex("nope")).status).toBe(401);
    expect((await reindex(TOKEN, "site_missing000001")).status).toBe(404);
    expect(await (await reindex()).json()).toEqual({ published: null, index: null });
    const snap = await b.store.createSnapshot(site.id, { actor: human, reason: "publish" });
    await b.store.publish(site, snap.id);
    // a restored backup has no index rows: the reindex brings them back
    await b.sql.run("DELETE FROM search_index");
    await b.sql.run("DELETE FROM search_links");
    await b.sql.run("DELETE FROM search_state");
    const res = await reindex();
    expect(res.status).toBe(200);
    // the seeded article, its two pages and its two terms (RFC-0029 §2)
    expect(await res.json()).toEqual({
      published: snap.id,
      index: { snapshotId: snap.id, entries: 5 },
    });
    expect((await b.store.search(site.id, "hello", { locale: "en", now: Date.now() })).total).toBe(
      1,
    );
  });
});

describe("admin field operations (RFC-0041 §6)", () => {
  it("runs a field operation as the operator behind the deploy token", async () => {
    const b = await backend();
    let site = await seedStarterSite(b.store, { name: "Ops", slug: "ops" });
    site = await b.store.updateSite({
      ...site,
      collections: {
        events: {
          fields: [{ key: "venue", type: "text", labels: { en: { label: "V" } }, localized: true }],
        },
      },
    });
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const res = await app.request(
      `/api/admin/sites/${site.id}/collections/events/fields/operations`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ op: "rename_field", from: "venue", to: "place" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { done: boolean; operationId: string };
    expect(body.done).toBe(true);
    const before = await b.store.getSnapshot(body.operationId);
    expect(before?.actor.id).toBe("sys_operator01");
    expect((await b.store.getSite(site.id))?.collections?.events?.fields?.[0]?.key).toBe("place");
  });
});

describe("admin placeholder backfill (RFC-0028 §5)", () => {
  it("lists images without a colour and stores what the CLI drew, keeping measured fields", async () => {
    const b = await backend();
    const site = await seedStarterSite(b.store, { name: "Ph", slug: "ph" });
    const { asset } = await b.store.ingestAsset({
      siteId: site.id,
      bytes: makePng({ width: 40, height: 20 }),
      filename: "chart.png",
      uploadedBy: human,
      source: { kind: "upload" },
      fields: { alt: { en: "Chart" } },
    });
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const auth = { authorization: `Bearer ${TOKEN}` };
    const base = `/api/admin/sites/${site.id}/media-placeholders`;
    const list = (await (await app.request(base, { headers: auth })).json()) as {
      assets: { id: string; rev: number; alpha?: true }[];
    };
    expect(list.assets).toEqual([
      expect.objectContaining({
        id: asset.id,
        rev: 0,
        mediaType: "image/png",
        width: 40,
        alpha: true,
      }),
    ]);
    const put = (body: unknown) =>
      app.request(`${base}/${asset.id}`, {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await put({ rev: 0, color: "#ABCDEF" })).status).toBe(400);
    expect((await put({ rev: 5, color: "#abcdef" })).status).toBe(409);
    const saved = await put({ rev: 0, color: "#abcdef" });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { asset: { image: unknown } }).asset.image).toEqual({
      width: 40,
      height: 20,
      alpha: true,
      color: "#abcdef",
    });
    const again = (await (await app.request(base, { headers: auth })).json()) as { assets: [] };
    expect(again.assets).toEqual([]);
  });
});

describe("admin media endpoints (RFC-0004 §4.7)", () => {
  it("moves verified bytes before the bundle, which refuses to import without them", async () => {
    const a = await backend();
    const b = await backend();
    const site = await seedStarterSite(a.store, { name: "Media", slug: "media" });
    const { asset } = await a.store.ingestAsset({
      siteId: site.id,
      bytes: new TextEncoder().encode("hour,ferries\n06,12\n"),
      filename: "hourly.csv",
      uploadedBy: human,
      source: { kind: "upload" },
    });
    const appA = createApi({ store: a.store, admin: { deployToken: TOKEN, storage: a } });
    const appB = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const auth = { authorization: `Bearer ${TOKEN}` };
    const path = `/api/admin/sites/${site.id}/media/${asset.sha256}`;
    const bundle = await (
      await appA.request(`/api/admin/sites/${site.id}/bundle`, { headers: auth })
    ).text();
    const importInto = () =>
      appB.request(`/api/admin/sites/${site.id}/bundle?mode=bootstrap`, {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: bundle,
      });
    const refused = await importInto();
    expect(refused.status).toBe(400);
    expect(await refused.text()).toMatch(/missing 1 media file/);
    expect((await appB.request(path, { method: "HEAD", headers: auth })).status).toBe(404);
    const bytes = await (await appA.request(path, { headers: auth })).arrayBuffer();
    expect(new TextDecoder().decode(bytes)).toBe("hour,ferries\n06,12\n");
    expect((await appA.request(path)).status).toBe(401);
    // A body that does not hash to the URL's SHA-256 stores nothing.
    const wrong = await appB.request(path, {
      method: "PUT",
      headers: { ...auth, "content-length": "5" },
      body: "wrong",
    });
    expect(wrong.status).toBe(400);
    expect((await appB.request(path, { method: "HEAD", headers: auth })).status).toBe(404);
    const put = await appB.request(path, {
      method: "PUT",
      headers: { ...auth, "content-length": String(bytes.byteLength) },
      body: bytes,
    });
    expect(put.status).toBe(201);
    expect((await importInto()).status).toBe(200);
    expect((await b.store.getAsset(asset.id))?.sha256).toBe(asset.sha256);
    expect(
      (await appB.request(`/api/admin/sites/${site.id}/media/not-a-sha`, { headers: auth })).status,
    ).toBe(400);
  });
});

describe("admin bundle endpoints", () => {
  it("exports from one deployment and imports into another, behind the deploy token", async () => {
    const a = await backend();
    const b = await backend();
    const site = await seedStarterSite(a.store, { name: "Pushed", slug: "pushed" });
    await a.store.createSnapshot(site.id, { actor: human, reason: "manual" });
    const appA = createApi({ store: a.store, admin: { deployToken: TOKEN, storage: a } });
    const appB = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    const auth = { authorization: `Bearer ${TOKEN}` };

    expect((await appA.request(`/api/admin/sites/${site.id}/bundle`)).status).toBe(401);
    expect(
      (
        await appA.request(`/api/admin/sites/${site.id}/bundle`, {
          headers: { authorization: "Bearer nope" },
        })
      ).status,
    ).toBe(401);
    const exported = await appA.request(`/api/admin/sites/${site.id}/bundle`, { headers: auth });
    expect(exported.status).toBe(200);
    const bundle = await exported.text();

    const put = (body: string, query = "") =>
      appB.request(`/api/admin/sites/${site.id}/bundle${query}`, {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body,
      });
    const imported = await put(bundle);
    expect(imported.status, await imported.clone().text()).toBe(200);
    expect((await b.store.listPages(site.id)).length).toBe(2);

    // diverge B, then a plain push conflicts and a replace wins
    const about = (await b.store.listPages(site.id)).find((p) => p.path === "/about");
    await b.store.updatePage({ ...(about as NonNullable<typeof about>), title: "Edited remotely" });
    const conflict = await put(bundle);
    expect(conflict.status).toBe(409);
    expect(
      ((await conflict.json()) as { details: { differing: string[] } }).details.differing,
    ).toContain(about?.id);
    expect((await put(bundle, "?mode=replace")).status).toBe(200);
    expect((await b.store.getPage(about?.id as string))?.title).toBe("About");

    expect((await put(bundle.replace(site.id, "site_other0000001"))).status).toBe(400);
    expect((await put(bundle, "?mode=yolo")).status).toBe(400);
  });
});

describe("short deploy token", () => {
  it("disables only /api/admin, logs once and reports it on /api/health", async () => {
    const b = await backend();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = createApi({ store: b.store, admin: { deployToken: "short", storage: b } });
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0]?.[0])).toMatch(/CLOUDHAL_DEPLOY_TOKEN.*32/);

      const health = await app.request("/api/health");
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, problems: ["deploy_token_invalid"] });

      for (const token of ["short", TOKEN]) {
        const res = await app.request("/api/admin/sites", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(503);
        expect(((await res.json()) as { error: string }).error).toBe("deploy_token_invalid");
      }
      // The rest of the API still answers (here: unauthenticated, not a crash).
      expect((await app.request("/api/me")).status).toBeLessThan(500);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });

  it("keeps /api/health plain with a valid token", async () => {
    const b = await backend();
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
  });
});

describe("/mcp origin guard", () => {
  it("rejects browser requests from other origins", async () => {
    const { store } = await backend();
    const app = createApi({
      store,
      resolveActor: async () => human,
      mcp: { stateKey: "origin-test-state-key-at-least-32-bytes" },
    });
    const call = (origin?: string) =>
      app.request("http://studio.example/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    expect((await call("https://evil.example")).status).toBe(403);
    expect((await call("http://studio.example")).status).not.toBe(403);
    expect((await call()).status).not.toBe(403);
  });
});

describe("admin token guard", () => {
  // Every area is a sub-app mounted after the token check; none may answer without the token.
  const AREAS: [string, string][] = [
    ["POST", "/api/admin/owner"],
    ["POST", "/api/admin/sites/site_x/analytics/rollup"],
    ["GET", "/api/admin/sites/site_x/analytics/status"],
    ["GET", "/api/admin/sites/site_x/comments/status"],
    ["POST", "/api/admin/sites/site_x/comments/import"],
    ["GET", "/api/admin/schedules/status"],
    ["POST", "/api/admin/schedules/run-due"],
    ["GET", "/api/admin/sites/site_x/schedules/releases"],
    ["POST", "/api/admin/sites/site_x/ai/build-eval"],
    ["POST", "/api/admin/sites/site_x/ai/judge-check"],
    ["POST", "/api/admin/sites/site_x/search/reindex"],
    ["POST", "/api/admin/sites/site_x/collections/events/fields/operations"],
    ["GET", "/api/admin/sites/site_x/collections/events/fields/operations/snap_x"],
    ["POST", "/api/admin/sites/site_x/collections/events/fields/operations/snap_x/revert"],
    ["GET", "/api/admin/sites/site_x/media-placeholders"],
    ["PUT", "/api/admin/sites/site_x/media-placeholders/asset_x"],
    ["GET", "/api/admin/sites/site_x/bundle"],
    ["PUT", "/api/admin/sites/site_x/bundle"],
    ["PUT", "/api/admin/sites/site_x/domains"],
    ["GET", "/api/admin/sites/site_x/media/abc"],
    ["PUT", "/api/admin/sites/site_x/media/abc"],
  ];

  it("answers 401 on every area without the deployment token", async () => {
    const b = await backend();
    const app = createApi({ store: b.store, admin: { deployToken: TOKEN, storage: b } });
    for (const [method, path] of AREAS) {
      const res = await app.request(path, {
        method,
        headers: { authorization: "Bearer nope" },
      });
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 401`);
    }
  });
});
