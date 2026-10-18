/**
 * Site search (RFC-0019 §3, RFC-0029 §2): an FTS5 index of what readers see (`search_index`,
 * migrations `0021_search` and `0022_search_kinds`): published articles and pages, and public term
 * and author archives.
 *
 * - **Built on publish.** The rows come from the snapshot a publish or rollback makes live and are
 *   written in the same `batch()` as the pointer flip, guarded on the site's new hash (hard rule
 *   4); when the index already reflects the snapshot that was live, only the changed nodes are
 *   rewritten. `search_state` records which snapshot the index reflects.
 * - **Time gates are columns.** An embargoed article or page is indexed and found once its `from`
 *   has passed; an expired one only before its `until`. Drafts are never indexed.
 * - **Archives follow their articles.** `search_links` holds each indexed article's terms with its
 *   locale and gates; a term or author is found only while one of them is visible.
 * - **Queries are words, never syntax.** `ftsQuery` keeps letters and digits only and quotes every
 *   term, so readers cannot use column filters, `NEAR` or other FTS5 operators.
 *
 * Worker-safe: plain SQL through `SqlDriver`, no Node modules.
 */
import type { ContentEntry, NodeRef, Page, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import {
  ftsQuery,
  MARK_CLOSE,
  MARK_OPEN,
  SEARCH_QUERY_MAX,
  type SearchKind,
  type SearchOptions,
  type SearchResults,
  type SearchRow,
  searchKinds,
  searchPaging,
} from "./search-common.ts";
import { pageSearchRow, searchRowOf, termSearchRows } from "./search-rows.ts";

export * from "./search-common.ts";
export { searchRows } from "./search-memory.ts";
export {
  pageSearchRow,
  searchDocuments,
  searchRowOf,
  searchText,
  sectionText,
  termSearchRows,
} from "./search-rows.ts";

/** A JSON payload of rows per statement stays under D1's 2 MB value limit with room to spare. */
const PAYLOAD_MAX = 512 * 1024;

/** A guard condition: the statements run only while the site row has `hash`. */
export interface SiteGuard {
  siteId: string;
  hash: string;
}

const GUARD = "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)";

/** Rows as JSON payloads of at most `PAYLOAD_MAX` characters each. */
function payloads(rows: readonly SearchRow[]): string[] {
  const out: string[] = [];
  let chunk: string[] = [];
  let size = 2;
  for (const row of rows) {
    const json = JSON.stringify(row);
    if (chunk.length > 0 && size + json.length + 1 > PAYLOAD_MAX) {
      out.push(`[${chunk.join(",")}]`);
      chunk = [];
      size = 2;
    }
    chunk.push(json);
    size += json.length + 1;
  }
  if (chunk.length > 0) out.push(`[${chunk.join(",")}]`);
  return out;
}

/** What one index update writes: either the whole site or only some nodes. */
export interface SearchPlan {
  snapshotId: string;
  /** Rewrite every row of the site (otherwise only `remove`, `removeKinds` and `rows`' ids). */
  full: boolean;
  /** Nodes whose rows go (changed or no longer live). */
  remove: string[];
  /** Kinds whose rows all go (every archive, when a taxonomy or the site's locales changed). */
  removeKinds?: SearchKind[];
  rows: SearchRow[];
}

/** The statements of a plan, each guarded on the site's hash (one batch with the pointer flip). */
export function searchStatements(plan: SearchPlan, guard: SiteGuard, at: string): SqlStatement[] {
  const g = [guard.siteId, guard.hash];
  const site = guard.siteId;
  const out: SqlStatement[] = [];
  const del = (table: string, where: string, params: string[]) =>
    out.push({
      sql: `DELETE FROM ${table} WHERE site_id = ? ${where}AND ${GUARD}`,
      params: [site, ...params, ...g],
    });
  if (plan.full) {
    del("search_index", "", []);
    del("search_links", "", []);
  } else {
    if (plan.removeKinds && plan.removeKinds.length > 0)
      del("search_index", "AND kind IN (SELECT value FROM json_each(?)) ", [
        JSON.stringify(plan.removeKinds),
      ]);
    if (plan.remove.length > 0) {
      const ids = JSON.stringify(plan.remove);
      del("search_index", "AND node_id IN (SELECT value FROM json_each(?)) ", [ids]);
      del("search_links", "AND node_id IN (SELECT value FROM json_each(?)) ", [ids]);
    }
  }
  for (const json of payloads(plan.rows)) {
    out.push({
      sql: `INSERT INTO search_index (site_id, node_id, locale, kind, title, summary, body, href, context, published_at, gate_from, gate_until)
SELECT ?, j.value ->> '$.nodeId', j.value ->> '$.locale', j.value ->> '$.kind', j.value ->> '$.title', j.value ->> '$.summary', j.value ->> '$.body', j.value ->> '$.href', j.value ->> '$.context', j.value ->> '$.publishedAt', j.value ->> '$.gateFrom', j.value ->> '$.gateUntil'
FROM json_each(?) j WHERE ${GUARD}`,
      params: [site, json, ...g],
    });
    if (plan.rows.some((r) => r.terms && r.terms.length > 0))
      out.push({
        sql: `INSERT INTO search_links (site_id, node_id, term_id, locale, gate_from, gate_until)
SELECT ?, j.value ->> '$.nodeId', t.value, j.value ->> '$.locale', j.value ->> '$.gateFrom', j.value ->> '$.gateUntil'
FROM json_each(?) j, json_each(j.value, '$.terms') t WHERE ${GUARD}`,
        params: [site, json, ...g],
      });
  }
  out.push({
    sql: `INSERT INTO search_state (site_id, snapshot_id, entries, updated_at)
SELECT ?, ?, (SELECT count(*) FROM search_index WHERE site_id = ?), ? WHERE ${GUARD}
ON CONFLICT (site_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, entries = excluded.entries, updated_at = excluded.updated_at`,
    params: [site, plan.snapshotId, site, at, ...g],
  });
  return out;
}

/** The snapshot the index reflects for a site, if any, and how many rows it holds. */
export async function searchState(
  sql: SqlDriver,
  siteId: string,
): Promise<{ snapshotId: string; entries: number } | undefined> {
  const row = await sql.get<{ snapshot_id: string; entries: number }>(
    "SELECT snapshot_id, entries FROM search_state WHERE site_id = ?",
    [siteId],
  );
  return row ? { snapshotId: row.snapshot_id, entries: row.entries } : undefined;
}

type Snap = { id: string; nodes: readonly NodeRef[] };
/** Node kinds the index is built from. */
const INDEXED = new Set<NodeRef["kind"]>(["contentEntry", "page", "term"]);

/**
 * Plans the index update to `target` (the snapshot becoming live). With `base`, the snapshot the
 * index reflects now, only nodes that changed between them are rewritten, and every archive row
 * when a taxonomy or the site (its locales) changed; without it, all.
 */
export async function planSearch(input: {
  target: Snap;
  base?: Snap | undefined;
  read: (ref: NodeRef) => Promise<unknown>;
}): Promise<SearchPlan> {
  const { target, base } = input;
  const incremental = base !== undefined;
  const before = new Map((base?.nodes ?? []).map((n) => [n.id, n.hash]));
  const changed = (n: NodeRef) => !incremental || before.get(n.id) !== n.hash;
  const live = new Set(target.nodes.map((n) => n.id));
  const archivesChanged =
    !incremental ||
    target.nodes.some((n) => (n.kind === "taxonomy" || n.kind === "site") && changed(n)) ||
    (base?.nodes ?? []).some((n) => n.kind === "taxonomy" && !live.has(n.id));
  const rewrite = target.nodes.filter(
    (n) => INDEXED.has(n.kind) && (changed(n) || (n.kind === "term" && archivesChanged)),
  );
  const rows: SearchRow[] = [];
  const archives = rewrite.some((n) => n.kind === "term")
    ? await archiveContext(target, input.read)
    : undefined;
  for (const ref of rewrite) {
    const node = await input.read(ref);
    if (ref.kind === "contentEntry") pushRow(rows, searchRowOf(node as ContentEntry));
    else if (ref.kind === "page") pushRow(rows, pageSearchRow(node as Page));
    else if (archives) {
      const term = node as Term;
      const taxonomy = archives.taxonomies.get(term.taxonomyId);
      if (taxonomy) rows.push(...termSearchRows(taxonomy, term, archives.locales));
    }
  }
  const remove = incremental
    ? [
        ...(base?.nodes ?? [])
          .filter((n) => INDEXED.has(n.kind) && !live.has(n.id))
          .map((n) => n.id),
        ...rewrite.filter((n) => before.has(n.id)).map((n) => n.id),
      ]
    : [];
  return {
    snapshotId: target.id,
    full: !incremental,
    remove,
    ...(incremental && archivesChanged ? { removeKinds: ["term", "author"] as SearchKind[] } : {}),
    rows,
  };
}

function pushRow(rows: SearchRow[], row: SearchRow | undefined): void {
  if (row) rows.push(row);
}

/** The site's locales and taxonomies, which term rows need. */
async function archiveContext(
  target: Snap,
  read: (ref: NodeRef) => Promise<unknown>,
): Promise<{ locales: string[]; taxonomies: Map<string, Taxonomy> }> {
  const siteRef = target.nodes.find((n) => n.kind === "site");
  const site = siteRef ? ((await read(siteRef)) as Site) : undefined;
  const taxonomies = new Map<string, Taxonomy>();
  for (const ref of target.nodes.filter((n) => n.kind === "taxonomy"))
    taxonomies.set(ref.id, (await read(ref)) as Taxonomy);
  const locales = site ? [...new Set([site.defaultLocale, ...(site.locales ?? [])])] : [];
  return { locales, taxonomies };
}

/** A visible archive: its term is linked by an indexed article the reader can see. */
const LINKED = `(kind NOT IN ('term', 'author') OR EXISTS (SELECT 1 FROM search_links l
WHERE l.site_id = ? AND l.term_id = search_index.node_id AND l.locale = ?
AND (l.gate_from IS NULL OR l.gate_from <= ?) AND (l.gate_until IS NULL OR l.gate_until > ?)))`;

/** Searches the index for a site's readers. A query with nothing searchable finds nothing. */
export async function searchIndex(
  sql: SqlDriver,
  siteId: string,
  query: string,
  options: SearchOptions,
): Promise<SearchResults> {
  const { perPage, page } = searchPaging(options);
  const q = query.slice(0, SEARCH_QUERY_MAX).trim();
  const state = await searchState(sql, siteId);
  const stale = options.snapshotId !== undefined && state?.snapshotId !== options.snapshotId;
  const match = ftsQuery(q);
  const empty = { query: q, hits: [], total: 0, page, pages: 0, perPage, stale, provider: "fts5" };
  if (!match || !state) return empty;
  const now = new Date(options.now).toISOString();
  const where = `search_index MATCH ? AND site_id = ? AND locale = ?
AND kind IN (SELECT value FROM json_each(?))
AND (gate_from IS NULL OR gate_from <= ?) AND (gate_until IS NULL OR gate_until > ?)
AND ${LINKED}`;
  const kinds = JSON.stringify(searchKinds(options.kinds));
  const params = [match, siteId, options.locale, kinds, now, now, siteId, options.locale, now, now];
  const count = await sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM search_index WHERE ${where}`,
    params,
  );
  const total = count?.n ?? 0;
  const pages = Math.ceil(total / perPage);
  if (total === 0 || page > pages) return { ...empty, total, pages };
  const rows = await sql.all<{
    node_id: string;
    kind: SearchKind | null;
    title: string;
    href: string;
    context: string | null;
    snippet: string;
    published_at: string | null;
  }>(
    `SELECT node_id, kind, title, href, context, published_at,
snippet(search_index, -1, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 16) AS snippet
FROM search_index WHERE ${where}
ORDER BY bm25(search_index, 0, 0, 0, 0, 10, 4, 1, 0, 0, 0, 0, 0), published_at DESC
LIMIT ? OFFSET ?`,
    [...params, perPage, (page - 1) * perPage],
  );
  return {
    query: q,
    hits: rows.map((r) => ({
      nodeId: r.node_id,
      title: r.title,
      href: r.href,
      snippet: r.snippet,
      kind: r.kind ?? "article",
      ...(r.context ? { context: r.context } : {}),
      ...(r.published_at ? { publishedAt: r.published_at } : {}),
    })),
    total,
    page,
    pages,
    perPage,
    stale,
    provider: "fts5",
  };
}
