/**
 * `/api/notifications` — what needs the signed-in owner's attention across sites, worked out from
 * the current state on every request (nothing is stored, nothing has to run on a schedule):
 *
 * - `elevation-ending`: one of their keys' time-boxed elevations ends within
 *   `ELEVATION_NOTICE_MINUTES` (ADR-0016) — extend it or let it end;
 * - `elevation-request`: an agent asks for an elevation and waits in a site's Approvals;
 * - `member-joined`: someone they invited accepted (RFC-0005 §7);
 * - `role-changed`: someone changed their role (RFC-0005 open question 4);
 * - reader comments (RFC-0007 §13): `comments-pending` (a digest per site: how many wait, the
 *   oldest; Authors count their own entries), `comments-reported` (open reports), `comments-paused`
 *   (the daily cap was reached), `comments-purge-waiting` (a takedown has waited over 2 minutes for
 *   the live page) and `comments-approval` (an agent's comment request this person can decide).
 * - schedules (RFC-0008 §14): `schedule-approval-due` (a release awaiting approval runs within 60
 *   minutes; for people who may decide it), `schedule-upcoming` (within 15 minutes) and
 *   `schedule-published` (the last 24 hours) for its creator and approver; `schedule-conflict`,
 *   `schedule-missed`, `schedule-expired` and `schedule-failed` (the last 7 days) for them and for
 *   Editors; `scheduler-stalled` for Administrators and anyone with a release due within 24 hours;
 *   `automation-paused`, `automation-failed` and `automation-digest` for an automation's owner.
 *
 * People only. Each item has a stable `id`, so a client can remember what it already showed.
 */
import {
  type AgentMode,
  ELEVATION_NOTICE_MINUTES,
  endsSoon,
  holds,
  isRole,
  minutesLeft,
  ownsEntry,
  type Role,
  type Scope,
} from "@cloudhal/agent-runtime";
import { PURGE_LIMITS, utcDay, utcDayStart } from "@cloudhal/comments";
import type { Actor, Site } from "@cloudhal/core-contracts";
import { commentsAvailable } from "@cloudhal/mcp-server/comments";
import { approvalProblem, executeAtOf, schedulesAvailable } from "@cloudhal/mcp-server/schedules";
import { schedulerHealth } from "@cloudhal/schedules";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { unauthorized } from "../errors.ts";
import { canDecide } from "./approvals.ts";

/** Tools whose approval requests show up as `comments-approval`. */
const COMMENT_REQUEST_TOOLS = new Set([
  "moderate_comments",
  "draft_comment_reply",
  "set_comment_thread",
  "label_comments",
]);

/** RFC-0008 §14: what a release notification says, as data (Studio words it). */
export interface ReleaseNotice {
  id: string;
  kind:
    | "schedule-approval-due"
    | "schedule-upcoming"
    | "schedule-published"
    | "schedule-conflict"
    | "schedule-missed"
    | "schedule-expired"
    | "schedule-failed";
  siteId: string;
  releaseId: string;
  title: string | null;
  /** The release's time (or when it ran). */
  executeAt: string | null;
  /** Lateness for `schedule-published` and `schedule-missed`, the reason or code otherwise. */
  latenessSeconds?: number;
  reason?: string;
  /** Conflicts: how many nodes changed since approval. */
  changed?: number;
  at: string;
}

