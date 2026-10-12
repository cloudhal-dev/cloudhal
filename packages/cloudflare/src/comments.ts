/**
 * Reader comments on the admin Worker (RFC-0007 rollout step 5):
 *
 * - **The purge flusher** (§8.4, invariant C6). Moderation never purges directly: the store queues
 *   `cloudhal-comments-<nodeId>` in the same batch as the change, and `flushCommentPurges` sends
 *   what `planPurge` allows through the `SITE` binding to `/__cloudhal/purge` — takedowns at once
 *   (after a 2 s micro-batch), normal tags once 20 s old and only while the last minute shows fewer
 *   than 3 purge requests in total. The budget is shared: publishes, media takedowns and analytics
 *   settings log their requests in `cache_purge_log` too. A failed request (`success: false` is a
 *   502 from the site Worker) keeps the rows and backs off 30 s × 2^attempts, at most 5 minutes.
 * - **The hourly job** (§8.5, §9.2, §9.3): retention per site in bounded runs, comments of
 *   entries deleted 30 days ago, purges for threads that closed by time in the last hour, salts
 *   older than the previous month, then a flush as the backstop.
 * - **`adminComments`**: the deployment's `CommentsDeps` from its secrets. Without a valid
 *   `CLOUDHAL_COMMENTS_KEY` (the same secret the site Worker uses) comments are unavailable, never
 *   a crash; `CLOUDHAL_COMMENTS_AVAILABLE=false` turns them off for the deployment.
 */

import type { ApiDeps } from "@cloudhal/api";
import {
  closeAfterDaysFor,
  collectionEnabled,
  deletedEntriesDue,
  deriveCommentKeys,
  MIN_SECRET_LENGTH,
  oldestSaltMonthToKeep,
  PURGE_LIMITS,
  type PurgePriority,
  type PurgeQueueRow,
  planPurge,
  retentionPlan,
  threadClosesAt,
} from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import type { SqlDriver } from "@cloudhal/storage";
import type { SiteFetch } from "./purge.ts";

type CommentsDeps = NonNullable<ApiDeps["comments"]>;

const PURGE_URL = "https://site.internal/__cloudhal/purge";

