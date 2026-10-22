/**
 * What site search indexes (RFC-0019 §3, RFC-0029 §2): one row per published article, page, and
 * public term or author archive, built from graph nodes alone, so the store (from a snapshot) and
 * `cloudhal dev` (from the live graph) index the same things. Worker-safe.
 */
import type { ContentEntry, Page, Taxonomy, Term } from "@cloudhal/core-contracts";
import { termName } from "./names.ts";
import { entryPath, type PermalinkSite } from "./permalinks.ts";
import { MARK_CLOSE, MARK_OPEN, SEARCH_TEXT_MAX, type SearchRow } from "./search-common.ts";
import { termSlug } from "./term-locales.ts";

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

const clip = (text: string) =>
  text.length > SEARCH_TEXT_MAX ? text.slice(0, SEARCH_TEXT_MAX) : text;

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
  return clip(text);
}

/** Readers see it: published, or (with `drafts`, as `cloudhal dev` shows them) anything not archived. */
const shown = (status: string, drafts: boolean | undefined) =>
  status === "published" || (drafts === true && status !== "archived");

/** The term ids an article carries, across its taxonomies. */
function entryTermIds(entry: ContentEntry): string[] {
  return [...new Set(Object.values(entry.terms ?? {}).flatMap((a) => a?.ids ?? []))];
}

/**
 * The index row of an article, or undefined when readers never see it (not published; with
 * `drafts`, as `cloudhal dev` shows them, only archived ones are left out).
 */
export function searchRowOf(
  entry: ContentEntry,
  options: { drafts?: boolean; site?: PermalinkSite | undefined } = {},
): SearchRow | undefined {
  if (!shown(entry.status, options.drafts)) return undefined;
  const terms = entryTermIds(entry);
  return {
    nodeId: entry.id,
    locale: entry.locale,
    kind: "article",
    title: entry.title,
    summary: entry.summary ?? "",
    body: searchText(entry.body),
    href: entryPath(options.site, entry),
    publishedAt: iso(entry.publishedAt),
    gateFrom: iso(entry.availability?.from),
    gateUntil: iso(entry.availability?.until),
    ...(terms.length > 0 ? { terms } : {}),
  };
}

/** Keys whose strings are addresses, ids or settings, never words a reader would search for. */
const NOT_TEXT =
  /^(id|kind|type|component|href|src|url|image|icon|variant|align|justify|gap|layout|style|tone|size|target|rel|format|width|height|color|theme|mode|ratio|fit|position|slot|ref|path|asset|assetId|nodeId|catalog)$/i;

/**
 * Surface props a reader reads (RFC-0020 catalog: plain or markdown strings that are not values,
 * options, data or units), so ids, layout settings and bound values stay out of the index.
 */
const SURFACE_TEXT = new Set([
  "text",
  "words",
  "content",
  "alt",
  "caption",
  "label",
  "detail",
  "cite",
  "role",
  "items",
  "title",
  "summary",
  "help",
]);

type Words = (section: Record<string, unknown>) => unknown[];
const at = (value: unknown, key: string) =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** Where each section kind keeps its words. A block type's props are read by key (`NOT_TEXT`). */
const SECTION_WORDS: Record<string, Words> = {
  hero: (s) => [s.heading, s.subheading, at(s.cta, "label")],
  richText: (s) => [s.body],
  image: (s) => [s.caption, at(s.image, "alt")],
  contentList: () => [],
  component: (s) => [s.props],
  surface: (s) =>
    (Array.isArray(s.components) ? s.components : []).flatMap((c) =>
      Object.entries((at(c, "props") ?? {}) as Record<string, unknown>)
        .filter(([k]) => SURFACE_TEXT.has(k))
        .map(([, v]) => literal(v)),
    ),
};

/** A prop's own words: a string or a list of strings; a bound value (`{path}`, `{call}`) has none. */
function literal(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The strings of a value: under text-like keys only, addresses and paths left out. */
function strings(value: unknown, key: string, out: string[], depth = 0): void {
  if (depth > 8 || out.length > 2000) return;
  if (typeof value === "string") {
    if (!NOT_TEXT.test(key) && !/^[a-z]+:\/\//i.test(value) && !value.startsWith("/"))
      out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) strings(v, key, out, depth + 1);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) strings(v, k, out, depth + 1);
  }
}