export type Notification =
  | ReleaseNotice
  | {
      /** Scheduled work is not running (§8.7); `hour` keeps one notice per hour. */
      id: string;
      kind: "scheduler-stalled";
      state: "late" | "stopped" | "unknown";
      lastTickAt: string | null;
      at: string;
    }
  | {
      id: string;
      kind: "automation-paused" | "automation-failed" | "automation-digest";
      siteId: string;
      automationId: string;
      name: string;
      /** The pause reason, the run's error code, or nothing for a digest. */
      reason?: string;
      runId?: string;
      /** `automation-digest`: the digest's plain-text report and its counts (published, scheduled, …). */
      summary?: string;
      counts?: Record<string, number>;
      at: string;
    }
  | {
      id: string;
      kind: "elevation-ending";
      keyId: string;
      keyName: string | null;
      /** The elevated mode, and the key's own mode it falls back to. */
      mode: AgentMode;
      from: AgentMode;
      until: string;
      minutesLeft: number;
    }
  | {
      id: string;
      kind: "elevation-request";
      approvalId: string;
      siteId: string;
      agent: Actor;
      keyId?: string;
      mode: AgentMode;
      minutes: number;
      reason: string;
      createdAt: string;
      expiresAt: string;
    }
  | {
      /** Someone the person invited accepted (RFC-0005 §7, last 7 days). */
      id: string;
      kind: "member-joined";
      inviteId: string;
      userId: string;
      name: string | null;
      role: Role;
      at: string;
    }
  | {
      /** Someone changed the person's role (RFC-0005 open question 4, last 7 days). */
      id: string;
      kind: "role-changed";
      from: Role;
      to: Role;
      by: Actor;
      at: string;
    }
  | {
      /** Comments wait for moderation (RFC-0007 §13); Authors count their own entries. */
      id: string;
      kind: "comments-pending";
      siteId: string;
      count: number;
      oldestAt: string | null;
      at: string;
    }
  | {
      id: string;
      kind: "comments-reported";
      siteId: string;
      /** Comments with open reports. */
      count: number;
      at: string;
    }
  | {
      /** The site's daily cap of stored comments was reached; new ones are refused until 00:00 UTC. */
      id: string;
      kind: "comments-paused";
      siteId: string;
      cap: number;
      day: string;
      at: string;
    }
  | {
      /** A takedown has waited over 2 minutes: the comment may still be on the live page. */
      id: string;
      kind: "comments-purge-waiting";
      siteId: string;
      tags: number;
      since: string;
      at: string;
    }
  | {
      /** An agent asks to approve comments, publish a reply or reopen a thread. */
      id: string;
      kind: "comments-approval";
      siteId: string;
      approvalId: string;
      tool: string;
      agent: Actor;
      createdAt: string;
      expiresAt: string;
      at: string;
    };

/** How far back `member-joined` and `role-changed` look. */
export const MEMBER_NOTICE_DAYS = 7;

export interface NotificationsPage {
  items: Notification[];
  /** Minutes before its end that an elevation shows up here. */
  noticeMinutes: number;
}

/** The deployment's sites, read once per request (comment and schedule notices both walk them). */
const sitesByRequest = new WeakMap<Context<Env>, Promise<Site[]>>();
function requestSites(c: Context<Env>): Promise<Site[]> {
  let sites = sitesByRequest.get(c);
  if (!sites) {
    sites = c.get("store").listSites();
    sitesByRequest.set(c, sites);
  }
  return sites;
}

