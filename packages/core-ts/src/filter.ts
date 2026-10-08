/**
 * `@cloudhal/core-ts/filter` — the one filter language over term assignments (RFC-0002 §5), shared
 * by the REST API, MCP `list_entries`, `ContentListSection.filter` and feeds. Dependency-free and
 * Worker-safe.
 *
 * ```
 * filter  = clause *( "+" clause )                 ; "+" = AND
 * clause  = [ "-" ] field ":" values               ; "-" = NOT (none of the values)
 * field   = taxonomy-key / "primary:" taxonomy-key / "collection"
 * values  = value / "[" value *( "," value ) "]"   ; brackets = OR
 * value   = ( slug / id ) [ ">*" ]                 ; ">*" = the term or any descendant
 * ```
 *
 * `parseFilter` → `resolveFilter` (against the site's taxonomies and terms) → `matches` (in memory)
 * or `toSql` (a WHERE fragment over a node body, bound parameters only). Both give the same answer.
 */
import { type ResolvableTerm, suggestTerms, type TermSuggestion } from "./names.ts";

export const FILTER_LIMITS = {
  maxLength: 512,
  maxClauses: 8,
  maxValuesPerClause: 20,
  /** Most terms one `>*` value may expand to. */
  maxExpansion: 500,
} as const;

export type FilterErrorCode =
  | "syntax"
  | "too_long"
  | "too_many_clauses"
  | "too_many_values"
  | "unknown_field"
  | "unknown_taxonomy"
  | "unknown_term"
  | "not_hierarchical"
  | "expansion_too_large";

export class FilterError extends Error {
  override readonly name = "FilterError";
  readonly code: FilterErrorCode;
  /** For `unknown_term`: the unknown values and close terms per value. */
  readonly unknown: readonly { value: string; suggestions: readonly TermSuggestion[] }[];
  constructor(
    code: FilterErrorCode,
    message: string,
    unknown: readonly { value: string; suggestions: readonly TermSuggestion[] }[] = [],
  ) {
    super(message);
    this.code = code;
    this.unknown = unknown;
  }
}

export type FilterField =
  | { readonly kind: "taxonomy"; readonly key: string; readonly primary: boolean }
  | { readonly kind: "collection" };

export interface FilterValue {
  readonly value: string;
  /** Ids contain `_`; slugs never do. */
  readonly isId: boolean;
  /** `>*`: the term or any descendant. */
  readonly descendants: boolean;
}

export interface FilterClause {
  readonly negate: boolean;
  readonly field: FilterField;
  readonly values: readonly FilterValue[];
}

