/**
 * Shared API suite for RFC-0008 §10–§14 (schedules) — runs against SQLite and D1 like `testing.ts`:
 * people only and role gating through `ROUTE_SCOPES` (§10.2), `cache-control: no-store` on every
 * GET, releases scheduled with one's own approval or as a request, release requests carried out on
 * approval and bound to `rl1:` and the time (§10.4), denial back to a draft, D4 moves, D5 expiry,
 * "Publish now" through the injected executor, gates and the embargo override (D8), automations
 * people-only (D7) with their key, runs, the kill switch, `/api/scheduler`, `/api/instance`, the
 * operator routes, the notifications (§14) and the scheduler's run-time re-check (§10.6).
 */
import {
  ApprovalStore,
  AuditLog,
  PEOPLE_ONLY_OWNERSHIP,
  type Principal,
  type Role,
  roleScopes,
} from "@cloudhal/agent-runtime";
import type { Actor, ContentEntry, Release, Site } from "@cloudhal/core-contracts";
import { GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { SchedulerControl } from "@cloudhal/core-ts/releases";
import {
  createReleaseApprovalCheck,
  releaseService,
  requestRelease,
  type SchedulesDeps,
} from "@cloudhal/mcp-server/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { AgentKeyService, StaffService } from "./auth.ts";

export interface SchedulesApiFactory {
  create(): Promise<{ sql: SqlDriver }>;
  dispose?(): Promise<void>;
}

type Json = Record<string, unknown>;

const NOW = new Date("2026-10-12T10:00:00.000Z");
const plus = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const HOUR = 3_600_000;
const DEPLOY_TOKEN = "schedules-api-deploy-token-0123456789abcd";
const agent: Actor = { kind: "agent", id: "agent_desk000001", name: "Desk bot" };
const STAFF = {
  ownership: PEOPLE_ONLY_OWNERSHIP,
  store: { acceptedInvitesBy: async () => [], member: async () => undefined, list: async () => [] },
} as unknown as StaffService;

function person(role: Role): Principal {
  const id = `user_${role.padEnd(12, "0").slice(0, 12)}`;
  return {
    actor: { kind: "human", id, name: role },
    scopes: roleScopes(role),
    person: { id, userId: `u-${role}`, role, name: role },
  };
}

export function describeSchedulesApi(label: string, factory: SchedulesApiFactory): void {
  describe(`API schedules: ${label}`, () => {
    let sql: SqlDriver;
    let store: SiteGraphStore;
    let site: Site;
    let schedules: SqlScheduleStore;
    let approvals: ApprovalStore;
    let audit: AuditLog;
    let deps: SchedulesDeps;
    let pokes: string[];
    let minted: { name: string; scopes: string[]; automationId?: string }[];
    let ticks: number;
    let app: ReturnType<typeof createApi>;
    const clock = { now: NOW };

    const keys = {
      async create(input: { name: string; scopes?: string[]; automationId?: string }) {
        minted.push({
          name: input.name,
          scopes: input.scopes ?? [],
          ...(input.automationId ? { automationId: input.automationId } : {}),
        });
        return {
          id: `key_minted${minted.length}000`,
          key: "secret-shown-once",
          scopes: input.scopes ?? [],
        };
      },
      async list() {
        return [];
      },
      async delete() {
        return undefined;
      },
    } as unknown as AgentKeyService;

    const build = () => {
      deps = { store: schedules, maxNewBodies: Number.POSITIVE_INFINITY };
      const scheduler: SchedulerControl = {
        mode: "cron",
        poke: async (at) => {
          pokes.push(at);
        },
        async runDue() {
          ticks++;
          return { ran: 0, late: 0, failed: 0, more: false };
        },
      };
      app = createApi({
        store,
        now: () => clock.now,
        audit,
        schedules: deps,
        scheduler,
        agentKeys: keys,
        admin: { deployToken: DEPLOY_TOKEN, storage: { sql, blobs: new MemoryBlobStore() } },
        mcp: { stateKey: "schedules-api-state-key-0123456789abcdef", approvals, audit },
        staff: STAFF,
        resolvePrincipal: async (c) => {
          const who = c.req.header("x-test-user");
          if (!who) return undefined;
          if (who === "agent") return { actor: agent, scopes: ["schedules:read"] };
          return person(who as Role);
        },
      });
    };

    const call = async (
      path: string,
      who: string | null = "editor",
      init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) => {
      const res = await app.request(path, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(who ? { "x-test-user": who } : {}),
          ...(init.headers ?? {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await res.text();
      let body: Json;
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = { text };
      }
      return { status: res.status, body, text, headers: res.headers };
    };
    const S = () => `/api/sites/${site.id}`;
    const post = (path: string, body: unknown, who = "editor") =>
      call(path, who, { method: "POST", body });

    async function article(
      slug: string,
      author: Actor = person("author").actor,
    ): Promise<ContentEntry> {
      const first = (await store.listContentEntries(site.id)).find((e) => e.terms) as ContentEntry;
      return store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status: "published",
        title: `Article ${slug}`,
        body: { format: "markdown", value: "Body." },
        fields: {},
        tags: [],
        ...(first.terms ? { terms: first.terms } : {}),
        author,
        publishedAt: NOW.toISOString(),
      });
    }

    /** An agent's request for a release of `nodeIds`, as `schedule_release` files it. */
    async function agentRequest(nodeIds: string[], at = plus(3 * HOUR)) {
      const { release: draft } = await releaseService(deps, store, () => clock.now).create({
        siteId: site.id,
        set: nodeIds,
        createdBy: agent,
        title: "Agent's release",
      });
      const record = await schedules.getReleaseRecord(site.id, draft.id);
      if (!record) throw new Error("release");
      return requestRelease({
        deps,
        approvals,
        record,
        when: { kind: "at", at, timeZone: "UTC" },
        tool: "schedule_release",
        actor: agent,
        prompt: "Schedule it?",
        cause: "tool",
        mode: "edits",
        now: clock.now,
      });
    }

    beforeEach(async () => {
      ({ sql } = await factory.create());
      store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore(), gates: GATES_ENFORCED });
      await store.init();
      site = await seedStarterSite(store, { name: "Schedules API", slug: "schedules-api" });
      const snap = await store.createSnapshot(site.id, {
        actor: person("owner").actor,
        reason: "publish",
      });
      site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
      clock.now = NOW;
      schedules = new SqlScheduleStore(sql, { now: () => clock.now });
      approvals = new ApprovalStore(sql, { now: () => clock.now });
      audit = new AuditLog(sql);
      pokes = [];
      minted = [];
      ticks = 0;
      build();
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("is for people with the right roles; every GET answers no-store", async () => {
      expect((await call(`${S()}/releases`, null)).status).toBe(401);
      const a = await call(`${S()}/releases`, "agent");
      expect(a.status).toBe(403);
      expect(String(a.body.message)).toMatch(/MCP/);
      for (const role of ["contributor", "author", "editor", "administrator", "owner"])
        expect((await call(`${S()}/releases`, role)).status, role).toBe(200);
      // automations are people-only, Editors and above (D7)
      const builtin = {
        name: "Links",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: {
          start: "2026-10-12T11:07",
          rule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=11;BYMINUTE=7",
        },
      };
      expect((await post(`${S()}/automations`, builtin, "author")).body).toMatchObject({
        error: "missing_scope",
        details: { scope: "automations:manage" },
      });
      // the kill switch is site:settings (Administrators)
      expect(
        (
          await call(`${S()}/schedule-settings`, "editor", {
            method: "PUT",
            body: { paused: true, rev: 0 },
          })
        ).status,
      ).toBe(403);
      // no-store on schedule GETs and on other API GETs alike
      for (const path of [
        `${S()}/releases`,
        `${S()}/schedule?from=${NOW.toISOString()}&to=${plus(24 * HOUR)}`,
        `${S()}/automations`,
        `${S()}/schedule-settings`,
        "/api/scheduler",
        `${S()}`,
        "/api/instance",
      ]) {
        const r = await call(path);
        expect(r.status, path).toBe(200);
        expect(r.headers.get("cache-control"), path).toBe("no-store");
      }
    });

    it("an Editor schedules with their own approval, moves it keeping it (D4) and unschedules", async () => {
      const entry = await article("editor-scheduled");
      const created = await post(`${S()}/releases`, { nodeIds: [entry.id], title: "Monday" });
      expect(created.status).toBe(201);
      const release = created.body.release as Release;
      expect(release).toMatchObject({ state: "draft", createdBy: { kind: "human" } });
      const scheduled = await post(`${S()}/releases/${release.id}/schedule`, {
        when: { localTime: "2026-10-14T09:00", timeZone: "Europe/Istanbul" },
        rev: release.rev,
      });
      expect(scheduled.status, scheduled.text).toBe(200);
      expect(scheduled.body).toMatchObject({
        status: "scheduled",
        release: {
          state: "scheduled",
          when: { kind: "at", at: "2026-10-14T06:00:00.000Z", localTime: "2026-10-14T09:00" },
          approval: { kind: "person", by: { id: "user_editor000000" } },
        },
      });
      expect(pokes).toContain("2026-10-14T06:00:00.000Z");
      const s1 = scheduled.body.release as Release;
      const moved = await post(`${S()}/releases/${release.id}/reschedule`, {
        when: { at: plus(5 * HOUR) },
        rev: s1.rev,
      });
      expect(moved.body).toMatchObject({
        status: "scheduled",
        release: { state: "scheduled", approval: { kind: "person", executeAt: plus(5 * HOUR) } },
      });
      const [row] = await audit.list({ siteId: site.id, tool: "release.reschedule" });
      expect(row).toMatchObject({
        releaseId: release.id,
        input: { effect: { to: plus(5 * HOUR) } },
      });
      const view = await call(`${S()}/releases/${release.id}`);
      expect(view.body).toMatchObject({
        approvalState: "approved",
        executeAt: plus(5 * HOUR),
        view: {
          lockedNodes: [entry.id],
          items: [{ nodeId: entry.id, title: "Article editor-scheduled" }],
        },
      });
      const diff = await call(`${S()}/releases/${release.id}/diff`);
      expect(diff.body).toMatchObject({
        items: [{ nodeId: entry.id, base: null, target: { id: entry.id } }],
      });
      const un = await post(`${S()}/releases/${release.id}/unschedule`, {
        rev: (moved.body.release as Release).rev,
      });
      expect(un.body).toMatchObject({ status: "draft", release: { state: "draft" } });
      expect((await schedules.heldNodes(site.id)).size).toBe(0);
    });

    it("a Contributor's release is a request (cause role) an Editor carries out on approval", async () => {
      const filed = (await store.listContentEntries(site.id)).find((e) => e.terms);
      const own = await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "contributor-draft",
        locale: "en",
        status: "draft",
        title: "Contributor draft",
        body: { format: "markdown", value: "Body." },
        fields: {},
        tags: [],
        // Approving publishes the draft (RFC-0008 note 24), so it needs the site's primary term.
        ...(filed?.terms ? { terms: filed.terms } : {}),
        author: person("contributor").actor,
      });
      const created = await post(`${S()}/releases`, { nodeIds: [own.id] }, "contributor");
      expect(created.status, created.text).toBe(201);
      const release = created.body.release as Release;
      const asked = await post(
        `${S()}/releases/${release.id}/schedule`,
        { when: { at: plus(6 * HOUR) }, rev: release.rev },
        "contributor",
      );
      expect(asked.body).toMatchObject({ status: "approval-pending" });
      const approvalId = asked.body.approvalId as string;
      expect(await approvals.get(approvalId)).toMatchObject({
        cause: "role",
        releaseId: release.id,
      });
      // not someone else's article, Contributors
      const other = await article("someone-elses");
      expect(
        (await post(`${S()}/releases`, { nodeIds: [other.id] }, "contributor")).body,
      ).toMatchObject({
        error: "denied",
      });
      // nobody approves their own request; an Author cannot approve someone else's work
      expect((await post(`${S()}/approvals/${approvalId}/approve`, {}, "contributor")).status).toBe(
        403,
      );
      expect(
        (await post(`${S()}/approvals/${approvalId}/approve`, {}, "author")).body,
      ).toMatchObject({
        details: { code: "cannot_approve" },
      });
      const approved = await post(`${S()}/approvals/${approvalId}/approve`, {}, "editor");
      expect(approved.status, approved.text).toBe(200);
      expect(approved.body).toMatchObject({ status: "consumed" });
      expect(await schedules.getRelease(site.id, release.id)).toMatchObject({
        state: "scheduled",
        approval: {
          kind: "person",
          by: { id: "user_editor000000" },
          approvalId,
          executeAt: plus(6 * HOUR),
        },
      });
      // The Editor's approval published the Contributor's draft (held until the release runs).
      expect(await store.getContentEntry(own.id)).toMatchObject({ status: "published" });
    });

    it("an agent's request is carried out only for exactly what it asked (rl1: and time)", async () => {
      const entry = await article("agent-asked");
      const { release, request } = await agentRequest([entry.id]);
      expect(release.state).toBe("awaiting_approval");
      // the approvals list shows it decidable for an Editor
      const listed = await call(`${S()}/approvals?status=pending`);
      expect((listed.body.items as Json[]).find((x) => x.id === request.id)).toMatchObject({
        canDecide: true,
        releaseId: release.id,
      });
      const ok = await post(`${S()}/approvals/${request.id}/approve`, {});
      expect(ok.status, ok.text).toBe(200);
      expect(await schedules.getRelease(site.id, release.id)).toMatchObject({
        state: "scheduled",
        approval: { kind: "person", approvalId: request.id },
      });
      // the audit says who carried out whose request
      const rows = await audit.list({ siteId: site.id, tool: "schedule_release" });
      expect(rows.some((r) => String(r.reason).startsWith("carried out request"))).toBe(true);

      // a changed release voids the request: 409 state_changed, and it is closed
      const second = await article("agent-changed");
      const asked = await agentRequest([second.id]);
      // an agent's edit is refused while the release holds the node (§6.2, 409 scheduled_locked)
      await expect(
        store.updateContentEntry({ ...second, title: "Changed after asking" }),
      ).rejects.toMatchObject({ code: "scheduled_locked" });
      // a person's "edit and send for approval" re-pins it: a new rl1: hash
      await releaseService(deps, store, () => clock.now).editHeldEntry(site.id, asked.release.id, {
        ...second,
        title: "Changed after asking",
      });
      const stale = await post(`${S()}/approvals/${asked.request.id}/approve`, {});
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("state_changed");
      expect((await approvals.get(asked.request.id))?.status).toBe("denied");
    });

    it("denying returns the release to a draft; an unapproved release expires at its time (D5)", async () => {
      const entry = await article("deny-me");
      const { release, request } = await agentRequest([entry.id]);
      const denied = await post(`${S()}/approvals/${request.id}/deny`, {});
      expect(denied.status).toBe(200);
      expect((await schedules.getRelease(site.id, release.id))?.state).toBe("draft");

      const late = await article("expire-me");
      const asked = await agentRequest([late.id], plus(HOUR));
      clock.now = new Date(NOW.getTime() + 2 * HOUR);
      const list = await call(`${S()}/releases?state=expired`);
      expect((list.body.releases as Release[]).map((r) => r.id)).toContain(asked.release.id);
      expect((await approvals.get(asked.request.id))?.status).toBe("expired");
    });

    it("Publish now runs through ReleaseService.publishNow; rights apply", async () => {
      const entry = await article("publish-now", person("editor").actor);
      const created = (await post(`${S()}/releases`, { nodeIds: [entry.id] })).body
        .release as Release;
      const scheduled = (
        await post(`${S()}/releases/${created.id}/schedule`, {
          when: { at: plus(5 * HOUR) },
          rev: created.rev,
        })
      ).body.release as Release;
      expect(
        (
          await post(
            `${S()}/releases/${created.id}/publish-now`,
            { rev: scheduled.rev },
            "contributor",
          )
        ).status,
      ).toBe(403);
      // an Author approves own releases only: this one is someone else's article
      expect(
        (await post(`${S()}/releases/${created.id}/publish-now`, { rev: scheduled.rev }, "author"))
          .body,
      ).toMatchObject({
        error: "cannot_approve",
      });
      const now = await post(`${S()}/releases/${created.id}/publish-now`, { rev: scheduled.rev });
      expect(now.status, now.text).toBe(200);
      expect(now.body).toMatchObject({
        release: { state: "published", outcome: { kind: "published" } },
      });
      const live = (await store.getSite(site.id)) as Site;
      const snap = await store.getSnapshot(live.publishedSnapshotId as string);
      expect(snap?.reason).toBe("scheduled");
      expect(snap?.nodes.some((n) => n.id === entry.id)).toBe(true);
      const [row] = await audit.list({ siteId: site.id, tool: "release.publish-now" });
      expect(row).toMatchObject({ releaseId: created.id, runId: now.body.runId });
      const runs = await call(`${S()}/runs?releaseId=${created.id}`);
      expect((runs.body.runs as Json[])[0]).toMatchObject({
        state: "succeeded",
        trigger: "manual",
      });
      expect((await call(`${S()}/runs/${now.body.runId}`)).body).toMatchObject({
        run: { id: now.body.runId },
      });
    });

    it("gates: an embargo goes with the next publish or now; lifting is Editor+ with a reason (D8)", async () => {
      const live = (await store.listContentEntries(site.id))[0] as ContentEntry;
      const later = await post(`${S()}/gates`, {
        nodeId: live.id,
        from: plus(5 * HOUR),
        rev: live.rev,
      });
      expect(later.status, later.text).toBe(200);
      expect(later.body).toMatchObject({
        status: "set",
        node: { availability: { from: plus(5 * HOUR) } },
      });
      const current = (await store.getContentEntry(live.id)) as ContentEntry;
      const now = await post(`${S()}/gates`, {
        nodeId: live.id,
        from: plus(6 * HOUR),
        rev: current.rev,
        apply: "now",
      });
      expect(now.body).toMatchObject({
        status: "scheduled",
        release: {
          state: "scheduled",
          when: { kind: "on-approval" },
          approval: { kind: "person" },
        },
      });
      const noReason = await post(`${S()}/gates/${live.id}/lift`, {});
      expect(noReason.body.error).toBe("reason_required");
      expect(
        (await post(`${S()}/gates/${live.id}/lift`, { reason: "Press moved" }, "author")).status,
      ).toBe(403);
      // the release holds the node; lifting edits it, so unschedule first
      const held = now.body.release as Release;
      await post(`${S()}/releases/${held.id}/cancel`, { rev: held.rev });
      const lifted = await post(`${S()}/gates/${live.id}/lift`, { reason: "Press moved" });
      expect(lifted.status, lifted.text).toBe(200);
      expect(lifted.body).toMatchObject({ status: "lifted" });
      expect((await store.getContentEntry(live.id))?.availability).toBeUndefined();
      const [row] = await audit.list({ siteId: site.id, tool: "schedule.embargo.lift" });
      expect(row).toMatchObject({
        input: { reason: "Press moved", effect: { reason: "Press moved" } },
      });
    });

    it("automations: built-ins and agent tasks with their key; pause, resume, delete; preview", async () => {
      const builtin = await post(`${S()}/automations`, {
        name: "Links",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: {
          start: "2026-10-12T11:07",
          rule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=11;BYMINUTE=7",
        },
      });
      expect(builtin.status, builtin.text).toBe(201);
      const a = builtin.body.automation as { id: string; rev: number };
      const task = await post(`${S()}/automations`, {
        name: "Triage",
        job: {
          kind: "agent-task",
          instructions: "Label new comments.",
          modeCap: "edits",
          readsUntrustedText: true,
          windowMinutes: 30,
        },
        recurrence: { start: "2026-10-12T11:07", rule: "FREQ=DAILY;BYHOUR=11;BYMINUTE=7" },
      });
      expect(task.status, task.text).toBe(201);
      expect(task.body).toMatchObject({ key: { secret: "secret-shown-once" } });
      expect(minted[0]?.automationId).toBe((task.body.automation as { id: string }).id);
      // reading visitor text: no write scopes on the key
      expect(minted[0]?.scopes).not.toContain("content:write");
      expect(minted[0]?.scopes).not.toContain("schedules:write");
      const refused = await post(`${S()}/automations`, {
        name: "Bad",
        job: {
          kind: "agent-task",
          instructions: "x",
          modeCap: "edits",
          readsUntrustedText: true,
          scopes: ["content:write", "comments:read"],
        },
        recurrence: { start: "2026-10-12T11:07", rule: "FREQ=DAILY" },
      });
      expect(refused.body.error).toBe("untrusted_write_scopes");
      const paused = await post(`${S()}/automations/${a.id}/pause`, { rev: a.rev });
      expect(paused.body).toMatchObject({
        automation: { state: "paused", pausedReason: "person" },
      });
      const resumed = await post(`${S()}/automations/${a.id}/resume`, {
        rev: (paused.body.automation as { rev: number }).rev,
      });
      expect(resumed.body).toMatchObject({ automation: { state: "active" } });
      // "Run now" for a built-in: a manual run for this minute, stepped by the next tick (step 9)
      const sweep = await post(`${S()}/automations`, {
        name: "Feed check",
        job: { kind: "builtin", builtin: "feed-check" },
        recurrence: { start: "2026-10-12T11:07", rule: "FREQ=DAILY;BYHOUR=11;BYMINUTE=7" },
      });
      const sweepId = (sweep.body.automation as { id: string }).id;
      const manual = await post(`${S()}/automations/${sweepId}/run-now`, {});
      expect(manual.status, manual.text).toBe(200);
      const manualRun = await call(`${S()}/runs/${String(manual.body.runId)}`);
      expect(manualRun.body).toMatchObject({
        run: { state: "running", trigger: "manual", subject: { automationId: sweepId } },
      });
      expect((await post(`${S()}/automations/${sweepId}/run-now`, {})).status).toBe(409);
      const t = task.body.automation as { id: string };
      const run = await post(`${S()}/automations/${t.id}/run-now`, {});
      expect(run.status, run.text).toBe(200);
      expect(String(run.body.runId)).toMatch(/^run_/);
      const preview = await post(`${S()}/automations/preview-rule`, {
        start: "2026-10-12T09:07",
        timeZone: "Europe/Istanbul",
        rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      });
      expect(preview.status, preview.text).toBe(200);
      expect((preview.body.occurrences as unknown[]).length).toBe(5);
      expect(typeof preview.body.text).toBe("string");
      const del = await call(
        `${S()}/automations/${a.id}?rev=${(resumed.body.automation as { rev: number }).rev}`,
        "editor",
        {
          method: "DELETE",
        },
      );
      expect(del.status, del.text).toBe(200);
      expect((await call(`${S()}/automations/${a.id}`)).status).toBe(404);
    });

    it("the kill switch, /api/scheduler, /api/instance and the operator routes", async () => {
      const put = await call(`${S()}/schedule-settings`, "administrator", {
        method: "PUT",
        body: { paused: true, reason: "Incident", rev: 0 },
      });
      expect(put.status, put.text).toBe(200);
      expect(put.body).toMatchObject({ paused: true, pausedReason: "Incident", rev: 1 });
      expect((await call(`${S()}/schedule-settings`)).body).toMatchObject({
        paused: true,
        writesToday: 0,
      });
      const health = await call("/api/scheduler");
      expect(health.body).toMatchObject({ mode: "cron", healthy: false, state: "unknown" });
      await schedules.writeHeartbeat({
        at: NOW.toISOString(),
        trigger: "cron",
        nextWakeAt: plus(5 * 60_000),
        ran: 0,
        more: false,
      });
      expect((await call("/api/scheduler")).body).toMatchObject({
        healthy: true,
        state: "running",
      });
      expect((await call("/api/instance")).body).toMatchObject({
        features: {
          schedules: {
            available: true,
            scheduler: "cron",
            publishNow: true,
            limits: { maxItems: 100, horizonDays: 366, requestHorizonDays: 30, lateMinutes: 60 },
          },
        },
      });
      const auth = { authorization: `Bearer ${DEPLOY_TOKEN}` };
      expect((await call("/api/admin/schedules/status", null)).status).toBe(401);
      expect(
        (await call("/api/admin/schedules/status", null, { headers: auth })).body,
      ).toMatchObject({
        scheduler: { healthy: true, mode: "cron" },
      });
      const tick = await call("/api/admin/schedules/run-due", null, {
        method: "POST",
        body: {},
        headers: auth,
      });
      expect(tick.body).toMatchObject({ ran: 0, more: false });
      expect(ticks).toBe(1);
    });

    it("notifications: approval due, missed, conflict and stalled (§14)", async () => {
      const entry = await article("notify");
      const { release } = await agentRequest([entry.id], plus(30 * 60_000));
      const items = async (who: string) =>
        ((await call("/api/notifications", who)).body.items as { kind: string; id: string }[]).map(
          (n) => n.kind,
        );
      expect(await items("editor")).toContain("schedule-approval-due");
      expect(await items("contributor")).not.toContain("schedule-approval-due");

      const missed = await article("missed");
      const created = (await post(`${S()}/releases`, { nodeIds: [missed.id] })).body
        .release as Release;
      await post(`${S()}/releases/${created.id}/schedule`, {
        when: { at: plus(2 * HOUR) },
        rev: created.rev,
      });
      const rec = await schedules.getReleaseRecord(site.id, created.id);
      await schedules.settleRelease({
        siteId: site.id,
        releaseId: created.id,
        expectedRev: rec?.release.rev ?? 0,
        executeAt: plus(2 * HOUR),
        now: plus(4 * HOUR),
        outcome: { kind: "missed", at: plus(4 * HOUR), latenessSeconds: 7200 },
        trigger: "cron",
      });
      clock.now = new Date(NOW.getTime() + 4 * HOUR);
      const kinds = await items("editor");
      expect(kinds).toContain("schedule-missed");
      // the last tick was four hours ago: stalled, for Administrators (not for Contributors)
      await schedules.writeHeartbeat({
        at: NOW.toISOString(),
        trigger: "cron",
        nextWakeAt: plus(5 * 60_000),
        ran: 0,
        more: false,
      });
      expect(await items("contributor")).not.toContain("scheduler-stalled");
      expect(await items("administrator")).toContain("scheduler-stalled");
      void release;
    });

    it("the scheduler's re-check: a lost right expires, an approver who left too (§10.6)", async () => {
      const entry = await article("recheck");
      const created = (await post(`${S()}/releases`, { nodeIds: [entry.id] })).body
        .release as Release;
      const scheduled = (
        await post(`${S()}/releases/${created.id}/schedule`, {
          when: { at: plus(5 * HOUR) },
          rev: created.rev,
        })
      ).body.release as Release;
      const roles = new Map<string, Role>([["user_editor000000", "editor"]]);
      const check = createReleaseApprovalCheck({
        graph: store,
        store: schedules,
        ownership: PEOPLE_ONLY_OWNERSHIP,
        rights: {
          role: async (id) => roles.get(id),
          key: async () => undefined,
        },
      });
      expect(await check(scheduled, clock.now)).toEqual({ ok: true });
      roles.set("user_editor000000", "author");
      expect(await check(scheduled, clock.now)).toEqual({ ok: false, reason: "approval_lost" });
      roles.delete("user_editor000000");
      expect(await check(scheduled, clock.now)).toEqual({ ok: false, reason: "approval_lost" });
      const auto: Release = {
        ...scheduled,
        approval: {
          kind: "auto",
          by: agent,
          keyId: "key_gone00000",
          at: NOW.toISOString(),
          windowEnds: plus(HOUR),
        },
      };
      expect(await check(auto, clock.now)).toEqual({ ok: false, reason: "creator_removed" });
    });
  });
}
