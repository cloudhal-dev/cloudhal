/**
 * Taxonomy as the public site shows it (RFC-0002 §7): which terms an entry displays, their names in
 * the entry's locale, archive links, breadcrumbs, related posts and archive membership. Pure
 * functions over graph nodes, so heads, feeds, sitemaps and themes agree on one set of rules:
 *
 * - only `active` + `public` terms are shown or linked (proposed and internal terms never are);
 * - names come from the term's label in the locale (`termName`, default-locale fallback);
 * - entries written before the tags → terms migration still show their deprecated `tags`.
 */
import type { ContentEntry, Taxonomy, Term } from "@cloudhal/core-contracts";
import { termName } from "@cloudhal/core-ts";
import type { GraphSource } from "./source.ts";

/** Everything needed to show terms: the site's taxonomies and every term, by id. */
export interface TaxonomyIndex {
  readonly locale: string;
  /** The site's default locale, whose archive slugs are the terms' own (RFC-0033). */
  readonly defaultLocale?: string;
  /** In display order: the section taxonomy (categories) first, then the others by key. */
  readonly taxonomies: readonly Taxonomy[];
  readonly byKey: ReadonlyMap<string, Taxonomy>;
  readonly byId: ReadonlyMap<string, Taxonomy>;
  /** Every term of the site in any status, by id. */
  readonly terms: ReadonlyMap<string, Term>;
}

/** Maximum hierarchy depth the walkers follow (the store enforces 5; this only stops bad data). */
const MAX_WALK = 16;

/**
 * The taxonomy that gives an entry its section (breadcrumb, `articleSection`): `category`, else
 * the first hierarchical one.
 */
function pickSection(taxonomies: readonly Taxonomy[]): Taxonomy | undefined {
  return taxonomies.find((t) => t.key === "category") ?? taxonomies.find((t) => t.hierarchical);
}

export function taxonomyIndex(
  taxonomies: readonly Taxonomy[],
  terms: readonly Term[],
  locale: string,
  defaultLocale?: string,
): TaxonomyIndex {
  const section = pickSection(taxonomies);
  const ordered = [...taxonomies].sort(
    (a, b) => Number(b === section) - Number(a === section) || a.key.localeCompare(b.key),
  );
  return {
    locale,
    ...(defaultLocale ? { defaultLocale } : {}),
    taxonomies: ordered,
    byKey: new Map(ordered.map((t) => [t.key, t])),
    byId: new Map(ordered.map((t) => [t.id, t])),
    terms: new Map(terms.map((t) => [t.id, t])),
  };
}

/** Loads the index from a source, in `locale` (default: the site's). */
export async function loadTaxonomyIndex(
  source: GraphSource,
  locale?: string,
): Promise<TaxonomyIndex> {
  const [site, taxonomies, terms] = await Promise.all([
    source.site(),
    source.taxonomies(),
    source.vocabulary(),
  ]);
  return taxonomyIndex(taxonomies, terms, locale ?? site.defaultLocale, site.defaultLocale);
}

export function sectionTaxonomy(index: TaxonomyIndex): Taxonomy | undefined {
  return pickSection(index.taxonomies);
}

/** Shown on the public site: active and public (RFC-0002 invariant 11). */
export function isPublicTerm(term: Pick<Term, "status" | "visibility">): boolean {
  return term.status === "active" && term.visibility === "public";
}

/** `/<basePath>/<slug>`. */
export function archivePath(taxonomy: Pick<Taxonomy, "archive">, slug: string): string {
  return `${taxonomy.archive.basePath}/${slug}`;
}

/** Page `n` of an archive: the root for page 1, `<root>/page/<n>` after it. */
export function archivePagePath(root: string, page: number): string {
  return page <= 1 ? root : `${root}/page/${page}`;
}

/** `<archive>/rss.xml`. */
export function archiveFeedPath(root: string): string {
  return `${root}/rss.xml`;
}

/** A term as the site shows it. */
export interface ShownTerm {
  readonly id: string;
  readonly slug: string;
  /** Label in the index locale (default-locale fallback). */
  readonly name: string;
  /** The archive URL path, when the taxonomy publishes archives. */
  readonly href?: string;
  readonly taxonomy: Taxonomy;
  readonly term: Term;
}

export function shownTerm(index: TaxonomyIndex, term: Term): ShownTerm | undefined {
  const taxonomy = index.byId.get(term.taxonomyId);
  if (!taxonomy) return undefined;
  return {
    id: term.id,
    slug: term.slug,
    name: termName(term, index.locale),
    ...(taxonomy.archive.enabled ? { href: archivePath(taxonomy, term.slug) } : {}),
    taxonomy,
    term,
  };
}

/** Ancestors of a term, root first (any status; cycles and dangling parents end the walk). */
export function termAncestors(index: TaxonomyIndex, term: Term): Term[] {
  const out: Term[] = [];
  const seen = new Set([term.id]);
  let parentId = term.parentId;
  while (parentId && out.length < MAX_WALK && !seen.has(parentId)) {
    const parent = index.terms.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    out.unshift(parent);
    parentId = parent.parentId;
  }
  return out;
}

/** The public ancestors of a term as breadcrumb items, root first. */
export function publicTrail(index: TaxonomyIndex, term: Term): ShownTerm[] {
  return termAncestors(index, term)
    .filter(isPublicTerm)
    .map((t) => shownTerm(index, t))
    .filter((t): t is ShownTerm => t !== undefined);
}

