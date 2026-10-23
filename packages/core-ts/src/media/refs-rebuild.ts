/**
 * `asset_refs` for a whole site from its node rows (RFC-0004 §4.4): sync import and repair. Entry
 * rows also count their typed fields' references (RFC-0041 §2) when the site's own row is among
 * them. Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { fieldAssetRefs, siteFieldDefinitions } from "./field-refs.ts";
import { assetRefsOf } from "./refs.ts";

/** `asset_refs` for a whole site from node rows (DELETE + one INSERT). */
export function refsRebuild(
  siteId: string,
  rows: readonly { id: string; kind: string; body: string }[],
): SqlStatement[] {
  const siteRow = rows.find((r) => r.kind === "site" && r.id === siteId);
  const defs = siteRow ? siteFieldDefinitions(JSON.parse(siteRow.body) as Site) : {};
  const all: { a: string; n: string; k: string; f: string }[] = [];
  for (const r of rows) {
    const node = JSON.parse(r.body);
    const refs = assetRefsOf(r.kind, node);
    if (r.kind === "contentEntry") {
      const entry = node as ContentEntry;
      refs.push(...fieldAssetRefs(defs[entry.collection] ?? [], entry.fields));
    }
    for (const ref of refs) all.push({ a: ref.assetId, n: r.id, k: r.kind, f: ref.field });
  }
  const out: SqlStatement[] = [
    { sql: "DELETE FROM asset_refs WHERE site_id = ?", params: [siteId] },
  ];
  if (all.length > 0)
    out.push({
      sql: `INSERT OR IGNORE INTO asset_refs (site_id, asset_id, node_id, node_kind, field)
            SELECT ?, json_extract(value, '$.a'), json_extract(value, '$.n'), json_extract(value, '$.k'), json_extract(value, '$.f') FROM json_each(?)`,
      params: [siteId, JSON.stringify(all)],
    });
  return out;
}
