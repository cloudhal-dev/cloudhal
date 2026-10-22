import type { Page, Redirect, Taxonomy, Term } from "@cloudhal/core-contracts";
import { RESERVED_FIELDS } from "@cloudhal/core-ts/filter";
import type { NewTaxonomy } from "./api.ts";
import { SLUG_PATTERN } from "./taxonomy.ts";

/**
 * Taxonomy settings in Studio (RFC-0002 §2.2, invariants 7 and 13). The limits are the contract's
 * (`taxonomy.schema.json`), the checks mirror core-ts (`#checkTaxonomy` and `updateTaxonomy` in
 * packages/core-ts/src/taxonomy.ts), so a person sees why before the server refuses.
 */
export const TAXONOMY_LIMITS = {
  /** `Slug` maxLength (the key). */
  keyMax: 128,
  /** `TaxonomyLabel.singular` / `plural` maxLength. */
  labelMax: 100,
  /** `maxPerEntry` range; absent means the contract limit of 50. */
  perEntryMax: 50,
  /** `minEntriesToIndex` range. */
  indexMax: 1000,
  /** `Path` maxLength. */
  pathMax: 1024,
} as const;

/** Words the filter grammar keeps for itself (`category:news+status:…`): never a key. */
export const RESERVED_KEYS: readonly string[] = RESERVED_FIELDS;

const PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

/** What the settings form edits; numbers stay text while typing. */
export interface TaxonomyDraft {
  key: string;
  /** Per locale; the default locale's pair is required, others are optional but come in pairs. */
  labels: Record<string, { singular: string; plural: string; description?: string }>;
  hierarchical: boolean;
  allowNewTerms: Taxonomy["allowNewTerms"];
  required: boolean;
  /** Empty: up to the contract limit of 50. */
  maxPerEntry: string;
  /** `undefined`: every collection. */
  collections: string[] | undefined;
  archiveEnabled: boolean;
  basePath: string;
  feed: boolean;
  minEntriesToIndex: string;
}

export type KeyError = "required" | "invalid" | "tooLong" | "reserved" | "taken";
export type LabelError = "required" | "tooLong" | "pair";
export type BasePathError =
  | "required"
  | "invalid"
  | "tooLong"
  | "root"
  | "taxonomy"
  | "page"
  | "collection";

export interface TaxonomyErrors {
  key?: KeyError;
  labels?: Record<string, { singular?: LabelError; plural?: LabelError }>;
  maxPerEntry?: true;
  minEntriesToIndex?: true;
  collections?: true;
  basePath?: BasePathError;
  /** What the base path collides with (another taxonomy's key, a page path, a collection). */
  basePathConflict?: string;
  /** Flat while terms still have parents (flatten them first). */
  hierarchical?: number;
  /** "People only" while proposals wait (review them first). */
  allowNewTerms?: number;
}

export function hasTaxonomyErrors(e: TaxonomyErrors): boolean {
  return Object.keys(e).length > 0;
}

/** The form for a new taxonomy: agents propose, archives at `/<key>`, indexed from 3 articles. */
export function newTaxonomyDraft(defaultLocale: string): TaxonomyDraft {
  return {
    key: "",
    labels: { [defaultLocale]: { singular: "", plural: "" } },
    hierarchical: false,
    allowNewTerms: "propose",
    required: false,
    maxPerEntry: "",
    collections: undefined,
    archiveEnabled: true,
    basePath: "",
    feed: true,
    minEntriesToIndex: "3",
  };
}

export function draftOf(tax: Taxonomy): TaxonomyDraft {
  return {
    key: tax.key,
    labels: Object.fromEntries(
      Object.entries(tax.labels).flatMap(([l, v]) => (v ? [[l, { ...v }]] : [])),
    ),
    hierarchical: tax.hierarchical,
    allowNewTerms: tax.allowNewTerms,
    required: tax.required,
    maxPerEntry: tax.maxPerEntry === undefined ? "" : String(tax.maxPerEntry),
    collections: tax.collections ? [...tax.collections] : undefined,
    archiveEnabled: tax.archive.enabled,
    basePath: tax.archive.basePath,
    feed: tax.feed,
    minEntriesToIndex: String(tax.minEntriesToIndex),
  };
}

