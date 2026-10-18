/**
 * Studio and agent search over a site's own nodes (RFC-0029 §7–8): what people and agents edit,
 * drafts included, not what readers see (that is `search.ts`). Articles, pages, terms, media, menu
 * items and redirects, matched by words in the ways people name them (title, slug, path, alt
 * text, labels), folded like term names (`foldName`: Turkish-aware, no diacritics), every word a
 * prefix of a word somewhere, title matches first. A scan in memory: fine for the sizes Studio
 * lists today (RFC-0029 open question 2). Worker-safe.
 */
import type {
  Asset,
  ContentEntry,
  Menu,
  Page,
  Redirect,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { foldName, termName } from "./names.ts";
import { SEARCH_QUERY_MAX, SEARCH_TERMS_MAX } from "./search-common.ts";

export type SiteSearchKind = "entry" | "page" | "term" | "asset" | "menu" | "redirect";
export const SITE_SEARCH_KINDS: readonly SiteSearchKind[] = [
  "entry",
  "page",
  "term",
  "asset",
  "menu",
  "redirect",
];
/** Hits per kind by default, and at most. */
export const SITE_SEARCH_LIMIT = 5;
export const SITE_SEARCH_LIMIT_MAX = 10;

export interface SiteSearchHit {
  kind: SiteSearchKind;
  /** The node's id (a menu item: the menu's id). */
  id: string;
  title: string;
  /** How people find it again: slug, path, file name, `from → to`. */
  detail?: string;
  /** What it belongs to: collection, taxonomy, menu key. */
  context?: string;
  status?: string;
  locale?: string;
  /** A menu item's id, a menu's key, a term's taxonomy key: what a link to it needs. */
  ref?: string;
}

export interface SiteSearchResult {
  query: string;
  hits: SiteSearchHit[];
}

/** What the search reads; the store has all of it. */
export interface SiteSearchSource {
  listContentEntries(siteId: string): Promise<ContentEntry[]>;
  listPages(siteId: string): Promise<Page[]>;
  listTaxonomies(siteId: string): Promise<Taxonomy[]>;
  listTerms(siteId: string): Promise<Term[]>;
  listAssets(siteId: string, query: { query: string; limit: number }): Promise<{ assets: Asset[] }>;
  listMenus(siteId: string): Promise<Menu[]>;
  listRedirects(siteId: string): Promise<Redirect[]>;
}

/** The words of a query, folded: at most `SEARCH_TERMS_MAX`. */
export function siteSearchWords(query: string): string[] {
  return foldName(query.slice(0, SEARCH_QUERY_MAX))
    .split("-")
    .filter(Boolean)
    .slice(0, SEARCH_TERMS_MAX);
}

/**
 * A candidate's score: every word must start a word of the title (10) or of another field (2);
 * undefined when one does not.
 */
function score(words: readonly string[], title: string, rest: readonly (string | undefined)[]) {
  const t = `-${foldName(title)}`;
  const r = `-${rest
    .filter(Boolean)
    .map((s) => foldName(s as string))
    .join("-")}`;
  let total = 0;
  for (const w of words) {
    const hit = (t.includes(`-${w}`) ? 10 : 0) + (r.includes(`-${w}`) ? 2 : 0);
    if (hit === 0) return undefined;
    total += hit;
  }
  return total;
}

/** A hit before scoring: its other words, and whether its source matched it already. */
type Candidate = SiteSearchHit & { rest: (string | undefined)[]; matched?: boolean };
const values = (map: Readonly<Record<string, string | undefined>> | undefined) =>
  Object.values(map ?? {}).filter((v): v is string => typeof v === "string");

/** Menu items with their labels, depth first. */
function menuItems(menu: Menu): Candidate[] {
  const out: Candidate[] = [];
  const walk = (items: readonly unknown[]) => {
    for (const raw of items) {
      const item = raw as { id: string; labels?: Record<string, string>; children?: unknown[] };
      const labels = values(item.labels);
      if (labels[0])
        out.push({
          kind: "menu",
          id: menu.id,
          title: labels[0],
          context: menu.key,
          ref: item.id,
          rest: labels.slice(1),
        });
      walk(item.children ?? []);
    }
  };
  walk(menu.items ?? []);
  return out;
}

type Reader = (src: SiteSearchSource, siteId: string, query: string) => Promise<Candidate[]>;

/** Where each kind's candidates come from (a dispatch table, one reader per kind). */
const READERS: Record<SiteSearchKind, Reader> = {
  entry: async (src, siteId) =>
    (await src.listContentEntries(siteId)).map((e) => ({
      kind: "entry",
      id: e.id,
      title: e.title,
      detail: `/${e.collection}/${e.slug}`,
      context: e.collection,
      status: e.status,
      locale: e.locale,
      rest: [e.slug, e.summary],
    })),
  page: async (src, siteId) =>
    (await src.listPages(siteId)).map((p) => ({
      kind: "page",
      id: p.id,
      title: p.title,
      detail: p.path,
      status: p.status,
      locale: p.locale,
      rest: [p.path, p.seo?.title, p.seo?.description],
    })),
  term: async (src, siteId) => {
    const taxonomies = new Map((await src.listTaxonomies(siteId)).map((t) => [t.id, t]));
    return (await src.listTerms(siteId)).flatMap((term) => {
      const tax = taxonomies.get(term.taxonomyId);
      if (!tax) return [];
      const labels = Object.values(term.labels);
      return [
        {
          kind: "term" as const,
          id: term.id,
          title: termName(term),
          detail: term.slug,
          context: Object.values(tax.labels)[0]?.singular ?? tax.key,
          status: term.status,
          ref: tax.key,
          rest: [term.slug, ...labels.flatMap((l) => [l?.name, ...(l?.altNames ?? [])])],
        },
      ];
    });
  },
  // The media library's own query (title, alt, caption, credit, slug, file name).
  asset: async (src, siteId, query) =>
    (await src.listAssets(siteId, { query, limit: SITE_SEARCH_LIMIT_MAX })).assets.map((a) => ({
      kind: "asset",
      id: a.id,
      title: values(a.title)[0] ?? a.slug,
      detail: a.slug,
      context: a.kind,
      status: a.status,
      // found by the library already: its words count as the title's
      rest: [],
      matched: true,
    })),
  menu: async (src, siteId) => (await src.listMenus(siteId)).flatMap(menuItems),
  redirect: async (src, siteId) =>
    (await src.listRedirects(siteId)).map((r) => ({
      kind: "redirect",
      id: r.id,
      title: r.from,
      detail: `${r.from} → ${r.to}`,
      status: String(r.status),
      rest: [r.to, r.note],
    })),
};

/**
 * The site's nodes matching `query`, up to `limit` per kind, best first within a kind and kinds
 * in `SITE_SEARCH_KINDS` order. A query without words finds nothing.
 */
export async function searchSiteNodes(
  src: SiteSearchSource,
  siteId: string,
  query: string,
  options: { kinds?: readonly SiteSearchKind[]; limit?: number } = {},
): Promise<SiteSearchResult> {
  const q = query.slice(0, SEARCH_QUERY_MAX).trim();
  const words = siteSearchWords(q);
  if (words.length === 0) return { query: q, hits: [] };
  const limit = Math.min(Math.max(1, options.limit ?? SITE_SEARCH_LIMIT), SITE_SEARCH_LIMIT_MAX);
  const wanted = SITE_SEARCH_KINDS.filter((k) => !options.kinds || options.kinds.includes(k));
  const groups = await Promise.all(
    wanted.map(async (kind) => {
      const candidates = await READERS[kind](src, siteId, q);
      return candidates
        .map((c) => ({
          c,
          s: c.matched ? 10 : score(words, c.title, c.rest),
        }))
        .filter((x): x is { c: Candidate; s: number } => x.s !== undefined)
        .sort((a, b) => b.s - a.s || a.c.title.localeCompare(b.c.title))
        .slice(0, limit)
        .map(({ c }) => hitOf(c));
    }),
  );
  return { query: q, hits: groups.flat() };
}

function hitOf({ rest: _rest, matched: _matched, ...hit }: Candidate): SiteSearchHit {
  for (const key of Object.keys(hit) as (keyof SiteSearchHit)[])
    if (hit[key] === undefined) delete hit[key];
  return hit;
}