/** The terms one entry shows. */
export interface EntryTaxonomy {
  /** Public terms per taxonomy, in assignment order; taxonomies without shown terms are left out. */
  readonly groups: ReadonlyArray<{ readonly taxonomy: Taxonomy; readonly terms: ShownTerm[] }>;
  /** The primary term of the section taxonomy (categories), when public. */
  readonly section?: ShownTerm;
  /** Breadcrumb: the section's public ancestors, then the section. */
  readonly trail: ShownTerm[];
  /** Public `tag` terms. */
  readonly tags: ShownTerm[];
  /** The byline (RFC-0019 §1): public `author` terms, the primary author first. */
  readonly authors: ShownTerm[];
  /**
   * Keyword names (`article:tag`, JSON-LD `keywords`, RSS categories): the names of `tags`, or the
   * deprecated `ContentEntry.tags` slugs for an entry that has no `terms.tag` yet (un-migrated).
   */
  readonly keywords: string[];
}

const EMPTY: EntryTaxonomy = { groups: [], trail: [], tags: [], authors: [], keywords: [] };

export function entryTaxonomy(
  index: TaxonomyIndex | undefined,
  entry: Pick<ContentEntry, "tags" | "terms">,
): EntryTaxonomy {
  const legacy = [...entry.tags];
  if (!index) return { ...EMPTY, keywords: legacy };
  const groups: { taxonomy: Taxonomy; terms: ShownTerm[] }[] = [];
  let section: ShownTerm | undefined;
  let tags: ShownTerm[] = [];
  let authors: ShownTerm[] = [];
  const sectionTax = sectionTaxonomy(index);
  for (const taxonomy of index.taxonomies) {
    const assignment = entry.terms?.[taxonomy.key];
    if (!assignment) continue;
    const shown = assignment.ids
      .map((id) => index.terms.get(id))
      .filter((t): t is Term => t !== undefined && t.taxonomyId === taxonomy.id && isPublicTerm(t))
      .map((t) => shownTerm(index, t))
      .filter((t): t is ShownTerm => t !== undefined);
    if (taxonomy === sectionTax && assignment.primary)
      section = shown.find((t) => t.id === assignment.primary);
    if (taxonomy.key === "tag") tags = shown;
    if (taxonomy.key === "author")
      authors = [...shown].sort(
        (a, b) => Number(b.id === assignment.primary) - Number(a.id === assignment.primary),
      );
    if (shown.length > 0) groups.push({ taxonomy, terms: shown });
  }
  const trail = section ? [...publicTrail(index, section.term), section] : [];
  const keywords = entry.terms?.tag ? tags.map((t) => t.name) : legacy;
  return { groups, ...(section ? { section } : {}), trail, tags, authors, keywords };
}

/** Term ids an entry belongs to for archives: its assignments plus, in hierarchical taxonomies, their ancestors. */
export function archiveTermIds(
  index: TaxonomyIndex,
  entry: Pick<ContentEntry, "terms">,
): Set<string> {
  const ids = new Set<string>();
  for (const [key, assignment] of Object.entries(entry.terms ?? {})) {
    const taxonomy = index.byKey.get(key);
    if (!taxonomy || !assignment) continue;
    for (const id of assignment.ids) {
      const term = index.terms.get(id);
      if (!term || term.taxonomyId !== taxonomy.id) continue;
      ids.add(id);
      if (taxonomy.hierarchical) for (const a of termAncestors(index, term)) ids.add(a.id);
    }
  }
  return ids;
}

/**
 * Archive membership in one pass: term id → the entries its archive lists (category archives
 * include their sub-categories' entries, RFC-0002 answer 9), in the order given (newest first).
 */
export function archiveMembers(
  index: TaxonomyIndex,
  entries: readonly ContentEntry[],
): Map<string, ContentEntry[]> {
  const out = new Map<string, ContentEntry[]>();
  for (const entry of entries)
    for (const id of archiveTermIds(index, entry)) {
      const list = out.get(id);
      if (list) list.push(entry);
      else out.set(id, [entry]);
    }
  return out;
}

/**
 * Up to `limit` published entries related to `entry`: sharing its primary category scores 2,
 * every other shared term (or legacy tag) 1. Highest score first, then newest; never the entry
 * itself, never another locale, never zero-score entries.
 */
export function relatedEntries(
  entry: ContentEntry,
  candidates: readonly ContentEntry[],
  index: TaxonomyIndex | undefined,
  limit = 3,
): ContentEntry[] {
  const sectionKey = index ? sectionTaxonomy(index)?.key : undefined;
  const primary = sectionKey ? entry.terms?.[sectionKey]?.primary : undefined;
  const mine = new Set(Object.values(entry.terms ?? {}).flatMap((a) => a?.ids ?? []));
  const legacy = new Set(entry.tags);
  const scored: { e: ContentEntry; score: number }[] = [];
  for (const e of candidates) {
    if (e.id === entry.id || e.status !== "published" || e.locale !== entry.locale) continue;
    let score = 0;
    const theirPrimary = sectionKey ? e.terms?.[sectionKey]?.primary : undefined;
    if (primary && theirPrimary === primary) score += 2;
    for (const id of new Set(Object.values(e.terms ?? {}).flatMap((a) => a?.ids ?? [])))
      if (mine.has(id) && !(id === primary && theirPrimary === primary)) score += 1;
    for (const t of new Set(e.tags)) if (legacy.has(t)) score += 1;
    if (score > 0) scored.push({ e, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.e.publishedAt ?? b.e.createdAt).localeCompare(a.e.publishedAt ?? a.e.createdAt),
    )
    .slice(0, limit)
    .map(({ e }) => e);
}
