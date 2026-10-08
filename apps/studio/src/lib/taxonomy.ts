import type {
  ContentEntry,
  PublishStatus,
  Site,
  Taxonomy,
  Term,
  TermLabel,
} from "@cloudhal/core-contracts";
import {
  foldName,
  type ResolvableTerm,
  resolveTerm,
  slugify,
  suggestTerms,
} from "@cloudhal/core-ts/names";
import type { TermListItem, TermUsage } from "./api.ts";
import {
  cleanImageRef,
  type ImageRefErrors,
  type Seo,
  type SeoErrors,
  validateImageRef,
  validateSeo,
} from "./seo.ts";

/**
 * Taxonomy helpers for Studio (RFC-0002). Validation mirrors the contracts and the core-ts
 * invariants (packages/core-ts/src/taxonomy.ts), so a refusal is explained before the server sees
 * it; names fold and resolve with the store's own functions (`@cloudhal/core-ts/names`).
 */
export const TERM_LIMITS = {
  /** `TermLabel.name` maxLength. */
  nameMax: 200,
  /** `TermLabel.altNames` maxItems. */
  altNamesMax: 50,
  /** `TermLabel.description` maxLength. */
  descriptionMax: 20_000,
  /** `Slug` maxLength. */
  slugMax: 128,
  /** `Term.position` maximum. */
  positionMax: 100_000,
  /** Deepest category tree (a root term has depth 1). */
  depthMax: 5,
  /** One governance operation touches at most this many entries (`GOVERNANCE_ENTRY_LIMIT`). */
  governanceEntries: 400,
} as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export { foldName, slugify };

// ---- names ----------------------------------------------------------------------------------

/** A term's name in the first locale that has one (the site's default locale first). */
export function termLabel(term: Pick<Term, "labels" | "slug">, ...locales: string[]): string {
  for (const loc of locales) {
    const name = term.labels[loc]?.name;
    if (name) return name;
  }
  return Object.values(term.labels).find((l) => l?.name)?.name ?? term.slug;
}

/** A taxonomy's display label in Studio's language, else the site's default locale, else any. */
export function taxonomyLabel(
  tax: Pick<Taxonomy, "labels" | "key">,
  locales: string[],
  form: "singular" | "plural" = "plural",
): string {
  for (const loc of locales) {
    const label = tax.labels[loc] ?? tax.labels[loc.split("-")[0] ?? loc];
    if (label) return label[form];
  }
  const any = Object.values(tax.labels).find(Boolean);
  return any?.[form] ?? tax.key;
}

export function archivePath(tax: Pick<Taxonomy, "archive">, slug: string): string {
  return `${tax.archive.basePath}/${slug}`;
}

// ---- filters and the tree -------------------------------------------------------------------

export type TermFilter = "all" | "public" | "internal" | "proposed" | "retired";
export const TERM_FILTERS: TermFilter[] = ["all", "public", "internal", "proposed", "retired"];

/** `all` is every live term (retired ones are their own filter). */
export function matchesFilter(term: Pick<Term, "status" | "visibility">, f: TermFilter): boolean {
  switch (f) {
    case "all":
      return term.status !== "retired";
    case "public":
      return term.status === "active" && term.visibility === "public";
    case "internal":
      return term.status !== "retired" && term.visibility === "internal";
    case "proposed":
      return term.status === "proposed";
    case "retired":
      return term.status === "retired";
  }
}

export interface TreeRow<T extends { term: Term }> {
  item: T;
  /** 0 for a root. */
  depth: number;
  /** Ancestors present in the input, nearest last. */
  ancestors: Term[];
  hasChildren: boolean;
}

/**
 * Depth-first order of a hierarchical list: each term followed by its children, siblings in the
 * input's order (the API sorts by `position`, then name). Terms whose parent is not in the list
 * start at the root, so a filtered view still shows every row once.
 */
export function termTree<T extends { term: Term }>(items: readonly T[]): TreeRow<T>[] {
  const ids = new Set(items.map((i) => i.term.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of items) {
    const parent = item.term.parentId;
    if (parent && ids.has(parent) && parent !== item.term.id)
      children.set(parent, [...(children.get(parent) ?? []), item]);
    else roots.push(item);
  }
  const out: TreeRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (item: T, ancestors: Term[]) => {
    if (seen.has(item.term.id)) return;
    seen.add(item.term.id);
    const kids = children.get(item.term.id) ?? [];
    out.push({ item, depth: ancestors.length, ancestors, hasChildren: kids.length > 0 });
    for (const kid of kids) walk(kid, [...ancestors, item.term]);
  };
  for (const root of roots) walk(root, []);
  // A corrupt cycle would leave rows unvisited: list them at the root rather than lose them.
  for (const item of items) walk(item, []);
  return out;
}

/** Ids of a term and every term below it. */
export function descendantIds(terms: readonly Term[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of terms)
      if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
        out.add(t.id);
        grew = true;
      }
  }
  return out;
}

