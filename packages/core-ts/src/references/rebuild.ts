/**
 * RFC-0045 §2.4: `entry_refs` for a whole site from its node rows, in the batch that writes the
 * node set (`importSite`, so pull, push, `cloudhal import --replace` and `--revert`, and snapshot
 * restores). Emitted only beside a written node set: an `unchanged` import's plan-time rows could
 * replace a concurrent writer's fresher ones (R10, the `asset_refs` lesson of #196).
 *
 * `shared` is computed in JS from the same site row, so no `NULL` can arise, and body keys are
 * read through any `migration.fromKey` the site carries (`entryRefRows`); a running text ↔
 * reference conversion's path is read through its earlier type (`rebuildRows`). There is no membership
 * join: rows are kept for every stored value, and the site filters keep them harmless. The
 * `INSERT` is chunked below 90 KB a statement; the chunks count against the import batch's cap.
 * Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { GROUP_ID_PATTERN } from "../fields/props.ts";
import { fieldDefinitions, isRecord } from "../fields/types.ts";
import { chunks, REFS_STATEMENT_BYTES } from "../media/refs-rebuild.ts";
import { convertingPath } from "./conversion-rows.ts";
import { type EntryRefRow, entryRefRows, sharedOf, storedKey } from "./rows.ts";

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/**
 * RFC-0045 §7: an entry's rows for a rebuild, read through a running text ↔ reference
 * conversion's earlier type, so they mean only what phase B or an accepted write left. Converting
 * from text, a bare string gets no row, so phase B checks it again; a multiple's list keeps its
 * rows (only phase B or a guarded write stores one). Converting from references, every stored
 * group-id-shaped string keeps its row, whether or not its group still has a member, as the live
 * writer keeps it; phase B then reports a deleted target. Without such a marker, `entryRefRows`.
 */
export function rebuildRows(site: Pick<Site, "collections">, entry: ContentEntry): EntryRefRow[] {
  const defs = fieldDefinitions(site, entry.collection);
  const rows = entryRefRows(defs, entry.fields);
  const values = isRecord(entry.fields) ? entry.fields : {};
  const out = [...rows];
  for (const def of defs) {
    const f = convertingPath(def);
    if (f === undefined) continue;
    const k = storedKey(def, values) ?? def.key;
    const sub = def.migration?.sub;
    const stored = values[k];
    if (def.migration?.fromType === "text") {
      // A bare string may be legacy text; a multiple's list came from phase B or a guarded write.
      if (sub !== undefined || !Array.isArray(stored))
        out.splice(0, out.length, ...out.filter((row) => row.f !== f));
      continue;
    }
    const found =
      sub === undefined
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : Array.isArray(stored)
          ? stored.map((i) => (isRecord(i) ? i[sub] : undefined))
          : [];
    for (const t of new Set(found))
      if (typeof t === "string" && GROUP_ID.test(t)) out.push({ t, f, k, shared: sharedOf(def) });
  }
  return out;
}

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
  const entries = rows.flatMap((r) =>
    r.kind === "contentEntry" ? [{ id: r.id, entry: JSON.parse(r.body) as ContentEntry }] : [],
  );
  for (const { id, entry } of entries) {
    for (const row of rebuildRows(site, entry))
      out.push(
        JSON.stringify({
          t: row.t,
          n: id,
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
