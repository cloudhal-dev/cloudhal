/**
 * `/api/notifications` — what needs the signed-in owner's attention across sites, worked out from
 * the current state on every request (nothing is stored, nothing has to run on a schedule):
 *
 * - `elevation-ending`: one of their keys' time-boxed elevations ends within
 *   `ELEVATION_NOTICE_MINUTES` (ADR-0016) — extend it or let it end;
 * - `elevation-request`: an agent asks for an elevation and waits in a site's Approvals;
 * - `member-joined`: someone they invited accepted (RFC-0005 §7);
 * - `role-changed`: someone changed their role (RFC-0005 open question 4).
 *
 * People only. Each item has a stable `id`, so a client can remember what it already showed.
 */
import {
  type AgentMode,
  ELEVATION_NOTICE_MINUTES,
  endsSoon,
  isRole,
  minutesLeft,
  type Role,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { unauthorized } from "../errors.ts";

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
    };

/** How far back `member-joined` and `role-changed` look. */
export const MEMBER_NOTICE_DAYS = 7;

export interface NotificationsPage {
  items: Notification[];
  /** Minutes before its end that an elevation shows up here. */
  noticeMinutes: number;
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

    // Soonest-ending elevations first, then the newest requests and member events.
    const order: Record<Notification["kind"], number> = {
      "elevation-ending": 0,
      "elevation-request": 1,
      "member-joined": 2,
      "role-changed": 3,
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
