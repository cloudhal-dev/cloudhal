/**
 * Site search (RFC-0019 §3, RFC-0029 §2): an FTS5 index of what readers see (`search_index`,
 * migrations `0021_search` and `0022_search_kinds`; `search_index_cjk` for languages without
 * spaces between words, RFC-0033 §5): published articles and pages, and public term and author
 * archives.
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
import { changedPermalinks } from "./permalinks.ts";
import { CJK_TABLE, SEARCH_TABLES, searchTable, trigramQuery } from "./search-cjk.ts";
import {
  ftsQuery,
  MARK_CLOSE,
  MARK_OPEN,
  SEARCH_QUERY_MAX,
  type SearchHit,
  type SearchKind,
  type SearchOptions,
  type SearchResults,
  type SearchRow,
  searchKinds,
  searchPaging,
} from "./search-common.ts";
import { searchableChanged, searchableFields } from "./search-fields.ts";
import { pageSearchRow, searchRowOf, termSearchRows } from "./search-rows.ts";

export * from "./search-common.ts";
export { markedSnippet, searchRows } from "./search-memory.ts";
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
    for (const table of SEARCH_TABLES) del(table, "", []);
    del("search_links", "", []);
  } else {
    if (plan.removeKinds && plan.removeKinds.length > 0)
      for (const table of SEARCH_TABLES)
        del(table, "AND kind IN (SELECT value FROM json_each(?)) ", [
          JSON.stringify(plan.removeKinds),
        ]);
    if (plan.remove.length > 0) {
      const ids = JSON.stringify(plan.remove);
      for (const table of SEARCH_TABLES)
        del(table, "AND node_id IN (SELECT value FROM json_each(?)) ", [ids]);
      del("search_links", "AND node_id IN (SELECT value FROM json_each(?)) ", [ids]);
    }
  }
  // RFC-0033 §5: each row goes to its locale's table (`search-cjk.ts`).
  for (const table of SEARCH_TABLES)
    for (const json of payloads(plan.rows.filter((r) => searchTable(r.locale) === table)))
      insertRows(out, { table, json, site, guard: g });
  out.push({
    sql: `INSERT INTO search_state (site_id, snapshot_id, entries, updated_at)
SELECT ?, ?, (SELECT count(*) FROM search_index WHERE site_id = ?) + (SELECT count(*) FROM ${CJK_TABLE} WHERE site_id = ?), ? WHERE ${GUARD}
ON CONFLICT (site_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, entries = excluded.entries, updated_at = excluded.updated_at`,
    params: [site, plan.snapshotId, site, site, at, ...g],
  });
  return out;
}

/** The inserts of one payload: its rows into `table`, and the terms they carry into `search_links`. */
function insertRows(
  out: SqlStatement[],
  { table, json, site, guard: g }: { table: string; json: string; site: string; guard: string[] },
): void {
  out.push({
    sql: `INSERT INTO ${table} (site_id, node_id, locale, kind, title, summary, body, href, context, published_at, gate_from, gate_until)
SELECT ?, j.value ->> '$.nodeId', j.value ->> '$.locale', j.value ->> '$.kind', j.value ->> '$.title', j.value ->> '$.summary', j.value ->> '$.body', j.value ->> '$.href', j.value ->> '$.context', j.value ->> '$.publishedAt', j.value ->> '$.gateFrom', j.value ->> '$.gateUntil'
FROM json_each(?) j WHERE ${GUARD}`,
    params: [site, json, ...g],
  });
  if (json.includes('"terms":['))
    out.push({
      sql: `INSERT INTO search_links (site_id, node_id, term_id, locale, gate_from, gate_until)
SELECT ?, j.value ->> '$.nodeId', t.value, j.value ->> '$.locale', j.value ->> '$.gateFrom', j.value ->> '$.gateUntil'
FROM json_each(?) j, json_each(j.value, '$.terms') t WHERE ${GUARD}`,
      params: [site, json, ...g],
    });
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
  // RFC-0038: a moved collection template changes every entry's href; rewrite all entry rows.
  const hrefsMoved = incremental && (await permalinksMoved(target, base, input.read));
  const rewrite = target.nodes.filter(
    (n) =>
      INDEXED.has(n.kind) &&
      (changed(n) ||
        (n.kind === "term" && archivesChanged) ||
        (n.kind === "contentEntry" && hrefsMoved)),
  );
  const rows: SearchRow[] = [];
  const siteRef = target.nodes.find((n) => n.kind === "site");
  const site = siteRef && rewrite.length > 0 ? ((await input.read(siteRef)) as Site) : undefined;
  const archives = rewrite.some((n) => n.kind === "term")
    ? await archiveContext(target, site, input.read)
    : undefined;
  for (const ref of rewrite) {
    const node = await input.read(ref);
    if (ref.kind === "contentEntry") {
      const entry = node as ContentEntry;
      const original = await originalFor(entry, site, target, input.read);
      pushRow(rows, searchRowOf(entry, { site, original }));
    } else if (ref.kind === "page") pushRow(rows, pageSearchRow(node as Page));
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

/**
 * Whether every entry row changes with the site node between `base` and `target`: a moved
 * collection template (RFC-0038, new hrefs) or other searchable fields (RFC-0041 §10, new words).
 */
async function permalinksMoved(
  target: Snap,
  base: Snap | undefined,
  read: (ref: NodeRef) => Promise<unknown>,
): Promise<boolean> {
  const after = target.nodes.find((n) => n.kind === "site");
  const before = base?.nodes.find((n) => n.kind === "site");
  if (!after || !before || after.hash === before.hash) return false;
  const [a, b] = [(await read(after)) as Site, (await read(before)) as Site];
  return changedPermalinks(b, a).length > 0 || searchableChanged(b, a);
}

/** A translation's original in `target`, read only when its collection has searchable fields. */
async function originalFor(
  entry: ContentEntry,
  site: Site | undefined,
  target: Snap,
  read: (ref: NodeRef) => Promise<unknown>,
): Promise<ContentEntry | undefined> {
  const group = entry.translation?.group;
  if (!group || group === entry.id || searchableFields(site, entry.collection).length === 0)
    return undefined;
  const ref = target.nodes.find((n) => n.id === group && n.kind === "contentEntry");
  return ref ? ((await read(ref)) as ContentEntry) : undefined;
}

function pushRow(rows: SearchRow[], row: SearchRow | undefined): void {
  if (row) rows.push(row);
}

/** The site's locales and taxonomies, which term rows need. */
async function archiveContext(
  target: Snap,
  site: Site | undefined,
  read: (ref: NodeRef) => Promise<unknown>,
): Promise<{ locales: string[]; taxonomies: Map<string, Taxonomy> }> {
  const taxonomies = new Map<string, Taxonomy>();
  for (const ref of target.nodes.filter((n) => n.kind === "taxonomy"))
    taxonomies.set(ref.id, (await read(ref)) as Taxonomy);
  const locales = site ? [...new Set([site.defaultLocale, ...(site.locales ?? [])])] : [];
  return { locales, taxonomies };
}

/** A visible archive: its term is linked by an indexed article the reader can see. */
const linked = (
  table: string,
) => `(kind NOT IN ('term', 'author') OR EXISTS (SELECT 1 FROM search_links l
WHERE l.site_id = ? AND l.term_id = ${table}.node_id AND l.locale = ?
AND (l.gate_from IS NULL OR l.gate_from <= ?) AND (l.gate_until IS NULL OR l.gate_until > ?)))`;

/**
 * The text condition of a query in a table: `MATCH` (words for `search_index`, substrings of three
 * characters or more for the trigram table), or `LIKE` for shorter words in the trigram table.
 */
function textCondition(
  table: string,
  query: string,
): { sql: string; params: string[]; ranked: boolean } | undefined {
  if (table !== CJK_TABLE) {
    const match = ftsQuery(query);
    return match ? { sql: `${table} MATCH ?`, params: [match], ranked: true } : undefined;
  }
  const t = trigramQuery(query);
  if (!t) return undefined;
  if ("match" in t) return { sql: `${table} MATCH ?`, params: [t.match], ranked: true };
  const like =
    "(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')";
  return {
    sql: t.like.map(() => like).join(" AND "),
    params: t.like.flatMap((p) => [p, p, p]),
    ranked: false,
  };
}

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
  const table = searchTable(options.locale);
  const text = textCondition(table, q);
  const empty = { query: q, hits: [], total: 0, page, pages: 0, perPage, stale, provider: "fts5" };
  if (!text || !state) return empty;
  const now = new Date(options.now).toISOString();
  const where = `${text.sql} AND site_id = ? AND locale = ?
AND kind IN (SELECT value FROM json_each(?))
AND (gate_from IS NULL OR gate_from <= ?) AND (gate_until IS NULL OR gate_until > ?)
AND ${linked(table)}`;
  const kinds = JSON.stringify(searchKinds(options.kinds));
  const params = [
    ...text.params,
    siteId,
    options.locale,
    kinds,
    now,
    now,
    siteId,
    options.locale,
    now,
    now,
  ];
  const count = await sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
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
${text.ranked ? `snippet(${table}, -1, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 16)` : "substr(coalesce(summary, body), 1, 160)"} AS snippet
FROM ${table} WHERE ${where}
ORDER BY ${text.ranked ? `bm25(${table}, 0, 0, 0, 0, 10, 4, 1, 0, 0, 0, 0, 0), ` : ""}published_at DESC
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

/** A live row of the index, without a snippet: what another provider's hit is checked against. */
export type LiveHit = Omit<SearchHit, "snippet">;

/**
 * Which of `nodeIds` readers can see now (RFC-0029 §1, invariant 1): rows of the index in the
 * reader's locale and kinds, inside their time gates, archives only while an article carries them.
 * Another provider's hits pass through this, so what it indexed late or kept too long never shows.
 * A scan of the site's rows (no `MATCH`), bounded by the ids asked.
 */
export async function liveHits(
  sql: SqlDriver,
  siteId: string,
  nodeIds: readonly string[],
  options: Pick<SearchOptions, "locale" | "now" | "kinds">,
): Promise<Map<string, LiveHit>> {
  if (nodeIds.length === 0) return new Map();
  const now = new Date(options.now).toISOString();
  const rows = await sql.all<{
    node_id: string;
    kind: SearchKind | null;
    title: string;
    href: string;
    context: string | null;
    published_at: string | null;
  }>(
    `SELECT node_id, kind, title, href, context, published_at FROM ${searchTable(options.locale)}
WHERE site_id = ? AND locale = ? AND node_id IN (SELECT value FROM json_each(?))
AND kind IN (SELECT value FROM json_each(?))
AND (gate_from IS NULL OR gate_from <= ?) AND (gate_until IS NULL OR gate_until > ?)
AND ${linked(searchTable(options.locale))}`,
    [
      siteId,
      options.locale,
      JSON.stringify(nodeIds),
      JSON.stringify(searchKinds(options.kinds)),
      now,
      now,
      siteId,
      options.locale,
      now,
      now,
    ],
  );
  return new Map(
    rows.map((r) => [
      r.node_id,
      {
        nodeId: r.node_id,
        title: r.title,
        href: r.href,
        kind: r.kind ?? "article",
        ...(r.context ? { context: r.context } : {}),
        ...(r.published_at ? { publishedAt: r.published_at } : {}),
      },
    ]),
  );
}
