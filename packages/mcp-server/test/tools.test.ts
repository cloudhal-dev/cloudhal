import { AuditLog, defaultScopes, PolicyEngine } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, ToolError, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_newsroom01", name: "Newsroom Agent" };

describe("Cloudhal tools (SDK-independent)", () => {
  let ctx: ToolContext;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let siteId: string;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    siteId = (await seedStarterSite(store, { name: "Tools Site", slug: "tools" })).id;
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = {
      store,
      principal: { actor: agent, scopes: defaultScopes(agent) },
      previewBaseUrl: "http://localhost:4321",
    };
  });

  const call = (name: string, args: Record<string, unknown>, confirmed = false) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, audit, confirmed });

  it("exposes a deterministic, annotated tool list", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "list_sites",
      "get_site",
      "list_pages",
      "get_page",
      "create_page",
      "update_page",
      "delete_page",
      "list_entries",
      "get_entry",
      "create_entry",
      "update_entry",
      "delete_entry",
      "create_snapshot",
      "list_snapshots",
      "diff_snapshots",
      "preview_page",
      "publish",
      "rollback",
    ]);
    for (const t of tools) {
      expect(typeof t.annotations.readOnlyHint).toBe("boolean");
      expect(typeof t.annotations.destructiveHint).toBe("boolean");
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
    expect(byName.publish?.annotations.destructiveHint).toBe(true);
    expect(byName.get_page?.annotations.readOnlyHint).toBe(true);
  });

  it("an agent creates an article, previews it, and every mutation snapshots", async () => {
    const created = await call("create_entry", {
      siteId,
      slug: "agent-post",
      title: "Written by an agent",
      summary: "s",
      body: "# Hello\n\nfrom MCP",
      tags: ["agents"],
    });
    expect(created.decision.kind).toBe("allow");
    const { entry, snapshot } = created.result as {
      entry: { id: string; rev: number; author: { id: string } };
      snapshot: { reason: string; label?: string };
    };
    expect(entry.author.id).toBe(agent.id);
    expect(snapshot.reason).toBe("agentMutation");
    expect(snapshot.label).toContain("create_entry");

    const preview = await call("preview_page", { siteId, entryId: entry.id });
    const doc = preview.result as { html: string; url: string | null; path: string };
    expect(doc.html).toContain("<h1>Hello</h1>");
    expect(doc.url).toBe("http://localhost:4321/posts/agent-post");

    const updated = await call("update_entry", {
      siteId,
      entryId: entry.id,
      rev: entry.rev,
      status: "review",
    });
    expect((updated.result as { entry: { status: string; rev: number } }).entry.status).toBe(
      "review",
    );
    await expect(
      call("update_entry", { siteId, entryId: entry.id, rev: 0, title: "stale" }),
    ).rejects.toThrow(ToolError);

    const list = await call("list_snapshots", { siteId });
    expect((list.result as { snapshots: unknown[] }).snapshots.length).toBe(2);
    const rows = await audit.list({ siteId });
    expect(rows.map((r) => r.tool)).toEqual([
      "list_snapshots",
      "update_entry",
      "update_entry",
      "preview_page",
      "create_entry",
    ]);
    expect(rows.find((r) => r.tool === "create_entry")?.snapshotId).toBeDefined();
  });

  it("publishing is denied for a plain agent and approval-gated for a human", async () => {
    const denied = await call("publish", { siteId });
    expect(denied.decision).toMatchObject({ kind: "deny", reason: "missing scope site:publish" });

    ctx.principal = {
      actor: { kind: "human", id: "user_halil000001", name: "Halil" },
      scopes: ["*"],
    };
    const gated = await call("publish", { siteId, label: "First" });
    expect(gated.decision.kind).toBe("approval-required");
    expect(gated.approvalPrompt).toMatch(/^Publish "Tools Site" to production/);
    expect(gated.result).toBeUndefined();

    const done = await call("publish", { siteId, label: "First" }, true);
    expect(done.decision.kind).toBe("allow");
    const { site, snapshot } = done.result as {
      site: { publishedSnapshotId?: string };
      snapshot: { id: string; reason: string };
    };
    expect(site.publishedSnapshotId).toBe(snapshot.id);
    expect(snapshot.reason).toBe("publish");

    const second = await call("publish", { siteId, label: "Second" }, true);
    const rb = await call("rollback", { siteId, snapshotId: snapshot.id });
    expect(rb.decision.kind).toBe("approval-required");
    expect(rb.approvalPrompt).toContain("First");
    const rolled = await call("rollback", { siteId, snapshotId: snapshot.id }, true);
    expect(
      (rolled.result as { site: { publishedSnapshotId?: string } }).site.publishedSnapshotId,
    ).toBe(snapshot.id);
    // Second is a descendant of First (now live), not an ancestor: refused, nothing changes.
    await expect(
      call(
        "rollback",
        { siteId, snapshotId: (second.result as { snapshot: { id: string } }).snapshot.id },
        true,
      ),
    ).rejects.toThrow(/not an ancestor/);
  });

  it("a declared skill narrows the tools an agent may call", async () => {
    ctx.principal = {
      actor: agent,
      scopes: ["*"],
      skill: { name: "rollback", scopes: ["site:read", "site:rollback"], approval: ["rollback"] },
    };
    const denied = await call("create_entry", { siteId, slug: "x", title: "x", body: "x" });
    expect(denied.decision).toMatchObject({ kind: "deny" });
    const list = await call("list_snapshots", { siteId });
    expect(list.decision.kind).toBe("allow");
  });
});

describe("preview_page on a deployed site", () => {
  it("returns a signed link to the primary domain when a preview secret is configured", async () => {
    const { verifyPreviewToken } = await import("@cloudhal/core-ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const seeded = await seedStarterSite(store, { name: "Deployed", slug: "deployed" });
    await store.updateSite({ ...seeded, domains: [{ hostname: "news.example.com", primary: true }] });
    const secret = "mcp-preview-secret-at-least-32-bytes-long";
    const page = (await store.listPages(seeded.id)).find((p) => p.path === "/about");
    const def = tools.find((t) => t.name === "preview_page") as (typeof tools)[number];
    const out = await runTool(
      def,
      { siteId: seeded.id, pageId: page?.id },
      { store, principal: { actor: agent, scopes: defaultScopes(agent) }, previewSecret: secret, previewBaseUrl: "http://localhost:4321" },
      { policy: new PolicyEngine(toolPolicies(tools)) },
    );
    const url = new URL((out.result as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://news.example.com/about");
    const token = url.searchParams.get("cloudhal-preview") as string;
    expect((await verifyPreviewToken(secret, token, seeded.id)).target).toBe("live");
  });
});
