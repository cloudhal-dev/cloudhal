/**
 * Schedules for people (RFC-0008 §13; agents use the MCP schedule tools). Mounted at
 * `/api/sites/:siteId` when the server has schedules; every route is declared in `ROUTE_SCOPES`,
 * handlers enforce "own" and the person-only rules, and every GET answers `cache-control: no-store`.
 *
 * - `GET  /schedule?from&to&types&states&origin&approval&collection&q&cursor` — calendar items.
 * - `GET|POST /releases`, `GET|PATCH /releases/:releaseId`, `GET /releases/:releaseId/diff`,
 *   `POST /releases/:releaseId/{items,schedule,reschedule,repin,unschedule,cancel,publish-now}`.
 *   Scheduling with one's own approval when the role allows it, else a request (cause `role`) that
 *   someone who may approve carries out in Approvals; "Publish now" through the injected
 *   `ReleaseExecutor` (503 without one).
 * - `POST /gates` (`from` embargo, `until` expiry; `apply`: `now` | `with-next-publish`),
 *   `POST /gates/:nodeId/lift` (D8: Editors and above, a reason, audited `schedule.embargo.lift`).
 * - `GET|POST /automations`, `GET|PATCH|DELETE /automations/:automationId`,
 *   `POST /automations/:automationId/{pause,resume,run-now}`, `POST /automations/preview-rule`.
 *   Agent tasks mint their key here (the secret is in the creation answer only).
 * - `GET /runs`, `GET /runs/:runId`; `GET|PUT /schedule-settings` (kill switch, daily cap).
 */
import {
  holds,
  narrow,
  type Principal,
  type Role,
  roleScopes,
  type Scope,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type {
  Automation,
  AutomationJob,
  ReleaseWhen,
  ScheduleRun,
  Site,
} from "@cloudhal/core-contracts";
import { type PersonApproval, schedulerHealthReport } from "@cloudhal/core-ts/releases";
import type { SchedulesDeps } from "@cloudhal/mcp-server/schedules";
import {
  type ApprovalState,
  approvalProblem,
  CALENDAR_MAX_DAYS,
  calendarItems,
  liveRefs,
  nodeVersion,
  notOwnRelease,
  personApproval,
  poke,
  releaseService,
  releaseView,
} from "@cloudhal/mcp-server/schedules";
import {
  DEFAULT_AGENT_BUDGET,
  describeRecurrence,
  forbiddenUntrustedScopes,
  newAutomationId,
  occurrences,
  type RecurrenceLocale,
  renderRecurrence,
  runWindow,
  ScheduleConflictError,
  ScheduleError,
  untrustedEffectiveScopes,
  validateRecurrence,
} from "@cloudhal/schedules";
import { type Context, Hono } from "hono";
import { agentIdForKey } from "../auth.ts";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { auditPerson, runAsPerson, schedulesOf } from "../schedules.ts";

type Json = Record<string, unknown>;

async function body(c: Context<Env>): Promise<Json> {
  const b = (await c.req.json().catch(() => undefined)) as unknown;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw badRequest("expected a JSON object");
  return b as Json;
}

function rev(b: Json): number {
  if (typeof b.rev !== "number" || !Number.isInteger(b.rev) || b.rev < 0)
    throw badRequest("rev (the rev you read) is required");
  return b.rev;
}

async function site(c: Context<Env>): Promise<Site> {
  const s = await c.get("store").getSite(param(c, "siteId"));
  if (!s) throw notFound("site not found");
  return s;
}

const now = (c: Context<Env>) => c.get("now")();
const principalOf = (c: Context<Env>) => c.get("principal") as Principal;

/** Schedule store errors as HTTP answers. */
async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ScheduleConflictError)
      throw apiError(409, "conflict", `${e.message}; read it again and send the current rev`, {
        kind: e.kind,
        id: e.id,
      });
    if (e instanceof ScheduleError)
      throw apiError(
        e.code === "not_found" ? 404 : e.code === "invalid_transition" ? 409 : 400,
        e.code,
        e.message,
      );
    throw e;
  }
}

/** `when` in REST bodies: `{ at }`, `{ localTime, timeZone? }` or `"on-approval"`. */
function whenArg(b: Json): unknown {
  const w = b.when;
  if (w === "on-approval") return w;
  if (w && typeof w === "object") return w;
  throw badRequest('when must be { at }, { localTime, timeZone? } or "on-approval"');
}

