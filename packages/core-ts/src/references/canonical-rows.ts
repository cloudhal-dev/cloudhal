/**
 * RFC-0045 §2.4 "Canonical rows, from phase 2": the anchors compare a site row's `collections`
 * and definitions as text, so a site row stored verbatim by an import before phase 2 (or by an
 * import planned `unchanged`) could make every entry write of a collection conflict. This job
 * rewrites such rows in canonical form, one CAS each (`WHERE hash = ?`, the hash unchanged:
 * it is computed over canonical JSON already), so it can never race a write (rule 4).
 *
 * Only site rows are rewritten: they are what the anchors read. The admin Worker runs it as a
 * system job, local stores when they open; step 7 runs it once more. Worker-safe.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { canonicalJson } from "../hash.ts";

export interface CanonicalRowsResult {
  /** Site rows read. */
  read: number;
  /** Rows rewritten (a row that changed meanwhile is skipped: its writer stored it canonically). */
  rewritten: number;
}

/** Rewrites up to `limit` non-canonical site rows (default 50); idempotent. */
export async function canonicalizeSiteRows(
  sql: SqlDriver,
  options: { limit?: number } = {},
): Promise<CanonicalRowsResult> {
  const rows = await sql.all<{ id: string; hash: string; body: string }>(
    "SELECT id, hash, body FROM nodes WHERE kind = 'site' ORDER BY id",
  );
  let rewritten = 0;
  for (const row of rows) {
    if (rewritten >= (options.limit ?? 50)) break;
    let canonical: string;
    try {
      canonical = canonicalJson(JSON.parse(row.body));
    } catch {
      continue;
    }
    if (canonical === row.body) continue;
    const r = await sql.run(
      "UPDATE nodes SET body = ? WHERE id = ? AND kind = 'site' AND hash = ? AND body = ?",
      [canonical, row.id, row.hash, row.body],
    );
    rewritten += r.changes;
  }
  return { read: rows.length, rewritten };
}
