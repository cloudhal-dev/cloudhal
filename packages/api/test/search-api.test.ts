/** RFC-0029 §7: `GET /api/sites/:siteId/search`, Studio's search over the site's own nodes. */
import type { Scope } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { requirementFor } from "../src/scopes.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
const agent = { kind: "agent" as const, id: "agent_apitest0001", name: "Bot" };

describe("API site search", () => {
  let store: SiteGraphStore;
  let siteId: string;
  let app: ReturnType<typeof createApi>;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    siteId = (await seedStarterSite(store, { name: "Desk", slug: "desk" })).id;
    await store.createContentEntry({
      siteId,
      collection: "posts",
      slug: "about-the-desk",
      locale: "en",
      status: "draft",
      title: "About the desk",
      body: { format: "markdown", value: "" },
      fields: {},
      tags: [],
      author: human,
    });
    await store.createRedirect({
      siteId,
      from: "/about-us",
      to: "/about",
      status: 301,
      match: "exact",
      reason: "manual",
    });
    // x-test-scopes: the person's scopes (a role without site:read sees no media, menus or redirects)
    app = createApi({
      store,
      resolvePrincipal: async (c) => {
        const who = c.req.header("x-test-user");
        if (!who) return undefined;
        if (who === "agent") return { actor: agent, scopes: ["content:read" as Scope] };
        const scopes = (c.req.header("x-test-scopes") ?? "content:read,site:read").split(",");
        return { actor: human, scopes: scopes as Scope[] };
      },
    });
  });

  const search = async (query: string, scopes?: string) => {
    const res = await app.request(`/api/sites/${siteId}/search${query}`, {
      headers: { "x-test-user": "1", ...(scopes ? { "x-test-scopes": scopes } : {}) },
    });
    return { status: res.status, body: (await res.json()) as { hits: Record<string, string>[] } };
  };
  const kinds = (r: { body: { hits: Record<string, string>[] } }) =>
    r.body.hits.map((h) => `${h.kind}:${h.title}`);

  it("is for people: anonymous 401, agent keys 403 (agents use search_site)", async () => {
    expect((await app.request(`/api/sites/${siteId}/search?q=about`)).status).toBe(401);
    const r = await app.request(`/api/sites/${siteId}/search?q=about`, {
      headers: { "x-test-user": "agent" },
    });
    expect(r.status).toBe(403);
  });

  it("finds drafts and live nodes grouped by kind, narrowed by kinds and limit", async () => {
    const r = await search("?q=about");
    expect(r.status).toBe(200);
    expect(kinds(r)).toEqual(["entry:About the desk", "page:About", "redirect:/about-us"]);
    expect(r.body.hits[0]).toMatchObject({ status: "draft", detail: "/posts/about-the-desk" });
    expect(kinds(await search("?q=about&kinds=page,nope"))).toEqual(["page:About"]);
    expect((await search("?q=about&limit=1")).body.hits).toHaveLength(3); // one per kind
    expect((await search("?q=")).body.hits).toEqual([]);
  });

  it("leaves media, menus and redirects out for people without site:read", async () => {
    expect(kinds(await search("?q=about", "content:read"))).toEqual([
      "entry:About the desk",
      "page:About",
    ]);
    expect(kinds(await search("?q=about&kinds=redirect", "content:read"))).toEqual([]);
  });

  it("requires content:read (enforced by the route guard for members)", () => {
    expect(requirementFor("GET", `/api/sites/${siteId}/search`)).toBe("content:read");
  });
});