async function record(c: Context<Env>, siteId: string, releaseId: string) {
  const rec = await schedulesOf(c).store.getReleaseRecord(siteId, releaseId);
  if (!rec) throw notFound("release not found");
  return rec;
}

const LIST = /^[a-z_-]+(?:,[a-z_-]+)*$/;
function list(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  if (!LIST.test(value)) throw badRequest("lists are comma-separated words");
  return value.split(",");
}

/** The scopes an agent task's key gets (§11.2): within the owner's role, never write scopes when it reads untrusted text. */
function automationKeyScopes(
  role: Role | undefined,
  modeCap: string,
  untrusted: boolean,
  requested: unknown,
): Scope[] {
  const base = Array.isArray(requested)
    ? (requested as Scope[])
    : narrow(scopesForMode(modeCap as "plan"), role ? roleScopes(role) : ["*"]);
  if (untrusted) {
    const bad = forbiddenUntrustedScopes(base);
    if (Array.isArray(requested) && bad.length > 0)
      throw apiError(
        400,
        "untrusted_write_scopes",
        `an automation that reads visitor text cannot hold ${bad.join(", ")}`,
      );
    return untrustedEffectiveScopes(base) as Scope[];
  }
  return base;
}

function agentJob(b: Json, keyId: string): AutomationJob {
  const j = (b.job ?? {}) as Json;
  return {
    kind: "agent-task",
    keyId,
    instructions: String(j.instructions ?? ""),
    ...(typeof j.skill === "string" ? { skill: j.skill } : {}),
    modeCap: (j.modeCap ?? "edits") as "edits",
    readsUntrustedText: j.readsUntrustedText === true,
    windowMinutes: typeof j.windowMinutes === "number" ? j.windowMinutes : 30,
    budget: {
      ...DEFAULT_AGENT_BUDGET,
      ...((j.budget as Json | undefined) ?? {}),
    } as typeof DEFAULT_AGENT_BUDGET,
  };
}

/**
 * Own-limited people (Contributors, Authors: `schedules:write:own`) change only releases of their
 * own work (§10.1).
 */
async function assertOwnRelease(
  c: Context<Env>,
  rec: { items: Parameters<typeof notOwnRelease>[3] },
): Promise<void> {
  const p = principalOf(c);
  if (holds(p.scopes, "schedules:write")) return;
  const why = await notOwnRelease(
    c.get("store"),
    c.get("ownership"),
    p.person?.id ?? p.actor.id,
    rec.items,
  );
  if (why)
    throw apiError(403, "not_own", `your role changes only releases of your own work, but ${why}`);
}

/** Automations are managed by anyone with `automations:manage` (Editors and above, §10.2). */
async function automation(c: Context<Env>, siteId: string): Promise<Automation> {
  const a = await schedulesOf(c).store.getAutomation(siteId, param(c, "automationId"));
  if (!a) throw notFound("automation not found");
  return a;
}

