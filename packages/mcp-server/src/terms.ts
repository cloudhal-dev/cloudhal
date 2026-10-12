/**
 * Term assignment over MCP (RFC-0002 §6.2–§6.3): `terms: { [taxonomy]: { set?, add?, remove?,
 * primary? } }` with values by id, slug or name, resolved by the store's `resolveTerms`. Nothing is
 * ever created implicitly: an unknown or ambiguous value is an error with suggestions. Also the
 * assignment deltas shown in approval prompts and written to the audit.
 */
import type { ContentEntry, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import type { Resolution } from "@cloudhal/core-ts";
import { termName } from "@cloudhal/core-ts";
import {
  type JsonSchema,
  quote,
  SLUG_PATTERN,
  type ToolContext,
  ToolError,
  toToolError,
} from "./common.ts";

export type Assignments = NonNullable<ContentEntry["terms"]>;

export interface TermOps {
  set?: string[];
  add?: string[];
  remove?: string[];
  primary?: string;
}

export type TermsInput = Record<string, TermOps>;

const termRef = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  description: "A term id, current or old slug, name in any locale, or synonym",
};
const termList = (desc: string) => ({
  type: "array",
  description: desc,
  items: termRef,
  maxItems: 50,
  uniqueItems: true,
});

/** Input schema of `terms` on create_entry / update_entry. */
export const TERMS_INPUT: JsonSchema = {
  type: "object",
  description:
    'Categories, tags and other terms by taxonomy key (see list_taxonomies), e.g. {"category": {"primary": "News"}, "tag": {"add": ["AI"], "remove": ["llms"]}}. Values are ids, slugs, names or synonyms of existing terms (list_terms, resolve_terms); unknown values are an error, never created. `set` replaces the list, then `add` and `remove` apply; `primary` (required for review/published articles in required taxonomies) is added if missing. At most maxPerEntry terms per taxonomy.',
  propertyNames: { pattern: SLUG_PATTERN, maxLength: 128 },
  maxProperties: 10,
  additionalProperties: {
    type: "object",
    additionalProperties: false,
    properties: {
      set: termList("Replace this taxonomy's terms with these (in display order)"),
      add: termList("Add these terms"),
      remove: termList("Remove these terms"),
      primary: { ...termRef, description: "The main term (breadcrumbs, articleSection)" },
    },
  },
};

/** The deprecated `tags` input: an alias for `terms.tag.add`. */
export const TAGS_INPUT: JsonSchema = {
  type: "array",
  deprecated: true,
  description:
    'Deprecated: use terms.tag.add. Existing tags by slug or name; same rules as "terms".',
  items: termRef,
  maxItems: 50,
  uniqueItems: true,
};

