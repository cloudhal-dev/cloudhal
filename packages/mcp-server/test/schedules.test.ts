/**
 * RFC-0008 §10–§12 over a real MCP client: the seventeen schedule tools, their classes per mode,
 * release requests bound to `rl1:`, the `auto` window (D9), the embargo override (D8), gates, and
 * automation runs (outside-run refusals, the envelope, taint, budgets, `get_mode`).
 */
import {
  type AgentMode,
  ApprovalStore,
  AuditLog,
  PEOPLE_ONLY_OWNERSHIP,
  PolicyEngine,
  type Principal,
  type Scope,
} from "@cloudhal/agent-runtime";
import type { ContentEntry, Release, Site } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import { GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { MemoryBlobStore, migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createReleaseApprovalCheck, type SchedulesDeps } from "../src/schedules.ts";
import { createCloudhalMcpServer } from "../src/server.ts";
import { defineTools, toolPolicies } from "../src/tools.ts";

const NOW = new Date("2026-10-12T10:00:00.000Z");
const plus = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const HOUR = 3_600_000;
const agent = { kind: "agent" as const, id: "agent_sched00001", name: "Desk bot" };
const owner = { kind: "human" as const, id: "user_owner000001", name: "Owner" };

const SCHEDULE_TOOLS = [
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
];

interface Setup {
  sql: SqlDriver;
  store: SiteGraphStore;
  site: Site;
  entry: ContentEntry;
  schedules: SqlScheduleStore;
  approvals: ApprovalStore;
  audit: AuditLog;
  deps: SchedulesDeps;
  clock: { now: Date };
}

async function base(): Promise<Setup> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore(), gates: GATES_ENFORCED });
  let site = await seedStarterSite(store, { name: "Schedules", slug: "schedules" });
  // Publish the starter once, as a person would: terms and pages are live.
  const snap = await store.createSnapshot(site.id, { actor: owner, reason: "publish" });
  site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
  const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
  const clock = { now: NOW };
  const schedules = new SqlScheduleStore(sql, { now: () => clock.now });
  const deps: SchedulesDeps = { store: schedules, maxNewBodies: Number.POSITIVE_INFINITY };
  return {
    sql,
    store,
    site,
    entry,
    schedules,
    approvals: new ApprovalStore(sql, { now: () => clock.now }),
    audit: new AuditLog(sql),
    deps,
    clock,
  };
}

async function connect(s: Setup, principal: Principal) {
  const server = createCloudhalMcpServer({
    store: s.store,
    audit: s.audit,
    approvals: s.approvals,
    schedules: s.deps,
    principal,
    now: () => s.clock.now,
    stateKey: "schedules-test-state-key-0123456789abcd",
  });
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      text: (r.content as { text?: string }[])[0]?.text ?? "",
      data: r.structuredContent as Record<string, unknown> | undefined,
    };
  };
  return { client, call };
}

const keyScopes: Scope[] = [
  "site:read",
  "content:read",
  "content:write",
  "site:publish",
  "schedules:read",
  "schedules:write",
  "analytics:read",
];

function agentKey(mode: AgentMode, extra: Partial<Principal> = {}): Principal {
  return { actor: agent, scopes: keyScopes, mode, keyId: "key_sched000001", ...extra };
}

/** A new article that rides on live terms: a low-risk release candidate. */
async function newArticle(s: Setup, slug: string): Promise<ContentEntry> {
  return s.store.createContentEntry({
    siteId: s.site.id,
    collection: "posts",
    slug,
    locale: "en",
    status: "published",
    title: `Article ${slug}`,
    body: { format: "markdown", value: "Body." },
    fields: {},
    tags: [],
    ...(s.entry.terms ? { terms: s.entry.terms } : {}),
    author: agent,
    publishedAt: NOW.toISOString(),
  });
}