/** The base path a draft uses: what was typed, else `/<key>`. */
export function effectiveBasePath(draft: Pick<TaxonomyDraft, "key" | "basePath">): string {
  return draft.basePath || (draft.key ? `/${draft.key}` : "");
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

const integer = (v: string, min: number, max: number): number | undefined => {
  if (!/^\d+$/.test(v.trim())) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
};

export interface TaxonomyContext {
  defaultLocale: string;
  /** The site's taxonomies (the edited one included when editing). */
  taxonomies: readonly Pick<Taxonomy, "id" | "key" | "archive">[];
  pages: readonly Pick<Page, "path">[];
  /** Collections the site's entries use. */
  collections: readonly string[];
  /** The edited taxonomy's terms (any status); empty for a new one. */
  terms: readonly Pick<Term, "status" | "parentId">[];
  /** The edited taxonomy's id; absent for a new one. */
  selfId?: string | undefined;
}

export function validateTaxonomy(draft: TaxonomyDraft, ctx: TaxonomyContext): TaxonomyErrors {
  const e: TaxonomyErrors = {};
  const others = ctx.taxonomies.filter((t) => t.id !== ctx.selfId);
  if (!ctx.selfId) {
    if (!draft.key) e.key = "required";
    else if (draft.key.length > TAXONOMY_LIMITS.keyMax) e.key = "tooLong";
    else if (!SLUG_PATTERN.test(draft.key)) e.key = "invalid";
    else if (RESERVED_KEYS.includes(draft.key)) e.key = "reserved";
    else if (others.some((t) => t.key === draft.key)) e.key = "taken";
  }

  const labels: NonNullable<TaxonomyErrors["labels"]> = {};
  for (const [locale, l] of Object.entries(draft.labels)) {
    const s = l.singular.trim();
    const p = l.plural.trim();
    const isDefault = locale === ctx.defaultLocale;
    const one = (v: string, other: string): LabelError | undefined =>
      v.length > TAXONOMY_LIMITS.labelMax
        ? "tooLong"
        : !v && isDefault
          ? "required"
          : !v && other
            ? "pair"
            : undefined;
    const errs = { singular: one(s, p), plural: one(p, s) };
    if (errs.singular || errs.plural)
      labels[locale] = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
  }
  if (!draft.labels[ctx.defaultLocale])
    labels[ctx.defaultLocale] = { singular: "required", plural: "required" };
  if (Object.keys(labels).length > 0) e.labels = labels;

  if (
    draft.maxPerEntry.trim() &&
    integer(draft.maxPerEntry, 1, TAXONOMY_LIMITS.perEntryMax) === undefined
  )
    e.maxPerEntry = true;
  if (integer(draft.minEntriesToIndex, 0, TAXONOMY_LIMITS.indexMax) === undefined)
    e.minEntriesToIndex = true;
  if (draft.collections && draft.collections.length === 0) e.collections = true;

  const base = effectiveBasePath(draft);
  if (!base) e.basePath = "required";
  else if (base.length > TAXONOMY_LIMITS.pathMax) e.basePath = "tooLong";
  else if (!PATH.test(base)) e.basePath = "invalid";
  else if (base === "/") e.basePath = "root";
  else {
    const taxonomy = others.find((t) => overlaps(t.archive.basePath, base));
    const page = draft.archiveEnabled
      ? ctx.pages.find((p) => p.path === base || p.path.startsWith(`${base}/`))
      : undefined;
    const collection = [...new Set([...ctx.collections, ...(draft.collections ?? [])])].find((c) =>
      overlaps(`/${c}`, base),
    );
    if (taxonomy) {
      e.basePath = "taxonomy";
      e.basePathConflict = taxonomy.key;
    } else if (page) {
      e.basePath = "page";
      e.basePathConflict = page.path;
    } else if (collection) {
      e.basePath = "collection";
      e.basePathConflict = `/${collection}`;
    }
  }

  if (ctx.selfId) {
    const withParents = ctx.terms.filter((t) => t.parentId && t.status !== "retired").length;
    if (!draft.hierarchical && withParents > 0) e.hierarchical = withParents;
    const proposals = ctx.terms.filter((t) => t.status === "proposed").length;
    if (draft.allowNewTerms === "none" && proposals > 0) e.allowNewTerms = proposals;
  }
  return e;
}

/** The contract shape of a valid draft (labels trimmed, empty locales dropped, feed off without archives). */
export function taxonomyFromDraft(draft: TaxonomyDraft): NewTaxonomy {
  const labels: NewTaxonomy["labels"] = {};
  for (const [locale, l] of Object.entries(draft.labels)) {
    const singular = l.singular.trim();
    const plural = l.plural.trim();
    if (!singular || !plural) continue;
    labels[locale] = { singular, plural, ...(l.description ? { description: l.description } : {}) };
  }
  const max = draft.maxPerEntry.trim();
  return {
    key: draft.key,
    labels,
    hierarchical: draft.hierarchical,
    allowNewTerms: draft.allowNewTerms,
    required: draft.required,
    ...(max ? { maxPerEntry: Number(max) } : {}),
    ...(draft.collections ? { collections: draft.collections as [string, ...string[]] } : {}),
    archive: { enabled: draft.archiveEnabled, basePath: effectiveBasePath(draft) },
    feed: draft.archiveEnabled && draft.feed,
    minEntriesToIndex: Number(draft.minEntriesToIndex),
  };
}

/** What saving the archive settings does to public addresses (core-ts `updateTaxonomy`). */
export interface ArchiveChange {
  /** The prefix redirect left behind when an enabled archive moves (301, "and below"). */
  redirect?: { from: string; to: string };
  /** Existing redirects into the old path that follow to the new one (no chains). */
  follow: number;
  /** The archives stop: their addresses answer 404 (no redirect is made). */
  disabled?: string;
  /** The archives start at this base path. */
  enabled?: string;
}

export function archiveChange(
  stored: Pick<Taxonomy, "archive"> | undefined,
  draft: TaxonomyDraft,
  redirects: readonly Pick<Redirect, "to">[],
): ArchiveChange {
  const base = effectiveBasePath(draft);
  if (!stored) return { follow: 0 };
  const was = stored.archive;
  if (was.enabled && draft.archiveEnabled && was.basePath !== base && PATH.test(base))
    return {
      redirect: { from: was.basePath, to: base },
      follow: redirects.filter((r) => r.to === was.basePath || r.to.startsWith(`${was.basePath}/`))
        .length,
    };
  if (was.enabled && !draft.archiveEnabled) return { follow: 0, disabled: was.basePath };
  if (!was.enabled && draft.archiveEnabled) return { follow: 0, enabled: base };
  return { follow: 0 };
}

/**
 * Collections a taxonomy can apply to: the registry's (RFC-0040: declared, in use, `posts`), the
 * ones entries use, and the ones it names.
 */
export function knownCollections(
  entries: readonly { collection: string }[],
  draft?: Pick<TaxonomyDraft, "collections">,
  registry: readonly string[] = [],
): string[] {
  return [
    ...new Set([
      "posts",
      ...registry,
      ...entries.map((e) => e.collection),
      ...(draft?.collections ?? []),
    ]),
  ].sort();
}
