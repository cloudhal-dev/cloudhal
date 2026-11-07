/**
 * RFC-0042 §4, #110: the admin job's tidy. A site write that unlists a collection drops its state
 * row and leaves its rows (an entry write replaces only its own); this removes them, in bounded
 * statements within the run's budget.
 *
 * Each DELETE covers many (site, collection) pairs and is safe inside itself: a row goes only
 * while its collection has no state row (a collection gets one in the batch that lists it, and
 * loses it in the batch that unlists it) and its site still has the hash the run read the pairs
 * from. So a collection listed (and rebuilt) after the run read its site keeps every row.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import type { ListValuesMeter } from "./meter.ts";

/** Rows one statement removes at most. */
export const TIDY_CHUNK = 2000;
/** (site, collection) pairs one statement looks at. */
const PAIRS = 200;

/** Up to `TIDY_CHUNK` rows of `pairs` (`[siteId, collection, siteHash]`), each guarded as above. */
export function tidyStatement(pairs: readonly (readonly [string, string, string])[]): SqlStatement {
  return {
    sql: `DELETE FROM entry_list_values WHERE rowid IN (SELECT v.rowid FROM json_each(?) j
        CROSS JOIN entry_list_values v
      WHERE v.site_id = json_extract(j.value, '$[0]') AND v.collection = json_extract(j.value, '$[1]')
        AND EXISTS (SELECT 1 FROM nodes s WHERE s.id = json_extract(j.value, '$[0]')
          AND s.hash = json_extract(j.value, '$[2]'))
        AND NOT EXISTS (SELECT 1 FROM entry_list_state t WHERE t.site_id = v.site_id
          AND t.collection = v.collection)
      LIMIT ${TIDY_CHUNK})`,
    params: [JSON.stringify(pairs)],
  };
}

/** The collections of `sites` that list no fields, with the site hash each was read at. */
function unlisted(sites: readonly { site: Site; hash: string }[]) {
  return sites.flatMap(({ site, hash }) =>
    Object.entries(site.collections ?? {})
      .filter(([, s]) => !s?.listFields?.length)
      .map(([c]) => [site.id, c, hash] as const),
  );
}

/** Removes rows of unlisted collections while the meter allows; the number removed. */
export async function tidyRows(
  meter: ListValuesMeter,
  sites: readonly { site: Site; hash: string }[],
): Promise<number> {
  const pairs = unlisted(sites);
  let removed = 0;
  for (let i = 0; i < pairs.length && !meter.short(1); ) {
    const s = tidyStatement(pairs.slice(i, i + PAIRS));
    const r = await meter.sql.run(s.sql, s.params ?? []);
    removed += r.changes;
    if (r.changes < TIDY_CHUNK) i += PAIRS;
  }
  return removed;
}
