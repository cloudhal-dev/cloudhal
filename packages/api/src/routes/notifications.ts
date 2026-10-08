/**
 * `/api/notifications` — what needs the signed-in owner's attention across sites, worked out from
 * the current state on every request (nothing is stored, nothing has to run on a schedule):
 *
 * - `elevation-ending`: one of their keys' time-boxed elevations ends within
 *   `ELEVATION_NOTICE_MINUTES` (ADR-0016) — extend it or let it end;
 * - `elevation-request`: an agent asks for an elevation and waits in a site's Approvals.
 *
 * People only. Each item has a stable `id`, so a client can remember what it already showed.
 */
import {
  type AgentMode,
  ELEVATION_NOTICE_MINUTES,
  endsSoon,
  minutesLeft,
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
    };

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

    // Soonest-ending first, then the newest requests.
    items.sort((x, y) =>
      x.kind === y.kind
        ? x.kind === "elevation-ending"
          ? x.until.localeCompare((y as typeof x).until)
          : (y as typeof x).createdAt.localeCompare(x.createdAt)
        : x.kind === "elevation-ending"
          ? -1
          : 1,
    );
    return c.json({ items, noticeMinutes: ELEVATION_NOTICE_MINUTES } satisfies NotificationsPage);
  });
}
