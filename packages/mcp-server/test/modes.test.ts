/** Agent modes end to end over a real MCP client (ADR-0015). */
import { type AgentMode, ApprovalStore, AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createCloudhalMcpServer } from "../src/server.ts";

async function setup(mode: AgentMode) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Modes", slug: "modes" });
  const audit = new AuditLog(sql);
  const approvals = new ApprovalStore(sql);
  const server = createCloudhalMcpServer({
    store,
    audit,
    approvals,
    principal: {
      actor: { kind: "agent", id: "agent_modes00001", name: "bot" },
      scopes: ["*"],
      mode,
    },
    stateKey: "modes-test-state-key-0123456789abcdefgh",
  });
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { ...r, text: (r.content as { text?: string }[])[0]?.text ?? "" };
  };
  return { store, site, audit, approvals, client, call };
}

const article = (siteId: string, slug: string) => ({ siteId, slug, title: slug, body: "Body." });

describe("agent modes over MCP", () => {
  it("auto: a publish of only articles goes live without a person, and says so in the audit", async () => {
    const { store, site, audit, approvals, client, call } = await setup("auto");
    expect(client.getInstructions()).toContain("AUTO mode");
    const created = await call("create_entry", article(site.id, "auto-one"));
    expect(created.isError).toBeFalsy();
    // the seed's pages are not live yet → that first publish touches pages and must wait
    const first = await call("publish", { siteId: site.id });
    expect(first.text).toMatch(/^approval pending:/);
    // the approval says, as data, which mode asked and why auto did not let it through
    const [waiting] = await approvals.list({ siteId: site.id, status: "pending" });
    expect(waiting).toMatchObject({
      mode: "auto",
      cause: "tool",
      autoCheck: { rule: "low-risk-publish", lowRisk: false, code: "structure", limit: 20 },
    });
    // publish the starter once as a person would, then an article-only publish is low risk
    const owner = { kind: "human" as const, id: "user_owner000001" };
    const s0 = await store.createSnapshot(site.id, { actor: owner, reason: "publish" });
    await store.publish(
      (await store.getSite(site.id)) as NonNullable<Awaited<ReturnType<typeof store.getSite>>>,
      s0.id,
    );
    await call("create_entry", article(site.id, "auto-two"));
    const second = await call("publish", { siteId: site.id });
    expect(second.isError, second.text).toBeFalsy();
    expect((await store.getSite(site.id))?.publishedSnapshotId).not.toBe(s0.id);
    const row = (await audit.list({ siteId: site.id })).find(
      (r) => r.tool === "publish" && r.decision === "allow",
    );
    expect(row).toMatchObject({
      mode: "auto",
      reason: expect.stringMatching(/^auto mode: published without approval/),
      autoCheck: { rule: "low-risk-publish", lowRisk: true, code: "low-risk", changes: 1 },
    });
    expect(await approvals.list({ siteId: site.id, status: "pending" })).toHaveLength(1); // only the first

    // a page change is not low risk, even in auto
    const pages = (await call("list_pages", { siteId: site.id })).structuredContent as {
      pages: { id: string; rev: number }[];
    };
    const p = pages.pages[0] as { id: string; rev: number };
    await call("update_page", { siteId: site.id, pageId: p.id, rev: p.rev, title: "Changed" });
    const third = await call("publish", { siteId: site.id });
    expect(third.text).toMatch(/^approval pending:/);
    // rollback never skips the person
    const rb = await call("rollback", { siteId: site.id, snapshotId: s0.id });
    expect(rb.text).toMatch(/^approval pending:/);
    const rbApproval = (await approvals.list({ siteId: site.id, status: "pending" })).find(
      (a) => a.tool === "rollback",
    );
    expect(rbApproval).toMatchObject({ mode: "auto", cause: "tool" });
    expect(rbApproval?.autoCheck).toBeUndefined();
  });

  it("auto: a publish that adds a correction waits for a person (RFC-0019 §2.4)", async () => {
    const { store, site, approvals, audit, call } = await setup("auto");
    const owner = { kind: "human" as const, id: "user_owner000001" };
    const publishAsPerson = async () => {
      const s = await store.createSnapshot(site.id, { actor: owner, reason: "publish" });
      await store.publish(
        (await store.getSite(site.id)) as NonNullable<Awaited<ReturnType<typeof store.getSite>>>,
        s.id,
      );
    };
    const created = (await call("create_entry", article(site.id, "corrected")))
      .structuredContent as {
      entry: { id: string; rev: number };
    };
    await publishAsPerson();
    const added = await call("add_correction", {
      siteId: site.id,
      entryId: created.entry.id,
      rev: created.entry.rev,
      kind: "correction",
      note: "An earlier version misspelled the mayor's name.",
      // a forged time is not part of the tool: the store stamps it
    });
    expect(added.isError, added.text).toBeFalsy();
    const entry = (added.structuredContent as { entry: { rev: number; corrections: unknown[] } })
      .entry;
    expect(entry.corrections).toEqual([
      {
        id: expect.stringMatching(/^crx_/),
        kind: "correction",
        at: expect.any(String),
        note: "An earlier version misspelled the mayor's name.",
      },
    ]);
    const publish = await call("publish", { siteId: site.id });
    expect(publish.text).toMatch(/^approval pending:/);
    const [waiting] = await approvals.list({ siteId: site.id, status: "pending" });
    expect(waiting?.autoCheck).toMatchObject({ lowRisk: false, code: "correction" });
    const held = (await audit.list({ siteId: site.id })).find((r) => r.tool === "publish");
    expect(held?.reason).toMatch(/auto mode waits for a person: it adds a correction/);

    // once live, the agent cannot take it back
    await publishAsPerson();
    const live = (await store.getContentEntry(created.entry.id)) as NonNullable<
      Awaited<ReturnType<typeof store.getContentEntry>>
    >;
    const { corrections: _gone, ...rest } = live;
    await expect(store.updateContentEntry(rest as typeof live)).rejects.toMatchObject({
      code: "correction_locked",
    });
  });

  it("plan: read and preview only", async () => {
    const { site, client, call } = await setup("plan");
    expect(client.getInstructions()).toContain("PLAN mode");
    expect((await call("list_pages", { siteId: site.id })).isError).toBeFalsy();
    const w = await call("create_entry", article(site.id, "nope"));
    expect(w.isError).toBe(true);
    expect(w.text).toMatch(/plan mode is read-only/);
  });

  it("manual: even a content edit waits for a person, then completes with the approval", async () => {
    const { site, approvals, call, audit } = await setup("manual");
    const ask = await call("create_entry", article(site.id, "manual-one"));
    expect(ask.text).toMatch(
      /^approval pending: manual mode: create_entry needs a person's approval/,
    );
    const id = ask.text.match(/approvalId: (appr_\w+)/)?.[1] as string;
    expect(await approvals.get(id)).toMatchObject({ mode: "manual", cause: "manual-mode" });
    expect((await audit.list({ siteId: site.id }))[0]).toMatchObject({
      decision: "approval-required",
      cause: "manual-mode",
    });
    await approvals.decide(id, "approved", { kind: "human", id: "user_owner000001" });
    const done = await call("create_entry", { ...article(site.id, "manual-one"), approvalId: id });
    expect(done.isError, done.text).toBeFalsy();
    expect((await audit.list({ siteId: site.id }))[0]).toMatchObject({
      tool: "create_entry",
      mode: "manual",
      decision: "allow",
    });
  });

  it("bypass from a remote key behaves like edits", async () => {
    const { site, client, call } = await setup("bypass");
    expect(client.getInstructions()).toContain("EDITS mode");
    expect((await call("create_entry", article(site.id, "b"))).isError).toBeFalsy();
    expect((await call("publish", { siteId: site.id })).text).toMatch(/^approval pending:/);
  });
});
