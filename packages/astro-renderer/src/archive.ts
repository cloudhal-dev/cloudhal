/**
 * Term archives (RFC-0002 §7): `<basePath>/<slug>`, `<basePath>/<slug>/page/<n>` and
 * `<basePath>/<slug>/rss.xml`. Parsing, the status-code rules and the archive list are pure, so the
 * starter's routes, sitemaps and static builds share one tested decision:
 *
 * | Request                                                       | Answer                         |
 * |---------------------------------------------------------------|--------------------------------|
 * | active + public, published entries ≥ `minEntriesToIndex`      | 200, indexable, in the sitemap |
 * | active + public, fewer entries, or `seo.noindex`              | 200 `noindex,follow`           |
 * | no published entries; proposed or internal; archive disabled  | 404                            |
 * | retired without a redirect                                    | 410 (accepted answer 8)        |
 * | old slug, merged or redirected term                           | 301 via the Redirect node      |
 * | `…/page/1`                                                    | 301 to the archive root        |
 * | `…/page/n` past the last page                                 | 404                            |
 */
import type { ContentEntry, Taxonomy, Term } from "@cloudhal/core-contracts";
import { termSlug } from "@cloudhal/core-ts";
import {
  archiveFeedPath,
  archiveMembers,
  archivePagePath,
  archivePath,
  isPublicTerm,
  type ShownTerm,
  type TaxonomyIndex,
} from "./taxonomy.ts";

/** Entries per archive page when a theme does not choose (the blog starter sets its own). */
export const DEFAULT_ARCHIVE_PAGE_SIZE = 20;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A request path that addresses a term archive. */
export interface ArchiveRequest {
  readonly taxonomy: Taxonomy;
  readonly slug: string;
  /** The archive root (`<basePath>/<slug>`). */
  readonly root: string;
  readonly kind: "page" | "feed";
  /** Requested page (1 for the root and the feed). */
  readonly page: number;
  /** `…/page/1`: the root's duplicate, answered with a 301 to the root. */
  readonly explicitFirstPage: boolean;
}

/**
 * The archive a path addresses, if any: only taxonomies with `archive.enabled`, a valid slug and
 * one of the three shapes. A page number must be canonical (`2`, not `02` or `0`).
 */
export function parseArchivePath(
  taxonomies: readonly Taxonomy[],
  path: string,
): ArchiveRequest | undefined {
  for (const taxonomy of taxonomies) {
    if (!taxonomy.archive.enabled) continue;
    const base = taxonomy.archive.basePath;
    if (!path.startsWith(`${base}/`)) continue;
    const [slug, ...rest] = path.slice(base.length + 1).split("/");
    if (!slug || !SLUG.test(slug)) continue;
    const root = archivePath(taxonomy, slug);
    const common = { taxonomy, slug, root };
    if (rest.length === 0) return { ...common, kind: "page", page: 1, explicitFirstPage: false };
    if (rest.length === 1 && rest[0] === "rss.xml")
      return { ...common, kind: "feed", page: 1, explicitFirstPage: false };
    if (rest.length === 2 && rest[0] === "page" && /^[1-9]\d{0,5}$/.test(rest[1] ?? ""))
      return {
        ...common,
        kind: "page",
        page: Number(rest[1]),
        explicitFirstPage: rest[1] === "1",
      };
  }
  return undefined;
}

/**
 * The term an archive slug names: a live (non-retired) term with that current slug, else the most
 * recently retired one. Old slugs (`slugHistory`) are not matched here: they answer through their
 * redirects.
 */
/**
 * The term an archive slug names; with `locale` (RFC-0033), the slug that locale shows
 * (`labels[locale].slug`, else the term's own).
 */
export function termForSlug(
  terms: readonly Term[],
  slug: string,
  locale?: { readonly locale: string; readonly defaultLocale: string },
): Term | undefined {
  const of = (t: Term) => (locale ? termSlug(t, locale.locale, locale.defaultLocale) : t.slug);
  return (
    terms.find((t) => of(t) === slug && t.status !== "retired") ??
    terms.filter((t) => of(t) === slug).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  );
}

export type ArchiveState =
  | { readonly status: 200; readonly indexable: boolean }
  | { readonly status: 404 }
  | { readonly status: 410 };

/**
 * The status of a term's archive (before redirects, which the route consults for anything that is
 * not a 200): `count` is the number of entries the archive lists in `locale`.
 */
export function archiveState(
  taxonomy: Taxonomy,
  term: Term | undefined,
  count: number,
  locale: string,
): ArchiveState {
  if (!taxonomy.archive.enabled || !term || term.taxonomyId !== taxonomy.id) return { status: 404 };
  if (term.status === "retired") return { status: 410 };
  if (!isPublicTerm(term) || count < 1) return { status: 404 };
  const noindex = term.labels[locale]?.seo?.noindex === true;
  return { status: 200, indexable: !noindex && count >= taxonomy.minEntriesToIndex };
}

/** Pages an archive of `total` entries has (at least 1). */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/** What an archive page renders. */
export interface ArchiveView {
  readonly taxonomy: Taxonomy;
  readonly term: Term;
  /** The term as shown (name in the locale, archive link). */
  readonly shown: ShownTerm;
  /** Public ancestors, root first (breadcrumb). */
  readonly trail: ShownTerm[];
  readonly locale: string;
  /** Archive root path. */
  readonly root: string;
  /** This page's path (the root for page 1). */
  readonly path: string;
  /** The term feed's path, when the taxonomy publishes feeds. */
  readonly feedPath?: string;
  readonly page: number;
  readonly pages: number;
  readonly perPage: number;
  /** Entries listed by the whole archive. */
  readonly total: number;
  /** Entries on this page, newest first. */
  readonly entries: ContentEntry[];
  readonly indexable: boolean;
}

/** Path of page `n` of the archive a view belongs to. */
export function viewPagePath(view: Pick<ArchiveView, "root">, page: number): string {
  return archivePagePath(view.root, page);
}

/** One public archive of the site, as sitemaps, navigation and static builds list them. */
export interface ArchiveSummary {
  readonly taxonomy: Taxonomy;
  readonly term: Term;
  readonly path: string;
  readonly feedPath?: string;
  readonly total: number;
  readonly indexable: boolean;
  /** The later of the newest listed entry's `updatedAt` and the term's `updatedAt`. */
  readonly lastmod: string;
}

/**
 * Every archive the site serves (a 200 by `archiveState`), from the entries a source shows: pass
 * published entries for the public site. Ordered by taxonomy (index order), then term order.
 */
export function archiveSummaries(
  index: TaxonomyIndex,
  entries: readonly ContentEntry[],
): ArchiveSummary[] {
  const members = archiveMembers(
    index,
    entries.filter((e) => e.locale === index.locale),
  );
  const out: ArchiveSummary[] = [];
  const terms = [...index.terms.values()];
  for (const taxonomy of index.taxonomies) {
    if (!taxonomy.archive.enabled) continue;
    for (const term of terms) {
      if (term.taxonomyId !== taxonomy.id) continue;
      const listed = members.get(term.id) ?? [];
      const state = archiveState(taxonomy, term, listed.length, index.locale);
      if (state.status !== 200) continue;
      const newest = listed.reduce(
        (max, e) => (e.updatedAt > max ? e.updatedAt : max),
        term.updatedAt,
      );
      const path = archivePath(taxonomy, term.slug);
      out.push({
        taxonomy,
        term,
        path,
        ...(taxonomy.feed ? { feedPath: archiveFeedPath(path) } : {}),
        total: listed.length,
        indexable: state.indexable,
        lastmod: newest,
      });
    }
  }
  return out;
}
