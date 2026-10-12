/**
 * Notifications (ADR-0016 addendum "told before it ends"): elevations about to end and agents
 * asking for one. Pure helpers for Studio — polling cadence, which items are new, what "Extend"
 * sends, the words, and the per-browser memory of what was already shown. The server derives the
 * list from current state on every request; items have stable ids, so each is shown once.
 */
import type { MessageKey } from "../i18n/index.tsx";
import { isKeyMode } from "./agents.ts";
import {
  type AgentKeySummary,
  type CommentNotification,
  type ElevationEndingNotification,
  type ElevationInput,
  type ElevationRequestNotification,
  isNotEnabled,
  type KeyMode,
  type NotificationsPage,
  type StudioNotification,
} from "./api.ts";
import { activeElevation, formatDuration, formatUntil, remainingMinutes } from "./elevation.ts";

/** How often Studio asks while signed in. */
export const NOTIFICATIONS_POLL_MS = 60_000;
/** …and while an elevation is about to end, so "8 min left" and the bell stay close to the truth. */
export const NOTIFICATIONS_FAST_POLL_MS = 15_000;

/** One-click extensions, in minutes: 30 min, 1 hour (the default), 4 hours. */
export const EXTEND_PRESETS = [30, 60, 240] as const;
export const DEFAULT_EXTEND_MINUTES = 60;

/**
 * The next poll: never again after a 404 (older server, nothing to poll), every 15 s while an
 * elevation is ending, else every minute.
 */
export function notificationsPollInterval(
  page: NotificationsPage | undefined,
  error: unknown,
): number | false {
  if (isNotEnabled(error)) return false;
  return page?.items.some((i) => i.kind === "elevation-ending")
    ? NOTIFICATIONS_FAST_POLL_MS
    : NOTIFICATIONS_POLL_MS;
}

/**
 * Items still current at `now`: an elevation whose end has passed, or a request that expired,
 * drops out before the next poll confirms it.
 */
export function liveNotifications(
  items: readonly StudioNotification[] | undefined,
  now: number = Date.now(),
): StudioNotification[] {
  return (items ?? []).filter((i) =>
    i.kind === "elevation-ending"
      ? Date.parse(i.until) > now
      : i.kind === "elevation-request" || i.kind === "comments-approval"
        ? Date.parse(i.expiresAt) > now
        : // Member events do not expire here (the server lists the last seven days); comment
          // digests are recomputed on every poll.
          true,
  );
}

/** An elevation that ends within `noticeMinutes` of `now` (and has not ended yet). */
export function endsWithin(
  until: string,
  noticeMinutes: number,
  now: number = Date.now(),
): boolean {
  const left = Date.parse(until) - now;
  return Number.isFinite(left) && left > 0 && left <= noticeMinutes * 60_000;
}

/** Ids not seen before, in the server's order. */
export function freshNotifications(
  items: readonly StudioNotification[],
  shown: ReadonlySet<string>,
): StudioNotification[] {
  return items.filter((i) => !shown.has(i.id));
}

// ---- Extending an elevation ------------------------------------------------------------------

/**
 * What "Extend" needs to know about an elevation in force. Extending re-posts **the same mode**
 * (a new elevation replaces the one in force, ADR-0016), so it never raises autonomy: Auto was
 * consented to when the elevation was granted.
 */
export interface ExtendTarget {
  keyId: string;
  name: string | null;
  /** The elevated mode — the only mode an extension may send. */
  mode: KeyMode;
  /** The key's own mode, for "then back to Edits". */
  from: KeyMode | undefined;
  /** When the elevation in force ends; an extension is refused once it has passed. */
  until: string;
}

/** The extension target of an `elevation-ending` item; none for a mode a key cannot hold. */
export function extendTargetOf(item: ElevationEndingNotification): ExtendTarget | undefined {
  if (!isKeyMode(item.mode)) return undefined;
  return {
    keyId: item.keyId,
    name: item.keyName,
    mode: item.mode,
    from: isKeyMode(item.from) ? item.from : undefined,
    until: item.until,
  };
}