/** The words of a page's sections, markdown read as text. */
export function sectionText(sections: readonly unknown[]): string {
  const out: string[] = [];
  for (const section of sections) {
    const s = (section ?? {}) as Record<string, unknown>;
    const words = SECTION_WORDS[String(s.kind)] ?? ((x: Record<string, unknown>) => [x]);
    for (const value of words(s)) strings(value, "", out);
  }
  return clip(
    out
      .map((value) => searchText({ format: "markdown", value }))
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * The index row of a page: published (or shown in `cloudhal dev`) and not `noindex`, with its SEO
 * description as the summary and its sections' words as the body.
 */
export function pageSearchRow(
  page: Page,
  options: { drafts?: boolean } = {},
): SearchRow | undefined {
  // The site's not-found page (`/404`, RFC-0033 §4) is no search result.
  if (!shown(page.status, options.drafts) || page.seo?.noindex || page.path === "/404")
    return undefined;
  return {
    nodeId: page.id,
    locale: page.locale,
    kind: "page",
    title: page.title,
    summary: page.seo?.description ?? "",
    body: sectionText(page.sections),
    href: page.path,
    gateFrom: iso(page.availability?.from),
    gateUntil: iso(page.availability?.until),
  };
}

/**
 * A public term's rows, one per site locale (its name in that locale, else its first name): only
 * active, public terms of taxonomies with archives, linking to the archive. A term of the `author`
 * taxonomy is an author, its role and bio its summary. Whether the archive lists anything the
 * reader can see is decided at query time from the articles' `terms` (RFC-0029 §2).
 */
export function termSearchRows(
  taxonomy: Taxonomy,
  term: Term,
  locales: readonly string[],
  defaultLocale = locales[0] ?? "",
): SearchRow[] {
  if (!taxonomy.archive.enabled || term.status !== "active" || term.visibility !== "public")
    return [];
  const kind = taxonomy.key === "author" ? "author" : "term";
  const fallbackTax = Object.values(taxonomy.labels).find(Boolean);
  return locales.map((locale) => {
    const label = term.labels[locale] ?? Object.values(term.labels).find(Boolean);
    const words = [label?.role, ...(label?.altNames ?? []), label?.description].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    return {
      nodeId: term.id,
      locale,
      kind,
      title: termName(term, locale),
      summary: searchText({ format: "markdown", value: words.join(" ") }),
      body: "",
      // RFC-0033: the archive under the locale's slug for the term.
      href: `${taxonomy.archive.basePath}/${termSlug(term, locale, defaultLocale)}`,
      context: (taxonomy.labels[locale] ?? fallbackTax)?.singular,
    };
  });
}

/**
 * Every row a set of nodes yields, as the index would hold them: what `cloudhal dev` searches in
 * memory (with `drafts`, as it shows them). Terms take their taxonomy from `taxonomies`.
 */
export function searchDocuments(input: {
  locales: readonly string[];
  entries: readonly ContentEntry[];
  pages: readonly Page[];
  taxonomies: readonly Taxonomy[];
  terms: readonly Term[];
  drafts?: boolean;
  /** The site's default locale, whose archive slugs are the terms' own (default: `locales[0]`). */
  defaultLocale?: string;
  /** The site's collection permalinks (RFC-0038), for article links. */
  site?: PermalinkSite;
}): SearchRow[] {
  const options = { drafts: input.drafts ?? false };
  const entryOptions = { ...options, site: input.site };
  const byId = new Map(input.taxonomies.map((t) => [t.id, t]));
  const rows: (SearchRow | undefined)[] = [
    ...input.entries.map((e) => searchRowOf(e, entryOptions)),
    ...input.pages.map((p) => pageSearchRow(p, options)),
  ];
  for (const term of input.terms) {
    const taxonomy = byId.get(term.taxonomyId);
    if (taxonomy) rows.push(...termSearchRows(taxonomy, term, input.locales, input.defaultLocale));
  }
  return rows.filter((r): r is SearchRow => r !== undefined);
}