/** Depth of a term (a root is 1). */
export function depthOf(terms: readonly Term[], id: string): number {
  const byId = new Map(terms.map((t) => [t.id, t]));
  let depth = 0;
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth++;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return depth;
}

/** Height of the subtree under `id` (a leaf is 1). */
export function heightOf(terms: readonly Term[], id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  let h = 0;
  for (const t of terms)
    if (t.parentId === id && t.status !== "retired") h = Math.max(h, heightOf(terms, t.id, seen));
  return h + 1;
}

/** Parents `term` may move under: live terms of its taxonomy, not itself or below it, within depth 5. */
export function parentCandidates(terms: readonly Term[], term: Term): Term[] {
  const below = descendantIds(terms, term.id);
  const height = heightOf(terms, term.id);
  return terms.filter(
    (t) =>
      t.status !== "retired" &&
      !below.has(t.id) &&
      depthOf(terms, t.id) + height <= TERM_LIMITS.depthMax,
  );
}

// ---- indexing -----------------------------------------------------------------------------

export type IndexStatus =
  | { kind: "indexed"; published: number }
  | { kind: "thin"; published: number; min: number }
  | { kind: "empty" }
  | { kind: "noindex" }
  | { kind: "none"; reason: "internal" | "proposed" | "retired" | "archiveOff" };

/**
 * How the term's archive is served (RFC-0002 §7): indexed at `minEntriesToIndex` published entries,
 * `noindex, follow` below it or with `seo.noindex`, 404 when empty, no archive when not public.
 * `published` counts the term's subtree in hierarchical taxonomies (archives include sub-categories).
 */
export function indexStatus(
  term: Term,
  tax: Pick<Taxonomy, "archive" | "minEntriesToIndex">,
  published: number,
  defaultLocale: string,
): IndexStatus {
  if (term.status === "retired") return { kind: "none", reason: "retired" };
  if (term.status === "proposed") return { kind: "none", reason: "proposed" };
  if (term.visibility === "internal") return { kind: "none", reason: "internal" };
  if (!tax.archive.enabled) return { kind: "none", reason: "archiveOff" };
  if (published === 0) return { kind: "empty" };
  if (term.labels[defaultLocale]?.seo?.noindex) return { kind: "noindex" };
  if (published < tax.minEntriesToIndex)
    return { kind: "thin", published, min: tax.minEntriesToIndex };
  return { kind: "indexed", published };
}

/** Published entries per term, summed over each term's subtree when `hierarchical`. */
export function archiveCounts(
  items: readonly TermListItem[],
  hierarchical: boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  const terms = items.map((i) => i.term);
  const usage = new Map(items.map((i) => [i.term.id, i.usage.published]));
  for (const t of terms) {
    if (!hierarchical) {
      out.set(t.id, usage.get(t.id) ?? 0);
      continue;
    }
    let sum = 0;
    for (const id of descendantIds(terms, t.id)) sum += usage.get(id) ?? 0;
    out.set(t.id, sum);
  }
  return out;
}

// ---- term validation (invariants 8, 9, 12 and the contract limits) --------------------------

export type SlugError = "required" | "invalid" | "tooLong" | "taken" | "reserved";

/** A new slug: the contract pattern, and free in the taxonomy (live slugs and slug histories). */
export function validateSlug(
  slug: string,
  terms: readonly Term[],
  selfId?: string,
): SlugError | undefined {
  if (!slug) return "required";
  if (slug.length > TERM_LIMITS.slugMax) return "tooLong";
  if (!SLUG_PATTERN.test(slug)) return "invalid";
  for (const t of terms) {
    if (t.id === selfId) continue;
    if (t.status !== "retired" && t.slug === slug) return "taken";
    if (t.slugHistory?.includes(slug)) return "reserved";
    if (t.status === "retired" && !t.mergedInto && t.slug === slug) return "reserved";
  }
  return undefined;
}

export interface AltNameError {
  value: string;
  code: "tooLong" | "duplicate" | "collision";
  /** The other term's name, for "collision". */
  other?: string;
}

export interface LocaleErrors {
  name?: "required" | "tooLong";
  altNames?: AltNameError[];
  description?: "tooLong";
  seo?: SeoErrors;
}

export interface TermErrors {
  locales: Record<string, LocaleErrors>;
  slug?: SlugError;
  position?: "invalid";
  image?: ImageRefErrors;
}

