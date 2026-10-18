/** RFC-0029 §8: `search_site`, the editing view (drafts included) and the readers' view. */
import { PolicyEngine, roleScopes } from "@cloudhal/agent-runtime";
import type { Actor, Site } from "@cloudhal/core-contracts";
import { MARK_OPEN, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_search0001", name: "Finder" };
const human: Actor = { kind: "human", id: "user_search00001", name: "Halil" };
const tools = defineTools();
const tool = tools.find((t) => t.name === "search_site") as (typeof tools)[number];
const policy = new PolicyEngine(toolPolicies(tools));

type Hit = Record<string, string>;

describe("search_site", () => {
  let store: SiteGraphStore;
  let site: Site;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    site = await seedStarterSite(store, { name: "Desk", slug: "desk" });
    await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "hello-draft",
      locale: "en",
      status: "draft",
      title: "Hello again",
      body: { format: "markdown", value: "A draft." },
      fields: {},
      tags: [],
      author: human,
    });
    const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
    site = await store.publish(site, snap.id);
  });

  const call = async (args: Record<string, unknown>, scopes = roleScopes("contributor")) => {
    const ctx: ToolContext = { store, principal: { actor: agent, scopes } };
    return runTool(tool, { siteId: site.id, ...args }, ctx, { policy });
  };
  const hits = async (args: Record<string, unknown>) =>
    ((await call(args)).result as { hits: Hit[] }).hits;

  it("is read-only and needs content:read", () => {
    expect(tool.scopes).toEqual(["content:read"]);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("finds drafts in the editing view, published content in the readers' view", async () => {
    expect((await hits({ query: "hello" })).map((h) => `${h.kind}:${h.title}:${h.status}`)).toEqual(
      ["entry:Hello again:draft", "entry:Hello, world:published"],
    );
    const published = await hits({ query: "hello", published: true });
    expect(published.map((h) => `${h.kind}:${h.href}`)).toEqual(["article:/posts/hello-world"]);
    expect(published[0]?.snippet).not.toContain(MARK_OPEN);
    expect(await hits({ query: "about", kinds: ["page"] })).toEqual([
      expect.objectContaining({ kind: "page", title: "About", detail: "/about" }),
    ]);
    expect(await hits({ query: "news", published: true, kinds: ["term"] })).toEqual([
      expect.objectContaining({ kind: "term", href: "/category/news", context: "Category" }),
    ]);
  });
});
