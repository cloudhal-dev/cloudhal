/**
 * Reader comments for `cloudhal studio` and `cloudhal mcp` (RFC-0007 §15.2): the project's SQLite
 * store, and the keys from `CLOUDHAL_COMMENTS_KEY` or the data directory's `comments.key` (which
 * `cloudhal dev` creates on the first comment request). Without a key the queue, moderation and
 * MCP tools still work; commenter emails and stored secrets answer 503 until there is one.
 *
 * There is no cron on Node, so `startLocalCommentsJob` runs the admin Worker's hourly job (the
 * same `runCommentsHourly`: retention, comments of deleted entries, threads closed by time, old
 * salts) at start and every hour while the process runs. There is no edge cache either: the job
 * empties the purge queue moderation filled, so nothing waits for a purge that never comes.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommentsHourly } from "@cloudhal/cloudflare/comments";
import {
  type CommentKeys,
  deriveCommentKeys,
  MIN_SECRET_LENGTH,
  randomBytes,
  toBase64Url,
} from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import type { SqlDriver } from "@cloudhal/storage";

const usable = (k: unknown): k is string => typeof k === "string" && k.length >= MIN_SECRET_LENGTH;

/** The data directory's key file (`cloudhal dev` creates the same one). */
export const LOCAL_KEY_FILE = "comments.key";

/**
 * The project's comments keys: `CLOUDHAL_COMMENTS_KEY`, else `<dataDir>/comments.key`; with
 * `create`, a missing file is created (256 random bits, owner-only), as `cloudhal dev` does.
 */
export async function localCommentsKeys(
  dataDir: string,
  o: { create?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<CommentKeys | undefined> {
  const env = o.env ?? process.env;
  let secret = env.CLOUDHAL_COMMENTS_KEY;
  if (!usable(secret)) {
    try {
      secret = (await readFile(path.join(dataDir, LOCAL_KEY_FILE), "utf8")).trim();
    } catch {
      secret = undefined;
    }
  }
  if (!usable(secret) && o.create) {
    secret = toBase64Url(randomBytes(32));
    await writeFile(path.join(dataDir, LOCAL_KEY_FILE), `${secret}\n`, { mode: 0o600 });
  }
  return usable(secret) ? deriveCommentKeys(secret) : undefined;
}

export async function localComments(
  sql: SqlDriver,
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
) {
  const keys = await localCommentsKeys(dataDir, { env });
  const store = new SqlCommentStore(sql);
  return {
    store,
    ...(keys ? { keys } : {}),
    // no edge cache locally: a queued purge is done at once (Studio shows nothing waiting)
    onQueued: (siteId: string) => {
      drainPurgeQueue(store, siteId).catch(() => {});
    },
  };
}

/** Empties a site's (or every site's) comment purge queue: locally there is nothing to purge. */
export async function drainPurgeQueue(store: SqlCommentStore, siteId?: string): Promise<number> {
  let drained = 0;
  for (const id of siteId ? [siteId] : await store.purgeQueue.sites()) {
    const r = await store.sql.run("DELETE FROM comment_purge_queue WHERE site_id = ?", [id]);
    drained += r.changes;
  }
  return drained;
}

/** One run of the local hourly job; returns what it did (for logs and tests). */
export async function runLocalCommentsJob(
  graph: SiteGraphStore,
  store: SqlCommentStore,
  now: Date = new Date(),
) {
  const report = await runCommentsHourly({ graph, store, now });
  return { ...report, drained: await drainPurgeQueue(store) };
}

/**
 * Starts the hourly comments job on its own timer: once now, then every hour; errors are logged,
 * never thrown. Returns a stop function.
 *
 * @deprecated `cloudhal studio`, `mcp` and `dev` run the job as the `comments.hourly` system job
 * of the scheduler's Node ticker (RFC-0008 §8.4, `scheduler-local.ts`).
 */
export function startLocalCommentsJob(
  graph: SiteGraphStore,
  store: SqlCommentStore,
  log: (line: string) => void = (l) => process.stderr.write(`${l}\n`),
  intervalMs = 3_600_000,
): () => void {
  const tick = () => {
    runLocalCommentsJob(graph, store).catch((e) =>
      log(`comments hourly job failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