export function hasTermErrors(errors: TermErrors): boolean {
  return (
    errors.slug !== undefined ||
    errors.position !== undefined ||
    (errors.image !== undefined && Object.keys(errors.image).length > 0) ||
    Object.values(errors.locales).some(
      (l) =>
        l.name !== undefined ||
        (l.altNames?.length ?? 0) > 0 ||
        l.description !== undefined ||
        (l.seo !== undefined && Object.keys(l.seo).length > 0),
    )
  );
}

/** Folded names, synonyms and slugs that other live terms of the taxonomy hold (invariant 12). */
function takenNames(terms: readonly Term[], selfId: string | undefined): Map<string, Term> {
  const taken = new Map<string, Term>();
  for (const t of terms) {
    if (t.id === selfId || t.status === "retired") continue;
    taken.set(t.slug, t);
    for (const label of Object.values(t.labels)) {
      if (!label) continue;
      taken.set(foldName(label.name), t);
      for (const a of label.altNames ?? []) taken.set(foldName(a), t);
    }
  }
  return taken;
}

/**
 * Everything the store would refuse in a term draft: the default locale's name (invariant 12),
 * lengths, synonyms that repeat or name another term, SEO limits, the image rule, the position
 * range and — for a new term — the slug.
 */
export function validateTerm(
  term: Term,
  context: { defaultLocale: string; terms: readonly Term[]; isNew?: boolean },
): TermErrors {
  const errors: TermErrors = { locales: {} };
  const taken = takenNames(context.terms, term.id);
  const locales = new Set([context.defaultLocale, ...Object.keys(term.labels)]);
  for (const loc of locales) {
    const label = term.labels[loc];
    const e: LocaleErrors = {};
    const name = label?.name.trim() ?? "";
    if (loc === context.defaultLocale && !name) e.name = "required";
    else if (name.length > TERM_LIMITS.nameMax) e.name = "tooLong";
    const seen = new Set<string>(name ? [foldName(name)] : []);
    const alt: AltNameError[] = [];
    for (const value of label?.altNames ?? []) {
      const folded = foldName(value);
      if (value.length > TERM_LIMITS.nameMax) alt.push({ value, code: "tooLong" });
      else if (seen.has(folded)) alt.push({ value, code: "duplicate" });
      else {
        const other = taken.get(folded);
        if (other)
          alt.push({
            value,
            code: "collision",
            other: termLabel(other, context.defaultLocale),
          });
      }
      seen.add(folded);
    }
    if (alt.length) e.altNames = alt;
    if ((label?.description?.length ?? 0) > TERM_LIMITS.descriptionMax) e.description = "tooLong";
    const seo = validateSeo(label?.seo);
    if (Object.keys(seo).length) e.seo = seo;
    if (Object.keys(e).length) errors.locales[loc] = e;
  }
  if (context.isNew) {
    const slug = validateSlug(term.slug, context.terms, term.id);
    if (slug) errors.slug = slug;
  }
  if (
    term.position !== undefined &&
    (!Number.isInteger(term.position) ||
      term.position < 0 ||
      term.position > TERM_LIMITS.positionMax)
  )
    errors.position = "invalid";
  const image = validateImageRef(term.image);
  if (Object.keys(image).length) errors.image = image;
  return errors;
}

function cleanSeoObject(seo: Seo | undefined): Seo | undefined {
  if (!seo) return undefined;
  const next: Seo = { ...seo };
  for (const key of ["title", "description", "canonical"] as const) {
    const v = next[key]?.trim();
    if (v) next[key] = v;
    else delete next[key];
  }
  if (next.noindex === false) delete next.noindex;
  return Object.keys(next).length ? next : undefined;
}

/**
 * What is sent: trimmed names, other locales without a name dropped, no empty synonym lists,
 * descriptions or SEO objects (the contract allows no empty containers, RFC-0002 §2.10).
 */
export function cleanTerm(term: Term, defaultLocale: string): Term {
  const labels: Term["labels"] = {};
  for (const [loc, label] of Object.entries(term.labels)) {
    if (!label) continue;
    const name = label.name.trim();
    if (!name && loc !== defaultLocale) continue;
    const altNames = [...new Set((label.altNames ?? []).map((a) => a.trim()).filter(Boolean))];
    const description = label.description?.trim();
    const seo = cleanSeoObject(label.seo);
    const next: TermLabel = {
      name,
      ...(altNames.length ? { altNames: altNames as [string, ...string[]] } : {}),
      ...(description ? { description } : {}),
      ...(seo ? { seo } : {}),
    };
    labels[loc] = next;
  }
  const { image, position, ...rest } = term;
  return {
    ...rest,
    labels,
    ...(image ? { image: cleanImageRef(image) } : {}),
    ...(position !== undefined && Number.isFinite(position) ? { position } : {}),
  };
}

