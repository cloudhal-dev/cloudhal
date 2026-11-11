/**
 * `asset_refs` for a whole site from its node rows (RFC-0004 §4.4): sync import and repair. Entry
 * rows also count their typed fields' references (RFC-0041 §2) when the site's own row is among
 * them, read through a running rename's `migration.fromKey` like `resolveFields` (an archive
 * exported mid-operation keeps the rows of entries not rewritten yet). Only references to assets
 * of the same site are recorded (RFC-0045 §2.5): the `INSERT` joins `nodes`, so a foreign archive
 * naming another site's asset neither blocks that asset's delete nor hides it from that site's
 * unused list. Run it only in a batch that also writes the site's node set (after the node
 * `INSERT`s): a rebuild beside an unchanged node set would replace rows a concurrent write
 * committed with plan-time ones (#196). Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { fieldAssetRefs, migratedFieldValues, siteFieldDefinitions } from "./field-refs.ts";
import { assetRefsOf } from "./refs.ts";

/** Each rebuild `INSERT` stays below this many bytes, SQL and parameters together (D1: 100 KB). */
export const REFS_STATEMENT_BYTES = 90_000;

/** `listAssets`' `unused` filter: no reference from a node of the asset's own site (RFC-0045 §2.5). */
export const UNUSED_ASSET_SQL =
  "NOT EXISTS (SELECT 1 FROM asset_refs r WHERE r.site_id = nodes.site_id AND r.asset_id = nodes.id)";

const INSERT_SQL = `INSERT INTO asset_refs (site_id, asset_id, node_id, node_kind, field)
  SELECT ?, a.id, json_extract(r.value, '$.n'), json_extract(r.value, '$.k'), json_extract(r.value, '$.f')
  FROM json_each(?) r JOIN nodes a ON a.id = json_extract(r.value, '$.a') AND a.site_id = ? AND a.kind = 'asset'`;

const encoder = new TextEncoder();

/** The JSON-encoded rows, in `json_each` arrays of at most `budget` bytes each. */
function chunks(items: readonly string[], budget: number): string[] {
  const out: string[] = [];
  let open: string[] = [];
  let bytes = 2;
  for (const item of items) {
    const size = encoder.encode(item).length + 1;
    if (open.length > 0 && bytes + size > budget) {
      out.push(`[${open.join(",")}]`);
      open = [];
      bytes = 2;
    }
    open.push(item);
    bytes += size;
  }
  if (open.length > 0) out.push(`[${open.join(",")}]`);
  return out;
}

/** `asset_refs` for a whole site from node rows: one `DELETE`, then `INSERT`s below 90 KB each. */
export function refsRebuild(
  siteId: string,
  rows: readonly { id: string; kind: string; body: string }[],
): SqlStatement[] {
  const siteRow = rows.find((r) => r.kind === "site" && r.id === siteId);
  const defs = siteRow ? siteFieldDefinitions(JSON.parse(siteRow.body) as Site) : {};
  const all = new Set<string>();
  for (const r of rows) {
    const node = JSON.parse(r.body);
    const refs = assetRefsOf(r.kind, node);
    if (r.kind === "contentEntry") {
      const entry = node as ContentEntry;
      const own = defs[entry.collection] ?? [];
      refs.push(...fieldAssetRefs(own, migratedFieldValues(own, entry.fields)));
    }
    for (const ref of refs)
      all.add(JSON.stringify({ a: ref.assetId, n: r.id, k: r.kind, f: ref.field }));
  }
  const fixed = encoder.encode(INSERT_SQL + siteId + siteId).length;
  return [
    { sql: "DELETE FROM asset_refs WHERE site_id = ?", params: [siteId] },
    ...chunks([...all], REFS_STATEMENT_BYTES - fixed).map((rows) => ({
      sql: INSERT_SQL,
      params: [siteId, rows, siteId],
    })),
  ];
}