export interface FlushOptions {
  readonly store: SqlCommentStore;
  /** `fetch` of the site Worker (the `SITE` binding). */
  readonly fetch: SiteFetch;
  /** The shared `CLOUDHAL_PURGE_TOKEN`. */
  readonly token: string;
  readonly now?: (() => Date) | undefined;
  /** Only this site's queue (default: every site with queued tags). */
  readonly siteId?: string | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

export interface FlushReport {
  /** Requests sent, with their tags. */
  readonly sent: readonly { siteId: string; priority: PurgePriority; tags: readonly string[] }[];
  /** Requests that failed (rows backed off). */
  readonly failed: number;
  /** A takedown has waited longer than 2 minutes (the bell's `comments-purge-waiting`). */
  readonly takedownWaiting: boolean;
  /** When the queue should be looked at again (`null`: empty). */
  readonly nextCheckAt: string | null;
}

/** Plans and sends one flush of the comment purge queue (§8.4). */
export async function flushCommentPurges(o: FlushOptions): Promise<FlushReport> {
  const clock = o.now ?? (() => new Date());
  const log = o.log ?? (() => {});
  const sent: { siteId: string; priority: PurgePriority; tags: readonly string[] }[] = [];
  let failed = 0;
  let takedownWaiting = false;
  let next: number | undefined;
  const sites = o.siteId ? [o.siteId] : await o.store.purgeQueue.sites();
  for (const siteId of sites) {
    const rows = await o.store.purgeQueue.queued(siteId);
    if (rows.length === 0) continue;
    const now = clock();
    const plan = planPurge({ rows, recent: await o.store.purgeQueue.recent(now), now });
    takedownWaiting ||= plan.takedownWaiting;
    if (plan.nextCheckAt) next = Math.min(next ?? Infinity, Date.parse(plan.nextCheckAt));
    for (const request of plan.requests) {
      const at = clock();
      let ok = false;
      let status = "error";
      try {
        const res = await o.fetch(PURGE_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${o.token}`, "content-type": "application/json" },
          body: JSON.stringify({ tags: request.tags }),
        });
        status = String(res.status);
        // the site Worker answers 502 when Cloudflare said `success: false` (bucket empty)
        ok = res.ok;
        await res.body?.cancel();
      } catch (e) {
        status = e instanceof Error ? e.message : String(e);
      }
      if (ok) {
        await o.store.purgeQueue.sent(siteId, request.tags, at);
        sent.push({ siteId, priority: request.priority, tags: request.tags });
        log(
          `comments purge ${siteId}: ${request.priority}, ${request.tags.length} tag(s): ${status}`,
        );
        continue;
      }
      const tags = new Set(request.tags);
      const back: PurgeQueueRow[] = rows.filter((r) => tags.has(r.tag));
      await o.store.purgeQueue.failed(siteId, back, at);
      failed++;
      log(`comments purge ${siteId} failed (${status}); ${back.length} tag(s) back off`);
      // an empty bucket stays empty for a while: stop here, the next flush retries
      return {
        sent,
        failed,
        takedownWaiting,
        nextCheckAt: new Date(at.getTime() + PURGE_LIMITS.backoffBaseMs).toISOString(),
      };
    }
  }
  return {
    sent,
    failed,
    takedownWaiting,
    nextCheckAt: next === undefined ? null : new Date(next).toISOString(),
  };
}

export interface HourlyReport {
  readonly sites: number;
  /** Rows deleted or cleared by retention, across sites. */
  readonly retained: number;
  /** Comments and reports of entries deleted ≥ 30 days ago. */
  readonly deletedEntries: number;
  /** Comment tags queued because a thread closed by time in the last hour. */
  readonly closed: number;
  readonly salts: number;
  readonly purgeLog: number;
  /** A retention run hit its row budget; the next run continues. */
  readonly more: boolean;
}

/** How far back "closed in the last hour" looks: an hour and a bit, duplicates coalesce. */
const CLOSING_WINDOW_MS = 65 * 60_000;

/**
 * When missing entries were deleted, from the site's snapshots (the graph keeps no deletion time):
 * the first snapshot after the newest one that still had the entry; when none of the recent
 * snapshots has it, the oldest of them (a later time than the real one, so never too early).
 */
async function deletionTimes(
  graph: SiteGraphStore,
  siteId: string,
  missing: readonly string[],
  now: Date,
): Promise<{ nodeId: string; deletedAt: string }[]> {
  const snaps = await graph.listSnapshots(siteId, 200); // newest first
  if (snaps.length === 0) return [];
  return missing.map((nodeId) => {
    const i = snaps.findIndex((s) => s.nodes.some((n) => n.id === nodeId));
    const deletedAt =
      i < 0
        ? (snaps.at(-1)?.createdAt ?? now.toISOString())
        : i === 0
          ? now.toISOString()
          : (snaps[i - 1]?.createdAt ?? now.toISOString());
    return { nodeId, deletedAt };
  });
}

/** The hourly comments job (§8.5, §9.3): bounded work per site; a missed run is caught up later. */
export async function runCommentsHourly(o: {
  readonly graph: SiteGraphStore;
  readonly store: SqlCommentStore;
  readonly now: Date;
}): Promise<HourlyReport> {
  const { graph, store, now } = o;
  let retained = 0;
  let deletedEntries = 0;
  let closed = 0;
  let more = false;
  const sites = await graph.listSites();
  for (const site of sites) {
    const settings = await store.settings(site.id);
    const run = await store.retention.run(site.id, retentionPlan(settings.retention, now));
    retained += Object.values(run.counts).reduce((a, b) => a + (b ?? 0), 0);
    more ||= run.more;

    const commented = await store.nodeIds(site.id);
    const entries = await graph.listContentEntries(site.id);
    if (commented.length > 0) {
      const live = new Set(entries.map((e) => e.id));
      const missing = commented.filter((id) => !live.has(id));
      if (missing.length > 0) {
        const due = deletedEntriesDue(await deletionTimes(graph, site.id, missing, now), now);
        if (due.length > 0) deletedEntries += await store.retention.deleteEntries(site.id, due);
      }
    }

    // Threads that closed by time in the last hour: the cached page still shows the form.
    if (settings.enabled) {
      const threads = new Map((await store.threads(site.id)).map((t) => [t.nodeId, t]));
      const tags: string[] = [];
      for (const e of entries) {
        if (e.status !== "published" || !collectionEnabled(settings, e.collection)) continue;
        if (closeAfterDaysFor(settings, e.collection) === null && !threads.get(e.id)?.closesAt)
          continue;
        const thread = threads.get(e.id);
        if (thread?.mode === "closed" || thread?.mode === "hidden") continue;
        const at = threadClosesAt(
          settings,
          { nodeId: e.id, collection: e.collection, publishedAt: e.publishedAt ?? null },
          thread,
        );
        if (at === null) continue;
        const t = Date.parse(at);
        if (t <= now.getTime() && t > now.getTime() - CLOSING_WINDOW_MS)
          tags.push(`cloudhal-comments-${e.id}`);
      }
      if (tags.length > 0) {
        await store.purgeQueue.enqueue(site.id, tags, "normal");
        closed += tags.length;
      }
    }
  }
  const deployment = await store.retention.runDeployment(now, oldestSaltMonthToKeep(now));
  return {
    sites: sites.length,
    retained,
    deletedEntries,
    closed,
    salts: deployment.salts,
    purgeLog: deployment.purgeLog,
    more,
  };
}

/** The comment secrets and switches of a deployment (both Workers read the same key). */
export interface CommentsEnv {
  CLOUDHAL_COMMENTS_KEY?: string;
  /** `false` turns comments off for the deployment (`cloudhal.json` `comments.available`). */
  CLOUDHAL_COMMENTS_AVAILABLE?: string;
  /**
   * `off` when `cloudhal deploy` had to go without the hourly cron trigger (Workers Free allows 5
   * per account): the hourly job then runs after admin requests, at most once an hour.
   */
  CLOUDHAL_COMMENTS_CRON?: string;
}

/** True when the deployment serves comments: a valid key and not switched off. */
export function commentsOn(env: CommentsEnv): boolean {
  const key = env.CLOUDHAL_COMMENTS_KEY;
  return (
    typeof key === "string" &&
    key.length >= MIN_SECRET_LENGTH &&
    env.CLOUDHAL_COMMENTS_AVAILABLE !== "false"
  );
}

/** One hour between on-request runs of the comments job (no cron trigger). */
export const ON_REQUEST_HOURLY_MS = 3_600_000;

/** Whether an admin request should run the hourly comments job (no cron trigger, an hour since). */
export function commentsHourlyDue(env: CommentsEnv, now: number, last: number): boolean {
  return (
    commentsOn(env) && env.CLOUDHAL_COMMENTS_CRON === "off" && now - last >= ON_REQUEST_HOURLY_MS
  );
}

/**
 * The admin Worker's `CommentsDeps`, or `undefined` when comments are unavailable. `wake` is
 * called after a write queued purge rows (the Worker flushes in `waitUntil`); `purgeSite` purges
 * the whole site cache (the last resort).
 */
export async function adminComments(
  env: CommentsEnv,
  sql: SqlDriver,
  o: {
    readonly wake?: ((siteId: string, priority: PurgePriority) => void) | undefined;
    readonly purgeSite?: ((siteId: string) => Promise<void>) | undefined;
  } = {},
): Promise<CommentsDeps | undefined> {
  if (!commentsOn(env)) return undefined;
  return {
    store: new SqlCommentStore(sql),
    keys: await deriveCommentKeys(env.CLOUDHAL_COMMENTS_KEY as string),
    ...(o.wake ? { onQueued: o.wake } : {}),
    ...(o.purgeSite ? { purgeSite: o.purgeSite } : {}),
  };
}