export const scheduleRoutes: Hono<Env> = new Hono<Env>()

  // ───────────────────────────── the calendar ─────────────────────────────
  .get("/schedule", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!from || !to || !(Date.parse(to) > Date.parse(from)))
      throw badRequest("from and to (instants, to after from) are required");
    if (Date.parse(to) - Date.parse(from) > CALENDAR_MAX_DAYS * 86_400_000)
      throw badRequest(`at most ${CALENDAR_MAX_DAYS} days per request`);
    await deps.store.expireOverdueApprovals(s.id, now(c).toISOString());
    const q = (name: string) => c.req.query(name);
    const origin = q("origin");
    const approval = q("approval");
    const cursor = q("cursor");
    const types = list(q("types"));
    const states = list(q("states"));
    const collection = q("collection");
    const text = q("q");
    const page = await calendarItems(deps, c.get("store"), s.id, {
      from,
      to,
      ...(types ? { types: types as ("release" | "gate" | "automation")[] } : {}),
      ...(states ? { states } : {}),
      ...(origin === "person" || origin === "agent" ? { origin } : {}),
      ...(approval ? { approval: approval as ApprovalState } : {}),
      ...(collection ? { collection } : {}),
      ...(text ? { q: text } : {}),
      ...(cursor && /^[0-9]{1,6}$/.test(cursor) ? { offset: Number(cursor) } : {}),
    });
    return c.json({ ...page, timeZone: s.timeZone ?? "UTC" });
  })

  // ───────────────────────────── releases ─────────────────────────────
  .get("/releases", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    await deps.store.expireOverdueApprovals(s.id, now(c).toISOString());
    const states = list(c.req.query("state"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const releases = await deps.store.listReleases(s.id, {
      ...(states ? { states: states as never } : {}),
      limit,
    });
    return c.json({ releases });
  })
  .post("/releases", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const when = b.when as Json | undefined;
    const out = await runAsPerson(
      c,
      "propose_release",
      {
        siteId: s.id,
        ...(Array.isArray(b.nodeIds) ? { nodeIds: b.nodeIds } : {}),
        ...(Array.isArray(b.removeIds) ? { removeIds: b.removeIds } : {}),
        ...(typeof b.title === "string" ? { title: b.title } : {}),
        ...(when && typeof when.at === "string" ? { at: when.at } : {}),
        ...(when && typeof when.localTime === "string" ? { localTime: when.localTime } : {}),
        ...(when && typeof when.timeZone === "string" ? { timeZone: when.timeZone } : {}),
      },
      "release.create",
    );
    return c.json(out, 201);
  })
  .get("/releases/:releaseId", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    await deps.store.expireOverdueApprovals(s.id, now(c).toISOString());
    const rec = await record(c, s.id, param(c, "releaseId"));
    return c.json(await releaseView(deps, c.get("store"), rec, c.get("approvals")));
  })
  .get("/releases/:releaseId/diff", async (c) => {
    const s = await site(c);
    const rec = await record(c, s.id, param(c, "releaseId"));
    const graph = c.get("store");
    const live = new Map((await liveRefs(graph, s)).map((r) => [r.id, r]));
    const items = [];
    for (const p of rec.items) {
      const i = p.item;
      const ref = (v: { rev: number; hash: string } | undefined) =>
        v
          ? nodeVersion(graph, { id: i.nodeId, kind: i.nodeKind, ...v })
          : Promise.resolve(undefined);
      const now_ = live.get(i.nodeId);
      const changed = (now_?.hash ?? null) !== (i.base?.hash ?? null);
      items.push({
        nodeId: i.nodeId,
        nodeKind: i.nodeKind,
        kind: i.kind,
        base: (await ref(i.base)) ?? null,
        target: i.kind === "set" ? ((await ref(i.target)) ?? null) : null,
        // after a conflict: what is live now (three-way, §6.4)
        ...(changed
          ? { live: (await ref(now_ ? { rev: now_.rev, hash: now_.hash } : undefined)) ?? null }
          : {}),
      });
    }
    return c.json({ releaseId: rec.release.id, state: rec.release.state, items });
  })
  .patch("/releases/:releaseId", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    let rec = await record(c, s.id, param(c, "releaseId"));
    let expected = rev(b);
    await assertOwnRelease(c, rec);
    if (Array.isArray(b.nodeIds) || Array.isArray(b.removeIds)) {
      if (rec.release.state !== "draft")
        throw apiError(409, "invalid_transition", "items change while the release is a draft");
      // The items become exactly these (current versions), through ReleaseService.repin.
      const pinned = await guard(() =>
        releaseService(deps, c.get("store"), c.get("now")).repin(s.id, rec.release.id, {
          expectedRev: expected,
          drop: rec.release.items.map((i) => i.nodeId),
          add: {
            set: (b.nodeIds as string[] | undefined) ?? [],
            remove: (b.removeIds as string[] | undefined) ?? [],
          },
        }),
      );
      expected = pinned.release.rev;
      rec = await record(c, s.id, rec.release.id);
    }
    if ("title" in b) {
      const title = typeof b.title === "string" && b.title.trim() ? b.title : null;
      await guard(() =>
        deps.store.retitleRelease(s.id, rec.release.id, { expectedRev: expected, title }),
      );
    }
    await auditPerson(
      c,
      "release.update",
      { releaseId: rec.release.id, title: b.title ?? null },
      { siteId: s.id, releaseId: rec.release.id },
    );
    return c.json(await releaseView(deps, c.get("store"), await record(c, s.id, rec.release.id)));
  })
  .post("/releases/:releaseId/items", async (c) => {
    // Adds items in chunks (§6.1 step 4: at most 20 new versions per call on Workers Free).
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    const rec = await record(c, s.id, param(c, "releaseId"));
    await assertOwnRelease(c, rec);
    if (rec.release.state !== "draft")
      throw apiError(409, "invalid_transition", "items are added while the release is a draft");
    const add = (b.nodeIds as string[] | undefined) ?? [];
    const remove = (b.removeIds as string[] | undefined) ?? [];
    if (add.length + remove.length === 0)
      throw badRequest("name nodes to add (nodeIds, removeIds)");
    const pinned = await guard(() =>
      releaseService(deps, c.get("store"), c.get("now")).addItems(s.id, rec.release.id, {
        expectedRev: rev(b),
        set: add,
        remove,
      }),
    );
    await auditPerson(
      c,
      "release.items",
      { add, remove },
      { siteId: s.id, releaseId: rec.release.id },
    );
    return c.json({
      release: await releaseView(deps, c.get("store"), await record(c, s.id, rec.release.id)),
      closureAdded: pinned.closureAdded,
    });
  })
  .post("/releases/:releaseId/schedule", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const out = await runAsPerson(
      c,
      "schedule_release",
      { siteId: s.id, releaseId: param(c, "releaseId"), when: whenArg(b), expectedRev: rev(b) },
      "release.schedule",
    );
    return c.json(out);
  })
  .post("/releases/:releaseId/reschedule", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const out = await runAsPerson(
      c,
      "reschedule",
      { siteId: s.id, releaseId: param(c, "releaseId"), when: whenArg(b), expectedRev: rev(b) },
      "release.reschedule",
    );
    return c.json(out);
  })
  .post("/releases/:releaseId/repin", async (c) => {
    // "Re-pin" (§6.4) and "Edit and re-approve" (§6.2): the current versions of the same nodes,
    // a new rl1: hash; the approval is voided unless the caller approves it again here.
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    const rec = await record(c, s.id, param(c, "releaseId"));
    await assertOwnRelease(c, rec);
    if (!["draft", "conflict", "awaiting_approval", "scheduled"].includes(rec.release.state))
      throw apiError(
        409,
        "invalid_transition",
        `a ${rec.release.state} release cannot be re-pinned`,
      );
    const p = principalOf(c);
    const mayApprove =
      b.approve === true &&
      (await approvalProblem(c.get("store"), c.get("ownership"), p, rec.items)) === undefined;
    await c.get("approvals")?.closeForRelease(s.id, rec.release.id, p.actor, "re-pinned");
    const at = now(c).toISOString();
    const approval = personApproval(p, at) as PersonApproval;
    const pinned = await guard(() =>
      releaseService(deps, c.get("store"), c.get("now")).repin(s.id, rec.release.id, {
        expectedRev: rev(b),
        ...(mayApprove ? { approval } : {}),
      }),
    );
    const repinned = pinned.release;
    await auditPerson(
      c,
      "release.repin",
      { releaseId: repinned.id, hash: repinned.hash, approved: repinned.state === "scheduled" },
      { siteId: s.id, releaseId: repinned.id },
    );
    // Still waiting: ask someone who may approve it (or schedule it, when the caller may).
    const when = rec.release.when;
    if (
      when &&
      (repinned.state === "awaiting_approval" || (b.approve === true && repinned.state === "draft"))
    ) {
      const out = await runAsPerson(
        c,
        "schedule_release",
        { siteId: s.id, releaseId: repinned.id, when: whenOf(when), expectedRev: repinned.rev },
        "release.schedule",
      );
      return c.json(out);
    }
    return c.json({ release: repinned, status: repinned.state });
  })
  .post("/releases/:releaseId/unschedule", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    const rec = await record(c, s.id, param(c, "releaseId"));
    if (rec.release.state !== "awaiting_approval" && rec.release.state !== "scheduled")
      throw apiError(409, "invalid_transition", `a ${rec.release.state} release is not scheduled`);
    await assertOwnRelease(c, rec);
    const draft = await guard(() =>
      releaseService(deps, c.get("store"), c.get("now")).unschedule(s.id, rec.release.id, {
        expectedRev: rev(b),
      }),
    );
    await c
      .get("approvals")
      ?.closeForRelease(s.id, draft.id, c.get("actor") as never, "unscheduled");
    await auditPerson(
      c,
      "release.unschedule",
      { releaseId: draft.id },
      { siteId: s.id, releaseId: draft.id },
    );
    return c.json({ release: draft, status: "draft" });
  })
  .post("/releases/:releaseId/cancel", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const out = await runAsPerson(
      c,
      "cancel_schedule",
      { siteId: s.id, releaseId: param(c, "releaseId"), expectedRev: rev(b) },
      "release.cancel",
    );
    return c.json(out);
  })
  .post("/releases/:releaseId/publish-now", async (c) => {
    // A manual run now (missed, expired or scheduled) through ReleaseService.publishNow: the
    // conflict check and the person's rights apply; the snapshot records the real time (§8.6).
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    const rec = await record(c, s.id, param(c, "releaseId"));
    if (!["scheduled", "missed", "expired"].includes(rec.release.state))
      throw apiError(
        409,
        "invalid_transition",
        `a ${rec.release.state} release cannot be published now`,
      );
    const p = principalOf(c);
    const problem = await approvalProblem(c.get("store"), c.get("ownership"), p, rec.items);
    if (problem) throw apiError(403, "cannot_approve", problem);
    const by = (personApproval(p, now(c).toISOString()) as PersonApproval).by;
    const result = await guard(() =>
      releaseService(deps, c.get("store"), c.get("now")).publishNow(s.id, rec.release.id, {
        expectedRev: rev(b),
        by,
      }),
    );
    await c.get("approvals")?.closeForRelease(s.id, rec.release.id, p.actor, "published now");
    const outcome = result.release.outcome;
    const runId = outcome && "runId" in outcome ? outcome.runId : undefined;
    await auditPerson(
      c,
      "release.publish-now",
      { releaseId: rec.release.id, state: result.release.state },
      { siteId: s.id, releaseId: rec.release.id, ...(runId ? { runId } : {}) },
    );
    return c.json({ release: result.release, report: result.report, ...(runId ? { runId } : {}) });
  })

  // ───────────────────────────── gates ─────────────────────────────
  .post("/gates", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const nodeId = b.nodeId;
    if (typeof nodeId !== "string") throw badRequest("nodeId is required");
    const apply = b.apply === "now" ? "now" : "with-next-publish";
    const node =
      (await c.get("store").getContentEntry(nodeId)) ?? (await c.get("store").getPage(nodeId));
    if (!node || node.siteId !== s.id) throw notFound("no article or page with that id");
    const expectedRev = typeof b.rev === "number" ? b.rev : node.rev;
    if (typeof b.from === "string" && b.until === undefined) {
      const out = await runAsPerson(
        c,
        "set_embargo",
        { siteId: s.id, nodeId, from: b.from, expectedRev, apply },
        "schedule.gate",
      );
      return c.json(out);
    }
    if (typeof b.until === "string" && b.from === undefined) {
      const out = await runAsPerson(
        c,
        "schedule_unpublish",
        {
          siteId: s.id,
          nodeId,
          at: b.until,
          until: new Date(b.until).toISOString(),
          expectedRev,
          apply,
        },
        "schedule.gate",
      );
      return c.json(out);
    }
    throw badRequest(
      "send one gate: from (an embargo) or until (an expiry); lifting an embargo is POST …/gates/:nodeId/lift",
    );
  })
  .post("/gates/:nodeId/lift", async (c) => {
    const s = await site(c);
    const b = await body(c);
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (reason.length < 3)
      throw apiError(400, "reason_required", "lifting an embargo needs a reason");
    const p = principalOf(c);
    // D8: Editors and above (schedules:write and releases:publish), a person, in every mode.
    if (!holds(p.scopes, "schedules:write") || !holds(p.scopes, "releases:publish"))
      throw apiError(403, "missing_scope", "lifting an embargo is for Editors and above");
    const nodeId = param(c, "nodeId");
    const node =
      (await c.get("store").getContentEntry(nodeId)) ?? (await c.get("store").getPage(nodeId));
    if (!node || node.siteId !== s.id) throw notFound("no article or page with that id");
    const out = await runAsPerson(
      c,
      "lift_embargo",
      {
        siteId: s.id,
        nodeId,
        reason,
        expectedRev: typeof b.rev === "number" ? b.rev : node.rev,
        ...(typeof b.from === "string" ? { from: b.from } : {}),
      },
      "schedule.embargo.lift",
    );
    return c.json(out);
  })

  // ───────────────────────────── automations ─────────────────────────────
  .get("/automations", async (c) => {
    const s = await site(c);
    return c.json({ automations: await schedulesOf(c).store.listAutomations(s.id) });
  })
  .post("/automations/preview-rule", async (c) => {
    const b = await body(c);
    const s = await site(c);
    const input = {
      start: String(b.start ?? ""),
      timeZone: typeof b.timeZone === "string" ? b.timeZone : (s.timeZone ?? "UTC"),
      ...(typeof b.rule === "string" ? { rule: b.rule } : {}),
    };
    return guard(async () => {
      validateRecurrence(input, { minIntervalMinutes: 60 });
      const next = occurrences(input, { after: now(c), limit: 5 });
      const locale: RecurrenceLocale = b.locale === "tr" ? "tr" : "en";
      const sentence = describeRecurrence(input);
      return c.json({
        occurrences: next,
        dstAdjusted: next.filter((o) => o.adjusted).map((o) => o.at),
        sentence,
        text: renderRecurrence(sentence, locale),
      });
    });
  })
  .post("/automations", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const b = await body(c);
    const p = principalOf(c);
    const person = p.person;
    const owner = { id: person?.id ?? p.actor.id, ...(person?.name ? { name: person.name } : {}) };
    if (!/^user_[A-Za-z0-9]{6,32}$/.test(owner.id))
      throw apiError(403, "person_only", "automations are created by people");
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw badRequest("name is required");
    const r = (b.recurrence ?? {}) as Json;
    const recurrence = {
      start: String(r.start ?? ""),
      timeZone: typeof r.timeZone === "string" ? r.timeZone : (s.timeZone ?? "UTC"),
      ...(typeof r.rule === "string" ? { rule: r.rule } : {}),
      ...(typeof r.preset === "string" ? { preset: r.preset as never } : {}),
    };
    const job = (b.job ?? {}) as Json;
    if (job.kind === "builtin") {
      const created = await guard(() =>
        deps.store.createAutomation({
          siteId: s.id,
          name,
          job: {
            kind: "builtin",
            builtin: job.builtin as never,
            ...(typeof job.staleAfterDays === "number"
              ? { staleAfterDays: job.staleAfterDays }
              : {}),
          },
          recurrence,
          owner,
        }),
      );
      await auditPerson(
        c,
        "automation.create",
        { name, job: created.job },
        { siteId: s.id, automationId: created.id },
      );
      poke(deps, created.nextRunAt);
      return c.json({ automation: created }, 201);
    }
    if (job.kind !== "agent-task") throw badRequest("job.kind is builtin or agent-task");
    const keys = c.get("agentKeys");
    if (!keys) throw apiError(409, "agent_keys_unavailable", "this server cannot mint agent keys");
    const modeCap = typeof job.modeCap === "string" ? job.modeCap : "edits";
    if (!["plan", "manual", "edits", "auto"].includes(modeCap))
      throw badRequest("modeCap is plan, manual, edits or auto (never bypass)");
    const scopes = automationKeyScopes(
      person?.role,
      modeCap,
      job.readsUntrustedText === true,
      job.scopes,
    );
    const id = newAutomationId();
    const key = await keys.create({
      headers: c.req.raw.headers,
      name: `Automation: ${name}`.slice(0, 100),
      mode: modeCap as "edits",
      scopes,
      automationId: id,
    });
    try {
      const created = await guard(() =>
        deps.store.createAutomation({
          id,
          siteId: s.id,
          name,
          job: agentJob(b, key.id),
          recurrence,
          owner,
        }),
      );
      await auditPerson(
        c,
        "automation.create",
        { name, keyId: key.id, scopes, modeCap },
        {
          siteId: s.id,
          automationId: id,
        },
      );
      poke(deps, created.nextRunAt);
      return c.json(
        { automation: created, key: { id: key.id, secret: key.key, scopes: key.scopes } },
        201,
      );
    } catch (e) {
      await keys.delete({ headers: c.req.raw.headers, id: key.id }).catch(() => undefined);
      throw e;
    }
  })
  .get("/automations/:automationId", async (c) => {
    const s = await site(c);
    const a = await automation(c, s.id);
    const runs = await schedulesOf(c).store.listRuns(s.id, { subjectId: a.id, limit: 10 });
    return c.json({ automation: a, runs });
  })
  .patch("/automations/:automationId", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const a = await automation(c, s.id);
    const b = await body(c);
    const j = (b.job ?? undefined) as Json | undefined;
    let job: AutomationJob | undefined;
    if (j && a.job.kind === "agent-task") {
      const next = { ...a.job, ...j, kind: "agent-task", keyId: a.job.keyId } as AutomationJob;
      if (next.kind === "agent-task" && next.readsUntrustedText && !a.job.readsUntrustedText)
        throw apiError(
          400,
          "untrusted_write_scopes",
          "an automation that starts reading visitor text needs a new key without write scopes; create a new automation",
        );
      job = next;
    } else if (j && a.job.kind === "builtin")
      job = { ...a.job, ...j, kind: "builtin" } as AutomationJob;
    const r = b.recurrence as Json | undefined;
    const updated = await guard(() =>
      deps.store.updateAutomation(s.id, a.id, {
        expectedRev: rev(b),
        ...(typeof b.name === "string" ? { name: b.name.trim() } : {}),
        ...(job ? { job } : {}),
        ...(r
          ? {
              recurrence: {
                start: String(r.start ?? a.recurrence.start),
                timeZone: typeof r.timeZone === "string" ? r.timeZone : a.recurrence.timeZone,
                ...(typeof r.rule === "string" ? { rule: r.rule } : {}),
                ...(typeof r.preset === "string" ? { preset: r.preset as never } : {}),
              },
            }
          : {}),
      }),
    );
    await auditPerson(
      c,
      "automation.update",
      { name: b.name ?? null, job: j ?? null, recurrence: r ?? null },
      {
        siteId: s.id,
        automationId: a.id,
      },
    );
    return c.json({ automation: updated });
  })
  .post("/automations/:automationId/pause", async (c) => {
    const s = await site(c);
    const a = await automation(c, s.id);
    const b = await body(c);
    const paused = await guard(() =>
      schedulesOf(c).store.transitionAutomation(s.id, a.id, {
        expectedRev: rev(b),
        to: "paused",
        pausedReason: "person",
      }),
    );
    await auditPerson(
      c,
      "automation.pause",
      { reason: b.reason ?? null },
      { siteId: s.id, automationId: a.id },
    );
    return c.json({ automation: paused });
  })
  .post("/automations/:automationId/resume", async (c) => {
    // D7: only a person resumes (agents may pause their own; nobody resumes over MCP).
    const deps = schedulesOf(c);
    const s = await site(c);
    const a = await automation(c, s.id);
    const b = await body(c);
    const resumed = await guard(() =>
      deps.store.transitionAutomation(s.id, a.id, { expectedRev: rev(b), to: "active" }),
    );
    poke(deps, resumed.nextRunAt);
    await auditPerson(c, "automation.resume", {}, { siteId: s.id, automationId: a.id });
    return c.json({ automation: resumed });
  })
  .post("/automations/:automationId/run-now", async (c) => {
    // Built-ins: due now (the next tick runs them); agent tasks: a window opens now.
    const deps = schedulesOf(c);
    const s = await site(c);
    const a = await automation(c, s.id);
    if (a.state !== "active")
      throw apiError(409, "invalid_transition", `the automation is ${a.state}`);
    const at = now(c);
    if (a.job.kind === "agent-task") {
      const window = runWindow(
        new Date(Math.floor(at.getTime() / 60_000) * 60_000),
        a.job.windowMinutes,
      );
      const runId = await deps.store.openManualWindow({
        automation: a,
        now: at.toISOString(),
        window,
      });
      if (!runId) throw apiError(409, "conflict", "a run for this minute already exists");
      poke(deps, window.opensAt);
      await auditPerson(
        c,
        "automation.run-now",
        { window },
        { siteId: s.id, automationId: a.id, runId },
      );
      return c.json({ runId, window });
    }
    // Built-ins (rollout step 9): a run for this minute that the next tick steps in bounded
    // steps; afterwards the automation returns to its scheduled next run.
    const runId = await deps.store.startBuiltinNow({ automation: a, now: at.toISOString() });
    if (!runId)
      throw apiError(
        409,
        "conflict",
        "a run of this automation is in progress or already ran this minute",
      );
    poke(deps, at.toISOString());
    await auditPerson(c, "automation.run-now", {}, { siteId: s.id, automationId: a.id, runId });
    return c.json({ runId });
  })
  .delete("/automations/:automationId", async (c) => {
    const deps = schedulesOf(c);
    const s = await site(c);
    const a = await automation(c, s.id);
    const expected = Number(c.req.query("rev"));
    if (!Number.isInteger(expected)) throw badRequest("?rev= (the rev you read) is required");
    await guard(() => deps.store.deleteAutomation(s.id, a.id, expected));
    // §11.8: its waiting requests are denied and its key revoked (when the caller may revoke it).
    if (a.job.kind === "agent-task") {
      const keys = c.get("agentKeys");
      await keys?.delete({ headers: c.req.raw.headers, id: a.job.keyId }).catch(() => undefined);
      const approvals = c.get("approvals");
      if (approvals)
        await approvals.denyPending(
          [agentIdForKey(a.job.keyId)],
          c.get("actor") as never,
          "automation deleted",
        );
    }
    await auditPerson(
      c,
      "automation.delete",
      { name: a.name },
      { siteId: s.id, automationId: a.id },
    );
    return c.json({ deleted: a.id });
  })

  // ───────────────────────────── runs ─────────────────────────────
  .get("/runs", async (c) => {
    const s = await site(c);
    const states = list(c.req.query("state"));
    const subject = c.req.query("automationId") ?? c.req.query("releaseId");
    const before = c.req.query("before");
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const runs = await schedulesOf(c).store.listRuns(s.id, {
      ...(subject ? { subjectId: subject } : {}),
      ...(states ? { states: states as ScheduleRun["state"][] } : {}),
      ...(before ? { before } : {}),
      limit,
    });
    const last = runs[runs.length - 1];
    return c.json({
      runs,
      ...(runs.length === limit && last ? { nextCursor: last.createdAt } : {}),
    });
  })
  .get("/runs/:runId", async (c) => {
    const s = await site(c);
    const deps = schedulesOf(c);
    const run = await deps.store.getRun(s.id, param(c, "runId"));
    if (!run) throw notFound("run not found");
    const rows = (await c.get("audit")?.list({ siteId: s.id, runId: run.id, limit: 500 })) ?? [];
    return c.json({
      run,
      findings: await deps.store.runFindings(s.id, run.id),
      auditRowIds: rows.map((r) => r.id),
      snapshots: [...new Set(rows.map((r) => r.snapshotId).filter((x): x is string => !!x))],
    });
  })

  // ───────────────────────────── settings ─────────────────────────────
  .get("/schedule-settings", async (c) => {
    const s = await site(c);
    const deps = schedulesOf(c);
    const settings = await deps.store.settings(s.id);
    const writesToday = await deps.store.automationWritesToday(s.id, now(c).toISOString());
    return c.json({ ...settings, writesToday });
  })
  .put("/schedule-settings", async (c) => {
    const s = await site(c);
    const deps = schedulesOf(c);
    const b = await body(c);
    const actor = c.get("actor") as NonNullable<Env["Variables"]["actor"]>;
    const next = await guard(() =>
      deps.store.putSettings(
        s.id,
        {
          ...(typeof b.paused === "boolean" ? { paused: b.paused } : {}),
          ...(typeof b.reason === "string" ? { reason: b.reason } : {}),
          ...(typeof b.dailyWriteCap === "number" ? { dailyWriteCap: b.dailyWriteCap } : {}),
        },
        { expectedRev: rev(b), by: actor },
      ),
    );
    await auditPerson(
      c,
      "schedule.settings",
      { paused: next.paused, dailyWriteCap: next.dailyWriteCap, reason: b.reason ?? null },
      { siteId: s.id },
    );
    if (!next.paused) poke(deps, now(c).toISOString());
    return c.json(next);
  });