export interface FilterAst {
  readonly source: string;
  readonly clauses: readonly FilterClause[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-z]+_[A-Za-z0-9]{6,32}$/;
/** Field names reserved by the grammar (also reserved as taxonomy keys, invariant 7). */
export const RESERVED_FIELDS = ["primary", "collection", "locale", "status", "id"] as const;

function syntax(message: string): FilterError {
  return new FilterError(
    "syntax",
    `${message}. Clauses are joined with "+" (send it as %2B in a query string), e.g. category:news+tag:ai`,
  );
}

/** Splits on `sep` outside brackets. */
function splitTop(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (depth < 0) throw syntax('unbalanced "]"');
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (depth !== 0) throw syntax('unbalanced "["');
  out.push(cur);
  return out;
}

function parseValue(raw: string, field: FilterField): FilterValue {
  let v = raw;
  let descendants = false;
  if (v.endsWith(">*")) {
    descendants = true;
    v = v.slice(0, -2);
  }
  const isId = ID.test(v);
  if (!isId && !SLUG.test(v)) throw syntax(`"${raw}" is not a slug or an id`);
  if (field.kind === "collection" && (isId || descendants))
    throw syntax(`collection values are collection slugs ("${raw}")`);
  return { value: v, isId, descendants };
}

/** Parses a filter expression; throws `FilterError` (syntax and size limits). */
export function parseFilter(input: string): FilterAst {
  if (input.length > FILTER_LIMITS.maxLength)
    throw new FilterError(
      "too_long",
      `filter is ${input.length} characters; the limit is ${FILTER_LIMITS.maxLength}`,
    );
  const source = input.trim();
  if (!source) throw syntax("empty filter");
  if (/\s/.test(source))
    throw syntax("unexpected whitespace (a '+' sent unencoded turns into a space)");
  const parts = splitTop(source, "+");
  if (parts.length > FILTER_LIMITS.maxClauses)
    throw new FilterError(
      "too_many_clauses",
      `filter has ${parts.length} clauses; the limit is ${FILTER_LIMITS.maxClauses}`,
    );
  const clauses = parts.map((part): FilterClause => {
    let rest = part;
    const negate = rest.startsWith("-");
    if (negate) rest = rest.slice(1);
    const colon = rest.indexOf(":");
    if (colon <= 0) throw syntax(`clause "${part}" needs field:value`);
    let name = rest.slice(0, colon);
    rest = rest.slice(colon + 1);
    let field: FilterField;
    if (name === "primary") {
      const c2 = rest.indexOf(":");
      if (c2 <= 0) throw syntax(`"primary:" needs a taxonomy key, e.g. primary:category:news`);
      name = rest.slice(0, c2);
      rest = rest.slice(c2 + 1);
      if (!SLUG.test(name) || (RESERVED_FIELDS as readonly string[]).includes(name))
        throw new FilterError("unknown_field", `"primary:${name}" is not a taxonomy`);
      field = { kind: "taxonomy", key: name, primary: true };
    } else if (name === "collection") {
      field = { kind: "collection" };
    } else if ((RESERVED_FIELDS as readonly string[]).includes(name) || !SLUG.test(name)) {
      throw new FilterError(
        "unknown_field",
        `"${name}" is not a filter field (taxonomy keys, primary:<key> and collection)`,
      );
    } else {
      field = { kind: "taxonomy", key: name, primary: false };
    }
    if (!rest) throw syntax(`clause "${part}" has no value`);
    let raws: string[];
    if (rest.startsWith("[")) {
      if (!rest.endsWith("]")) throw syntax(`clause "${part}" has an unclosed list`);
      raws = rest.slice(1, -1).split(",");
    } else {
      if (rest.includes("[") || rest.includes("]") || rest.includes(","))
        throw syntax(`several values go in brackets: ${name}:[a,b]`);
      raws = [rest];
    }
    if (raws.length > FILTER_LIMITS.maxValuesPerClause)
      throw new FilterError(
        "too_many_values",
        `clause "${name}" has ${raws.length} values; the limit is ${FILTER_LIMITS.maxValuesPerClause}`,
      );
    if (raws.some((r) => r === "")) throw syntax(`clause "${part}" has an empty value`);
    return { negate, field, values: raws.map((r) => parseValue(r, field)) };
  });
  return { source, clauses };
}

/** What `resolveFilter` needs to know about a site's vocabulary. */
export interface FilterVocabulary {
  readonly taxonomies: readonly {
    readonly id: string;
    readonly key: string;
    readonly hierarchical: boolean;
  }[];
  readonly terms: readonly (ResolvableTerm & {
    readonly taxonomyId: string;
    readonly parentId?: string;
  })[];
}

export type ResolvedClause =
  | {
      readonly negate: boolean;
      readonly kind: "taxonomy";
      readonly key: string;
      readonly primary: boolean;
      /** Term ids; empty when every value was unknown (matches nothing). */
      readonly ids: readonly string[];
    }
  | { readonly negate: boolean; readonly kind: "collection"; readonly values: readonly string[] };

export interface ResolvedFilter {
  readonly source: string;
  readonly clauses: readonly ResolvedClause[];
  /** Values that resolved to nothing (only with `unknown: "match-nothing"`). */
  readonly unknown: readonly string[];
}

/**
 * Resolves slugs to term ids (current slug, then slug history, then a retired term's slug) and
 * expands `>*`. Unknown values are an `unknown_term` error with suggestions, or — for renderers
 * reading a published snapshot — match nothing with `unknown: "match-nothing"`.
 */
export function resolveFilter(
  ast: FilterAst,
  vocabulary: FilterVocabulary,
  options: { unknown?: "error" | "match-nothing"; locale?: string } = {},
): ResolvedFilter {
  const unknownMode = options.unknown ?? "error";
  const unknown: { value: string; suggestions: readonly TermSuggestion[] }[] = [];
  const clauses = ast.clauses.map((clause): ResolvedClause => {
    if (clause.field.kind === "collection")
      return {
        negate: clause.negate,
        kind: "collection",
        values: clause.values.map((v) => v.value),
      };
    const { key, primary } = clause.field;
    const taxonomy = vocabulary.taxonomies.find((t) => t.key === key);
    if (!taxonomy)
      throw new FilterError(
        "unknown_taxonomy",
        `unknown taxonomy "${key}" (known: ${vocabulary.taxonomies.map((t) => t.key).join(", ") || "none"})`,
      );
    const terms = vocabulary.terms.filter((t) => t.taxonomyId === taxonomy.id);
    const ids: string[] = [];
    for (const v of clause.values) {
      const term = v.isId
        ? terms.find((t) => t.id === v.value)
        : (terms.find((t) => t.status !== "retired" && t.slug === v.value) ??
          terms.find((t) => t.status !== "retired" && (t.slugHistory ?? []).includes(v.value)) ??
          terms.find((t) => t.slug === v.value || (t.slugHistory ?? []).includes(v.value)));
      if (!term) {
        unknown.push({
          value: `${key}:${v.value}`,
          suggestions: suggestTerms(
            terms,
            v.value,
            options.locale ? { locale: options.locale } : {},
          ),
        });
        continue;
      }
      if (v.descendants && !taxonomy.hierarchical)
        throw new FilterError(
          "not_hierarchical",
          `"${key}" is a flat taxonomy; ">*" (sub-terms) only applies to hierarchical ones`,
        );
      const found = v.descendants ? descendantsOf(terms, term.id) : [term.id];
      if (found.length > FILTER_LIMITS.maxExpansion)
        throw new FilterError(
          "expansion_too_large",
          `"${key}:${v.value}>*" expands to ${found.length} terms; the limit is ${FILTER_LIMITS.maxExpansion}`,
        );
      for (const id of found) if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length > FILTER_LIMITS.maxExpansion)
      throw new FilterError(
        "expansion_too_large",
        `clause "${key}" expands to ${ids.length} terms; the limit is ${FILTER_LIMITS.maxExpansion}`,
      );
    return { negate: clause.negate, kind: "taxonomy", key, primary, ids };
  });
  if (unknown.length > 0 && unknownMode === "error")
    throw new FilterError(
      "unknown_term",
      `unknown term${unknown.length > 1 ? "s" : ""} ${unknown
        .map(
          (u) =>
            `"${u.value}"${u.suggestions.length ? ` (did you mean ${u.suggestions.map((s) => s.slug).join(", ")}?)` : ""}`,
        )
        .join(", ")}`,
      unknown,
    );
  return { source: ast.source, clauses, unknown: unknown.map((u) => u.value) };
}

/** The term and every non-retired descendant, breadth first. */
function descendantsOf(
  terms: readonly { id: string; parentId?: string; status: string }[],
  rootId: string,
): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length && out.length <= FILTER_LIMITS.maxExpansion; i++)
    for (const t of terms)
      if (t.parentId === out[i] && t.status !== "retired" && !out.includes(t.id)) out.push(t.id);
  return out;
}

