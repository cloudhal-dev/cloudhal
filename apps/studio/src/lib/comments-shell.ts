/**
 * The comment helpers the shell needs (the router's `?tab=` check, the sidebar's pending count),
 * apart from `comments.ts` so the rest of the comment model loads with the comment screens rather
 * than with every page (`bundle-budget.ts`). `comments.ts` re-exports them.
 */
import type { CommentNotification } from "./api.ts";

/** The queue's page tabs, in order (RFC-0007 §14): Pending · Reported · Approved · Spam · Hidden. */
export const QUEUE_TABS = ["pending", "reported", "approved", "spam", "hidden"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export function isQueueTab(value: unknown): value is QueueTab {
  return typeof value === "string" && (QUEUE_TABS as readonly string[]).includes(value);
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
