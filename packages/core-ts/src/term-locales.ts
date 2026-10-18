/**
 * RFC-0033: a term's archive slug per locale. The default locale always uses the term's own slug;
 * another locale uses `labels[locale].slug` when set and the term's slug otherwise. Within a
 * taxonomy, no two live terms share a slug in any one locale.
 */
import type { Site, Term } from "@cloudhal/core-contracts";
import { InvariantError } from "./errors.ts";

/** The slug a term's archive has in `locale`. */
export function termSlug(term: Term, locale: string, defaultLocale: string): string {
  return locale === defaultLocale ? term.slug : (term.labels[locale]?.slug ?? term.slug);
}

/** Refuses a default-locale label slug and a slug another live term already has in that locale. */
export function checkLocaleSlugs(term: Term, site: Site, taxonomyTerms: readonly Term[]): void {
  if (term.labels[site.defaultLocale]?.slug !== undefined)
    throw new InvariantError(
      "invalid_labels",
      `the default locale's slug is the term's own slug; remove labels.${site.defaultLocale}.slug`,
    );
  for (const l of site.locales) {
    if (l === site.defaultLocale) continue;
    const mine = termSlug(term, l, site.defaultLocale);
    const other = taxonomyTerms.find(
      (t) =>
        t.id !== term.id && t.status !== "retired" && termSlug(t, l, site.defaultLocale) === mine,
    );
    if (other)
      throw new InvariantError(
        "slug_taken",
        `"${mine}" is already the ${l} slug of term "${other.slug}"`,
        { termId: other.id, locale: l, slug: mine },
      );
  }
}
