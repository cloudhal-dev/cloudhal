/**
 * The effective state of an entry's thread (RFC-0007 §4.5) — one function used by the renderer,
 * the site Worker and Studio so they never disagree:
 *
 * 1. `mode = hidden` → **hidden** (nothing rendered, nothing accepted).
 * 2. The site or the entry's collection is off → **closed** when `showWhenOff` and approved
 *    comments exist, else **off**.
 * 3. `mode = closed` → **closed**; `mode = open` → **open** unless an explicit `closesAt` passed.
 * 4. `default`: closes at `closesAt` when set, else at first publication + `closeAfterDays`
 *    (the collection's, else the site's; `null` = never). Before that **open**, after **closed**.
 */
import { DAY_MS, type ThreadRow, type ThreadState } from "./model.ts";
import { type CommentSettings, closeAfterDaysFor, collectionEnabled } from "./settings.ts";

export interface ThreadEntry {
  readonly nodeId: string;
  readonly collection: string;
  /** The entry's first publication (`publishedAt`); `null` while never published. */
  readonly publishedAt: string | null;
}

export interface ThreadStateInput {
  readonly settings: CommentSettings;
  readonly entry: ThreadEntry;
  readonly thread?: Pick<ThreadRow, "mode" | "closesAt"> | null;
  /** Whether approved comments exist (only rule 2 reads it). */
  readonly hasApproved?: boolean;
  readonly now: Date;
}

/**
 * When the thread closes (or closed), as an ISO instant; `null` when it never closes by time.
 * Explicit `closesAt` wins, else first publication + `closeAfterDays`.
 */
export function threadClosesAt(
  settings: CommentSettings,
  entry: ThreadEntry,
  thread?: Pick<ThreadRow, "mode" | "closesAt"> | null,
): string | null {
  if (thread?.closesAt) return thread.closesAt;
  if (thread?.mode === "open" || thread?.mode === "closed" || thread?.mode === "hidden")
    return null;
  const days = closeAfterDaysFor(settings, entry.collection);
  if (days === null || entry.publishedAt === null) return null;
  const at = Date.parse(entry.publishedAt);
  if (!Number.isFinite(at)) return null;
  return new Date(at + days * DAY_MS).toISOString();
}

export function threadState(input: ThreadStateInput): ThreadState {
  const { settings, entry, thread, now } = input;
  const mode = thread?.mode ?? "default";
  if (mode === "hidden") return "hidden";
  if (!collectionEnabled(settings, entry.collection))
    return settings.showWhenOff && input.hasApproved === true ? "closed" : "off";
  if (mode === "closed") return "closed";
  const closesAt = threadClosesAt(settings, entry, thread);
  if (closesAt !== null && Date.parse(closesAt) <= now.getTime()) return "closed";
  return "open";
}

/** Whether approved comments are rendered at all (open or closed threads). */
export const threadVisible = (state: ThreadState): boolean =>
  state === "open" || state === "closed";
