/**
 * Vocabulary hygiene of one taxonomy (RFC-0002 §6.2 `taxonomy_report`): single-use and unused
 * terms, near-duplicates (edit distance, singular/plural, synonym collisions) with a merge
 * suggestion, empty and oversized categories, the proposed backlog, indexed archives without an
 * intro (recommended answer 6) and articles without a required primary term or without any
 * category (answer 10).
 *
 * This is the one report: MCP `taxonomy_report` and Studio's "Vocabulary health" card both call it
 * with the same terms, usage counts and entries, so a person and an agent see the same findings.
 * Pure and dependency-free (Worker- and browser-safe).
 */
import { editDistance, foldName, pluralForms, type ResolvableTerm, termName } from "./names.ts";

/** Thresholds of the report; MCP returns them with every report. */
export const REPORT_THRESHOLDS = {
  /** Near-duplicates: names (compared without hyphens) at most this many edits apart… */
  maxEditDistance: 2,
  /** …and fewer edits than half the shorter name… */
  maxEditShare: 0.5,
  /** …and, unless identical, both at least this long ("ai" / "ui" are different words). */
  minSimilarLength: 4,
  /** A category holding at least this share of the filed articles… */
  oversizedShare: 0.5,
  /** …and at least this many articles, without sub-categories, is worth splitting. */
  oversizedMinEntries: 20,
  /** Pair comparisons stop after this many live terms (the check is quadratic). */
  maxPairTerms: 2000,
} as const;

/** The parts of a Taxonomy the report reads. */
export interface ReportTaxonomy {
  readonly key: string;
  readonly hierarchical: boolean;
  readonly required?: boolean;
  readonly collections?: readonly string[];
  readonly minEntriesToIndex?: number;
}

/** The parts of a Term the report reads. */
export interface ReportTerm extends ResolvableTerm {
  readonly visibility: "public" | "internal";
  readonly parentId?: string | undefined;
  readonly createdAt: string;
  readonly labels: {
    readonly [locale: string]:
      | {
          readonly name: string;
          readonly altNames?: readonly string[];
          readonly description?: string;
        }
      | undefined;
  };
}

/** The parts of a ContentEntry the report reads. */
export interface ReportEntry {
  readonly id: string;
  readonly collection: string;
  readonly terms?: {
    readonly [key: string]:
      | { readonly ids: readonly string[]; readonly primary?: string }
      | undefined;
  };
}

export interface ReportUsage {
  readonly total: number;
  readonly published: number;
}

export interface NearDuplicate {
  /** The term to merge away: the less used one (a proposed term before an active one). */
  readonly source: string;
  /** The term to keep. */
  readonly target: string;
  /** `synonym`: a synonym of one is a name, slug or synonym of the other. */
  readonly reason: "similar" | "plural" | "synonym";
  /** The folded forms that met (e.g. `llm` / `llms`). */
  readonly forms: readonly [string, string];
  /** Edits between the forms (`similar` only). */
  readonly distance?: number;
}

export interface TaxonomyReport {
  /** Live terms (active and proposed) considered. */
  readonly terms: number;
  /** Active terms on exactly one entry: candidates to merge or drop. */
  readonly singleUse: readonly string[];
  /** Flat taxonomies: active terms no entry uses (categories report as `emptyCategories`). */
  readonly unused: readonly string[];
  /** Pairs that probably mean the same thing, each with a merge suggestion. */
  readonly nearDuplicates: readonly NearDuplicate[];
  /** Hierarchical taxonomies: active categories without a published entry in them or below (404). */
  readonly emptyCategories: readonly string[];
  /** Hierarchical taxonomies: leaf categories holding most of the filed entries (at least 20). */
  readonly oversizedCategories: readonly string[];
  /** Proposed terms waiting for a person, oldest first. */
  readonly proposed: readonly string[];
  /** Public, active terms whose archive is indexed but has no intro text in the locale. */
  readonly noIntro: readonly string[];
  /** Required taxonomies: entries without a primary term (they cannot go to review or live). */
  readonly missingPrimary: readonly string[];
  /** Hierarchical taxonomies that are not required: entries without any term of it. */
  readonly unfiled: readonly string[];
  /** Entries the taxonomy applies to that carry at least one of its terms. */
  readonly filed: number;
}

export interface TaxonomyReportInput {
  readonly taxonomy: ReportTaxonomy;
  /** Terms of the taxonomy, any status (retired ones are ignored). */
  readonly terms: readonly ReportTerm[];
  readonly usage: ReadonlyMap<string, ReportUsage> | Readonly<Record<string, ReportUsage>>;
  /**
   * The site's entries (any collection, any status). Omit to skip the entry-based checks
   * (oversized categories, missing primary, unfiled).
   */
  readonly entries?: readonly ReportEntry[];
  /** The site's default locale: names, and where an archive's intro must be. */
  readonly locale?: string;
}

function usageOf(input: TaxonomyReportInput, id: string): ReportUsage {
  const u = input.usage;
  const found = u instanceof Map ? u.get(id) : (u as Record<string, ReportUsage>)[id];
  return found ?? { total: 0, published: 0 };
}

function forms(t: ReportTerm): { names: string[]; alt: string[] } {
  const names = new Set([t.slug]);
  const alt = new Set<string>();
  for (const label of Object.values(t.labels)) {
    if (!label) continue;
    names.add(foldName(label.name));
    for (const a of label.altNames ?? []) alt.add(foldName(a));
  }
  return { names: [...names].filter(Boolean), alt: [...alt].filter(Boolean) };
}