/** The extension target of a key in the Agents list, while an elevation is in force. */
export function extendTargetOfKey(
  key: AgentKeySummary,
  now: number = Date.now(),
): ExtendTarget | undefined {
  const own = isKeyMode(key.mode) ? key.mode : undefined;
  const elevation = own ? activeElevation({ mode: own, elevation: key.elevation }, now) : undefined;
  if (!elevation) return undefined;
  return { keyId: key.id, name: key.name, mode: elevation.mode, from: own, until: elevation.until };
}

/** An extension is only possible while the elevation is still in force. */
export function canExtend(target: Pick<ExtendTarget, "until">, now: number = Date.now()): boolean {
  return Date.parse(target.until) > now;
}

/** Whole minutes for a preset, kept within the server's elevation bounds. */
export function extendMinutes(
  preset: number,
  bounds: { minMinutes: number; maxMinutes: number },
): number {
  return Math.min(bounds.maxMinutes, Math.max(bounds.minMinutes, Math.round(preset)));
}

/** The `POST /api/agent-keys/:id/elevation` body of an extension: the mode in force, for `minutes`. */
export function extensionInput(
  target: Pick<ExtendTarget, "mode">,
  minutes: number,
  bounds: { minMinutes: number; maxMinutes: number },
): ElevationInput {
  return { mode: target.mode, minutes: extendMinutes(minutes, bounds) };
}

// ---- Where an item leads ---------------------------------------------------------------------

/**
 * Agents for an ending elevation; the site's Approvals for a request; Team for member events; the
 * comment queue (the Reported tab), comment settings or Approvals for the comment kinds.
 */
export function notificationHref(item: StudioNotification): string {
  if (item.kind === "elevation-ending") return "/agents";
  if (item.kind === "elevation-request" || item.kind === "comments-approval")
    return `/sites/${encodeURIComponent(item.siteId)}/approvals`;
  if (item.kind === "comments-pending" || item.kind === "comments-purge-waiting")
    return `/sites/${encodeURIComponent(item.siteId)}/comments`;
  if (item.kind === "comments-reported")
    return `/sites/${encodeURIComponent(item.siteId)}/comments?tab=reported`;
  if (item.kind === "comments-paused")
    return `/sites/${encodeURIComponent(item.siteId)}/settings#comments`;
  return "/team";
}

/** The reader-comment kinds (RFC-0007 §13). */
export function isCommentNotification(item: { kind: string }): item is CommentNotification {
  return item.kind.startsWith("comments-");
}

/** "3 hours", "2 days": how long the oldest pending comment has waited. */
export function waitedFor(iso: string, locale: string, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes >= 1440) return formatDuration(Math.floor(minutes / 1440) * 1440, locale, "long");
  if (minutes >= 60) return formatDuration(Math.floor(minutes / 60) * 60, locale, "long");
  return formatDuration(minutes, locale, "long");
}

/** The comment tools' requests in a few words: what the agent wants. */
const APPROVAL_TOOL: Record<string, "moderate" | "reply" | "thread" | "label"> = {
  moderate_comments: "moderate",
  draft_comment_reply: "reply",
  set_comment_thread: "thread",
  label_comments: "label",
};

/**
 * A comment notification's title and sentence (bell, toast and browser notification): "12
 * comments wait for moderation", "The oldest has waited 3 hours." …
 */
export function commentNotice(
  t: Translate,
  locale: string,
  item: CommentNotification,
  now: number = Date.now(),
): { title: string; body: string } {
  const n = (count: number) => count.toLocaleString(locale);
  switch (item.kind) {
    case "comments-pending":
      return {
        title:
          item.count === 1
            ? t("notifications.comments.pending.titleOne")
            : t("notifications.comments.pending.title", { count: n(item.count) }),
        body: item.oldestAt
          ? t("notifications.comments.pending.body", { age: waitedFor(item.oldestAt, locale, now) })
          : t("notifications.comments.pending.bodyNew"),
      };
    case "comments-reported":
      return {
        title:
          item.count === 1
            ? t("notifications.comments.reported.titleOne")
            : t("notifications.comments.reported.title", { count: n(item.count) }),
        body: t("notifications.comments.reported.body"),
      };
    case "comments-paused":
      return {
        title: t("notifications.comments.paused.title"),
        body: t("notifications.comments.paused.body", { cap: n(item.cap) }),
      };
    case "comments-purge-waiting":
      return {
        title: t("notifications.comments.purgeWaiting.title"),
        body: t("notifications.comments.purgeWaiting.body", { count: n(item.tags) }),
      };
    default:
      return {
        title: t("notifications.comments.approval.title", {
          agent: item.agent.name ?? item.agent.id,
        }),
        body: t(`notifications.comments.approval.tools.${APPROVAL_TOOL[item.tool] ?? "moderate"}`),
      };
  }
}

