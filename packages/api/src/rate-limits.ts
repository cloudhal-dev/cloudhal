/**
 * Cloudhal's own fixed-window counters (#168 item 8), in `rate_limits` (migration 0030) rather
 * than Better Auth's `rateLimit`, which Better Auth prunes by its own 60 s window.
 *
 * Counting is one statement (an upsert with `RETURNING`), so two hits never read each other's
 * half-done window. The table is pruned here, because nothing else does and its keys come from
 * client addresses and submitted email addresses: about one hit in `PRUNE_EVERY` also deletes up
 * to `PRUNE_LIMIT` expired rows through the `expires_at` index. The prune is a statement of its
 * own (a `batch()` returns no rows, so it cannot carry the count), and it may run before or after
 * any hit: it only removes rows whose window has ended, which the next hit on that key would
 * reset to 1 anyway.
 */
import type { SqlDriver } from "@cloudhal/storage";

/** On average one hit in this many prunes expired counters. */
export const PRUNE_EVERY = 32;
/** The most expired rows one prune deletes (D1 prefers short statements). */
export const PRUNE_LIMIT = 500;

/** The default prune decision: random, so per-request instances (Workers) share the cost. */
export const randomPrune = (): boolean => Math.random() < 1 / PRUNE_EVERY;

/** Counts one hit on `key`; the result is the count in the current window, this hit included. */
export async function countHit(
  sql: SqlDriver,
  hit: { key: string; windowMs: number; now: number },
): Promise<number> {
  const { key, windowMs, now } = hit;
  // In an UPDATE every column reference is the row before the update (SQLite), so the three
  // CASEs agree on whether the window has ended.
  const row = await sql.get<{ count: number }>(
    "INSERT INTO rate_limits (key, count, window_start, expires_at) VALUES (?, 1, ?, ?) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.expires_at < ? THEN 1 ELSE rate_limits.count + 1 END, window_start = CASE WHEN rate_limits.expires_at < ? THEN excluded.window_start ELSE rate_limits.window_start END, expires_at = CASE WHEN rate_limits.expires_at < ? THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count",
    [key, now, now + windowMs, now, now, now],
  );
  return Number(row?.count ?? 0);
}

/** Deletes up to `PRUNE_LIMIT` counters whose window ended before `now`; returns how many. */
export async function pruneCounters(sql: SqlDriver, now: number): Promise<number> {
  const r = await sql.run(
    "DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE expires_at < ? LIMIT ?)",
    [now, PRUNE_LIMIT],
  );
  return r.changes;
}
