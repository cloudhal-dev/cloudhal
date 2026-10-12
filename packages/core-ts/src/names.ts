/**
 * Term names: folding for comparison and the assignment resolution order of RFC-0002 §6.3.
 * Pure and dependency-free (Worker-safe); the store, the filter module and MCP tools share it.
 */

/** The parts of a Term that resolution reads. */
export interface ResolvableTerm {
  readonly id: string;
  readonly slug: string;
  readonly status: "active" | "proposed" | "retired";
  readonly slugHistory?: readonly string[];
  readonly labels: {
    readonly [locale: string]:
      | { readonly name: string; readonly altNames?: readonly string[] }
      | undefined;
  };
}

const SPECIAL: Record<string, string> = {
  ø: "o",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  đ: "d",
  ł: "l",
  þ: "th",
  ð: "d",
};

/**
 * Folds a name for comparison: NFKC, Turkish-aware lower-casing (İ, I and ı all become i),
 * diacritics removed, apostrophes and dots dropped (`A.I.` → `ai`), every other run of
 * non-letters/digits turned into a single `-`. `Yapay Zekâ` → `yapay-zeka`; a folded slug is itself.
 */
export function foldName(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[øßæœđłþð]/g, (c) => SPECIAL[c] ?? c)
    .replace(/['’‘`ʼ.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The folded word and its singular candidates (English `-s`, `-es`, `-ies`; Turkish `-lar`, `-ler`).
 * Two names match by plural folding when their candidate sets intersect.
 */
export function pluralForms(folded: string): string[] {
  const out = new Set([folded]);
  const n = folded.length;
  if (n > 4 && folded.endsWith("ies")) out.add(`${folded.slice(0, -3)}y`);
  if (n > 3 && folded.endsWith("es")) out.add(folded.slice(0, -2));
  if (n > 2 && folded.endsWith("s") && !folded.endsWith("ss")) out.add(folded.slice(0, -1));
  if (n > 4 && (folded.endsWith("lar") || folded.endsWith("ler"))) out.add(folded.slice(0, -3));
  return [...out];
}

/** A slug for a free-text name (`Machine Learning` → `machine-learning`); empty when nothing is left. */
export function slugify(name: string): string {
  return foldName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128)
    .replace(/-+$/, "");
}

/** `machine-learning` → `Machine learning`. */
export function humanizeSlug(slug: string): string {
  const text = slug.replace(/-+/g, " ").trim();
  return text ? text[0]?.toUpperCase() + text.slice(1) : slug;
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

export type ResolutionVia = "id" | "slug" | "slugHistory" | "name" | "altName" | "plural";

export interface TermSuggestion {
  readonly termId: string;
  readonly slug: string;
  readonly name: string;
}

export type Resolution =
  | {
      readonly input: string;
      readonly matched: true;
      readonly termId: string;
      readonly via: ResolutionVia;
    }
  | {
      readonly input: string;
      readonly matched: false;
      /** `none`: nothing matched; `ambiguous`: several terms matched at the same step. */
      readonly reason: "none" | "ambiguous";
      /** The terms that matched at the ambiguous step. */
      readonly candidates: readonly string[];
      /** Up to 5 close terms, closest first. */
      readonly suggestions: readonly TermSuggestion[];
    };

const ID = /^[a-z]+_[A-Za-z0-9]{6,32}$/;

function names(t: ResolvableTerm): { names: string[]; alt: string[] } {
  const n: string[] = [];
  const alt: string[] = [];
  for (const label of Object.values(t.labels)) {
    if (!label) continue;
    n.push(foldName(label.name));
    for (const a of label.altNames ?? []) alt.push(foldName(a));
  }
  return { names: n, alt };
}

/** Name of a term in `locale`, else the first label's. */
export function termName(t: ResolvableTerm, locale?: string): string {
  const label = (locale ? t.labels[locale] : undefined) ?? Object.values(t.labels).find(Boolean);
  return label?.name ?? t.slug;
}

/**
 * Suggestions for an input that matched nothing: terms whose slug, names or alternative names are
 * within a small edit distance of it or contain it, closest first, at most `limit`.
 */
export function suggestTerms(
  terms: readonly ResolvableTerm[],
  input: string,
  options: { locale?: string; limit?: number } = {},
): TermSuggestion[] {
  const q = foldName(input);
  if (!q) return [];
  const max = Math.max(2, Math.floor(q.length / 3));
  const scored: { t: ResolvableTerm; d: number }[] = [];
  for (const t of terms) {
    if (t.status === "retired") continue;
    const { names: n, alt } = names(t);
    let d = Number.POSITIVE_INFINITY;
    for (const c of [t.slug, ...(t.slugHistory ?? []), ...n, ...alt]) {
      const dist =
        c.includes(q) || q.includes(c)
          ? Math.min(1, editDistance(q, c, max))
          : editDistance(q, c, max);
      d = Math.min(d, dist);
    }
    if (d <= max) scored.push({ t, d });
  }
  return scored
    .sort((a, b) => a.d - b.d || a.t.slug.localeCompare(b.t.slug))
    .slice(0, options.limit ?? 5)
    .map(({ t }) => ({ termId: t.id, slug: t.slug, name: termName(t, options.locale) }));
}

/**
 * Resolves one input (id, slug or name) against the terms of one taxonomy, in the order of RFC-0002
 * §6.3: id → current slug → slug history → name in any locale → alternative names → plural folding.
 * The first step with exactly one match wins; several matches at a step are ambiguous. Retired terms
 * never match (merged ones resolve through their target's slug history and alternative names).
 */
export function resolveTerm(
  terms: readonly ResolvableTerm[],
  input: string,
  options: { locale?: string } = {},
): Resolution {
  const live = terms.filter((t) => t.status !== "retired");
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const folded = foldName(raw);
  const steps: [ResolutionVia, (t: ResolvableTerm) => boolean][] = [
    ["id", (t) => ID.test(raw) && t.id === raw],
    ["slug", (t) => t.slug === lower || t.slug === folded],
    ["slugHistory", (t) => (t.slugHistory ?? []).some((s) => s === lower || s === folded)],
    ["name", (t) => folded !== "" && names(t).names.includes(folded)],
    ["altName", (t) => folded !== "" && names(t).alt.includes(folded)],
    [
      "plural",
      (t) => {
        if (!folded) return false;
        const mine = new Set(pluralForms(folded));
        const { names: n, alt } = names(t);
        return [t.slug, ...(t.slugHistory ?? []), ...n, ...alt].some((c) =>
          pluralForms(c).some((f) => mine.has(f)),
        );
      },
    ],
  ];
  for (const [via, test] of steps) {
    const hits = live.filter(test);
    if (hits.length === 1) return { input, matched: true, termId: hits[0]?.id as string, via };
    if (hits.length > 1)
      return {
        input,
        matched: false,
        reason: "ambiguous",
        candidates: hits.map((t) => t.id),
        suggestions: hits.slice(0, 5).map((t) => ({
          termId: t.id,
          slug: t.slug,
          name: termName(t, options.locale),
        })),
      };
  }
  return {
    input,
    matched: false,
    reason: "none",
    candidates: [],
    suggestions: suggestTerms(terms, raw, options),
  };
}

/** `resolveTerm` for several inputs. */
export function resolveTermInputs(
  terms: readonly ResolvableTerm[],
  inputs: readonly string[],
  options: { locale?: string } = {},
): Resolution[] {
  return inputs.map((i) => resolveTerm(terms, i, options));
}
