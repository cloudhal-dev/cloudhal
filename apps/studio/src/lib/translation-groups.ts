/**
 * Pages and Articles on a multilingual site (an internal review (2026-10) §4a):
 * one row per translation group (`translation.group`; a node without one is its own group), shown
 * by its default-language version (or the original), with one language state per site locale.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { fieldDefinitions, localizedFieldValues } from "@cloudhal/core-ts/fields";
import type { NewEntry, NewPage } from "./api/content.ts";

type Localized = Page | ContentEntry;

/** A language's state in a group's row, most pressing first when several apply. */
export type LanguageState = "outdated" | "review" | "published" | "draft" | "missing";

export interface LanguageCell<N extends Localized> {
  locale: string;
  state: LanguageState;
  /** The version in this language, absent when it is missing. */
  node?: N;
}

export interface TranslationGroupRow<N extends Localized> {
  group: string;
  /** The version the row shows: the default language's, else the original, else the first. */
  node: N;
  /** One cell per site locale, in `site.locales` order. */
  cells: LanguageCell<N>[];
}

/** The group a node belongs to: its translation group, or itself. */
export const groupOf = (n: Localized): string => n.translation?.group ?? n.id;

/**
 * A version's state. Outdated: its source changed since it was translated (the translations API's
 * `stale` / `sourceMissing`, passed in as `outdated`). Needs review: machine output no one has
 * reviewed. Otherwise published, or draft for every other lifecycle status.
 */
export function languageState(n: Localized, outdated: ReadonlySet<string>): LanguageState {
  if (outdated.has(n.id)) return "outdated";
  if (n.translation?.method === "machine" && !n.translation.review) return "review";
  return n.status === "published" ? "published" : "draft";
}

/**
 * Groups `nodes` into one row per translation group. Rows keep the order of `nodes` (by the
 * position of each group's first node), so the caller's sort carries over.
 */
export function translationGroups<N extends Localized>(
  nodes: readonly N[],
  site: { locales: readonly string[]; defaultLocale: string },
  outdated: ReadonlySet<string> = new Set(),
): TranslationGroupRow<N>[] {
  const groups = new Map<string, N[]>();
  for (const n of nodes) {
    const g = groupOf(n);
    const members = groups.get(g);
    if (members) members.push(n);
    else groups.set(g, [n]);
  }
  return [...groups].map(([group, members]) => {
    const node =
      members.find((m) => m.locale === site.defaultLocale) ??
      members.find((m) => m.id === group) ??
      (members[0] as N);
    const cells = site.locales.map((locale): LanguageCell<N> => {
      const version = members.find((m) => m.locale === locale);
      return version
        ? { locale, state: languageState(version, outdated), node: version }
        : { locale, state: "missing" };
    });
    return { group, node, cells };
  });
}

/** A site with more than one language groups its lists; a single-language site does not. */
export const isMultilingual = (site: { locales: readonly string[] } | undefined): boolean =>
  (site?.locales.length ?? 0) > 1;

/**
 * The translation link of a version a person writes by hand: linked to `source`'s group, made from
 * its current revision (`hash` from the translations API's group members).
 */
export function handTranslation(
  source: Localized,
  hash: string,
): NonNullable<Localized["translation"]> {
  return {
    group: groupOf(source),
    method: "human",
    layout: "linked",
    source: { id: source.id, locale: source.locale, rev: source.rev, hash },
  };
}

/**
 * The new version a person writes by hand for a missing language: a draft in `locale` holding a
 * copy of `source`'s content to translate (title, path or slug, sections or body), linked to the
 * group. Its schedule, publishing record and metadata are its own, so they are not copied, and
 * of an entry's typed fields only the localized values are (RFC-0041 §5: shared ones are read from
 * the original, `site`'s definitions).
 */
export function handTranslationDraft(
  source: Localized,
  locale: string,
  hash: string,
  site?: Pick<Site, "collections">,
): { kind: "page"; input: NewPage } | { kind: "entry"; input: NewEntry } {
  const translation = handTranslation(source, hash);
  if ("sections" in source) {
    const {
      id,
      rev,
      createdAt,
      updatedAt,
      schemaVersion,
      siteId,
      availability,
      metadata,
      ...page
    } = source;
    return { kind: "page", input: { ...page, locale, status: "draft", translation } };
  }
  const {
    id,
    rev,
    createdAt,
    updatedAt,
    schemaVersion,
    siteId,
    author,
    availability,
    metadata,
    publishedAt,
    ...entry
  } = source;
  const fields = site
    ? localizedFieldValues(fieldDefinitions(site, entry.collection), entry.fields)
    : entry.fields;
  return { kind: "entry", input: { ...entry, fields, locale, status: "draft", translation } };
}