describe("schedule tools: classes per mode (RFC-0008 §12)", () => {
  const engine = new PolicyEngine(toolPolicies(defineTools()));
  const p = (mode: AgentMode, local = false): Principal => ({
    actor: agent,
    scopes: ["*"],
    mode,
    local,
  });
  const verdict = (principal: Principal, tool: string) => {
    const d = engine.evaluate(principal, tool, { args: {} });
    if (d.kind === "allow") return "✓";
    if (d.kind === "deny") return "✗";
    return d.autoApprove === "low-risk-release" ? "auto?" : "waits";
  };

  it("registers the seventeen tools", () => {
    const names = defineTools().map((t) => t.name);
    for (const t of SCHEDULE_TOOLS) expect(names).toContain(t);
  });

  it("matches the RFC table", () => {
    const table: Record<string, [string, string, string, string, string]> = {
      // plan, manual, edits, auto, bypass (local)
      list_schedule: ["✓", "✓", "✓", "✓", "✓"],
      get_release: ["✓", "✓", "✓", "✓", "✓"],
      list_runs: ["✓", "✓", "✓", "✓", "✓"],
      propose_release: ["✗", "✓", "✓", "✓", "✓"],
      schedule_release: ["✗", "waits", "waits", "auto?", "✓"],
      reschedule: ["✗", "waits", "✓", "✓", "✓"],
      cancel_schedule: ["✗", "waits", "✓", "✓", "✓"],
      set_embargo: ["✗", "waits", "✓", "✓", "✓"],
      lift_embargo: ["✗", "waits", "waits", "waits", "waits"],
      schedule_unpublish: ["✗", "waits", "waits", "auto?", "✓"],
      begin_run: ["✓", "✓", "✓", "✓", "✓"],
      end_run: ["✓", "✓", "✓", "✓", "✓"],
      pause_automation: ["✓", "✓", "✓", "✓", "✓"],
    };
    for (const [tool, row] of Object.entries(table)) {
      const got = [
        verdict(p("plan"), tool),
        verdict(p("manual"), tool),
        verdict(p("edits"), tool),
        verdict(p("auto"), tool),
        verdict(p("bypass", true), tool),
      ];
      expect(got, tool).toEqual(row);
    }
  });

  it("read tools need schedules:read; writes need schedules:write (own variants count)", () => {
    const reader: Principal = { actor: agent, scopes: ["schedules:read"], mode: "edits" };
    expect(engine.evaluate(reader, "list_releases").kind).toBe("allow");
    expect(engine.evaluate(reader, "propose_release")).toMatchObject({
      kind: "deny",
      code: "missing_scope",
    });
    const own: Principal = { actor: agent, scopes: ["schedules:write:own"], mode: "edits" };
    expect(engine.evaluate(own, "propose_release")).toEqual({
      kind: "allow",
      limit: { level: "own", target: "release" },
    });
  });
});