/** Sets one locale's label fields; an absent label starts with an empty name. */
export function editLabel(term: Term, locale: string, patch: Partial<TermLabel>): Term {
  const current = term.labels[locale] ?? { name: "" };
  const next: TermLabel = { ...current, ...patch };
  for (const key of ["altNames", "description", "seo"] as const)
    if (key in patch && patch[key] === undefined) delete next[key];
  return { ...term, labels: { ...term.labels, [locale]: next } };
}

// ---- entry assignments (invariants 1–5) -----------------------------------------------------

export interface Assignment {
  ids: string[];
  primary?: string | undefined;
}

export function assignmentOf(entry: Pick<ContentEntry, "terms">, key: string): Assignment {
  const a = entry.terms?.[key];
  return { ids: a ? [...a.ids] : [], primary: a?.primary };
}

/**
 * The entry with one taxonomy's assignment replaced, in canonical form: no empty assignment or
 * `terms`; the primary is kept only when it is still assigned, and a single term is the primary
 * of a taxonomy that needs one.
 */
export function withAssignment<T extends Pick<ContentEntry, "terms">>(
  entry: T,
  key: string,
  next: Assignment,
  options: { autoPrimary?: boolean } = {},
): T {
  const ids = [...new Set(next.ids)];
  let primary = next.primary && ids.includes(next.primary) ? next.primary : undefined;
  if (!primary && options.autoPrimary && ids.length === 1) primary = ids[0];
  const terms = { ...(entry.terms ?? {}) };
  if (ids.length === 0) delete terms[key];
  else terms[key] = { ids: ids as [string, ...string[]], ...(primary ? { primary } : {}) };
  const out = { ...entry };
  if (Object.keys(terms).length === 0) delete out.terms;
  else out.terms = terms as NonNullable<ContentEntry["terms"]>;
  return out;
}

/** Does the taxonomy apply to the collection (`collections` absent = every collection)? */
export function appliesTo(tax: Pick<Taxonomy, "collections">, collection: string): boolean {
  return !tax.collections || tax.collections.includes(collection);
}

/**
 * Required taxonomies (invariant 2) whose primary term an entry lacks for `status`. Drafts and
 * archived entries may be incomplete.
 */
export function missingPrimaries(
  entry: Pick<ContentEntry, "terms" | "collection">,
  taxonomies: readonly Taxonomy[],
  status: PublishStatus,
): Taxonomy[] {
  if (status !== "review" && status !== "published") return [];
  return taxonomies.filter(
    (t) => t.required && appliesTo(t, entry.collection) && !entry.terms?.[t.key]?.primary,
  );
}

// ---- tag suggestions (RFC-0002 §6.3, §8) ----------------------------------------------------

export type TermMatchVia = "name" | "altName" | "slug" | "plural" | "similar";

export type TagSuggestion =
  | { kind: "term"; term: Term; via: TermMatchVia; matched?: string | undefined }
  | { kind: "create"; name: string; slug: string; similar: Term[] };

function asResolvable(t: Term): ResolvableTerm {
  return t;
}

/**
 * What the tag picker offers for `query` (RFC-0002 §8): existing terms first — matched by name,
 * synonym or slug, the exact match on top — then "create" only when no term resolves the query,
 * with the near-duplicates that make it look like a mistake. `selected` terms are left out.
 */
