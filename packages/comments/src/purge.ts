/**
 * The purge planner (RFC-0007 §8.3–§8.4, invariant C6). Workers Cache always uses the Free-tier
 * purge limit — 5 requests a minute, a bucket of 25, 100 tags a request — and publishing shares
 * it, so comment moderation never purges directly:
 *
 * 1. The batch that changes what readers see also upserts `cloudhal-comments-<nodeId>` into
 *    `comment_purge_queue` (the store does this; bulk moderation of 50 comments on 12 entries is
 *    12 rows and later one request).
 * 2. **Takedowns go first and fast**: every due takedown tag is sent at once (after a 2 s
 *    micro-batch in the flusher), up to 100 a request; normal tags ride along in spare room.
 *    Takedowns may use the whole budget.
 * 3. **Normal changes coalesce**: sent once the oldest normal row is ≥ 20 s old, and only while
 *    the last 60 s show fewer than 3 purge requests in total (publish included, from
 *    `cache_purge_log`), so a publish always finds room.
 * 4. **Failure** keeps the rows and backs off 30 s × 2^attempts, at most 5 minutes. A takedown
 *    still waiting after 2 minutes raises `comments-purge-waiting`.
 *
 * Pure: the admin Worker's flusher reads the queue and the log, sends what the plan says through
 * the `SITE` binding to `/__cloudhal/purge`, and reports back to the store.
 */
import { COMMENTS_TAG_PREFIX, commentsCacheTag } from "@cloudhal/core-ts/cache-tags";

export { COMMENTS_TAG_PREFIX, commentsCacheTag };

export type PurgePriority = "takedown" | "normal";

export const PURGE_LIMITS = {
  tagsPerRequest: 100,
  /** Normal rows wait this long so a burst of approvals is one request. */
  normalDelayMs: 20_000,
  /** The flusher waits this long after a takedown write so a bulk hide is one request. */
  takedownMicrobatchMs: 2_000,
  /** The window the shared budget is counted over. */
  windowMs: 60_000,
  /** Normal comment purges are sent only while the window holds fewer requests than this. */
  normalMaxInWindow: 3,
  /** Takedown requests per flush (Cloudflare's per-minute rate). */
  takedownMaxPerFlush: 5,
  backoffBaseMs: 30_000,
  backoffMaxMs: 300_000,
  /** A takedown still queued after this raises `comments-purge-waiting`. */
  takedownAlertMs: 120_000,
  /** Above this many entries a settings change purges the whole site instead (§8.3). */
  siteWideAbove: 300,
} as const;

export interface PurgeQueueRow {
  readonly tag: string;
  readonly priority: PurgePriority;
  readonly enqueuedAt: string;
  readonly attempts: number;
  readonly nextAt: string;
}

/** A purge request recorded in `cache_purge_log` (publish or comments). */
export interface PurgeLogEntry {
  readonly at: string;
  readonly requests: number;
}

export interface PurgeRequestPlan {
  readonly priority: PurgePriority;
  readonly tags: readonly string[];
}

export interface PurgePlan {
  /** Requests to send now, takedowns first. */
  readonly requests: readonly PurgeRequestPlan[];
  /** When the flusher should look again (`null` when the queue will be empty). */
  readonly nextCheckAt: string | null;
  /** A takedown has waited longer than 2 minutes (the bell's `comments-purge-waiting`). */
  readonly takedownWaiting: boolean;
}

const ms = (iso: string) => Date.parse(iso);

