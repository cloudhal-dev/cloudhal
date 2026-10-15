/**
 * Site search (RFC-0019 §3): an FTS5 index of the published articles (`search_index`, migration
 * `0021_search`) that always matches what readers see.
 *
 * - **Built on publish.** The rows come from the snapshot a publish or rollback makes live and are
 *   written in the same `batch()` as the pointer flip, guarded on the site's new hash (hard rule
 *   4); when the index already reflects the snapshot that was live, only the changed articles are
 *   rewritten. `search_state` records which snapshot the index reflects.
 * - **Time gates are columns.** An embargoed article is indexed and found once its `from` has
 *   passed; an expired one only before its `until`. Drafts are never indexed.
 * - **Queries are words, never syntax.** `ftsQuery` keeps letters and digits only and quotes every
 *   term, so readers cannot use column filters, `NEAR` or other FTS5 operators.
 *
 * Worker-safe: plain SQL through `SqlDriver`, no Node modules.
 */
import type { ContentEntry, NodeRef } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";

/** The site's search page (a reserved path; pages cannot take it). */
export const SEARCH_PATH = "/search";
/** Results per search page. */
export const SEARCH_PAGE_SIZE = 20;
/** The longest query a reader may send (characters). */
export const SEARCH_QUERY_MAX = 200;
/** At most this many words of a query are searched. */
export const SEARCH_TERMS_MAX = 8;
/** Body text kept per article (characters): enough to find it, bounded per row. */
export const SEARCH_TEXT_MAX = 20_000;
/** A JSON payload of rows per statement stays under D1's 2 MB value limit with room to spare. */
const PAYLOAD_MAX = 512 * 1024;
/** Snippet markers: control characters a body never keeps, replaced by `<mark>` after escaping. */
export const MARK_OPEN = "\u0002";
export const MARK_CLOSE = "\u0003";

/** One article as the index stores it. */
export interface SearchRow {
  nodeId: string;
  locale: string;
  title: string;
  summary: string;
  body: string;
  href: string;
  publishedAt?: string | undefined;
  gateFrom?: string | undefined;
  gateUntil?: string | undefined;
}

/** One search result: the snippet carries `MARK_OPEN`/`MARK_CLOSE` around matches, unescaped. */
export interface SearchHit {
  nodeId: string;
  title: string;
  href: string;
  snippet: string;
  publishedAt?: string | undefined;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
  /** The index reflects another snapshot than the live one (a publish is being indexed). */
  stale: boolean;
}

export interface SearchOptions {
  locale: string;
  page?: number;
  perPage?: number;
  /** The reader's instant (ms) for time gates. */
  now: number;
  /** The snapshot readers see; when the index reflects another, the results say `stale`. */
  snapshotId?: string | undefined;
}

const iso = (value: string | undefined) => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * An article body as plain text for the index: code and generated UI dropped, links and images
 * reduced to their words, URLs and markup removed. Directive attributes keep their quoted text
 * (a callout's title, a quote's text).
 */
