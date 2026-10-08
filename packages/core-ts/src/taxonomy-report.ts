/**
 * Vocabulary hygiene of one taxonomy (RFC-0002 §6.2 `taxonomy_report`): single-use terms,
 * near-duplicates (edit distance ≤ 2, plural forms, synonym collisions) with a merge suggestion,
 * empty or oversized categories and the proposed backlog. Pure and dependency-free (Worker- and
 * browser-safe): MCP and Studio compute it from the same terms and usage counts.
 */
import { editDistance, foldName, pluralForms, type ResolvableTerm, termName } from "./names.ts";

/** The parts of a Term the report reads. */
export interface ReportTerm extends ResolvableTerm {
  readonly visibility: "public" | "internal";
  readonly parentId?: string | undefined;
  readonly createdAt: string;
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
  readonly reason: "similar" | "plural" | "synonym";
  /** The folded forms that met (e.g. `llm` / `llms`). */
  readonly forms: readonly [string, string];
}

export interface TaxonomyReport {
  /** Live terms (active and proposed) considered. */
  readonly terms: number;
  /** Active terms on exactly one entry: candidates to merge or drop. */
  readonly singleUse: readonly string[];
  /** Live terms no entry uses. */
  readonly unused: readonly string[];
  /** Pairs that probably mean the same thing, each with a merge suggestion. */
  readonly nearDuplicates: readonly NearDuplicate[];
  /** Hierarchical taxonomies: active categories with no entries in them or below them. */
  readonly emptyCategories: readonly string[];
  /** Hierarchical taxonomies: categories holding more than half of the entries (at least 20). */
  readonly oversizedCategories: readonly string[];
  /** Proposed terms waiting for a person, oldest first. */
  readonly proposed: readonly string[];
}

export interface TaxonomyReportInput {
  readonly hierarchical: boolean;
  readonly terms: readonly ReportTerm[];
  readonly usage: ReadonlyMap<string, ReportUsage> | Readonly<Record<string, ReportUsage>>;
  /** Entries in the collections the taxonomy applies to (for "oversized"); omit to skip that check. */
  readonly entries?: number;
  readonly locale?: string;
}

/** Shorter folded names collide too easily ("ai" / "ui") for an edit-distance match. */
const MIN_SIMILAR_LENGTH = 4;
const MAX_DISTANCE = 2;
const OVERSIZED_MIN_ENTRIES = 20;

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

function matchPair(
  a: ReportTerm,
  b: ReportTerm,
): Omit<NearDuplicate, "source" | "target"> | undefined {
  const fa = forms(a);
  const fb = forms(b);
  for (const x of fa.alt) if (fb.names.includes(x)) return { reason: "synonym", forms: [x, x] };
  for (const x of fb.alt) if (fa.names.includes(x)) return { reason: "synonym", forms: [x, x] };
  for (const x of fa.names)
    for (const y of fb.names) {
      if (x === y) return { reason: "similar", forms: [x, y] };
      const px = pluralForms(x);
      if (pluralForms(y).some((p) => px.includes(p))) return { reason: "plural", forms: [x, y] };
    }
  for (const x of fa.names)
    for (const y of fb.names) {
      if (Math.min(x.length, y.length) < MIN_SIMILAR_LENGTH) continue;
      if (editDistance(x, y, MAX_DISTANCE) <= MAX_DISTANCE)
        return { reason: "similar", forms: [x, y] };
    }
  return undefined;
}

export function taxonomyReport(input: TaxonomyReportInput): TaxonomyReport {
  const live = input.terms.filter((t) => t.status !== "retired");
  const byName = (a: ReportTerm, b: ReportTerm) =>
    termName(a, input.locale).localeCompare(termName(b, input.locale));
  const singleUse = live
    .filter((t) => t.status === "active" && usageOf(input, t.id).total === 1)
    .sort(byName)
    .map((t) => t.id);
  const unused = live
    .filter((t) => usageOf(input, t.id).total === 0)
    .sort(byName)
    .map((t) => t.id);

  const nearDuplicates: NearDuplicate[] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i] as ReportTerm;
      const b = live[j] as ReportTerm;
      // Siblings of different parents in a tree are different concepts more often than not.
      if (input.hierarchical && (a.parentId ?? null) !== (b.parentId ?? null)) continue;
      const m = matchPair(a, b);
      if (!m) continue;
      const [keep, drop] = keepFirst(a, b, input) ? [a, b] : [b, a];
      nearDuplicates.push({ source: drop.id, target: keep.id, ...m });
    }

  const emptyCategories: string[] = [];
  const oversizedCategories: string[] = [];
  if (input.hierarchical) {
    const children = new Map<string, ReportTerm[]>();
    for (const t of live)
      if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
    const subtreeUsed = (t: ReportTerm, seen = new Set<string>()): boolean => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      if (usageOf(input, t.id).total > 0) return true;
      return (children.get(t.id) ?? []).some((c) => subtreeUsed(c, seen));
    };
    for (const t of [...live].sort(byName)) {
      if (t.status !== "active") continue;
      if (!subtreeUsed(t)) emptyCategories.push(t.id);
      const total = usageOf(input, t.id).total;
      if (
        input.entries !== undefined &&
        input.entries >= OVERSIZED_MIN_ENTRIES &&
        total > input.entries / 2
      )
        oversizedCategories.push(t.id);
    }
  }

  const proposed = live
    .filter((t) => t.status === "proposed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => t.id);

  return {
    terms: live.length,
    singleUse,
    unused,
    nearDuplicates,
    emptyCategories,
    oversizedCategories,
    proposed,
  };
}
