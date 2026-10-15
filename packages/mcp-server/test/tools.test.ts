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
      // RFC-0020 §2, §6
      "get_catalog",
      "patch_draft",
      // RFC-0020 §9
      "import_surface",
      "export_surface",
      "delete_page",
      "list_entries",
      "get_entry",
      "create_entry",
      "update_entry",
      // RFC-0019 §2
      "add_correction",
      "delete_entry",
      // RFC-0017 §1, RFC-0015 §6, RFC-0014 §4
      "get_theme_settings",
      "set_theme_settings",
      "list_block_types",
      "get_body",
      "edit_body",
      "diff_node",
      // RFC-0021 §2
      "get_design",
      "set_design",
      "render_page",
      "list_taxonomies",
      "list_terms",
      "resolve_terms",
      "propose_term",
      "update_term",
      "rename_term",
      "merge_terms",
      "retire_term",
      "set_term_parent",
      "set_term_visibility",
      "review_term",
      "taxonomy_report",
      "create_taxonomy",
      "update_taxonomy",
      "list_redirects",
      "create_redirect",
      "delete_redirect",
      "list_menus",
      "get_menu",
      "update_menu",
      "set_menu",
      "delete_menu",
      "list_assets",
      "get_asset",
      "upload_asset",
      "fetch_asset_url",
      "update_asset",
      "retire_asset",
      "restore_asset",
      "delete_asset",
      "create_snapshot",
      "list_snapshots",
      "diff_snapshots",
      "preview_page",
      "publish",
      "rollback",
      "get_analytics",
      "top_content",
      "content_stats",
      "broken_links",
      "list_comments",
      "get_comment_thread",
      "comments_summary",
      "label_comments",
      "moderate_comments",
      "draft_comment_reply",
      "set_comment_thread",
      // RFC-0008 §12
      "list_schedule",
      "get_schedule",
      "list_releases",
      "get_release",
      "propose_release",
      "schedule_release",
      "reschedule",
      "cancel_schedule",
      "set_embargo",
      "lift_embargo",
      "schedule_unpublish",
      "list_automations",
      "list_runs",
      "get_run",
      "begin_run",
      "end_run",
      "pause_automation",
      "get_mode",
      "request_elevation",
    ]);
    for (const t of tools) {
      expect(typeof t.annotations.readOnlyHint).toBe("boolean");
      expect(typeof t.annotations.destructiveHint).toBe("boolean");
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
    expect(byName.publish?.annotations.destructiveHint).toBe(true);
    expect(byName.get_page?.annotations.readOnlyHint).toBe(true);
    // asking for an elevation changes neither the site nor the key (a person grants it)
    expect(byName.request_elevation?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it("an agent creates an article, previews it, and every mutation snapshots", async () => {
    // A new tag is proposed first (never created implicitly); `tags` is an alias for terms.tag.add.
    const proposed = await call("propose_term", {
      siteId,
      taxonomy: "tag",
      name: "Agents",
      reason: "Articles about AI agents",
    });
    const tag = (proposed.result as { term: { id: string; status: string; proposedBy?: unknown } })
      .term;
    expect(tag).toMatchObject({ status: "proposed", proposedBy: agent });
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
      entry: { id: string; rev: number; author: { id: string }; terms?: unknown; tags: unknown };
      snapshot: { reason: string; label?: string };
    };
    expect(entry.author.id).toBe(agent.id);
    expect(entry.terms).toEqual({ tag: { ids: [tag.id] } });
    expect(entry.tags).toEqual([]);
    expect(snapshot.reason).toBe("agentMutation");
    expect(snapshot.label).toContain("create_entry");

    const preview = await call("preview_page", { siteId, entryId: entry.id });
    const doc = preview.result as { html: string; url: string | null; path: string };
    expect(doc.html).toContain("<h1>Hello</h1>");
    expect(doc.url).toBe("http://localhost:4321/posts/agent-post");

    // Review needs a primary category (required on the starter): filed by name.
    const missing = call("update_entry", {
      siteId,
      entryId: entry.id,
      rev: entry.rev,
      status: "review",
    });
    await expect(missing).rejects.toMatchObject({
      code: "required_term",
      message: expect.stringContaining(
        'call list_terms(taxonomy: "category") and set terms.category.primary',
      ),
    });
    const updated = await call("update_entry", {
      siteId,
      entryId: entry.id,
      rev: entry.rev,
      status: "review",
      terms: { category: { primary: "News" } },
    });
    expect((updated.result as { entry: { status: string; rev: number } }).entry.status).toBe(
      "review",
    );
    await expect(
      call("update_entry", { siteId, entryId: entry.id, rev: 0, title: "stale" }),
    ).rejects.toThrow(ToolError);

    const list = await call("list_snapshots", { siteId });
    expect((list.result as { snapshots: unknown[] }).snapshots.length).toBe(3);
    const rows = await audit.list({ siteId });
    expect(rows.map((r) => r.tool)).toEqual([
      "list_snapshots",
      "update_entry",
      "update_entry",
      "update_entry",
      "preview_page",
      "create_entry",
      "propose_term",
    ]);
    expect(rows.find((r) => r.tool === "create_entry")?.snapshotId).toBeDefined();
    // assignment deltas land in the audit input (RFC-0002 §6.4)
    expect(rows.find((r) => r.tool === "create_entry")?.input).toMatchObject({
      effect: { terms: { tag: { added: ["agents"] } } },
    });
    expect(rows.find((r) => r.tool === "update_entry" && r.outcome === "ok")?.input).toMatchObject({
      effect: { terms: { category: { added: ["news"], primary: { from: null, to: "news" } } } },
    });
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

    // Approval prompts name taxonomy, term and redirect changes (RFC-0002 §6.4).
    const tag = await ctx.store.getTermBySlug(siteId, "tag", "cloudhal");
    await ctx.store.renameTerm(tag as NonNullable<typeof tag>, "cloudhal-dev");
    const category = await ctx.store.getTaxonomyByKey(siteId, "category");
    await ctx.store.updateTaxonomy({
      ...(category as NonNullable<typeof category>),
      required: false,
    });
    const prompt = (await call("publish", { siteId, label: "Renamed" })).approvalPrompt ?? "";
    expect(prompt).toContain('~ taxonomy "Categories"');
    expect(prompt).toContain('~ term "Cloudhal"');
    expect(prompt).toContain('+ redirect "/tag/cloudhal → /tag/cloudhal-dev"');

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
    await store.updateSite({
      ...seeded,
      domains: [{ hostname: "news.example.com", primary: true }],
    });
    const secret = "mcp-preview-secret-at-least-32-bytes-long";
    const page = (await store.listPages(seeded.id)).find((p) => p.path === "/about");
    const def = tools.find((t) => t.name === "preview_page") as (typeof tools)[number];
    const out = await runTool(
      def,
      { siteId: seeded.id, pageId: page?.id },
      {
        store,
        principal: { actor: agent, scopes: defaultScopes(agent) },
        previewSecret: secret,
        previewBaseUrl: "http://localhost:4321",
      },
      { policy: new PolicyEngine(toolPolicies(tools)) },
    );
    const url = new URL((out.result as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://news.example.com/about");
    const token = url.searchParams.get("cloudhal-preview") as string;
    expect((await verifyPreviewToken(secret, token, seeded.id)).target).toBe("live");
  });
});

describe("agent-written content stays safe (H3)", () => {
  it("refuses HTML sections and edits to HTML bodies; the publish prompt lists what changes", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Safe", slug: "safe" });
    const ctx: ToolContext = { store, principal: { actor: agent, scopes: ["*"] } };
    const policy = new PolicyEngine(toolPolicies(tools));
    const run = (name: string, args: Record<string, unknown>, confirmed = false) =>
      runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, confirmed });
    const html = {
      id: "sec_evil00000001",
      kind: "richText",
      format: "html",
      body: "<img src=x onerror=alert(1)>",
    };
    await expect(
      run("create_page", { siteId: site.id, path: "/x", title: "X", sections: [html] }),
    ).rejects.toThrow(/only write markdown/);
    const page = (await store.listPages(site.id))[0] as NonNullable<
      Awaited<ReturnType<typeof store.listPages>>[number]
    >;
    await expect(
      run("update_page", { siteId: site.id, pageId: page.id, rev: page.rev, sections: [html] }),
    ).rejects.toThrow(/only write markdown/);

    // a person stored an HTML article; an agent may change its title but not its body
    const entry = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "by-hand",
      locale: "en",
      status: "draft",
      title: "By hand",
      body: { format: "html", value: "<p>hand-written</p>" },
      fields: {},
      tags: [],
      author: { kind: "human", id: "user_owner000001" },
    });
    await expect(
      run("update_entry", {
        siteId: site.id,
        entryId: entry.id,
        rev: entry.rev,
        body: "<script>x</script>",
      }),
    ).rejects.toThrow(/HTML body/);
    const renamed = await run("update_entry", {
      siteId: site.id,
      entryId: entry.id,
      rev: entry.rev,
      title: "Renamed",
    });
    expect((renamed.result as { entry: { title: string } }).entry.title).toBe("Renamed");

    const prompt = (await run("publish", { siteId: site.id })).approvalPrompt as string;
    expect(prompt).toMatch(/^Publish "Safe" to production \(\+\d+ added/);
    expect(prompt).toContain('+ article "Renamed"');
    expect(prompt).toContain('+ page "About"');
  });
});