describe("releases over MCP (RFC-0008 §10.3–§10.7)", () => {
  let s: Setup;
  beforeEach(async () => {
    s = await base();
  });

  it("proposals are drafts from manual mode up (D6); plan cannot propose", async () => {
    const article = await newArticle(s, "proposed");
    const plan = await connect(s, agentKey("plan"));
    expect(
      (await plan.call("propose_release", { siteId: s.site.id, nodeIds: [article.id] })).text,
    ).toMatch(/plan mode/);
    const manual = await connect(s, agentKey("manual"));
    const r = await manual.call("propose_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      title: "Monday's article",
      at: plus(48 * HOUR),
      note: "Ready for Monday",
    });
    expect(r.isError, r.text).toBe(false);
    const release = r.data?.release as Release;
    expect(release).toMatchObject({
      state: "draft",
      title: "Monday's article",
      when: { kind: "at" },
    });
    expect(release.hash).toMatch(/^rl1:/);
    expect(isValid("release", release)).toBe(true);
    // the target body is in the blob store, so running it reads no node rows
    const item = release.items[0] as Extract<Release["items"][number], { kind: "set" }>;
    expect(await s.store.blobs.head(`nodes/${item.target.hash}.json`)).not.toBeNull();
    // audit rows carry the release
    const rows = await s.audit.list({ releaseId: release.id });
    expect(rows[0]).toMatchObject({ tool: "propose_release", decision: "allow" });
  });

  it("edits: schedule_release files one request bound to rl1: and the time; it expires at the release time", async () => {
    const article = await newArticle(s, "for-monday");
    const { call } = await connect(s, agentKey("edits"));
    const at = plus(48 * HOUR);
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      when: { at },
    });
    expect(r.isError, r.text).toBe(false);
    expect(r.data).toMatchObject({ status: "approval-pending" });
    const release = r.data?.release as Release;
    expect(release.state).toBe("awaiting_approval");
    const request = await s.approvals.get(r.data?.approvalId as string);
    expect(request).toMatchObject({
      tool: "schedule_release",
      stateHash: release.hash,
      releaseId: release.id,
      expiresAt: at,
      status: "pending",
      input: { siteId: s.site.id, releaseId: release.id, when: { kind: "at", at } },
    });
    // the node is held and locked while it waits
    expect((await s.schedules.heldNodes(s.site.id)).has(article.id)).toBe(true);
    const view = await call("get_release", { siteId: s.site.id, releaseId: release.id });
    expect(view.data?.release).toMatchObject({
      approvalState: "pending",
      view: { request: { id: request?.id, status: "pending" }, lockedNodes: [article.id] },
    });
    // the audit row says it waits for a person
    const [row] = await s.audit.list({ releaseId: release.id, tool: "schedule_release" });
    expect(row).toMatchObject({ decision: "approval-required", outcome: "pending", cause: "tool" });
  });

  it("agents ask at most 30 days ahead (§10.5)", async () => {
    const article = await newArticle(s, "far-away");
    const { call } = await connect(s, agentKey("edits"));
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      when: { at: plus(40 * 24 * HOUR) },
    });
    expect(r.text).toMatch(/too_far_for_request/);
  });

  it("auto: a low-risk release inside the window is scheduled without a person (D9)", async () => {
    const article = await newArticle(s, "auto-soon");
    const { call } = await connect(s, agentKey("auto"));
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      when: { at: plus(2 * HOUR) },
    });
    expect(r.isError, r.text).toBe(false);
    expect(r.data).toMatchObject({ status: "scheduled" });
    expect((r.data?.release as Release | undefined)?.approval).toMatchObject({
      kind: "auto",
      keyId: "key_sched000001",
      windowEnds: plus(24 * HOUR),
    });
    const [row] = await s.audit.list({ tool: "schedule_release" });
    expect(row).toMatchObject({ decision: "allow", reason: expect.stringMatching(/^auto mode/) });
  });

  it("auto: beyond 24 h, or after the elevation ends, it waits for a person", async () => {
    const late = await newArticle(s, "auto-late");
    const { call } = await connect(s, agentKey("auto"));
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [late.id],
      when: { at: plus(30 * HOUR) },
    });
    expect(r.data).toMatchObject({ status: "approval-pending" });
    const elevated = await connect(
      s,
      agentKey("auto", { elevation: { from: "edits", until: plus(HOUR) } }),
    );
    const soon = await newArticle(s, "auto-elevated");
    const e = await elevated.call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [soon.id],
      when: { at: plus(2 * HOUR) },
    });
    expect(e.data).toMatchObject({ status: "approval-pending" });
    const inside = await newArticle(s, "auto-inside");
    const ok = await elevated.call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [inside.id],
      when: { at: plus(30 * 60_000) },
    });
    expect(ok.data).toMatchObject({ status: "scheduled" });
    expect((ok.data?.release as Release | undefined)?.approval).toMatchObject({
      windowEnds: plus(HOUR),
    });
  });

  it("auto: a page change is not low risk", async () => {
    const page = (await s.store.listPages(s.site.id))[0];
    if (!page) throw new Error("no page");
    await s.store.updatePage({ ...page, title: "New title" });
    const { call } = await connect(s, agentKey("auto"));
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [page.id],
      when: { at: plus(2 * HOUR) },
    });
    expect(r.data).toMatchObject({ status: "approval-pending" });
  });

  it("an agent's move voids the approval and asks again (D4)", async () => {
    const article = await newArticle(s, "move-me");
    const { call } = await connect(s, agentKey("auto"));
    const r = await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      when: { at: plus(2 * HOUR) },
    });
    const release = r.data?.release as Release;
    const edits = await connect(s, agentKey("edits"));
    const moved = await edits.call("reschedule", {
      siteId: s.site.id,
      releaseId: release.id,
      when: { at: plus(3 * HOUR) },
      expectedRev: release.rev,
    });
    expect(moved.isError, moved.text).toBe(false);
    expect(moved.data).toMatchObject({ status: "approval-pending" });
    const after = moved.data?.release as Release;
    expect(after.state).toBe("awaiting_approval");
    expect(after.approval).toBeUndefined();
  });

  it("cancel: free for publish-only releases in edits; a removal waits for a person", async () => {
    const article = await newArticle(s, "cancel-me");
    const { call } = await connect(s, agentKey("edits"));
    const proposed = (await call("propose_release", { siteId: s.site.id, nodeIds: [article.id] }))
      .data?.release as Release;
    const canceled = await call("cancel_schedule", {
      siteId: s.site.id,
      releaseId: proposed.id,
      expectedRev: proposed.rev,
    });
    expect(canceled.data).toMatchObject({ status: "canceled", release: { state: "canceled" } });
    const removal = (await call("propose_release", { siteId: s.site.id, removeIds: [s.entry.id] }))
      .data?.release as Release;
    const waits = await call("cancel_schedule", {
      siteId: s.site.id,
      releaseId: removal.id,
      expectedRev: removal.rev,
    });
    expect(waits.data).toMatchObject({ status: "approval-pending" });
    expect((await s.schedules.getRelease(s.site.id, removal.id))?.state).toBe("draft");
  });

  it("an own-limited key schedules only its person's articles", async () => {
    const article = await newArticle(s, "not-mine");
    const { call } = await connect(s, {
      actor: { kind: "agent", id: "agent_author0001" },
      scopes: ["schedules:write:own", "schedules:read"],
      mode: "edits",
      keyId: "key_author00001",
      person: { id: "user_author00001", userId: "u-author", role: "author" },
    });
    const r = await call("propose_release", { siteId: s.site.id, nodeIds: [article.id] });
    expect(r.text).toMatch(/denied: .*only your own work/);
  });
});

