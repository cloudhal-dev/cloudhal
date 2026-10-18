/**
 * Site search over rows in memory (RFC-0019 §3), for sources without an index: `cloudhal dev`,
 * which shows drafts. The same rules as the FTS5 index: every word must start a word of the title,
 * summary or body, title matches rank first, time gates apply at `now`, and a term or author is
 * found only while a visible article in the reader's locale carries it. Worker-safe.
 */
import {
  isArchiveKind,
  MARK_CLOSE,
  MARK_OPEN,
  queryWords,
  SEARCH_QUERY_MAX,
  type SearchOptions,
  type SearchResults,
  type SearchRow,
  searchKinds,
  searchPaging,
} from "./search-common.ts";

/** Letters and digits, lower-cased, without diacritics (what `unicode61 remove_diacritics` folds). */
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i");
}

/** The rows a reader in `locale` at `now` can see, archives included only while they list something. */
function visibleRows(rows: readonly SearchRow[], options: SearchOptions): SearchRow[] {
  const now = new Date(options.now).toISOString();
  const open = (r: SearchRow) =>
    r.locale === options.locale &&
    (!r.gateFrom || r.gateFrom <= now) &&
    (!r.gateUntil || r.gateUntil > now);
  const linked = new Set(
    rows.filter((r) => r.kind === "article" && open(r)).flatMap((r) => r.terms ?? []),
  );
  const kinds = new Set(searchKinds(options.kinds));
  return rows.filter(
    (r) => kinds.has(r.kind) && open(r) && (!isArchiveKind(r.kind) || linked.has(r.nodeId)),
  );
}

export function searchRows(
  rows: readonly SearchRow[],
  query: string,
  options: SearchOptions,
): SearchResults {
  const { perPage, page } = searchPaging(options);
  const q = query.slice(0, SEARCH_QUERY_MAX).trim();
  const words = queryWords(q).map(fold);
  const starts = (text: string, w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${w}`, "u").test(text);
  const scored =
    words.length === 0
      ? []
      : visibleRows(rows, options)
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
    kind: r.kind,
    ...(r.context ? { context: r.context } : {}),
    ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}),
  }));
  return { query: q, hits, total, page, pages, perPage, stale: false, provider: "memory" };
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

/** A snippet of `text` with the query's words marked: for providers whose text comes unmarked. */
export function markedSnippet(text: string, query: string): string {
  return snippetOf(text, queryWords(query).map(fold));
}
