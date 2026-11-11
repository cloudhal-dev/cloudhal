/**
 * RFC-0045 §5: the entry picker's search, bounded per request and complete across requests.
 *
 * - **Where it reads.** An entry's node key is `<collection>:<locale>:<slug>` (`NODE_SPEC`), and
 *   `nodes_site_kind_key (site_id, kind, key)` is a unique index. So each allowed collection, or
 *   collection and locale, is one index range, read in key order with a keyset cursor, and every
 *   row read is a row returned: the `WHERE` names only indexed columns.
 * - **The budget.** At most `PICK_ROWS` rows per request, across collections. When the budget
 *   ends before `limit` matches, the answer says `truncated: true` and carries a `cursor`. Asking
 *   again with it continues where this request stopped, so any matching entry can be found.
 * - **The match.** `q` and each row's title and slug are folded with the same `foldName` (case,
 *   diacritics, Turkish İ/ı), and matched as a substring, with no pattern over the input (rule 13).
 *   A `q` with nothing left once folded (only punctuation) matches nothing.
 *
 * Archived entries are skipped (they count toward the budget). Results come in key order:
 * collection, locale, slug.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { foldName } from "@cloudhal/core-ts/names";
import type { SqlDriver } from "@cloudhal/storage";

/** Rows one picker request reads at most. */
export const PICK_ROWS = 1000;

export interface PickQuery {
  q: string;
  collections: readonly string[];
  locale?: string | undefined;
  limit: number;
  /** The `cursor` of an earlier answer: the last node key it read. */
  cursor?: string | undefined;
  /** Rows to read at most (default `PICK_ROWS`; tests pass less). */
  budget?: number | undefined;
}

export interface PickCard {
  groupId: string;
  id: string;
  title: string;
  collection: string;
  status: ContentEntry["status"];
  locale: string;
}

export interface PickPage {
  entries: PickCard[];
  /** Where to continue; absent once every allowed collection was read to its end. */
  cursor?: string;
  /** The row budget ended before `limit` matches were found: ask again with `cursor`. */
  truncated?: true;
}

interface Row extends Record<string, unknown> {
  key: string;
  id: string;
  title: string | null;
  status: ContentEntry["status"];
  grp: string | null;
}

/** The SQL of one collection range (exported for the query-plan test). */
export const PICK_RANGE_SQL = `SELECT key, id, json_extract(body, '$.title') AS title,
    json_extract(body, '$.status') AS status, json_extract(body, '$.translation.group') AS grp
  FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND key >= ? AND key > ? AND key < ?
  ORDER BY key LIMIT ?`;

/** The key range of a collection (and locale): `<prefix>` up to the next character after `:`. */
function rangeOf(collection: string, locale: string | undefined) {
  const prefix = locale === undefined ? `${collection}:` : `${collection}:${locale}:`;
  return { prefix, upper: `${prefix.slice(0, -1)};` };
}

/** One picker answer. */
export async function pickEntries(
  sql: SqlDriver,
  siteId: string,
  query: PickQuery,
): Promise<PickPage> {
  const raw = query.q.trim();
  const q = foldName(raw);
  if (raw !== "" && q === "") return { entries: [] };
  const hits = (text: string | null) => text !== null && foldName(text).includes(q);
  const budget = query.budget ?? PICK_ROWS;
  const entries: PickCard[] = [];
  let read = 0;
  let last = query.cursor;
  for (const collection of [...new Set(query.collections)].sort()) {
    const { prefix, upper } = rangeOf(collection, query.locale);
    if (last !== undefined && last >= upper) continue;
    // One read per range, for the rest of the budget: the range ends first, or the budget does.
    const want = budget - read;
    const rows = await sql.all<Row>(PICK_RANGE_SQL, [siteId, prefix, last ?? "", upper, want]);
    for (const r of rows) {
      read++;
      last = r.key;
      if (r.status === "archived") continue;
      const cut = r.key.indexOf(":", collection.length + 1);
      if (q !== "" && !hits(r.title) && !hits(r.key.slice(cut + 1))) continue;
      entries.push({
        groupId: r.grp ?? r.id,
        id: r.id,
        title: r.title ?? "",
        collection,
        status: r.status,
        locale: r.key.slice(collection.length + 1, cut),
      });
      if (entries.length >= query.limit) return { entries, cursor: r.key };
    }
    if (read >= budget) return { entries, ...(last ? { cursor: last } : {}), truncated: true };
  }
  return { entries };
}