/** Which of two near-duplicates to keep: active over proposed, more used, older, then by slug. */
function keepFirst(a: ReportTerm, b: ReportTerm, input: TaxonomyReportInput): boolean {
  if (a.status !== b.status) return a.status === "active";
  const ua = usageOf(input, a.id).total;
  const ub = usageOf(input, b.id).total;
  if (ua !== ub) return ua > ub;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt;
  return a.slug < b.slug;
}

const compact = (s: string) => s.replace(/-/g, "");

function matchPair(
  a: ReportTerm,
  b: ReportTerm,
): Omit<NearDuplicate, "source" | "target"> | undefined {
  const fa = forms(a);
  const fb = forms(b);
  // A synonym of one that names (or is a synonym of) the other: invariant 12 territory.
  for (const x of fa.alt)
    if (fb.names.includes(x) || fb.alt.includes(x)) return { reason: "synonym", forms: [x, x] };
  for (const x of fb.alt) if (fa.names.includes(x)) return { reason: "synonym", forms: [x, x] };
  for (const x of fa.names)
    for (const y of fb.names) {
      const px = pluralForms(x);
      if (x !== y && pluralForms(y).some((p) => px.includes(p)))
        return { reason: "plural", forms: [x, y] };
    }
  const T = REPORT_THRESHOLDS;
  for (const x of fa.names)
    for (const y of fb.names) {
      const cx = compact(x);
      const cy = compact(y);
      const shorter = Math.min(cx.length, cy.length);
      const d = editDistance(cx, cy, T.maxEditDistance);
      if (d > T.maxEditDistance || d >= shorter * T.maxEditShare) continue;
      if (d > 0 && shorter < T.minSimilarLength) continue;
      return { reason: "similar", forms: [x, y], distance: d };
    }
  return undefined;
}

/** Whether a taxonomy applies to an entry's collection. */
export function reportAppliesTo(taxonomy: ReportTaxonomy, collection: string): boolean {
  return !taxonomy.collections || taxonomy.collections.includes(collection);
}

export function taxonomyReport(input: TaxonomyReportInput): TaxonomyReport {
  const T = REPORT_THRESHOLDS;
  const tax = input.taxonomy;
  const live = input.terms.filter((t) => t.status !== "retired");
  const active = live.filter((t) => t.status === "active");
  const byName = (a: ReportTerm, b: ReportTerm) =>
    termName(a, input.locale).localeCompare(termName(b, input.locale));
  const ids = (terms: readonly ReportTerm[]) => [...terms].sort(byName).map((t) => t.id);
  const use = (t: ReportTerm) => usageOf(input, t.id);

  const children = new Map<string, ReportTerm[]>();
  if (tax.hierarchical)
    for (const t of live)
      if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
  /** Published entries in a term and (hierarchical) below it, as its archive counts them. */
  const archived = (t: ReportTerm, seen = new Set<string>()): number => {
    if (seen.has(t.id)) return 0;
    seen.add(t.id);
    return (children.get(t.id) ?? []).reduce((n, c) => n + archived(c, seen), use(t).published);
  };

  const singleUse = ids(active.filter((t) => use(t).total === 1));
  const unused = tax.hierarchical ? [] : ids(active.filter((t) => use(t).total === 0));

  const nearDuplicates: NearDuplicate[] = [];
  const pairable = live.slice(0, T.maxPairTerms);
  for (let i = 0; i < pairable.length; i++)
    for (let j = i + 1; j < pairable.length; j++) {
      const a = pairable[i] as ReportTerm;
      const b = pairable[j] as ReportTerm;
      // Siblings of different parents in a tree are different concepts more often than not.
      if (tax.hierarchical && (a.parentId ?? null) !== (b.parentId ?? null)) continue;
      const m = matchPair(a, b);
      if (!m) continue;
      const [keep, drop] = keepFirst(a, b, input) ? [a, b] : [b, a];
      nearDuplicates.push({ source: drop.id, target: keep.id, ...m });
    }

  const applicable = (input.entries ?? []).filter((e) => reportAppliesTo(tax, e.collection));
  const filed = applicable.filter((e) => (e.terms?.[tax.key]?.ids.length ?? 0) > 0).length;

  const emptyCategories = tax.hierarchical ? ids(active.filter((t) => archived(t) === 0)) : [];
  const oversizedCategories =
    tax.hierarchical && input.entries
      ? ids(
          active.filter((t) => {
            const total = use(t).total;
            return (
              !children.has(t.id) &&
              total >= T.oversizedMinEntries &&
              filed > 0 &&
              total / filed >= T.oversizedShare
            );
          }),
        )
      : [];

  const proposed = live
    .filter((t) => t.status === "proposed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => t.id);

  const threshold = tax.minEntriesToIndex;
  const noIntro =
    threshold === undefined
      ? []
      : ids(
          active.filter(
            (t) =>
              t.visibility === "public" &&
              archived(t) >= Math.max(threshold, 1) &&
              !(input.locale ? t.labels[input.locale]?.description?.trim() : undefined),
          ),
        );

  const missingPrimary =
    input.entries && tax.required
      ? applicable.filter((e) => !e.terms?.[tax.key]?.primary).map((e) => e.id)
      : [];
  const unfiled =
    input.entries && tax.hierarchical && !tax.required
      ? applicable.filter((e) => !e.terms?.[tax.key]?.ids.length).map((e) => e.id)
      : [];

  return {
    terms: live.length,
    singleUse,
    unused,
    nearDuplicates,
    emptyCategories,
    oversizedCategories,
    proposed,
    noIntro,
    missingPrimary,
    unfiled,
    filed,
  };
}