describe("gates over MCP (RFC-0008 §7.6, §10.8)", () => {
  let s: Setup;
  beforeEach(async () => {
    s = await base();
  });

  it("set_embargo: a draft carries the gate; live content gets a gate-only release (reduce)", async () => {
    const draft = await s.store.createContentEntry({
      siteId: s.site.id,
      collection: "posts",
      slug: "embargoed-draft",
      locale: "en",
      status: "draft",
      title: "Embargoed",
      body: { format: "markdown", value: "Body." },
      fields: {},
      tags: [],
      author: agent,
    });
    const { call } = await connect(s, agentKey("edits"));
    const set = await call("set_embargo", {
      siteId: s.site.id,
      nodeId: draft.id,
      from: plus(5 * HOUR),
      expectedRev: draft.rev,
    });
    expect(set.isError, set.text).toBe(false);
    expect(set.data).toMatchObject({
      status: "set",
      node: { availability: { from: plus(5 * HOUR) } },
    });

    const live = s.entry;
    const hide = await call("set_embargo", {
      siteId: s.site.id,
      nodeId: live.id,
      from: plus(5 * HOUR),
      expectedRev: live.rev,
    });
    expect(hide.isError, hide.text).toBe(false);
    expect(hide.data).toMatchObject({ status: "scheduled" });
    const release = hide.data?.release as Release;
    expect(release).toMatchObject({
      state: "scheduled",
      when: { kind: "on-approval" },
      approval: { kind: "auto", keyId: "key_sched000001" },
      metadata: { "cloudhal.reduce": "1" },
    });
    // moving it earlier is lifting: refused here, it is lift_embargo's
    const current = (await s.store.getContentEntry(draft.id)) as ContentEntry;
    const earlier = await call("set_embargo", {
      siteId: s.site.id,
      nodeId: draft.id,
      from: plus(HOUR),
      expectedRev: current.rev,
    });
    expect(earlier.text).toMatch(/lift_embargo/);
  });

  it("lift_embargo always waits for a person, with the reason (D8)", async () => {
    const draft = await s.store.createContentEntry({
      siteId: s.site.id,
      collection: "posts",
      slug: "lift-me",
      locale: "en",
      status: "draft",
      title: "Lift me",
      body: { format: "markdown", value: "Body." },
      fields: {},
      tags: [],
      author: agent,
      availability: { from: plus(5 * HOUR) },
    });
    for (const mode of ["edits", "auto"] as const) {
      const { call } = await connect(s, agentKey(mode));
      const r = await call("lift_embargo", {
        siteId: s.site.id,
        nodeId: draft.id,
        reason: "The press conference moved earlier",
        expectedRev: draft.rev,
      });
      expect(r.isError, r.text).toBe(false);
      expect(r.data).toMatchObject({ status: "approval-pending" });
      const request = await s.approvals.get(r.data?.approvalId as string);
      expect(request).toMatchObject({
        tool: "lift_embargo",
        cause: "tool",
        input: { reason: "The press conference moved earlier", nodeId: draft.id },
      });
      expect(request?.stateHash).toMatch(/^rl1:/);
    }
    // the content itself did not change
    expect((await s.store.getContentEntry(draft.id))?.availability).toEqual({
      from: plus(5 * HOUR),
    });
  });

  it("schedule_unpublish waits for a person even in auto", async () => {
    const { call } = await connect(s, agentKey("auto"));
    const r = await call("schedule_unpublish", {
      siteId: s.site.id,
      nodeId: s.entry.id,
      at: plus(2 * HOUR),
      expectedRev: s.entry.rev,
    });
    expect(r.isError, r.text).toBe(false);
    expect(r.data).toMatchObject({ status: "approval-pending" });
    expect((await s.store.getContentEntry(s.entry.id))?.availability).toBeUndefined();
  });

  it("the calendar lists releases, gates and automation occurrences", async () => {
    const article = await newArticle(s, "calendar");
    const { call } = await connect(s, agentKey("edits"));
    await call("schedule_release", {
      siteId: s.site.id,
      nodeIds: [article.id],
      when: { at: plus(3 * HOUR) },
    });
    const gated = (await s.store.getContentEntry(article.id)) as ContentEntry;
    void gated;
    await s.schedules.createAutomation({
      siteId: s.site.id,
      name: "Weekly links",
      job: { kind: "builtin", builtin: "broken-links" },
      recurrence: {
        start: "2026-10-12T11:07",
        timeZone: "UTC",
        rule: "FREQ=DAILY;BYHOUR=11;BYMINUTE=7",
      },
      owner: { id: "user_owner000001" },
    });
    const r = await call("list_schedule", {
      siteId: s.site.id,
      from: NOW.toISOString(),
      to: plus(24 * HOUR),
    });
    expect(r.isError, r.text).toBe(false);
    const items = r.data?.items as { kind: string; approval: string; origin: string }[];
    expect(items.map((i) => i.kind)).toEqual(["automation", "release"]);
    expect(items[1]).toMatchObject({ approval: "pending", origin: "agent" });
    expect(
      (
        await call("list_schedule", {
          siteId: s.site.id,
          from: NOW.toISOString(),
          to: plus(90 * 24 * HOUR),
        })
      ).text,
    ).toMatch(/62 days/);
  });
});

