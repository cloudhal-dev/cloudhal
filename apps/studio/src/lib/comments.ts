/**
 * Reader comments in Studio (RFC-0007 §12–§14; DESIGN.md §2w): pure helpers behind the queue, the
 * thread view, the commenter page, the editor card and the comment approvals — query keys, which
 * moderation actions a status allows, what a bulk call sends and how its per-comment results read,
 * the client-side filters the API has no parameter for, ban durations, and the arguments of the
 * agents' comment tools. No React; every comment, name and report stays plain data here.
 */
import type {
  Approval,
  CommentModerateAction,
  CommentModerationResult,
  CommentNotification,
  CommentReasonCode,
  CommentThreadMode,
  CommentView,
  ReaderCommentStatus,
} from "./api.ts";

// ---- query keys --------------------------------------------------------------------------------

/** Everything about a site's comments sits under this key, so a moderation refreshes all of it. */
export const commentsKey = (siteId: string) => ["comments", siteId] as const;
export const commentThreadKey = (siteId: string, nodeId: string) =>
  ["comments", siteId, "thread", nodeId] as const;
export const commentSettingsKey = (siteId: string) => ["comments", siteId, "settings"] as const;
export const commenterKey = (siteId: string, commenterId: string) =>
  ["comments", siteId, "commenter", commenterId] as const;

// ---- the queue ---------------------------------------------------------------------------------

/** The queue's page tabs, in order (RFC-0007 §14): Pending · Reported · Approved · Spam · Hidden. */
export const QUEUE_TABS = ["pending", "reported", "approved", "spam", "hidden"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export function isQueueTab(value: unknown): value is QueueTab {
  return typeof value === "string" && (QUEUE_TABS as readonly string[]).includes(value);
}

/** Comments per page (DESIGN.md §2w: `Pagination` over 25). */
export const QUEUE_PAGE_SIZE = 25;

/** At most this many ids per moderation call (the API's limit). */
export const MODERATE_LIMIT = 50;

/**
 * The moderation actions a comment in `status` allows (RFC-0007 §4.2): `approve` from pending,
 * `restore` for hidden or spam, `hide` and `spam` from anything visible or waiting, `hold` back to
 * the queue. A deleted comment allows none.
 */
export function actionsFor(status: ReaderCommentStatus): CommentModerateAction[] {
  switch (status) {
    case "pending":
      return ["approve", "hide", "spam"];
    case "approved":
      return ["hide", "spam", "hold"];
    case "hidden":
      return ["restore", "spam", "hold"];
    case "spam":
      return ["restore", "hide", "hold"];
    default:
      return [];
  }
}

/** Actions that make a comment public: only a person decides them (§10.2 class `person`). */
export const PUBLISHING_ACTIONS: readonly CommentModerateAction[] = ["approve", "restore"];

/** Actions that ask for a reason (`hide`, `spam`; `delete` has its own route and asks too). */
export function needsReason(action: CommentModerateAction | "delete"): boolean {
  return action === "hide" || action === "spam" || action === "delete";
}

/** The reason a dialog preselects: `spam` for spam, `abuse` for hide, `other` for delete. */
export function defaultReason(action: "hide" | "spam" | "delete"): CommentReasonCode {
  return action === "spam" ? "spam" : action === "hide" ? "abuse" : "other";
}

/** The bulk bar's actions for a tab, the safe one first. */
export function bulkActionsFor(tab: QueueTab): CommentModerateAction[] {
  switch (tab) {
    case "pending":
      return ["approve", "hide", "spam"];
    case "approved":
      return ["hide", "spam", "hold"];
    case "hidden":
      return ["restore", "spam", "hold"];
    case "spam":
      return ["restore", "hide", "hold"];
    default:
      // Reported comments can be anything: offer what keeps them off the page, and holding.
      return ["hide", "spam", "hold"];
  }
}

/** Of the selected comments, those `action` applies to (the others are left out of the call). */
export function eligibleFor(
  action: CommentModerateAction,
  comments: readonly Pick<CommentView, "id" | "status">[],
): string[] {
  return comments.filter((c) => actionsFor(c.status).includes(action)).map((c) => c.id);
}

/** `{ id: rev }` of the comments a call names: the server moderates only those still at that rev. */
export function revsOf(
  comments: readonly Pick<CommentView, "id" | "rev">[],
  ids?: readonly string[],
): Record<string, number> {
  const wanted = ids ? new Set(ids) : undefined;
  return Object.fromEntries(
    comments.filter((c) => !wanted || wanted.has(c.id)).map((c) => [c.id, c.rev]),
  );
}

export type ModerationError = NonNullable<CommentModerationResult["error"]>;

/** A bulk call's per-comment results (§4.4: partial success is correct, each comment stands alone). */
export interface ModerationOutcome {
  done: string[];
  failed: { id: string; error: ModerationError }[];
  /** Failures by reason, for one line per reason. */
  byError: Partial<Record<ModerationError, number>>;
}

export function moderationOutcome(results: readonly CommentModerationResult[]): ModerationOutcome {
  const done: string[] = [];
  const failed: { id: string; error: ModerationError }[] = [];
  const byError: Partial<Record<ModerationError, number>> = {};
  for (const r of results) {
    if (r.ok) done.push(r.id);
    else {
      const error = r.error ?? "conflict";
      failed.push({ id: r.id, error });
      byError[error] = (byError[error] ?? 0) + 1;
    }
  }
  return { done, failed, byError };
}

/** Somebody (an agent included) hid or labelled it: the "Hidden or labelled by agents" filter. */
export function touchedByAgent(comment: Pick<CommentView, "labels" | "moderation">): boolean {
  return (
    comment.moderation?.actor.kind === "agent" ||
    (comment.labels ?? []).some((l) => l.source === "agent")
  );
}

/**
 * The search box over the loaded page (the API has no text search yet, RFC-0007 implementation
 * notes 5–7): the author's name or the text contains every word, ignoring case in `locale`.
 */
export function matchesSearch(
  comment: Pick<CommentView, "author" | "body">,
  query: string,
  locale = "en",
): boolean {
  const words = query.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const name = comment.author.kind === "erased" ? "" : comment.author.name;
  const hay = `${name}\n${comment.body?.text ?? ""}`.toLocaleLowerCase(locale);
  return words.every((w) => hay.includes(w));
}

/** The sidebar's pending count for a site, from the bell's `comments-pending` item (own entries for Authors). */
export function pendingCommentsCount(
  items: readonly { kind: string }[] | undefined,
  siteId: string,
): number {
  const item = (items ?? []).find(
    (i): i is Extract<CommentNotification, { kind: "comments-pending" }> =>
      i.kind === "comments-pending" && (i as { siteId?: string }).siteId === siteId,
  );
  return item?.count ?? 0;
}

// ---- replies -----------------------------------------------------------------------------------

/** A staff reply: 2 to 5,000 characters of plain text (RFC-0007 §11.1 `draft_comment_reply`). */
export const REPLY_MIN = 2;
export const REPLY_MAX = 5000;

export function replyProblem(text: string): "short" | "long" | undefined {
  const n = [...text.trim()].length;
  if (n < REPLY_MIN) return "short";
  if (n > REPLY_MAX) return "long";
  return undefined;
}

// ---- thread modes ------------------------------------------------------------------------------

/** A thread's mode from a tab value (anything unknown reads as `default`). */
export function threadModeOf(value: unknown): CommentThreadMode {
  return value === "open" || value === "closed" || value === "hidden" ? value : "default";
}

/** A `DatePicker` day → the close instant: the end of that day in UTC, so the whole day stays open. */
export function closeInstant(day: Date): string {
  return new Date(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59),
  ).toISOString();
}

