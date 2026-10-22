/**
 * RFC-0040 §5 over MCP: `list_collections` shows the registry; `create_collection` and
 * `update_collection` wait for a person in every mode, refuse overlaps and duplicates before anyone
 * is asked, and declare the collection; `create_entry` refuses a collection outside the registry.
 */
import { type AgentMode, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type { Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_collection", name: "Organiser" };
const tools = defineTools();
const byName = (n: string) => tools.find((t) => t.name === n) as (typeof tools)[number];
const policy = new PolicyEngine(toolPolicies(tools));
const EVENTS = { en: { singular: "Event", plural: "Events" } };

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  site: Site;
}

async function world(): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Kinds", slug: "kinds" });
  return { store, audit: new AuditLog(sql), site };
}

function call(w: World, name: string, mode: AgentMode = "edits") {
  const ctx: ToolContext = {
    store: w.store,
    principal: { actor: agent, scopes: ["*"], mode, ...(mode === "bypass" ? { local: true } : {}) },
  };
  return (args: Record<string, unknown>, confirmed = false) =>
    runTool(byName(name), { siteId: w.site.id, ...args }, ctx, {
      policy,
      audit: w.audit,
      confirmed,
    });
}

async function rejection(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string };
  }
  throw new Error("expected a rejection");
}

describe("collections over MCP (RFC-0040 §5)", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("list_collections shows posts with counts, its permalink and taxonomies", async () => {
    const r = await call(w, "list_collections")({});
    expect(r.decision.kind).toBe("allow");
    const [posts] = (r.result as { collections: Record<string, unknown>[] }).collections;
    expect(posts).toMatchObject({
      key: "posts",
      declared: false,
      permalink: "/posts/{slug}",
      settings: { feed: true, sitemap: true, sort: "newest" },
    });
    expect(posts?.taxonomies).toEqual(expect.arrayContaining(["category", "tag"]));
  });

  it("create_collection always waits for a person who may change site settings", async () => {
    const tool = byName("create_collection");
    expect(tool.scopes).toEqual(["site:write"]);
    expect(tool.approverScopes).toEqual(["site:settings"]);
    for (const mode of ["edits", "auto", "bypass"] as const) {
      const r = await call(w, "create_collection", mode)({ collection: "events", labels: EVENTS });
      expect(r.decision.kind, mode).toBe("approval-required");
      expect(r.approvalPrompt).toContain(
        'Create the collection "Events" (one: "Event") with key "events"',
      );
      expect(r.approvalPrompt).toContain("cannot be renamed");
    }
    expect((await w.store.getSite(w.site.id))?.collections).toBeUndefined();
    const dry = await call(
      w,
      "create_collection",
    )({ collection: "events", labels: EVENTS, dryRun: true });
    expect(dry.decision.kind).toBe("allow");
    expect((await w.store.getSite(w.site.id))?.collections).toBeUndefined();
  });

  it("create_entry refuses an undeclared collection until create_collection is approved", async () => {
    const entry = { collection: "events", slug: "launch", title: "Launch", body: "Soon." };
    const refused = await rejection(call(w, "create_entry")(entry));
    expect(refused.code).toBe("collection_undeclared");
    expect(refused.message).toContain("create_collection");
    // Existing collections (inferred: posts) keep working.
    const post = await call(w, "create_entry")({ slug: "second", title: "Second", body: "Hi." });
    expect(post.decision.kind).toBe("allow");

    const done = await call(w, "create_collection")(
      { collection: "events", labels: EVENTS, icon: "calendar", sort: "oldest" },
      true,
    );
    expect((done.result as { site: Site }).site.collections?.events).toEqual({
      labels: EVENTS,
      icon: "calendar",
      sort: "oldest",
    });
    const created = await call(w, "create_entry")(entry);
    expect(created.decision.kind).toBe("allow");
  });

  it("refuses overlaps, duplicates and a missing default-locale name before asking", async () => {
    await w.store.updateSite({ ...w.site, collections: { posts: { permalink: "/blog/{slug}" } } });
    const clash = await rejection(
      call(w, "create_collection")({ collection: "blog", labels: EVENTS }),
    );
    expect(clash.code).toBe("path_conflict");
    const archive = await rejection(
      call(w, "create_collection")({ collection: "tag", labels: EVENTS }),
    );
    expect(archive.code).toBe("path_conflict");
    const exists = await rejection(
      call(w, "create_collection")({ collection: "posts", labels: EVENTS }),
    );
    expect(exists.code).toBe("collection_exists");
    const unnamed = await rejection(
      call(
        w,
        "create_collection",
      )({ collection: "jobs", labels: { tr: { singular: "İş", plural: "İşler" } } }),
    );
    expect(unnamed.code).toBe("invalid");
  });

  it("update_collection names an inferred collection and merges labels by locale", async () => {
    const first = await call(w, "update_collection")(
      { collection: "posts", labels: { en: { singular: "Story", plural: "Stories" } } },
      true,
    );
    expect((first.result as { site: Site }).site.collections?.posts?.labels?.en?.plural).toBe(
      "Stories",
    );
    const second = await call(w, "update_collection")(
      {
        collection: "posts",
        labels: { tr: { singular: "Haber", plural: "Haberler" } },
        feed: false,
      },
      true,
    );
    expect((second.result as { site: Site }).site.collections?.posts).toEqual({
      labels: {
        en: { singular: "Story", plural: "Stories" },
        tr: { singular: "Haber", plural: "Haberler" },
      },
      feed: false,
    });
    const missing = await rejection(
      call(w, "update_collection")({ collection: "jobs", feed: false }),
    );
    expect(missing.code).toBe("collection_undeclared");
  });
});
