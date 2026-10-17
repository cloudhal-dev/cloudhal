/** The bell's notifications. */
import type { Actor } from "@cloudhal/core-contracts";
import type { AgentMode } from "./agents.ts";
import type { CommentNotification } from "./comments-types.ts";
import { request } from "./http.ts";
import { SCHEDULE_NOTIFICATION_KINDS, type ScheduleNotification } from "./schedules-types.ts";
import type { Role } from "./team.ts";

/**
 * One thing that needs the signed-in owner's attention (`GET /api/notifications`, ADR-0016 addendum
 * "told before it ends"). Derived from current state on every request; `id` is stable, so a client
 * can show each one once. Named `StudioNotification` so it never shadows the DOM `Notification`.
 */
export type StudioNotification =
  | ElevationEndingNotification
  | ElevationRequestNotification
  | MemberJoinedNotification
  | RoleChangedNotification
  | CommentNotification
  | ScheduleNotification;

/** Someone the person invited accepted (RFC-0005 §7; the last 7 days). */
export interface MemberJoinedNotification {
  /** `member-joined:<inviteId>`. */
  id: string;
  kind: "member-joined";
  inviteId: string;
  userId: string;
  name: string | null;
  role: Role;
  at: string;
}

/** Someone changed the person's own role (RFC-0005 open question 4; the last 7 days). */
export interface RoleChangedNotification {
  /** `role-changed:<auditRowId>`. */
  id: string;
  kind: "role-changed";
  from: Role;
  to: Role;
  by: Actor;
  at: string;
}

/** One of the owner's elevations ends within `noticeMinutes`: extend it or let it end. */
export interface ElevationEndingNotification {
  /** `elevation-ending:<keyId>:<until>` — a new elevation (an extension) gets a new id. */
  id: string;
  kind: "elevation-ending";
  keyId: string;
  keyName: string | null;
  /** The elevated mode. */
  mode: AgentMode;
  /** The key's own mode, which applies again afterwards. */
  from: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
  /** Whole minutes left when the server answered (Studio recomputes it from `until`). */
  minutesLeft: number;
}

/** An agent asks for an elevation of one of the owner's keys and waits in a site's Approvals. */
export interface ElevationRequestNotification {
  /** `elevation-request:<approvalId>`. */
  id: string;
  kind: "elevation-request";
  approvalId: string;
  siteId: string;
  agent: Actor;
  keyId?: string;
  mode: AgentMode;
  minutes: number;
  /** The agent's own words: agent-controlled, so plain text only. May be empty. */
  reason: string;
  createdAt: string;
  expiresAt: string;
}

export interface NotificationsPage {
  /** Elevations ending soonest first, then the newest requests. */
  items: StudioNotification[];
  /** Minutes before its end that an elevation shows up here. */
  noticeMinutes: number;
}

/** Every notification kind the bell renders. */
const KNOWN_NOTIFICATION_KINDS: ReadonlySet<string> = new Set<StudioNotification["kind"]>([
  "elevation-ending",
  "elevation-request",
  "member-joined",
  "role-changed",
  "comments-pending",
  "comments-reported",
  "comments-paused",
  "comments-purge-waiting",
  "comments-approval",
  ...SCHEDULE_NOTIFICATION_KINDS,
]);

export const notificationsApi = {
  /**
   * What needs the signed-in person's attention, the reader-comment kinds (RFC-0007 §13)
   * included; 404 on servers without it (see `isNotEnabled`). Kinds this Studio does not know
   * (a newer server) are left out, so the bell never renders an item it cannot describe.
   */
  list: () =>
    request<NotificationsPage>("/api/notifications").then((page) => ({
      ...page,
      items: (page?.items ?? []).filter((n) =>
        KNOWN_NOTIFICATION_KINDS.has((n as { kind: string }).kind),
      ),
    })),
};
