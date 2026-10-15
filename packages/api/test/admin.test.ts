/** `cloudhal push`/`pull` endpoints and the /mcp origin guard. */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
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
    await b.sql.run("DELETE FROM search_state");
    const res = await reindex();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      published: snap.id,
      index: { snapshotId: snap.id, entries: 1 },
    });
    expect((await b.store.search(site.id, "hello", { locale: "en", now: Date.now() })).total).toBe(
      1,
    );
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
    expect(() =>
      createApi({ store: a.store, admin: { deployToken: "short", storage: a } }),
    ).toThrow(/32/);
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
