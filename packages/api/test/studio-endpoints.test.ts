/** Endpoints the Studio's activity feed and live preview pane use. */
import { AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const human = { kind: "human" as const, id: "user_studio00001", name: "Halil" };
const agent = { kind: "agent" as const, id: "agent_studio0001", name: "Newsroom bot" };

async function setup(withAudit = true) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Studio Site", slug: "studio" });
  const audit = new AuditLog(sql);
  const app = createApi({
    store,
    resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
    ...(withAudit ? { audit } : {}),
  });
  const get = (path: string) => app.request(path, { headers: { "x-test-user": "1" } });
  return { store, site, audit, app, get };
}

describe("activity", () => {
  it("lists audit rows newest first with actor names and cursor paging", async () => {
    const { site, audit, get, app } = await setup();
    for (let i = 0; i < 3; i++)
      await audit.record({
        at: new Date(Date.UTC(2026, 9, 8, 10, i)).toISOString(),
        actor: i === 2 ? human : agent,
        siteId: site.id,
        tool: ["create_entry", "preview_page", "publish"][i] as string,
        decision: i === 2 ? "approval-required" : "allow",
        outcome: i === 2 ? "pending" : "ok",
      });
    await audit.record({
      at: new Date().toISOString(),
      actor: agent,
      siteId: "site_other0000001",
      tool: "list_pages",
      decision: "allow",
    });

    expect((await app.request(`/api/sites/${site.id}/activity`)).status).toBe(401);
    const first = await get(`/api/sites/${site.id}/activity?limit=2`);
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as {
      items: { id: number; tool: string; actor: { name?: string } }[];
      nextBefore: number | null;
    };
    expect(page1.items.map((r) => r.tool)).toEqual(["publish", "preview_page"]);
    expect(page1.items[0]?.actor.name).toBe("Halil");
    expect(page1.nextBefore).toBe(page1.items[1]?.id);
    const page2 = (await (
      await get(`/api/sites/${site.id}/activity?limit=2&before=${page1.nextBefore}`)
    ).json()) as typeof page1;
    expect(page2.items.map((r) => r.tool)).toEqual(["create_entry"]);
    expect(page2.nextBefore).toBeNull();
    const byActor = (await (
      await get(`/api/sites/${site.id}/activity?actorId=${human.id}`)
    ).json()) as typeof page1;
    expect(byActor.items).toHaveLength(1);
    expect((await get(`/api/sites/${site.id}/activity?limit=0`)).status).toBe(400);
    expect((await get("/api/sites/site_missing000001/activity")).status).toBe(404);
  });

  it("is 404 when the server keeps no audit log", async () => {
    const { site, get } = await setup(false);
    expect((await get(`/api/sites/${site.id}/activity`)).status).toBe(404);
  });
});

describe("preview", () => {
  it("renders pages and entries as sandboxed, uncached HTML (drafts included)", async () => {
    const { store, site, get } = await setup();
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    const res = await get(`/api/sites/${site.id}/pages/${home?.id}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("Studio Site");

    const draft = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "draft-one",
      locale: "en",
      status: "draft",
      title: "Draft <one>",
      body: { format: "markdown", value: "# Draft body" },
      fields: {},
      tags: [],
      author: human,
    });
    const entryHtml = await (await get(`/api/sites/${site.id}/entries/${draft.id}/preview`)).text();
    expect(entryHtml).toContain("<h1>Draft body</h1>");
    expect(entryHtml).toContain("Draft &lt;one&gt;");
    expect((await get(`/api/sites/${site.id}/entries/entry_missing00001/preview`)).status).toBe(
      404,
    );
  });
});
