/**
 * RFC-0045 §7, `set_field_localized` phase A: the rows' `shared` follows a reference or repeater
 * field's new `localized` in the same batch as the site write, anchored on the site's new hash,
 * so guards and purges read `resolveFields`' rule from that moment. Rows a racing holder write
 * inserts afterwards read `shared` from the site row at batch time (R16). The revert's site
 * write goes through the same diff, back. Pure.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { renamedFrom } from "../fields/types.ts";
import { holdsReferences, sharedOf } from "./rows.ts";

/** One `UPDATE entry_refs SET shared` per field whose `localized` the write changes. */
export function sharedUpdates(site: Site, next: Site, hash: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  for (const [collection, settings] of Object.entries(next.collections ?? {}))
    for (const def of settings?.fields ?? []) {
      // A rename's revert restores the old key and may restore an older `localized` with it.
      const from = renamedFrom(def);
      const keys = [def.key, ...(from === undefined ? [] : [from])];
      const was = site.collections?.[collection]?.fields?.find((d) => keys.includes(d.key));
      if (!was || was.localized === def.localized || !holdsReferences(def)) continue;
      out.push({
        sql: `UPDATE entry_refs SET shared = ?
               WHERE site_id = ? AND source_collection = ? AND root_key IN (?, ?)
                 AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)`,
        params: [sharedOf(def), site.id, collection, def.key, from ?? def.key, site.id, hash],
      });
    }
  return out;
}