// ---- bans --------------------------------------------------------------------------------------

/** "Ban for": 1 day, 30 days, 90 days, 1 year, or until lifted (RFC-0007 §14 commenter page). */
export const BAN_DURATIONS = ["1", "30", "90", "365", "forever"] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number];

/** The `until` a duration sends: `null` until lifted. */
export function banUntil(duration: BanDuration, now: number = Date.now()): string | null {
  if (duration === "forever") return null;
  return new Date(now + Number(duration) * 86_400_000).toISOString();
}

/** The ban in force among a commenter's (latest first), if any. */
export function activeBan<B extends { until: string | null }>(
  bans: readonly B[],
  now: number = Date.now(),
): B | undefined {
  return bans.find((b) => b.until === null || Date.parse(b.until) > now);
}

// ---- comment approvals (RFC-0007 §10.3) --------------------------------------------------------

/** Agents' comment tools whose approval Studio carries out on Approve. */
export const COMMENT_TOOLS = new Set([
  "moderate_comments",
  "draft_comment_reply",
  "set_comment_thread",
  "label_comments",
]);

export type CommentRequest =
  | {
      kind: "moderate";
      ids: string[];
      action: CommentModerateAction;
      reasonCode?: CommentReasonCode;
      note?: string;
    }
  | { kind: "reply"; commentId: string; text: string }
  | { kind: "thread"; nodeId: string; mode: CommentThreadMode; closesAt?: string | null }
  | { kind: "label"; ids: string[] };

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** What an agent's comment request asks for, from its arguments; `undefined` for other tools. */
export function commentRequestOf(
  request: Pick<Approval, "tool" | "input">,
): CommentRequest | undefined {
  if (!COMMENT_TOOLS.has(request.tool)) return undefined;
  const a = (request.input ?? {}) as Record<string, unknown>;
  if (request.tool === "moderate_comments") {
    const action = a.action;
    if (
      action !== "approve" &&
      action !== "restore" &&
      action !== "hide" &&
      action !== "spam" &&
      action !== "hold"
    )
      return undefined;
    return {
      kind: "moderate",
      ids: strings(a.ids),
      action,
      ...(typeof a.reasonCode === "string"
        ? { reasonCode: a.reasonCode as CommentReasonCode }
        : {}),
      ...(typeof a.note === "string" ? { note: a.note } : {}),
    };
  }
  if (request.tool === "draft_comment_reply")
    return {
      kind: "reply",
      commentId: typeof a.commentId === "string" ? a.commentId : "",
      text: typeof a.text === "string" ? a.text : "",
    };
  if (request.tool === "set_comment_thread")
    return {
      kind: "thread",
      nodeId: typeof a.nodeId === "string" ? a.nodeId : "",
      mode: threadModeOf(a.mode),
      ...(a.closesAt === null || typeof a.closesAt === "string"
        ? { closesAt: a.closesAt as string | null }
        : {}),
    };
  const items = Array.isArray(a.items) ? (a.items as { commentId?: unknown }[]) : [];
  return {
    kind: "label",
    ids: items.map((i) => i.commentId).filter((x): x is string => typeof x === "string"),
  };
}

/** The comment ids a request names (to show the comments themselves, never a summary of them). */
export function requestCommentIds(request: CommentRequest): string[] {
  if (request.kind === "moderate" || request.kind === "label") return request.ids;
  if (request.kind === "reply") return request.commentId ? [request.commentId] : [];
  return [];
}

/** Pending comment requests on a site that make comments public (the queue's info banner). */
export function pendingCommentApprovals(approvals: readonly Approval[] | undefined): Approval[] {
  return (approvals ?? []).filter(
    (a) => a.status === "pending" && commentRequestOf(a) !== undefined,
  );
}