describe("automation runs over MCP (RFC-0008 §11)", () => {
  let s: Setup;
  let automationId: string;
  const KEY = "key_auto0000001";

  beforeEach(async () => {
    s = await base();
    const a = await s.schedules.createAutomation({
      siteId: s.site.id,
      name: "Hourly triage",
      job: {
        kind: "agent-task",
        keyId: KEY,
        instructions: "Look at the analytics and propose a draft.",
        modeCap: "edits",
        readsUntrustedText: false,
        windowMinutes: 30,
        budget: { maxToolCalls: 6, maxWrites: 2, maxApprovalRequests: 1, maxMinutes: 15 },
      },
      recurrence: {
        start: "2026-10-12T10:00",
        timeZone: "UTC",
        rule: "FREQ=DAILY;BYHOUR=10;BYMINUTE=0",
      },
      owner: { id: "user_owner000001", name: "Owner" },
    });
    automationId = a.id;
  });

  const runKey = (mode: AgentMode = "auto"): Principal =>
    agentKey(mode, { keyId: KEY, automationId, actor: { ...agent, id: "agent_runkey00001" } });

  it("outside a run the key answers outside_run, except begin_run and get_mode", async () => {
    s.clock.now = new Date("2026-10-12T10:30:00.000Z"); // the 10:00 window closed at 10:30
    const { call } = await connect(s, runKey());
    expect((await call("list_releases", { siteId: s.site.id })).text).toMatch(/^outside_run/);
    expect((await call("get_mode", {})).isError).toBe(false);
    expect((await call("begin_run", { automationId })).text).toMatch(/outside_run/);
  });

  it("begin_run opens the run (scheduler or not) and answers the envelope; the mode is capped", async () => {
    const { call } = await connect(s, runKey("auto"));
    const r = await call("begin_run", { automationId });
    expect(r.isError, r.text).toBe(false);
    expect(r.data).toMatchObject({
      automationId,
      siteId: s.site.id,
      mode: "edits",
      instructions: "Look at the analytics and propose a draft.",
      endsAt: "2026-10-12T10:15:00.000Z",
      budget: { maxToolCalls: 6 },
    });
    const tools = r.data?.tools as string[];
    expect(tools).toContain("propose_release");
    expect(tools).not.toContain("fetch_asset_url");
    expect(tools).not.toContain("request_elevation");
    // again during the run: the same envelope
    expect((await call("begin_run", { automationId })).data?.runId).toBe(r.data?.runId);
    // inside the run, calls work and carry the run
    expect((await call("list_releases", { siteId: s.site.id })).isError).toBe(false);
    const rows = await s.audit.list({ runId: r.data?.runId as string });
    expect(rows.map((x) => x.tool)).toContain("list_releases");
    expect(rows[0]).toMatchObject({ automationId });
    const mode = await call("get_mode", {});
    expect(mode.data?.run).toMatchObject({ runId: r.data?.runId, tainted: false });
    expect(mode.data?.mode).toBe("edits");
    expect(
      (
        await call("request_elevation", {
          siteId: s.site.id,
          mode: "auto",
          minutes: 30,
          reason: "more",
        })
      ).text,
    ).toMatch(/run|automation/);
    // another site is out of bounds
    expect((await call("list_releases", { siteId: "site_elsewhere01" })).text).toMatch(
      /outside_run/,
    );
    const end = await call("end_run", {
      runId: r.data?.runId,
      summary: "Nothing to <do>",
      outcome: "nothing-to-do",
    });
    expect(end.isError, end.text).toBe(false);
    expect(end.data?.run).toMatchObject({
      state: "succeeded",
      outcome: "nothing-to-do",
      summary: "<run-summary>Nothing to &lt;do&gt;</run-summary>",
    });
    expect((await call("list_releases", { siteId: s.site.id })).text).toMatch(/^outside_run/);
  });

  it("the run's mode is worked out per call: min(key mode, current modeCap); a raise and a lower apply at once", async () => {
    const setCap = async (modeCap: AgentMode) => {
      const a = await s.schedules.getAutomation(s.site.id, automationId);
      if (a?.job.kind !== "agent-task") throw new Error("automation");
      await s.schedules.updateAutomation(s.site.id, automationId, {
        expectedRev: a.rev,
        job: { ...a.job, modeCap: modeCap as "edits" },
      });
    };
    // a key minted at its owner's cap (auto): outside the run get_mode already shows the cap
    const { call } = await connect(s, runKey("auto"));
    expect((await call("get_mode", {})).data?.mode).toBe("edits");
    const r = await call("begin_run", { automationId });
    expect(r.data?.mode).toBe("edits");
    // a person raises the cap: the next call works in AUTO (no new key)
    await setCap("auto");
    expect((await call("get_mode", {})).data?.mode).toBe("auto");
    // …and lowers it: the next call is PLAN, and writes are refused
    await setCap("plan");
    expect((await call("get_mode", {})).data?.mode).toBe("plan");
    const write = await call("set_embargo", {
      siteId: s.site.id,
      nodeId: s.entry.id,
      from: plus(5 * HOUR),
      expectedRev: s.entry.rev,
    });
    expect(write.isError).toBe(true);
    // a key that itself works in EDITS never goes above it, whatever the cap
    await setCap("auto");
    const lower = await connect(s, runKey("edits"));
    expect((await lower.call("get_mode", {})).data?.mode).toBe("edits");

    // at run time (§10.6) an `auto` release of the run's key holds only while the cap is `auto`
    const check = createReleaseApprovalCheck({
      graph: s.store,
      store: s.schedules,
      ownership: PEOPLE_ONLY_OWNERSHIP,
      rights: {
        role: async () => "editor",
        key: async () => ({ mode: "auto", creatorRole: "editor" }),
      },
    });
    const autoRelease = {
      siteId: s.site.id,
      id: "rel_autorun0001",
      approval: {
        kind: "auto",
        by: agent,
        keyId: KEY,
        at: NOW.toISOString(),
        windowEnds: plus(HOUR),
      },
    } as unknown as Release;
    expect(await check(autoRelease, NOW)).toEqual({ ok: true });
    await setCap("edits");
    expect(await check(autoRelease, NOW)).toEqual({ ok: false, reason: "auto_window_ended" });
  });

  it("after a tainting tool the run may only read, label, hide and pause (D10)", async () => {
    const { call } = await connect(s, runKey("edits"));
    const run = await call("begin_run", { automationId });
    await call("top_content", { siteId: s.site.id });
    const article = await newArticle(s, "tainted");
    const r = await call("propose_release", { siteId: s.site.id, nodeIds: [article.id] });
    expect(r.text).toMatch(/^tainted: /);
    expect((await call("list_releases", { siteId: s.site.id })).isError).toBe(false);
    const stored = await s.schedules.getRun(s.site.id, run.data?.runId as string);
    expect(stored?.taint).toMatchObject({ tool: "top_content" });
    expect((await call("get_mode", {})).data?.run).toMatchObject({ tainted: true });
  });

  it("the budget ends the run and pauses the automation (D11)", async () => {
    const { call } = await connect(s, runKey("edits"));
    const run = await call("begin_run", { automationId });
    for (let i = 0; i < 6; i++) await call("list_releases", { siteId: s.site.id });
    const over = await call("list_releases", { siteId: s.site.id });
    expect(over.text).toMatch(/budget_exceeded/);
    expect((await s.schedules.getRun(s.site.id, run.data?.runId as string))?.state).toBe(
      "budget-exceeded",
    );
    expect(await s.schedules.getAutomation(s.site.id, automationId)).toMatchObject({
      state: "auto-paused",
      pausedReason: "budget",
    });
  });

  it("an automation's own key pauses it, in a run or not; only a person resumes", async () => {
    const { call } = await connect(s, runKey("plan"));
    const r = await call("pause_automation", { automationId, reason: "Something looks wrong" });
    expect(r.isError, r.text).toBe(false);
    expect(r.data?.automation).toMatchObject({ state: "paused", pausedReason: "agent" });
    expect((await call("begin_run", { automationId })).text).toMatch(/paused/);
  });

  it("untrusted-input automations lose write scopes on every call", async () => {
    const a = (await s.schedules.getAutomation(s.site.id, automationId)) as NonNullable<
      Awaited<ReturnType<typeof s.schedules.getAutomation>>
    >;
    if (a.job.kind !== "agent-task") throw new Error("agent task");
    await s.schedules.updateAutomation(s.site.id, a.id, {
      expectedRev: a.rev,
      job: { ...a.job, readsUntrustedText: true },
    });
    const { call } = await connect(s, runKey("edits"));
    await call("begin_run", { automationId });
    const mode = await call("get_mode", {});
    expect(mode.data?.scopes).not.toContain("schedules:write");
    expect(mode.data?.scopes).toContain("schedules:read");
  });
});
