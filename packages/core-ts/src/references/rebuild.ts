/**
 * RFC-0045 §2.4: `entry_refs` for a whole site from its node rows, in the batch that writes the
 * node set (`importSite`, so pull, push, `cloudhal import --replace` and `--revert`, and snapshot
 * restores). Emitted only beside a written node set: an `unchanged` import's plan-time rows could
 * replace a concurrent writer's fresher ones (R10, the `asset_refs` lesson of #196).
 *
 * `shared` is computed in JS from the same site row, so no `NULL` can arise, and body keys are
 * read through any `migration.fromKey` the site carries (`entryRefRows`). There is no membership
 * join: rows are kept for every stored value, and the site filters keep them harmless. The
 * `INSERT` is chunked below 90 KB a statement; the chunks count against the import batch's cap.
 * Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { chunks, REFS_STATEMENT_BYTES } from "../media/refs-rebuild.ts";
import { entryRefRowsOf } from "./rows.ts";

const INSERT_SQL = `INSERT INTO entry_refs (site_id, target_id, source_id, source_collection, field, root_key, shared, source_status)
  SELECT ?, json_extract(r.value, '$.t'), json_extract(r.value, '$.n'), json_extract(r.value, '$.c'),
    json_extract(r.value, '$.f'), json_extract(r.value, '$.k'), json_extract(r.value, '$.h'), json_extract(r.value, '$.s')
  FROM json_each(?) r`;

const encoder = new TextEncoder();

/** The rows of a site's entry bodies, JSON-encoded for `json_each`. */
export function entryRefItems(
  siteId: string,
  rows: readonly { id: string; kind: string; body: string }[],
): string[] {
  const siteRow = rows.find((r) => r.kind === "site" && r.id === siteId);
  if (!siteRow) return [];
  const site = JSON.parse(siteRow.body) as Pick<Site, "collections">;
  const out: string[] = [];
  for (const r of rows) {
    if (r.kind !== "contentEntry") continue;
    const entry = JSON.parse(r.body) as ContentEntry;
    for (const row of entryRefRowsOf(site, entry))
      out.push(
        JSON.stringify({
          t: row.t,
          n: r.id,
          c: entry.collection,
          f: row.f,
          k: row.k,
          h: row.shared,
          s: entry.status,
        }),
      );
  }
  return out;
}

/** `entry_refs` for a whole site from node rows: one `DELETE`, then `INSERT`s below 90 KB each. */
export function entryRefsRebuild(
  siteId: string,
  rows: readonly { id: string; kind: string; body: string }[],
): SqlStatement[] {
  const fixed = encoder.encode(INSERT_SQL + siteId).length;
  return [
    { sql: "DELETE FROM entry_refs WHERE site_id = ?", params: [siteId] },
    ...chunks(entryRefItems(siteId, rows), REFS_STATEMENT_BYTES - fixed).map((items) => ({
      sql: INSERT_SQL,
      params: [siteId, items],
    })),
  ];
}

/** A deleted node's rows, only once the node is gone (anchored like `dropRefsStatement`). */
export function dropEntryRefsStatement(nodeId: string): SqlStatement {
  return {
    sql: "DELETE FROM entry_refs WHERE source_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)",
    params: [nodeId, nodeId],
  };
}
