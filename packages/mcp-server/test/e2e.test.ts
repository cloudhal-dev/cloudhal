/**
 * Sprint 5 exit criterion, end to end over a real MCP client ↔ server pair (in-memory transport):
 * an MCP client creates content, gets a preview, asks to publish — and publishing stops at the
 * human-approval gate until a person answers. Every mutation produces a snapshot.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApprovalStore, AuditLog, loadSkills } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createCloudhalMcpServer } from "../src/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.resolve(here, "../../../skills/official");
const agent = { kind: "agent" as const, id: "agent_e2eclient01", name: "E2E agent" };

type Answer = "accept" | "decline";

async function connect(opts: {
  store: SiteGraphStore;
  audit: AuditLog;
  elicitation: boolean;
  answer?: () => Answer | Promise<Answer>;
  prompts?: string[];
  confirmTokenFallback?: boolean;
  approvals?: ApprovalStore;
}) {
  const server = createCloudhalMcpServer({
    store: opts.store,
    principal: { actor: agent, scopes: ["*"] },
    audit: opts.audit,
    skills: await loadSkills(SKILLS),
    previewBaseUrl: "http://localhost:4321",
    stateKey: "e2e-test-key-at-least-thirty-two-bytes-long",
    ...(opts.confirmTokenFallback ? { confirmTokenFallback: true } : {}),
    ...(opts.approvals ? { approvals: opts.approvals } : {}),
  });
  const client = new Client(
    { name: "e2e", version: "1.0.0" },
    { capabilities: opts.elicitation ? { elicitation: { form: {} } } : {} },
  );
  if (opts.elicitation) {
    client.setRequestHandler("elicitation/create", async (req) => {
      opts.prompts?.push(req.params.message);
      const action = (await opts.answer?.()) ?? "accept";
      return action === "accept" ? { action, content: { confirm: true } } : { action };
    });
  }
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  return { client, server };
}

describe("MCP client ↔ Cloudhal server", () => {
  let store: SiteGraphStore;
  let audit: AuditLog;
  let siteId: string;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    audit = new AuditLog(sql);
    siteId = (await seedStarterSite(store, { name: "E2E Site", slug: "e2e" })).id;
  });

  it("lists tools deterministically with schemas and annotations, and skills as resources", async () => {
    const { client } = await connect({ store, audit, elicitation: true });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).slice(0, 3)).toEqual(["list_sites", "get_site", "list_pages"]);
    expect(tools).toHaveLength(105);
    const publish = tools.find((t) => t.name === "publish");
    expect(publish?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(publish?.inputSchema).toMatchObject({ type: "object" });
    expect(
      (publish?.inputSchema as { properties?: Record<string, unknown> })?.properties,
    ).not.toHaveProperty("confirmToken"); // off by default: the token would reach the agent
    expect(tools.find((t) => t.name === "get_page")?.outputSchema).toMatchObject({
      type: "object",
    });
    // RFC-0020 §6: MCP Apps hosts show these tools' results in Cloudhal's View.
    for (const name of ["preview_page", "patch_draft"])
      expect(tools.find((t) => t.name === name)?._meta).toEqual({
        ui: { resourceUri: "ui://cloudhal/preview" },
      });
    expect(tools.find((t) => t.name === "get_page")?._meta).toBeUndefined();
    const view = await client.readResource({ uri: "ui://cloudhal/preview" });
    expect(view.contents[0]).toMatchObject({
      uri: "ui://cloudhal/preview",
      mimeType: "text/html;profile=mcp-app",
      _meta: { ui: { prefersBorder: true } },
    });
    expect(String((view.contents[0] as { text?: string }).text)).toContain('"ui/initialize"');

    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(
      expect.arrayContaining([
        "skill://comment-triage/SKILL.md",
        "skill://publish-article/SKILL.md",
        "skill://rollback/SKILL.md",
        "skill://safe-edit/SKILL.md",
        "skill://site-bootstrap/SKILL.md",
        "skill://site-design/SKILL.md",
        "skill://stale-review/SKILL.md",
      ]),
    );
    expect(uris).toContain("skill://publish-article/references/editorial-checklist.md");
    const ref = await client.readResource({
      uri: "skill://publish-article/references/editorial-checklist.md",
    });
    expect((ref.contents[0] as { text: string }).text.length).toBeGreaterThan(20);
    const skill = await client.readResource({ uri: "skill://publish-article/SKILL.md" });
    expect((skill.contents[0] as { text: string }).text).toMatch(/^---\nname: publish-article/);
  });

  it("creates content, previews it, and stops publish at the human-approval gate", async () => {
    const prompts: string[] = [];
    let answer: Answer = "decline";
    const { client } = await connect({
      store,
      audit,
      elicitation: true,
      answer: () => answer,
      prompts,
    });

    const created = await client.callTool({
      name: "create_entry",
      arguments: {
        siteId,
        slug: "from-mcp",
        title: "Hello from MCP",
        summary: "An agent wrote this",
        body: "# Hello\n\nBody.",
      },
    });
    expect(created.isError).toBeFalsy();
    const { entry, snapshot } = created.structuredContent as {
      entry: { id: string; rev: number; status: string };
      snapshot: { reason: string };
    };
    expect(entry.status).toBe("draft");
    expect(snapshot.reason).toBe("agentMutation");

    const preview = await client.callTool({
      name: "preview_page",
      arguments: { siteId, entryId: entry.id },
    });
    const doc = preview.structuredContent as { html: string; url: string };
    expect(doc.html).toContain("<h1>Hello</h1>");
    expect(doc.url).toBe("http://localhost:4321/posts/from-mcp");

    // A person declines: nothing is published.
    const declined = await client.callTool({ name: "publish", arguments: { siteId, label: "v1" } });
    expect(declined.isError).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/^Publish "E2E Site" to production/);
    expect((await store.getSite(siteId))?.publishedSnapshotId).toBeUndefined();

    // A person approves: the same call completes.
    answer = "accept";
    const published = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "v1" },
    });
    expect(published.isError).toBeFalsy();
    const out = published.structuredContent as {
      site: { publishedSnapshotId: string };
      snapshot: { id: string; reason: string };
    };
    expect(out.site.publishedSnapshotId).toBe(out.snapshot.id);
    expect(out.snapshot.reason).toBe("publish");
    expect(prompts).toHaveLength(2);

    // Every mutation left a snapshot; every decision is in the audit log.
    const { snapshots } = (await client.callTool({ name: "list_snapshots", arguments: { siteId } }))
      .structuredContent as { snapshots: { reason: string }[] };
    expect(snapshots.map((s) => s.reason)).toEqual(["publish", "agentMutation"]);
    const rows = await audit.list({ siteId });
    expect(rows.map((r) => `${r.tool}:${r.decision}:${r.outcome}`)).toEqual([
      "list_snapshots:allow:ok",
      "publish:allow:ok",
      "publish:approval-required:pending",
      "publish:deny:error",
      "publish:approval-required:pending",
      "preview_page:allow:ok",
      "create_entry:allow:ok",
    ]);
  });

  it("falls back to a confirmToken for clients without elicitation, bound to the exact call", async () => {
    const { client } = await connect({
      store,
      audit,
      elicitation: false,
      confirmTokenFallback: true,
    });
    const first = await client.callTool({ name: "publish", arguments: { siteId, label: "token" } });
    expect(first.isError).toBe(true);
    const text = (first.content[0] as { text: string }).text;
    expect(text).toMatch(/^approval required: Publish "E2E Site"/);
    const token = text.match(/confirmToken: "([^"]+)"/)?.[1];
    expect(token).toBeDefined();

    // Different arguments → the token does not apply.
    const misuse = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "other", confirmToken: token },
    });
    expect(misuse.isError).toBe(true);
    expect((misuse.content[0] as { text: string }).text).toMatch(/mismatched confirmToken/);
    const bogus = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "token", confirmToken: "v1.nope.nope" },
    });
    expect(bogus.isError).toBe(true);

    const done = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "token", confirmToken: token },
    });
    expect(done.isError).toBeFalsy();
    expect((done.structuredContent as { snapshot: { label?: string } }).snapshot.label).toBe(
      "token",
    );
  });

  it("limits a call to the declared skill's scopes and reports denials and conflicts as tool errors", async () => {
    const { client } = await connect({ store, audit, elicitation: true });
    const denied = await client.callTool({
      name: "create_entry",
      arguments: { siteId, slug: "x", title: "x", body: "x" },
      _meta: { "cloudhal.skill": "rollback" },
    });
    expect(denied.isError).toBe(true);
    expect((denied.content[0] as { text: string }).text).toMatch(
      /skill rollback did not declare content:write/,
    );

    const unknown = await client.callTool({
      name: "list_sites",
      arguments: {},
      _meta: { "cloudhal.skill": "nope" },
    });
    expect(unknown.isError).toBe(true);

    const pages = (await client.callTool({ name: "list_pages", arguments: { siteId } }))
      .structuredContent as { pages: { id: string; rev: number }[] };
    const stale = await client.callTool({
      name: "update_page",
      arguments: { siteId, pageId: pages.pages[0]?.id, rev: 999, title: "stale" },
    });
    expect(stale.isError).toBe(true);
    expect((stale.content[0] as { text: string }).text).toMatch(/^conflict:/);

    const missing = await client.callTool({
      name: "get_page",
      arguments: { siteId, pageId: "page_doesnotexist" },
    });
    expect((missing.content[0] as { text: string }).text).toMatch(/^not_found:/);
  });

  it("never hands a token to a client that cannot ask a person, unless enabled", async () => {
    const { client } = await connect({ store, audit, elicitation: false });
    const r = await client.callTool({ name: "publish", arguments: { siteId } });
    expect(r.isError).toBe(true);
    const text = (r.content[0] as { text: string }).text;
    expect(text).toMatch(/cannot collect approval/);
    expect(text).not.toMatch(/confirmToken/);
  });

  it("voids an elicited approval when the site changed after the question (H2)", async () => {
    // The client approves, but before its retry reaches the server an edit lands.
    let edited = false;
    const { client } = await connect({
      store,
      audit,
      elicitation: true,
      // The edit is awaited before answering: it must land before the retry, whatever the load.
      answer: async (): Promise<Answer> => {
        if (!edited) {
          edited = true;
          const page = (await store.listPages(siteId))[0];
          if (page) await store.updatePage({ ...page, title: "Changed after the question" });
        }
        return "accept";
      },
    });
    const r = await client.callTool({ name: "publish", arguments: { siteId } });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/site changed meanwhile/);
    expect((await store.getSite(siteId))?.publishedSnapshotId).toBeUndefined();
  });

  it("agents wait for a person in Studio; approvals are single-use and state-bound (H1, H2)", async () => {
    const approvals = new ApprovalStore(
      await (async () => {
        const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
        const { migrate, migrations } = await import("@cloudhal/storage");
        const d = await BetterSqlite3Driver.open(":memory:");
        await migrate(d, migrations);
        return d;
      })(),
    );
    // the agent's client would happily auto-accept — it must not matter
    const { client } = await connect({
      store,
      audit,
      elicitation: true,
      answer: () => "accept",
      approvals,
    });
    const ask = await client.callTool({ name: "publish", arguments: { siteId, label: "v1" } });
    expect(ask.isError).toBe(true);
    const text = (ask.content[0] as { text: string }).text;
    expect(text).toMatch(/^approval pending: Publish "E2E Site"/);
    const id = text.match(/approvalId: (appr_\w+)/)?.[1] as string;
    expect(id).toBeDefined();
    expect((await store.getSite(siteId))?.publishedSnapshotId).toBeUndefined();
    // asking again for the same call on the same site state returns the waiting request
    const again = await client.callTool({ name: "publish", arguments: { siteId, label: "v1" } });
    expect((again.content[0] as { text: string }).text).toContain(`approvalId: ${id}`);
    expect(await approvals.list({ status: "pending" })).toHaveLength(1);

    const retry = () =>
      client.callTool({ name: "publish", arguments: { siteId, label: "v1", approvalId: id } });
    expect(((await retry()).content[0] as { text: string }).text).toMatch(/still waiting/);

    const owner = { kind: "human" as const, id: "user_owner000001", name: "Owner" };
    expect(await approvals.decide(id, "approved", owner)).toMatchObject({ status: "approved" });
    // a different call cannot use it
    const other = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "other", approvalId: id },
    });
    expect((other.content[0] as { text: string }).text).toMatch(/different call/);

    const done = await retry();
    expect(done.isError, JSON.stringify(done.content)).toBeFalsy();
    expect((await store.getSite(siteId))?.publishedSnapshotId).toBeDefined();
    // single use
    expect(((await retry()).content[0] as { text: string }).text).toMatch(/already used/);

    // approved, then the agent edits before redeeming → void
    const ask2 = await client.callTool({ name: "publish", arguments: { siteId, label: "v2" } });
    const id2 = (ask2.content[0] as { text: string }).text.match(
      /approvalId: (appr_\w+)/,
    )?.[1] as string;
    await approvals.decide(id2, "approved", owner);
    const entries = await client.callTool({ name: "list_entries", arguments: { siteId } });
    const e = (entries.structuredContent as { entries: { id: string; rev: number }[] }).entries[0];
    await client.callTool({
      name: "update_entry",
      arguments: { siteId, entryId: e?.id, rev: e?.rev, title: "Sneaky change" },
    });
    const late = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "v2", approvalId: id2 },
    });
    expect((late.content[0] as { text: string }).text).toMatch(/site changed/);

    // denied stays denied
    const ask3 = await client.callTool({ name: "publish", arguments: { siteId, label: "v3" } });
    const id3 = (ask3.content[0] as { text: string }).text.match(
      /approvalId: (appr_\w+)/,
    )?.[1] as string;
    await approvals.decide(id3, "denied", owner);
    const denied = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "v3", approvalId: id3 },
    });
    expect((denied.content[0] as { text: string }).text).toMatch(/denied/);
    expect(await approvals.decide(id3, "approved", owner)).toBeUndefined();
  });
});