function lines(resolution: Exclude<Resolution, { matched: true }>, key: string, tax: Taxonomy) {
  const s = resolution.suggestions.map((x) => `${x.slug} ("${quote(x.name, 40)}", ${x.termId})`);
  if (resolution.reason === "ambiguous")
    return `${key} "${quote(resolution.input, 40)}" matches several terms: ${s.join(", ")}; pass the term id`;
  const next =
    tax.allowNewTerms === "none"
      ? `only a person adds a ${key}: pick an existing one (list_terms) or ask`
      : `if it is really new, call propose_term(taxonomy: "${key}", name: …)`;
  return `${key} "${quote(resolution.input, 40)}" matches no term${s.length ? ` (did you mean ${s.join(", ")}?)` : ""}; ${next}`;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Applies `input` to an entry's current assignments. Resolves every value first (all taxonomies),
 * so one error lists every unknown value. Returns the new assignments (canonical: no empty lists).
 */
export async function applyTermsInput(
  ctx: ToolContext,
  site: Site,
  current: ContentEntry["terms"],
  input: TermsInput,
): Promise<ContentEntry["terms"]> {
  const next: Assignments = JSON.parse(JSON.stringify(current ?? {}));
  const problems: string[] = [];
  const unknown: { taxonomy: string; input: string; suggestions: unknown }[] = [];
  let ambiguous = false;
  const resolved: [string, TermOps, Map<string, string>][] = [];
  for (const [key, ops] of Object.entries(input)) {
    const tax = await ctx.store.getTaxonomyByKey(site.id, key);
    if (!tax) {
      const keys = (await ctx.store.listTaxonomies(site.id)).map((t) => t.key);
      throw new ToolError(
        "unknown_taxonomy",
        `this site has no taxonomy "${key}" (it has: ${keys.sort().join(", ") || "none"}); call list_taxonomies`,
      );
    }
    const values = dedupe([
      ...(ops.set ?? []),
      ...(ops.add ?? []),
      ...(ops.remove ?? []),
      ...(ops.primary !== undefined ? [ops.primary] : []),
    ]);
    const map = new Map<string, string>();
    if (values.length > 0) {
      let resolutions: Resolution[];
      try {
        resolutions = await ctx.store.resolveTerms(site.id, key, values);
      } catch (e) {
        throw toToolError(e);
      }
      for (const r of resolutions) {
        if (r.matched) map.set(r.input, r.termId);
        else {
          if (r.reason === "ambiguous") ambiguous = true;
          problems.push(lines(r, key, tax));
          unknown.push({ taxonomy: key, input: r.input, suggestions: r.suggestions });
        }
      }
    }
    resolved.push([key, ops, map]);
  }
  if (problems.length > 0)
    throw new ToolError(ambiguous ? "ambiguous_term" : "unknown_term", problems.join("; "), {
      unknown,
    });

  for (const [key, ops, map] of resolved) {
    const ids = (values: string[] | undefined) =>
      dedupe((values ?? []).map((v) => map.get(v) as string));
    const before = next[key];
    let list = ops.set !== undefined ? ids(ops.set) : [...(before?.ids ?? [])];
    for (const add of ids(ops.add)) if (!list.includes(add)) list.push(add);
    const removed = new Set(ids(ops.remove));
    list = list.filter((x) => !removed.has(x));
    let primary = before?.primary;
    if (ops.primary !== undefined) {
      primary = map.get(ops.primary) as string;
      if (!list.includes(primary)) list.push(primary);
    }
    if (primary !== undefined && !list.includes(primary)) primary = undefined;
    if (list.length === 0) delete next[key];
    else
      next[key] = {
        ids: list as [string, ...string[]],
        ...(primary !== undefined ? { primary } : {}),
      };
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** What changed in one taxonomy's assignment. */
export interface AssignmentDelta {
  readonly taxonomy: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Present when the primary term changed (`to` absent: no primary any more). */
  readonly primary?: { readonly from?: string; readonly to?: string };
}

/** Assignment deltas between two versions of an entry's `terms`, by taxonomy key (sorted). */
export function assignmentDeltas(
  before: ContentEntry["terms"],
  after: ContentEntry["terms"],
): AssignmentDelta[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const out: AssignmentDelta[] = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    const added = ((a?.ids ?? []) as string[]).filter(
      (x) => !((b?.ids ?? []) as string[]).includes(x),
    );
    const removed = ((b?.ids ?? []) as string[]).filter(
      (x) => !((a?.ids ?? []) as string[]).includes(x),
    );
    const primaryChanged = (b?.primary ?? null) !== (a?.primary ?? null);
    if (!added.length && !removed.length && !primaryChanged) continue;
    out.push({
      taxonomy: key,
      added,
      removed,
      ...(primaryChanged
        ? {
            primary: {
              ...(b?.primary ? { from: b.primary } : {}),
              ...(a?.primary ? { to: a.primary } : {}),
            },
          }
        : {}),
    });
  }
  return out;
}

/** Looks terms up once per prompt or audit row. */
export function termLookup(ctx: ToolContext): (id: string) => Promise<Term | undefined> {
  const cache = new Map<string, Promise<Term | undefined>>();
  return (id) => {
    let hit = cache.get(id);
    if (!hit) {
      hit = ctx.store.getTerm(id);
      cache.set(id, hit);
    }
    return hit;
  };
}

/**
 * `+tag ai, −tag llms, primary category → News` (slugs for membership, the quoted name for the
 * primary). At most `max` parts; the rest are counted.
 */
export async function describeDeltas(
  deltas: readonly AssignmentDelta[],
  lookup: (id: string) => Promise<Term | undefined>,
  locale: string | undefined,
  max = 6,
): Promise<string> {
  const parts: string[] = [];
  for (const d of deltas) {
    for (const x of d.added) parts.push(`+${d.taxonomy} ${(await lookup(x))?.slug ?? x}`);
    for (const x of d.removed) parts.push(`−${d.taxonomy} ${(await lookup(x))?.slug ?? x}`);
    if (d.primary) {
      const to = d.primary.to ? await lookup(d.primary.to) : undefined;
      parts.push(
        `primary ${d.taxonomy} → ${d.primary.to ? (to ? quote(termName(to, locale), 40) : d.primary.to) : "none"}`,
      );
    }
  }
  return parts.length > max
    ? `${parts.slice(0, max).join(", ")}, … ${parts.length - max} more`
    : parts.join(", ");
}

/** Deltas by slug, for the audit row (`input.effect.terms`). */
export async function auditDeltas(
  deltas: readonly AssignmentDelta[],
  lookup: (id: string) => Promise<Term | undefined>,
): Promise<Record<string, unknown>> {
  const slug = async (x: string) => (await lookup(x))?.slug ?? x;
  const out: Record<string, unknown> = {};
  for (const d of deltas)
    out[d.taxonomy] = {
      ...(d.added.length ? { added: await Promise.all(d.added.map(slug)) } : {}),
      ...(d.removed.length ? { removed: await Promise.all(d.removed.map(slug)) } : {}),
      ...(d.primary
        ? {
            primary: {
              from: d.primary.from ? await slug(d.primary.from) : null,
              to: d.primary.to ? await slug(d.primary.to) : null,
            },
          }
        : {}),
    };
  return out;
}