/** The scheduler as people see it (§8.7, §13 `GET /api/scheduler`): health, mode and 7-day lag. */
export async function schedulerStatus(c: Context<Env>, deps: SchedulesDeps, at: Date) {
  const report = await schedulerHealthReport(c.get("store").sql, {
    now: at,
    mode: deps.scheduler?.mode ?? "request",
  });
  const day = 86_400_000;
  const lateness = await deps.store.releaseLateness(new Date(at.getTime() - 7 * day).toISOString());
  const pct = (q: number) =>
    lateness.length > 0
      ? (lateness[Math.min(lateness.length - 1, Math.ceil(q * lateness.length) - 1)] ?? null)
      : null;
  return {
    ...report,
    mode: deps.scheduler?.mode ?? null,
    automations: deps.automationsEnabled !== false,
    lag: { p50: pct(0.5), p95: pct(0.95), runs: lateness.length },
  };
}

/** `GET /api/scheduler` (signed-in): is scheduled work running? */
export const schedulerRoute: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  c.header("cache-control", "no-store");
  return c.json(await schedulerStatus(c, schedulesOf(c), now(c)));
});

/** `when` as the tools take it, from a stored `ReleaseWhen`. */
function whenOf(when: ReleaseWhen): unknown {
  if (when.kind === "on-approval") return "on-approval";
  return when.localTime
    ? { localTime: when.localTime, timeZone: when.timeZone }
    : { at: when.at, timeZone: when.timeZone };
}
