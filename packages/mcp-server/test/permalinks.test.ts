/**
 * RFC-0038 §5 over MCP: `set_collection_permalink` waits for a person in every mode (bypass
 * included), its prompt and dry run list the old and new URLs and the redirect, applying it writes
 * the redirect, and an overlap is refused before anyone is asked.
 */
import { type AgentMode, ApprovalStore, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type { Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { PermalinkPlan } from "../src/permalink-tools.ts";
import { createCloudhalMcpServer } from "../src/server.ts";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_permalink1", name: "Mover" };
const owner = { kind: "human" as const, id: "user_owner000001", name: "Owner" };
const tools = defineTools();
const tool = tools.find((t) => t.name === "set_collection_permalink") as (typeof tools)[number];
const policy = new PolicyEngine(toolPolicies(tools));

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  approvals: ApprovalStore;
  site: Site;
}

async function world(): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Links", slug: "links" });
  return { store, audit: new AuditLog(sql), approvals: new ApprovalStore(sql), site };
}

function direct(w: World, mode: AgentMode, local = false) {
  const ctx: ToolContext = {
    store: w.store,
    principal: { actor: agent, scopes: ["*"], mode, ...(local ? { local: true } : {}) },
  };
  return (args: Record<string, unknown>, confirmed = false) =>
    runTool(tool, { siteId: w.site.id, collection: "posts", ...args }, ctx, {
      policy,
      audit: w.audit,
      confirmed,
    });
}