// ---- Words -----------------------------------------------------------------------------------

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Parameters for "Desk's Auto mode ends in 8 min (14:30), then back to Edits." */
export function endingParams(
  t: Translate,
  locale: string,
  item: Pick<ElevationEndingNotification, "keyName" | "mode" | "from" | "until">,
  now: number = Date.now(),
): { name: string; mode: string; from: string; left: string; time: string } {
  return {
    name: item.keyName ?? t("agents.unnamed"),
    mode: t(`agents.modes.names.${item.mode}`),
    from: t(`agents.modes.names.${item.from}`),
    left: formatDuration(Math.max(1, remainingMinutes(item.until, now)), locale, "short"),
    time: formatUntil(item.until, locale, { now }),
  };
}

/** Parameters for "Planner asks for Edits · 30 min"; `duration` uses the presets' short words. */
export function requestParams(
  t: Translate,
  item: Pick<ElevationRequestNotification, "agent" | "mode" | "minutes">,
  shortDuration: (minutes: number) => string,
): { agent: string; mode: string; duration: string } {
  return {
    agent: item.agent.name ?? item.agent.id,
    mode: t(`agents.modes.names.${item.mode}`),
    duration: shortDuration(item.minutes),
  };
}

// ---- Per-browser memory (DESIGN.md storage rules: a convenience, so every access may fail) ----

/** Ids already announced in this browser, so a reload does not announce them again. */
export const SHOWN_STORAGE_KEY = "cloudhal.studio.notifications.shown";
/** The person's opt-in to browser notifications. */
export const BROWSER_PREF_STORAGE_KEY = "cloudhal.studio.notifications.browser";
/** Ids remembered at most; old ones fall off (they cannot come back: an id names one `until`). */
const SHOWN_LIMIT = 200;

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readShownIds(): Set<string> {
  try {
    const raw = storage()?.getItem(SHOWN_STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Adds `ids` to the remembered ones (newest last, capped); returns the full set. */
export function rememberShownIds(ids: Iterable<string>): Set<string> {
  const all = readShownIds();
  for (const id of ids) {
    all.delete(id);
    all.add(id);
  }
  const kept = [...all].slice(-SHOWN_LIMIT);
  try {
    storage()?.setItem(SHOWN_STORAGE_KEY, JSON.stringify(kept));
  } catch {}
  return new Set(kept);
}

export function readBrowserPreference(): boolean {
  try {
    return storage()?.getItem(BROWSER_PREF_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeBrowserPreference(on: boolean): void {
  try {
    if (on) storage()?.setItem(BROWSER_PREF_STORAGE_KEY, "on");
    else storage()?.removeItem(BROWSER_PREF_STORAGE_KEY);
  } catch {}
}

// ---- Browser notifications -------------------------------------------------------------------

/** What this browser allows: no API at all, not asked yet, refused, or allowed. */
export type BrowserPermission = "unsupported" | NotificationPermission;

export function browserPermission(): BrowserPermission {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return window.Notification.permission;
  } catch {
    return "unsupported";
  }
}

/**
 * A system notification is raised only when the person opted in, the browser allows it, and
 * Studio is not on screen (a visible tab gets the toast instead).
 */
export function shouldRaiseBrowserNotification(state: {
  enabled: boolean;
  permission: BrowserPermission;
  visibility: DocumentVisibilityState;
}): boolean {
  return state.enabled && state.permission === "granted" && state.visibility !== "visible";
}