function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Plans one flush of a site's queue against the shared budget. */
export function planPurge(input: {
  readonly rows: readonly PurgeQueueRow[];
  /** Purge requests of the last 60 s, any source. */
  readonly recent: readonly PurgeLogEntry[];
  readonly now: Date;
}): PurgePlan {
  const now = input.now.getTime();
  const L = PURGE_LIMITS;
  const byAge = [...input.rows].sort(
    (a, b) => ms(a.enqueuedAt) - ms(b.enqueuedAt) || a.tag.localeCompare(b.tag),
  );
  const due = byAge.filter((r) => ms(r.nextAt) <= now);
  const takedowns = due.filter((r) => r.priority === "takedown").map((r) => r.tag);
  let normals = due.filter((r) => r.priority === "normal");
  const requests: PurgeRequestPlan[] = [];

  // 2. takedowns first; spare room carries due normal tags of any age
  for (const tags of chunk(takedowns, L.tagsPerRequest).slice(0, L.takedownMaxPerFlush)) {
    const room = L.tagsPerRequest - tags.length;
    const ride = normals.slice(0, room).map((r) => r.tag);
    normals = normals.slice(ride.length);
    requests.push({ priority: "takedown", tags: [...tags, ...ride] });
  }
  const takedownsLeft = Math.max(0, takedowns.length - L.takedownMaxPerFlush * L.tagsPerRequest);

  // 3. normal rows once the oldest is 20 s old, while the window has room
  const windowStart = now - L.windowMs;
  const inWindow = input.recent
    .filter((e) => ms(e.at) > windowStart && ms(e.at) <= now)
    .reduce((n, e) => n + e.requests, 0);
  let budgetBlockedUntil: number | undefined;
  const oldest = normals[0];
  const ripe = oldest !== undefined && ms(oldest.enqueuedAt) + L.normalDelayMs <= now;
  if (ripe) {
    let used = inWindow + requests.length;
    for (const tags of chunk(
      normals.map((r) => r.tag),
      L.tagsPerRequest,
    )) {
      if (used >= L.normalMaxInWindow) break;
      requests.push({ priority: "normal", tags });
      used++;
      normals = normals.slice(tags.length);
    }
    if (normals.length > 0) {
      // room returns when the oldest request in the window leaves it
      const times = input.recent
        .filter((e) => ms(e.at) > windowStart)
        .map((e) => ms(e.at))
        .sort((a, b) => a - b);
      budgetBlockedUntil = (times[0] ?? now) + L.windowMs;
    }
  }

  // when to look again
  const sent = new Set(requests.flatMap((r) => r.tags));
  const candidates: number[] = [];
  for (const r of byAge) {
    if (sent.has(r.tag)) continue;
    const next = ms(r.nextAt);
    if (next > now) candidates.push(next);
    else if (r.priority === "normal")
      candidates.push(Math.max(ms(r.enqueuedAt) + L.normalDelayMs, budgetBlockedUntil ?? now));
    else candidates.push(now + L.takedownMicrobatchMs);
  }
  if (takedownsLeft > 0) candidates.push(now + L.takedownMicrobatchMs);
  const nextCheck = candidates.length > 0 ? Math.min(...candidates) : undefined;

  return {
    requests,
    nextCheckAt: nextCheck === undefined ? null : new Date(Math.max(nextCheck, now)).toISOString(),
    takedownWaiting: input.rows.some(
      (r) => r.priority === "takedown" && ms(r.enqueuedAt) + L.takedownAlertMs <= now,
    ),
  };
}

/** Back-off after a failed purge request: 30 s × 2^attempts, at most 5 minutes (§8.4 step 5). */
export function purgeBackoffMs(attempts: number): number {
  return Math.min(
    PURGE_LIMITS.backoffBaseMs * 2 ** Math.max(0, attempts),
    PURGE_LIMITS.backoffMaxMs,
  );
}

/**
 * What a settings change that alters rendering purges (§8.3): the entries' comment tags, or the
 * whole site (`everything`) when there are more than 300.
 */
export function settingsPurgeTags(
  nodeIds: readonly string[],
):
  | { readonly everything: true }
  | { readonly everything: false; readonly tags: readonly string[] } {
  const unique = [...new Set(nodeIds)];
  if (unique.length > PURGE_LIMITS.siteWideAbove) return { everything: true };
  return { everything: false, tags: unique.map(commentsCacheTag) };
}

/** True for a tag this package enqueues. */
export const isCommentsCacheTag = (tag: string): boolean =>
  tag.startsWith(COMMENTS_TAG_PREFIX) &&
  /^[A-Za-z0-9_]{1,64}$/.test(tag.slice(COMMENTS_TAG_PREFIX.length));
