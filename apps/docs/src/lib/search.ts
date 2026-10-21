/**
 * Docs search for the docs MCP's `search_docs` (ADR-0039 rule 4). The post-build step writes the
 * index (`search-index.ts`); the Worker loads it once per isolate and ranks with BM25. Pure and
 * Worker-safe: no Node imports.
 */

/** Where the post-build step writes the index and the Worker reads it (through the assets). */
export const SEARCH_INDEX_PATH = "/_mcp/search-index.json";

export interface SearchDoc {
  readonly title: string;
  /** `https://cloudhal.dev/docs/…`, the HTML page; `read_doc` takes it as is. */
  readonly url: string;
  /** Section key (`start`, `agents`, …); site pages outside `/docs/` have none. */
  readonly section?: string;
  /** Plain text of the page, for snippets. */
  readonly text: string;
  /** Weighted token count (BM25's document length). */
  readonly length: number;
}

export interface SearchIndex {
  readonly version: 1;
  readonly docs: readonly SearchDoc[];
  /** Term → flat `[doc, weightedFrequency, doc, weightedFrequency, …]`. */
  readonly terms: Readonly<Record<string, readonly number[]>>;
}

export interface SearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

const STOP = new Set(
  "a an and are as at be by can do for from has have how i if in into is it its not of on or so that the their then there this to was what when where which who why will with you your".split(
    " ",
  ),
);

/** Lower case, accents dropped, words of letters and digits, a light plural stem. */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  const words =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => !STOP.has(w)).map(stem);
}

const K1 = 1.2;
const B = 0.75;
/** A query word also matches longer terms it starts with, at this weight. */
const PREFIX_WEIGHT = 0.4;

/** Each query term with the index terms it matches and their weight. */
function expand(index: SearchIndex, query: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const all = Object.keys(index.terms);
  for (const term of new Set(tokens(query))) {
    const matches = new Map<string, number>();
    if (index.terms[term]) matches.set(term, 1);
    if (term.length >= 3) {
      for (const t of all) if (t !== term && t.startsWith(term)) matches.set(t, PREFIX_WEIGHT);
    }
    if (matches.size > 0) out.set(term, matches);
  }
  return out;
}

function score(index: SearchIndex, query: string, section?: string): Map<number, number> {
  const n = index.docs.length;
  const avg = index.docs.reduce((sum, d) => sum + d.length, 0) / Math.max(n, 1);
  const scores = new Map<number, number>();
  for (const matches of expand(index, query).values()) {
    // A query word counts once per page: its best-matching term.
    const best = new Map<number, number>();
    for (const [term, weight] of matches) {
      const postings = index.terms[term] ?? [];
      const df = postings.length / 2;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let i = 0; i < postings.length; i += 2) {
        const doc = postings[i] as number;
        const tf = postings[i + 1] as number;
        const d = index.docs[doc];
        if (!d || (section && d.section !== section)) continue;
        const s = (weight * idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / avg));
        if (s > (best.get(doc) ?? 0)) best.set(doc, s);
      }
    }
    for (const [doc, s] of best) scores.set(doc, (scores.get(doc) ?? 0) + s);
  }
  return scores;
}

const SNIPPET = 240;

/** Where the most distinct query words fall within one snippet's width (the first 20 hits each). */
function bestPosition(lower: string, words: readonly string[]): number {
  const hits: [number, string][] = [];
  for (const word of words) {
    for (
      let at = lower.indexOf(word), n = 0;
      at >= 0 && n < 20;
      at = lower.indexOf(word, at + 1), n++
    ) {
      hits.push([at, word]);
    }
  }
  let best = { at: 0, count: 0 };
  for (const [at] of hits) {
    const near = new Set(hits.filter(([p]) => p >= at && p < at + SNIPPET / 2).map(([, w]) => w));
    if (near.size > best.count || (near.size === best.count && at < best.at)) {
      best = { at, count: near.size };
    }
  }
  return best.at;
}

/** About 240 characters of `text` around the densest cluster of query words. */
export function snippet(text: string, query: string): string {
  const at = bestPosition(text.toLowerCase(), [...new Set(tokens(query))]);
  let start = Math.max(0, at - SNIPPET / 3);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  let end = Math.min(text.length, start + SNIPPET);
  if (end < text.length)
    end = text.lastIndexOf(" ", end) > start ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** The best `limit` pages for `query`, optionally within one section. */
export function searchDocs(
  index: SearchIndex,
  query: string,
  options: { section?: string | undefined; limit?: number } = {},
): SearchHit[] {
  return [...score(index, query, options.section)]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, options.limit ?? 8)
    .flatMap(([doc]) => {
      const d = index.docs[doc];
      return d ? [{ title: d.title, url: d.url, snippet: snippet(d.text, query) }] : [];
    });
}