export function tagSuggestions(
  terms: readonly Term[],
  query: string,
  options: {
    locale: string;
    selected?: ReadonlySet<string>;
    usage?: ReadonlyMap<string, TermUsage>;
    limit?: number;
  },
): TagSuggestion[] {
  const limit = options.limit ?? 8;
  const live = terms.filter((t) => t.status !== "retired");
  const selected = options.selected ?? new Set<string>();
  const uses = (t: Term) => options.usage?.get(t.id)?.total ?? 0;
  const q = foldName(query);
  if (!q)
    return live
      .filter((t) => !selected.has(t.id))
      .sort(
        (a, b) =>
          uses(b) - uses(a) ||
          termLabel(a, options.locale).localeCompare(termLabel(b, options.locale)),
      )
      .slice(0, limit)
      .map((term) => ({ kind: "term", term, via: "name" }));

  const scored: { term: Term; via: TermMatchVia; matched?: string; score: number }[] = [];
  for (const t of live) {
    let best: { via: TermMatchVia; matched?: string; score: number } | undefined;
    const consider = (candidate: string, via: TermMatchVia, shown?: string) => {
      const f = foldName(candidate);
      const score = f === q ? 0 : f.startsWith(q) ? 1 : f.includes(q) ? 2 : undefined;
      if (score === undefined) return;
      if (!best || score < best.score) best = { via, score, ...(shown ? { matched: shown } : {}) };
    };
    for (const label of Object.values(t.labels)) {
      if (!label) continue;
      consider(label.name, "name");
      for (const a of label.altNames ?? []) consider(a, "altName", a);
    }
    consider(t.slug, "slug", t.slug);
    for (const s of t.slugHistory ?? []) consider(s, "slug", s);
    if (best) scored.push({ term: t, ...(best as { via: TermMatchVia; score: number }) });
  }
  const resolved = resolveTerm(live.map(asResolvable), query, { locale: options.locale });
  if (resolved.matched && !scored.some((s) => s.term.id === resolved.termId)) {
    const term = live.find((t) => t.id === resolved.termId);
    if (term) scored.push({ term, via: "plural", score: 0 });
  } else if (resolved.matched) {
    const hit = scored.find((s) => s.term.id === resolved.termId);
    if (hit) hit.score = 0;
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      uses(b.term) - uses(a.term) ||
      termLabel(a.term, options.locale).localeCompare(termLabel(b.term, options.locale)),
  );
  const out: TagSuggestion[] = scored
    .filter((s) => !selected.has(s.term.id))
    .slice(0, limit)
    .map((s) => ({ kind: "term", term: s.term, via: s.via, matched: s.matched }));
  if (resolved.matched) return out;
  // Nothing resolves the query: offer to create it, warning about terms that look the same.
  const similar = suggestTerms(live.map(asResolvable), query, { locale: options.locale })
    .map((s) => live.find((t) => t.id === s.termId))
    .filter((t): t is Term => t !== undefined);
  for (const t of similar)
    if (!out.some((o) => o.kind === "term" && o.term.id === t.id) && !selected.has(t.id))
      out.push({ kind: "term", term: t, via: "similar" });
  const name = query.trim().replace(/\s+/g, " ");
  out.push({ kind: "create", name, slug: slugify(name), similar });
  return out;
}

/** Terms that look like `name` (same folded form, plural, or a small edit distance). */
export function similarTerms(terms: readonly Term[], name: string, locale: string): Term[] {
  const live = terms.filter((t) => t.status !== "retired");
  const out: Term[] = [];
  const resolved = resolveTerm(live.map(asResolvable), name, { locale });
  if (resolved.matched) {
    const t = live.find((x) => x.id === resolved.termId);
    if (t) out.push(t);
  }
  for (const s of suggestTerms(live.map(asResolvable), name, { locale })) {
    const t = live.find((x) => x.id === s.termId);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

// ---- facets (RFC-0002 §5) -------------------------------------------------------------------

/**
 * The entries filter for the articles list's facets: `category:<slug>>*` (sub-categories
 * included, as archives do) and `tag:<slug>`, joined with `+`.
 */
export function facetFilter(facets: {
  category?: { key: string; slug: string; hierarchical: boolean } | undefined;
  tag?: { key: string; slug: string } | undefined;
}): string | undefined {
  const clauses: string[] = [];
  if (facets.category)
    clauses.push(
      `${facets.category.key}:${facets.category.slug}${facets.category.hierarchical ? ">*" : ""}`,
    );
  if (facets.tag) clauses.push(`${facets.tag.key}:${facets.tag.slug}`);
  return clauses.length ? clauses.join("+") : undefined;
}

/** The two default taxonomies, when the site has them. */
export function defaultTaxonomies(taxonomies: readonly Taxonomy[]): {
  category?: Taxonomy | undefined;
  tag?: Taxonomy | undefined;
} {
  return {
    category: taxonomies.find((t) => t.key === "category"),
    tag: taxonomies.find((t) => t.key === "tag"),
  };
}

/** Is the site still on legacy `tags` (no taxonomies yet, or entries that still carry tags)? */
export function needsTagsMigration(
  taxonomies: readonly Taxonomy[] | undefined,
  entries: readonly Pick<ContentEntry, "tags">[] | undefined,
): boolean {
  if (!taxonomies) return false;
  if (taxonomies.length === 0) return true;
  return (entries ?? []).some((e) => e.tags.length > 0);
}

/** The site's locales, default first. */
export function siteLocales(site: Pick<Site, "defaultLocale" | "locales"> | undefined): string[] {
  if (!site) return [];
  return [...new Set([site.defaultLocale, ...site.locales])];
}
