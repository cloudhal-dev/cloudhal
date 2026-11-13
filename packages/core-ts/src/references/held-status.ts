/**
 * RFC-0045 §7: a held row follows its holder's status. A person's write leaves the rows of values
 * a running conversion did not accept as they are (`HeldRef`): `entryRefStatements` keeps them out
 * of its `DELETE` and its `INSERT`. Their `source_status` is what the delete guard reads (`SHOWN`,
 * `references/sql.ts`), so the write sets it to the entry's new status, in the same batch and
 * anchored on the entry's new hash like the other rows statements (rule 4). Worker-safe.
 */
import type { SqlStatement } from "@cloudhal/storage";

/** The `UPDATE` of the held pairs' `source_status` (`kept`: `"<field> <target>"` keys). */
export function heldStatusStatement(
  at: { siteId: string; nodeId: string; status: string; hash: string },
  kept: ReadonlySet<string>,
): SqlStatement {
  return {
    sql: `UPDATE entry_refs SET source_status = ?
      WHERE site_id = ? AND source_id = ? AND field || ' ' || target_id IN (SELECT value FROM json_each(?))
        AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)`,
    params: [at.status, at.siteId, at.nodeId, JSON.stringify([...kept]), at.nodeId, at.hash],
  };
}