describe("set_collection_permalink (RFC-0038 §5)", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("is registered with site:write and always needs a person, bypass included", async () => {
    expect(tool.scopes).toEqual(["site:write"]);
    for (const mode of ["edits", "auto", "bypass"] as const) {
      const r = await direct(w, mode, mode === "bypass")({ permalink: "/blog/{slug}" });
      expect(r.decision.kind, mode).toBe("approval-required");
      expect(r.result).toBeUndefined();
    }
    expect((await w.store.getSite(w.site.id))?.collections).toBeUndefined();
    // Without site:write the call is refused.
    const reader = await runTool(
      tool,
      { siteId: w.site.id, collection: "posts", permalink: "/blog/{slug}" },
      { store: w.store, principal: { actor: agent, scopes: ["site:read"], mode: "edits" } },
      { policy },
    );
    expect(reader.decision.kind).toBe("deny");
  });

  it("the prompt and the dry run list example URLs and the redirect", async () => {
    const run = direct(w, "edits");
    const ask = await run({ permalink: "/blog/{slug}" });
    expect(ask.approvalPrompt).toMatch(
      /^Move the public URLs of collection "posts" from \/posts\/\{slug\} to \/blog\/\{slug\}\?/,
    );
    expect(ask.approvalPrompt).toContain("/posts/hello-world → /blog/hello-world");
    expect(ask.approvalPrompt).toContain("+ redirect /posts → /blog (301, prefix");
    expect(ask.approvalPrompt).toContain("permanent redirect (301)");

    const dry = await run({ permalink: "/blog/{slug}", dryRun: true });
    expect(dry.decision.kind).toBe("allow");
    const plan = (dry.result as { plan: PermalinkPlan; dryRun: boolean }).plan;
    expect(plan).toMatchObject({ from: "/posts/{slug}", to: "/blog/{slug}", isDefault: false });
    expect(plan.examples[0]).toMatchObject({
      from: "/posts/hello-world",
      to: "/blog/hello-world",
    });
    expect(plan.examples.length).toBeLessThanOrEqual(3);
    expect(plan.redirects).toEqual([
      expect.objectContaining({ change: "add", from: "/posts", to: "/blog" }),
    ]);
    // A dry run changes nothing.
    expect((await w.store.getSite(w.site.id))?.collections).toBeUndefined();
    expect(await w.store.listRedirects(w.site.id)).toEqual([]);
  });

  it("applying writes the template, the redirect and one snapshot; null goes back", async () => {
    const run = direct(w, "edits");
    const before = (await w.store.listSnapshots(w.site.id, 100)).length;
    const done = await run({ permalink: "/blog/{slug}" }, true);
    const out = done.result as { site: Site; dryRun: boolean };
    expect(out.dryRun).toBe(false);
    expect(out.site.collections).toEqual({ posts: { permalink: "/blog/{slug}" } });
    expect((await w.store.listSnapshots(w.site.id, 100)).length).toBe(before + 1);
    expect(
      (await w.store.listRedirects(w.site.id))
        .filter((r) => !r.locale)
        .map((r) => [r.from, r.to, r.match, r.status]),
    ).toEqual([["/posts", "/blog", "prefix", 301]]);
    expect((await w.store.redirectFor(w.site.id, "/posts/hello-world"))?.location).toBe(
      "/blog/hello-world",
    );

    // Back to the default: the prompt shows the loop the store drops.
    const back = await run({ permalink: null });
    expect(back.approvalPrompt).toContain("/blog/{slug} to /posts/{slug} (the default)");
    expect(back.approvalPrompt).toContain("− redirect /posts → /blog (it would point to itself)");
    const reset = await run({ permalink: null }, true);
    // RFC-0040: the collection stays declared, with no settings.
    expect((reset.result as { site: Site }).site.collections).toEqual({ posts: {} });
  });

  it("an overlap or a no-op is refused before a person is asked", async () => {
    const run = direct(w, "edits");
    // The page at /about would be the collection's index page; one under it is in the way.
    await w.store.createPage(w.site, {
      siteId: w.site.id,
      path: "/about/team",
      title: "Team",
      locale: w.site.defaultLocale,
      status: "draft",
      sections: [],
    });
    await expect(run({ permalink: "/about/{slug}" })).rejects.toMatchObject({
      code: "path_conflict",
      message: expect.stringContaining("would cover page /about/team"),
    });
    await expect(run({ permalink: "/tag/{slug}" })).rejects.toMatchObject({
      code: "path_conflict",
    });
    await expect(run({ permalink: "/search/{slug}" })).rejects.toMatchObject({
      code: "reserved_path",
    });
    await expect(run({ permalink: "/Blog/{slug}/" })).rejects.toMatchObject({ code: "invalid" });
    await expect(run({ permalink: null })).rejects.toMatchObject({
      code: "invalid",
      message: expect.stringContaining("already uses /posts/{slug}"),
    });
    const rows = await w.audit.list({ limit: 20 });
    expect(rows.filter((r) => r.tool === "set_collection_permalink").map((r) => r.outcome)).toEqual(
      ["error", "error", "error", "error", "error"],
    );
    expect(await w.store.listRedirects(w.site.id)).toEqual([]);
  });

  it("over MCP with out-of-band approvals: pending, approved in Studio, then applied", async () => {
    const server = createCloudhalMcpServer({
      store: w.store,
      audit: w.audit,
      approvals: w.approvals,
      principal: { actor: agent, scopes: ["*"], mode: "edits" },
      stateKey: "permalink-test-state-key-0123456789abcdef",
    });
    const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const args = { siteId: w.site.id, collection: "posts", permalink: "/blog/{slug}" };
    const call = async (a: Record<string, unknown>) => {
      const r = await client.callTool({ name: "set_collection_permalink", arguments: a });
      return {
        isError: r.isError === true,
        text: (r.content as { text?: string }[])[0]?.text ?? "",
      };
    };
    const ask = await call(args);
    expect(ask.text).toMatch(/^approval pending: Move the public URLs of collection "posts"/);
    expect(ask.text).toContain("/posts/hello-world → /blog/hello-world");
    const approvalId = ask.text.match(/approvalId: (appr_\w+)/)?.[1] as string;
    await w.approvals.decide(approvalId, "approved", owner);
    const done = await call({ ...args, approvalId });
    expect(done.isError, done.text).toBe(false);
    expect((await w.store.getSite(w.site.id))?.collections?.posts?.permalink).toBe("/blog/{slug}");
  });
});
