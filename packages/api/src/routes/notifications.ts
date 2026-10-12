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
import type { Actor } from "@cloudhal/core-contracts";
import { commentsAvailable } from "@cloudhal/mcp-server/comments";
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

export type Notification =
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
    for (const site of await c.get("store").listSites()) {
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

    // Soonest-ending elevations first, then the newest requests, comment work and member events.
    const order: Record<Notification["kind"], number> = {
      "elevation-ending": 0,
      "elevation-request": 1,
      "comments-purge-waiting": 2,
      "comments-approval": 3,
      "comments-reported": 4,
      "comments-pending": 5,
      "comments-paused": 6,
      "member-joined": 7,
      "role-changed": 8,
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