export function searchText(body: Pick<ContentEntry["body"], "format" | "value">): string {
  let text = body.value;
  if (body.format === "markdown") {
    text = text
      // fenced code and ```surface fences
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, " ")
      // directive lines: keep the text of quoted attributes
      .replace(/^:{2,}[a-z][\w-]*(\{[^\n]*\})?[ \t]*$/gim, (_m, attrs: string | undefined) =>
        attrs ? [...attrs.matchAll(/="((?:[^"\\]|\\.)*)"/g)].map((a) => a[1]).join(" ") : " ",
      )
      .replace(/^:{3,}[ \t]*$/gm, " ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1");
  }
  text = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\bhttps?:\/\/\S+/g, " ")
    .replace(/[#>*_~|\\]+/g, " ")
    .replace(new RegExp(`[${MARK_OPEN}${MARK_CLOSE}]`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > SEARCH_TEXT_MAX ? text.slice(0, SEARCH_TEXT_MAX) : text;
}

/**
 * The index row of an article, or undefined when readers never see it (not published; with
 * `drafts`, as `cloudhal dev` shows them, only archived ones are left out).
 */
export function searchRowOf(
  entry: ContentEntry,
  options: { drafts?: boolean } = {},
): SearchRow | undefined {
  if (entry.status !== "published" && !(options.drafts && entry.status !== "archived"))
    return undefined;
  return {
    nodeId: entry.id,
    locale: entry.locale,
    title: entry.title,
    summary: entry.summary ?? "",
    body: searchText(entry.body),
    href: `/${entry.collection}/${entry.slug}`,
    publishedAt: iso(entry.publishedAt),
    gateFrom: iso(entry.availability?.from),
    gateUntil: iso(entry.availability?.until),
  };
}

/**
 * A reader's query as an FTS5 expression: up to `SEARCH_TERMS_MAX` words of letters and digits,
 * each quoted and matched as a prefix, all required. Undefined when nothing searchable is left.
 */
export function ftsQuery(query: string): string | undefined {
  const words =
    query
      .slice(0, SEARCH_QUERY_MAX)
      .normalize("NFKC")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = words.slice(0, SEARCH_TERMS_MAX);
  return terms.length > 0 ? terms.map((w) => `"${w}"*`).join(" ") : undefined;
}

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

/** What one index update writes: either the whole site or only some articles. */
export interface SearchPlan {
  snapshotId: string;
  /** Rewrite every row of the site (otherwise only `remove` and `rows`' ids). */
  full: boolean;
  /** Articles whose rows go (changed or no longer live). */
  remove: string[];
  rows: SearchRow[];
}

/** The statements of a plan, each guarded on the site's hash (one batch with the pointer flip). */
export function searchStatements(plan: SearchPlan, guard: SiteGuard, at: string): SqlStatement[] {
  const g = [guard.siteId, guard.hash];
  const out: SqlStatement[] = [];
  if (plan.full)
    out.push({
      sql: `DELETE FROM search_index WHERE site_id = ? AND ${GUARD}`,
      params: [guard.siteId, ...g],
    });
  else if (plan.remove.length > 0)
    out.push({
      sql: `DELETE FROM search_index WHERE site_id = ? AND node_id IN (SELECT value FROM json_each(?)) AND ${GUARD}`,
      params: [guard.siteId, JSON.stringify(plan.remove), ...g],
    });
  for (const json of payloads(plan.rows))
    out.push({
      sql: `INSERT INTO search_index (site_id, node_id, locale, title, summary, body, href, published_at, gate_from, gate_until)
SELECT ?, j.value ->> '$.nodeId', j.value ->> '$.locale', j.value ->> '$.title', j.value ->> '$.summary', j.value ->> '$.body', j.value ->> '$.href', j.value ->> '$.publishedAt', j.value ->> '$.gateFrom', j.value ->> '$.gateUntil'
FROM json_each(?) j WHERE ${GUARD}`,
      params: [guard.siteId, json, ...g],
    });
  out.push({
    sql: `INSERT INTO search_state (site_id, snapshot_id, entries, updated_at)
SELECT ?, ?, (SELECT count(*) FROM search_index WHERE site_id = ?), ? WHERE ${GUARD}
ON CONFLICT (site_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, entries = excluded.entries, updated_at = excluded.updated_at`,
    params: [guard.siteId, plan.snapshotId, guard.siteId, at, ...g],
  });
  return out;
}

/** The snapshot the index reflects for a site, if any. */
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

/**
 * Plans the index update to `target` (the snapshot becoming live). With `base`, the snapshot the
 * index reflects now, only articles that changed between them are rewritten; without it, all.
 */
export async function planSearch(input: {
  target: { id: string; nodes: readonly NodeRef[] };
  base?: { id: string; nodes: readonly NodeRef[] } | undefined;
  read: (ref: NodeRef) => Promise<ContentEntry>;
}): Promise<SearchPlan> {
  const entries = input.target.nodes.filter((n) => n.kind === "contentEntry");
  const incremental = input.base !== undefined;
  const before = new Map(
    incremental
      ? (input.base?.nodes ?? [])
          .filter((n) => n.kind === "contentEntry")
          .map((n) => [n.id, n.hash])
      : [],
  );
  const now = new Set(entries.map((n) => n.id));
  const read = incremental ? entries.filter((n) => before.get(n.id) !== n.hash) : entries;
  const rows: SearchRow[] = [];
  for (const ref of read) {
    const row = searchRowOf(await input.read(ref));
    if (row) rows.push(row);
  }
  const remove = incremental
    ? [
        ...[...before.keys()].filter((id) => !now.has(id)),
        ...read.filter((n) => before.has(n.id)).map((n) => n.id),
      ]
    : [];
  return { snapshotId: input.target.id, full: !incremental, remove, rows };
}

/** Searches the index for a site's readers. A query with nothing searchable finds nothing. */
export async function searchIndex(
  sql: SqlDriver,
  siteId: string,
  query: string,
  options: SearchOptions,
): Promise<SearchResults> {
  const perPage = Math.min(Math.max(1, options.perPage ?? SEARCH_PAGE_SIZE), 50);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const q = query.slice(0, SEARCH_QUERY_MAX).trim();
  const state = await searchState(sql, siteId);
  const stale = options.snapshotId !== undefined && state?.snapshotId !== options.snapshotId;
  const match = ftsQuery(q);
  const empty = { query: q, hits: [], total: 0, page, pages: 0, perPage, stale };
  if (!match || !state) return empty;
  const now = new Date(options.now).toISOString();
  const where = `search_index MATCH ? AND site_id = ? AND locale = ?
AND (gate_from IS NULL OR gate_from <= ?) AND (gate_until IS NULL OR gate_until > ?)`;
  const params = [match, siteId, options.locale, now, now];
  const count = await sql.get<{ n: number }>(
    `SELECT count(*) AS n FROM search_index WHERE ${where}`,
    params,
  );
  const total = count?.n ?? 0;
  const pages = Math.ceil(total / perPage);
  if (total === 0 || page > pages) return { ...empty, total, pages };
  const rows = await sql.all<{
    node_id: string;
    title: string;
    href: string;
    snippet: string;
    published_at: string | null;
  }>(
    `SELECT node_id, title, href, published_at,
snippet(search_index, -1, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 16) AS snippet
FROM search_index WHERE ${where}
ORDER BY bm25(search_index, 0, 0, 0, 10, 4, 1, 0, 0, 0, 0), published_at DESC
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
      ...(r.published_at ? { publishedAt: r.published_at } : {}),
    })),
    total,
    page,
    pages,
    perPage,
    stale,
  };
}

/** Letters and digits, lower-cased, without diacritics (what `unicode61 remove_diacritics` folds). */
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i");
}

/**
 * The same search over rows in memory, for sources without an index (`cloudhal dev`, which shows
 * drafts): every word must start a word of the title, summary or body; title matches rank first.
 */
export function searchRows(
  rows: readonly SearchRow[],
  query: string,
  options: SearchOptions,
): SearchResults {
  const perPage = Math.min(Math.max(1, options.perPage ?? SEARCH_PAGE_SIZE), 50);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const q = query.slice(0, SEARCH_QUERY_MAX).trim();
  const words = (q.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, SEARCH_TERMS_MAX)
    .map(fold);
  const now = new Date(options.now).toISOString();
  const starts = (text: string, w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${w}`, "u").test(text);
  const scored =
    words.length === 0
      ? []
      : rows
          .filter(
            (r) =>
              r.locale === options.locale &&
              (!r.gateFrom || r.gateFrom <= now) &&
              (!r.gateUntil || r.gateUntil > now),
          )
          .map((r) => {
            const [t, s, b] = [fold(r.title), fold(r.summary), fold(r.body)];
            let score = 0;
            for (const w of words) {
              const hit = (starts(t, w) ? 10 : 0) + (starts(s, w) ? 4 : 0) + (starts(b, w) ? 1 : 0);
              if (hit === 0) return undefined;
              score += hit;
            }
            return { r, score };
          })
          .filter((x): x is { r: SearchRow; score: number } => x !== undefined)
          .sort(
            (a, b) =>
              b.score - a.score || (b.r.publishedAt ?? "").localeCompare(a.r.publishedAt ?? ""),
          );
  const total = scored.length;
  const pages = Math.ceil(total / perPage);
  const hits = scored.slice((page - 1) * perPage, page * perPage).map(({ r }) => ({
    nodeId: r.nodeId,
    title: r.title,
    href: r.href,
    snippet: snippetOf(r.body || r.summary, words),
    ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}),
  }));
  return { query: q, hits, total, page, pages, perPage, stale: false };
}

/** About 16 words of `text` around the first match, matches between `MARK_OPEN`/`MARK_CLOSE`. */
function snippetOf(text: string, words: readonly string[]): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const matches = (t: string) =>
    words.some((w) =>
      fold(t)
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .startsWith(w),
    );
  const first = Math.max(0, tokens.findIndex(matches));
  const from = Math.max(0, first - 4);
  const part = tokens
    .slice(from, from + 16)
    .map((t) => (matches(t) ? `${MARK_OPEN}${t}${MARK_CLOSE}` : t));
  return `${from > 0 ? "…" : ""}${part.join(" ")}${from + 16 < tokens.length ? "…" : ""}`;
}