/** What `matches` reads from an entry. */
export interface FilterableEntry {
  readonly collection: string;
  readonly terms?: {
    readonly [key: string]:
      | { readonly ids: readonly string[]; readonly primary?: string }
      | undefined;
  };
}

/** Evaluates a resolved filter against one entry in memory. */
export function matches(filter: ResolvedFilter, entry: FilterableEntry): boolean {
  return filter.clauses.every((c) => {
    let hit: boolean;
    if (c.kind === "collection") hit = c.values.includes(entry.collection);
    else {
      const a = entry.terms?.[c.key];
      hit = c.primary
        ? a?.primary !== undefined && c.ids.includes(a.primary)
        : (a?.ids ?? []).some((id) => c.ids.includes(id));
    }
    return c.negate ? !hit : hit;
  });
}

/**
 * Compiles a resolved filter to a SQL boolean expression over a JSON body column (SQLite / D1
 * `json_each`/`json_extract`). Lists travel as one JSON parameter each, so the parameter count stays
 * at two per clause whatever `>*` expands to.
 */
export function toSql(
  filter: ResolvedFilter,
  options: { column?: string } = {},
): { sql: string; params: string[] } {
  const col = options.column ?? "body";
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(col))
    throw new Error(`invalid column "${col}"`);
  const parts: string[] = [];
  const params: string[] = [];
  for (const c of filter.clauses) {
    let expr: string;
    if (c.kind === "collection") {
      expr = `json_extract(${col}, '$.collection') IN (SELECT value FROM json_each(?))`;
      params.push(JSON.stringify(c.values));
    } else if (c.ids.length === 0) {
      expr = "0";
    } else if (c.primary) {
      expr = `IFNULL(json_extract(${col}, ?) IN (SELECT value FROM json_each(?)), 0)`;
      params.push(`$.terms."${c.key}".primary`, JSON.stringify(c.ids));
    } else {
      expr = `EXISTS (SELECT 1 FROM json_each(${col}, ?) AS ft WHERE ft.value IN (SELECT value FROM json_each(?)))`;
      params.push(`$.terms."${c.key}".ids`, JSON.stringify(c.ids));
    }
    parts.push(c.negate ? `NOT (${expr})` : `(${expr})`);
  }
  return { sql: parts.length ? parts.join(" AND ") : "1", params };
}