/** The comment kinds (RFC-0007 §13), computed from the current state; nothing is stored. */
async function commentNotifications(c: Context<Env>, now: Date): Promise<Notification[]> {
  const comments = c.get("comments");
  const principal = c.get("principal");
  if (!commentsAvailable(comments) || !principal) return [];
  const roles = Boolean(c.get("staff")) && principal.person !== undefined;
  const can = (s: Scope) => !roles || holds(principal.scopes, s);
  const out: Notification[] = [];
  const at = now.toISOString();
  const moderateAny = can("comments:moderate");
  const moderateOwn = can("comments:moderate:own");
  if (moderateOwn || can("site:settings")) {
    for (const site of await requestSites(c)) {
      let nodeIds: string[] | undefined;
      if (!moderateAny && moderateOwn) {
        const person = principal.person?.id ?? principal.actor.id;
        const owner = c.get("ownership");
        nodeIds = [];
        for (const e of await c.get("store").listContentEntries(site.id))
          if (await ownsEntry(owner, person, e)) nodeIds.push(e.id);
      }
      const scope = nodeIds ? { nodeIds } : {};
      if (moderateOwn && (!nodeIds || nodeIds.length > 0)) {
        const newest = (
          await comments.store.list(site.id, { status: "pending", limit: 1, ...scope })
        ).comments[0];
        if (newest) {
          const stats = await comments.store.summary(site.id, at, scope);
          out.push({
            id: `comments-pending:${site.id}:${newest.id}`,
            kind: "comments-pending",
            siteId: site.id,
            count: stats.pending.count,
            oldestAt: stats.pending.oldestAt,
            at: newest.createdAt,
          });
        }
      }
      if (moderateAny) {
        const reports = await comments.store.listReports(site.id, { open: true, limit: 200 });
        const latest = reports[0];
        if (latest)
          out.push({
            id: `comments-reported:${site.id}:${latest.id}`,
            kind: "comments-reported",
            siteId: site.id,
            count: new Set(reports.map((r) => r.commentId)).size,
            at: latest.createdAt,
          });
        const waiting = (await comments.store.purgeQueue.queued(site.id)).filter(
          (r) =>
            r.priority === "takedown" &&
            Date.parse(r.enqueuedAt) + PURGE_LIMITS.takedownAlertMs <= now.getTime(),
        );
        const oldest = waiting[0];
        if (oldest)
          out.push({
            id: `comments-purge-waiting:${site.id}:${oldest.tag}`,
            kind: "comments-purge-waiting",
            siteId: site.id,
            tags: waiting.length,
            since: oldest.enqueuedAt,
            at: oldest.enqueuedAt,
          });
      }
      if (moderateAny || can("site:settings")) {
        const settings = await comments.store.settings(site.id);
        if (settings.enabled) {
          const today = await comments.store.storedSince(site.id, utcDayStart(now));
          if (today.total >= settings.dailyCap)
            out.push({
              id: `comments-paused:${site.id}:${utcDay(now)}`,
              kind: "comments-paused",
              siteId: site.id,
              cap: settings.dailyCap,
              day: utcDay(now),
              at,
            });
        }
      }
    }
  }
  const approvals = c.get("approvals");
  if (approvals && (moderateOwn || can("comments:reply:own"))) {
    for (const a of await approvals.list({ status: "pending", limit: 100 })) {
      if (a.status !== "pending" || !a.siteId || !COMMENT_REQUEST_TOOLS.has(a.tool)) continue;
      if (!(await canDecide(c, a, "approve")).ok) continue;
      out.push({
        id: `comments-approval:${a.id}`,
        kind: "comments-approval",
        siteId: a.siteId,
        approvalId: a.id,
        tool: a.tool,
        agent: a.actor,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        at: a.createdAt,
      });
    }
  }
  return out;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The schedule kinds (RFC-0008 §14), computed from state; nothing is stored. */
async function scheduleNotifications(c: Context<Env>, now: Date): Promise<Notification[]> {
  const deps = c.get("schedules");
  const principal = c.get("principal");
  if (!schedulesAvailable(deps) || !principal) return [];
  const roles = Boolean(c.get("staff")) && principal.person !== undefined;
  const can = (s: Scope) => !roles || holds(principal.scopes, s);
  if (!can("schedules:read")) return [];
  const me = principal.person?.id ?? principal.actor.id;
  const ownership = c.get("ownership");
  const graph = c.get("store");
  const at = now.toISOString();
  const t = now.getTime();
  const editor = can("releases:publish");
  const out: Notification[] = [];
  let dueWithin24hForMe = false;
  let dueWithin24h = false;
  for (const site of await requestSites(c)) {
    await deps.store.expireOverdueApprovals(site.id, at);
    for (const r of await deps.store.listReleases(site.id, { limit: 200 })) {
      const creator = (await ownership.personOf(r.createdBy)) === me;
      const approver = r.approval?.kind === "person" && r.approval.by.id === me;
      const mine = creator || approver;
      const when = executeAtOf(r.when, r.updatedAt) ?? null;
      const due = when ? Date.parse(when) : Number.NaN;
      const base = {
        siteId: site.id,
        releaseId: r.id,
        title: r.title ?? null,
        executeAt: when,
      };
      const outcomeAt = r.outcome && "at" in r.outcome ? Date.parse(r.outcome.at) : Number.NaN;
      const recent = (days: number) => Number.isFinite(outcomeAt) && t - outcomeAt <= days * DAY;
      if ((r.state === "scheduled" || r.state === "awaiting_approval") && due - t <= DAY) {
        dueWithin24h = true;
        if (mine) dueWithin24hForMe = true;
      }
      switch (r.state) {
        case "awaiting_approval":
          if (due - t <= 60 * MINUTE && due >= t) {
            const decides =
              !roles ||
              (r.createdBy.id !== principal.actor.id &&
                (await approvalProblem(
                  graph,
                  ownership,
                  principal,
                  r.items.map((item) => ({ item, deps: [] })),
                )) === undefined);
            if (decides)
              out.push({
                id: `schedule-approval-due:${r.id}:${when}`,
                kind: "schedule-approval-due",
                ...base,
                at,
              });
          }
          break;
        case "scheduled":
          if (mine && due >= t && due - t <= 15 * MINUTE)
            out.push({
              id: `schedule-upcoming:${r.id}:${when}`,
              kind: "schedule-upcoming",
              ...base,
              at,
            });
          break;
        case "published":
          if (mine && recent(1) && r.outcome?.kind === "published")
            out.push({
              id: `schedule-published:${r.id}`,
              kind: "schedule-published",
              ...base,
              latenessSeconds: r.outcome.latenessSeconds,
              at: r.outcome.at,
            });
          break;
        case "conflict":
          if ((mine || editor) && recent(7) && r.outcome?.kind === "conflict")
            out.push({
              id: `schedule-conflict:${r.id}`,
              kind: "schedule-conflict",
              ...base,
              changed: r.outcome.conflicts.length,
              at: r.outcome.at,
            });
          break;
        case "missed":
          if ((mine || editor) && recent(7) && r.outcome?.kind === "missed")
            out.push({
              id: `schedule-missed:${r.id}`,
              kind: "schedule-missed",
              ...base,
              latenessSeconds: r.outcome.latenessSeconds,
              at: r.outcome.at,
            });
          break;
        case "expired":
          if ((creator || editor) && recent(7) && r.outcome?.kind === "expired")
            out.push({
              id: `schedule-expired:${r.id}`,
              kind: "schedule-expired",
              ...base,
              reason: r.outcome.reason,
              at: r.outcome.at,
            });
          break;
        case "failed":
          if ((mine || editor) && recent(7) && r.outcome?.kind === "failed")
            out.push({
              id: `schedule-failed:${r.id}`,
              kind: "schedule-failed",
              ...base,
              reason: r.outcome.code,
              at: r.outcome.at,
            });
          break;
      }
    }
    for (const a of await deps.store.listAutomations(site.id)) {
      if (a.owner.id !== me) continue;
      if (a.state === "auto-paused" || a.state === "broken")
        out.push({
          id: `automation-paused:${a.id}:${a.rev}`,
          kind: "automation-paused",
          siteId: site.id,
          automationId: a.id,
          name: a.name,
          ...(a.pausedReason ? { reason: a.pausedReason } : {}),
          at: a.updatedAt,
        });
      for (const run of await deps.store.listRuns(site.id, { subjectId: a.id, limit: 20 })) {
        const ended = Date.parse(run.endedAt ?? run.updatedAt);
        const failed =
          run.state === "failed" || (run.state === "missed" && a.job.kind === "agent-task");
        if (failed && t - ended <= DAY)
          out.push({
            id: `automation-failed:${run.id}`,
            kind: "automation-failed",
            siteId: site.id,
            automationId: a.id,
            name: a.name,
            runId: run.id,
            reason: run.error?.code ?? run.state,
            at: run.endedAt ?? run.updatedAt,
          });
        if (
          a.job.kind === "builtin" &&
          a.job.builtin === "weekly-digest" &&
          run.state === "succeeded" &&
          t - ended <= 7 * DAY
        )
          out.push({
            id: `automation-digest:${run.id}`,
            kind: "automation-digest",
            siteId: site.id,
            automationId: a.id,
            name: a.name,
            runId: run.id,
            // The templated digest (RFC-0008 §11.1) as the run recorded it; the sections are the
            // run's findings (`GET …/runs/:runId`).
            ...(run.summary ? { summary: run.summary } : {}),
            ...(run.counts ? { counts: run.counts as Record<string, number> } : {}),
            at: run.endedAt ?? run.updatedAt,
          });
      }
    }
  }
  // §8.7: stalled — for Administrators, and for anyone with a release due within 24 hours.
  if (can("site:settings") || dueWithin24hForMe) {
    const heartbeat = await deps.store.heartbeat();
    const health = schedulerHealth(heartbeat, now, { dueWithin24h });
    if (!health.healthy && (health.state !== "unknown" || dueWithin24h))
      out.push({
        id: `scheduler-stalled:${at.slice(0, 13)}`,
        kind: "scheduler-stalled",
        state: health.state as "late" | "stopped" | "unknown",
        lastTickAt: health.lastTickAt ?? null,
        at,
      });
  }
  return out;
}

export function notificationRoutes(clock: () => Date): Hono<Env> {
  return new Hono<Env>().get("/", async (c) => {
    if (!c.get("actor")) throw unauthorized();
    const now = clock();
    const items: Notification[] = [];

    const keys = c.get("agentKeys");
    const own = keys ? await keys.list({ headers: c.req.raw.headers }) : undefined;
    if (own) {
      for (const k of own) {
        const e = k.elevation;
        if (!e || !endsSoon(e.until, now)) continue;
        items.push({
          id: `elevation-ending:${k.id}:${e.until}`,
          kind: "elevation-ending",
          keyId: k.id,
          keyName: k.name,
          mode: e.mode,
          from: k.mode,
          until: e.until,
          minutesLeft: minutesLeft(e.until, now),
        });
      }
    }

    const approvals = c.get("approvals");
    if (approvals) {
      const pending = await approvals.list({ tool: "request_elevation", status: "pending" });
      for (const a of pending) {
        if (a.status !== "pending" || !a.siteId) continue;
        const input = (a.input ?? {}) as {
          mode?: AgentMode;
          minutes?: number;
          reason?: string;
          keyId?: string;
        };
        if (!input.mode || typeof input.minutes !== "number") continue;
        // Only requests for this person's own keys (they are the ones who can grant them).
        if (own && !own.some((k) => k.id === input.keyId)) continue;
        items.push({
          id: `elevation-request:${a.id}`,
          kind: "elevation-request",
          approvalId: a.id,
          siteId: a.siteId,
          agent: a.actor,
          ...(input.keyId ? { keyId: input.keyId } : {}),
          mode: input.mode,
          minutes: input.minutes,
          reason: input.reason ?? "",
          createdAt: a.createdAt,
          expiresAt: a.expiresAt,
        });
      }
    }

    const staff = c.get("staff");
    const person = c.get("principal")?.person;
    if (staff && person) {
      const since = new Date(now.getTime() - MEMBER_NOTICE_DAYS * 86_400_000).toISOString();
      for (const invite of await staff.store.acceptedInvitesBy(person.userId, since)) {
        const joined = await staff.store.member(invite.acceptedUserId as string);
        items.push({
          id: `member-joined:${invite.id}`,
          kind: "member-joined",
          inviteId: invite.id,
          userId: invite.acceptedUserId as string,
          name: joined?.name ?? null,
          role: invite.role,
          at: invite.acceptedAt ?? invite.createdAt,
        });
      }
      const changes = await c
        .get("audit")
        ?.list({ deployment: true, tool: "member.role", since, limit: 100 });
      for (const row of changes ?? []) {
        const input = (row.input ?? {}) as { userId?: unknown; from?: unknown; to?: unknown };
        if (input.userId !== person.userId || !isRole(input.from) || !isRole(input.to)) continue;
        items.push({
          id: `role-changed:${row.id}`,
          kind: "role-changed",
          from: input.from,
          to: input.to,
          by: row.actor,
          at: row.at,
        });
      }
    }

    items.push(...(await commentNotifications(c, now)));
    items.push(...(await scheduleNotifications(c, now)));

    // Soonest-ending elevations first, then the newest requests, comment work and member events.
    const order: Record<Notification["kind"], number> = {
      "elevation-ending": 0,
      "elevation-request": 1,
      "scheduler-stalled": 2,
      "schedule-approval-due": 3,
      "schedule-conflict": 4,
      "schedule-missed": 5,
      "schedule-failed": 6,
      "schedule-expired": 7,
      "schedule-upcoming": 8,
      "comments-purge-waiting": 9,
      "comments-approval": 10,
      "comments-reported": 11,
      "comments-pending": 12,
      "comments-paused": 13,
      "automation-paused": 14,
      "automation-failed": 15,
      "schedule-published": 16,
      "automation-digest": 17,
      "member-joined": 18,
      "role-changed": 19,
    };
    const time = (n: Notification) =>
      n.kind === "elevation-ending" ? n.until : n.kind === "elevation-request" ? n.createdAt : n.at;
    items.sort(
      (x, y) =>
        order[x.kind] - order[y.kind] ||
        (x.kind === "elevation-ending"
          ? time(x).localeCompare(time(y))
          : time(y).localeCompare(time(x))),
    );
    return c.json({ items, noticeMinutes: ELEVATION_NOTICE_MINUTES } satisfies NotificationsPage);
  });
}
