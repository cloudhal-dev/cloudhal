/**
 * Site › Settings › Collections (RFC-0038 §5): where each collection's entries live. Version 1
 * templates are a fixed prefix followed by `/{slug}`, so the form edits the prefix (`/blog`);
 * an empty field is the default, `/<collection>`, and removes the setting.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { collectionPermalink, entryPath, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
import { ApiRequestError } from "./api/http.ts";

/** The schema's pattern without its `/{slug}` tail (`site.schema.json`, `CollectionSettings`). */
const PREFIX = /^(\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/** Prefix by collection key; `""` is the default. */
export type PrefixForm = Record<string, string>;

export type PrefixError = "slash" | "trailingSlash" | "invalid";

/** The site's collections: the configured ones and the ones its entries use, sorted. */
export function collectionKeys(
  site: Pick<Site, "collections">,
  entries: readonly Pick<ContentEntry, "collection">[],
): string[] {
  return [
    ...new Set([...Object.keys(site.collections ?? {}), ...entries.map((e) => e.collection)]),
  ].sort();
}

/** The form for a site: each collection's configured prefix, or `""`. */
export function prefixForm(site: Pick<Site, "collections">, keys: readonly string[]): PrefixForm {
  return Object.fromEntries(
    keys.map((k) => {
      const p = site.collections?.[k]?.permalink;
      return [k, p ? permalinkPrefix(p) : ""];
    }),
  );
}

/** Why a typed prefix is not a v1 template prefix; undefined when it is (or empty). */
export function validatePrefix(value: string): PrefixError | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  if (!v.startsWith("/")) return "slash";
  if (v.length > 1 && v.endsWith("/")) return "trailingSlash";
  return PREFIX.test(v) ? undefined : "invalid";
}

/** The site with the form applied. An empty prefix, or the default one, removes the setting. */
export function withPrefixes(site: Site, form: PrefixForm): Site {
  const collections: NonNullable<Site["collections"]> = { ...site.collections };
  for (const [key, raw] of Object.entries(form)) {
    const prefix = raw.trim();
    const { permalink: _old, ...rest } = collections[key] ?? {};
    if (prefix && prefix !== `/${key}`)
      collections[key] = { ...rest, permalink: `${prefix}/{slug}` };
    else if (Object.keys(rest).length) collections[key] = rest;
    else delete collections[key];
  }
  const { collections: _drop, ...base } = site;
  return Object.keys(collections).length ? { ...base, collections } : (base as Site);
}

/** The collections whose effective template the form changes. */
export function changedKeys(site: Site, form: PrefixForm): string[] {
  const next = withPrefixes(site, form);
  return Object.keys(form).filter(
    (k) => collectionPermalink(site, k) !== collectionPermalink(next, k),
  );
}

/** An entry to show the address of: published first, default locale first, newest first. */
export function sampleEntry(
  entries: readonly ContentEntry[],
  collection: string,
  defaultLocale: string,
): Pick<ContentEntry, "collection" | "slug"> | undefined {
  const rank = (e: ContentEntry) =>
    (e.status === "published" ? 0 : 2) + (e.locale === defaultLocale ? 0 : 1);
  return entries
    .filter((e) => e.collection === collection)
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** The entry's address now and with the form applied. */
export function previewUrls(
  site: Site,
  form: PrefixForm,
  entry: Pick<ContentEntry, "collection" | "slug">,
): { now: string; next: string } {
  return { now: entryPath(site, entry), next: entryPath(withPrefixes(site, form), entry) };
}

/** RFC-0038 invariant 1 refused the save (`path_conflict`, `reserved_path`). */
export function isPathRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.body?.error === "path_conflict" || error.body?.error === "reserved_path")
  );
}

/**
 * The collection a refusal is about: the one its message names (`collection "posts" at …`), else
 * the first changed one.
 */
export function refusedKey(error: unknown, changed: readonly string[]): string | undefined {
  if (!isPathRefusal(error)) return undefined;
  const named = /collection "([a-z0-9-]+)"/.exec((error as ApiRequestError).body?.message ?? "");
  return named?.[1] && changed.includes(named[1]) ? named[1] : changed[0];
}
