/**
 * Taxonomy, term and redirect tools (RFC-0002 §6.2). Reading the vocabulary and proposing terms are
 * content tools; renaming, merging, retiring, moving, reviewing, redirects and taxonomy settings are
 * structural (`site:write`) and always wait for a person, whose prompt lists the articles touched
 * and every redirect. Each mutation is one store operation followed by exactly one snapshot.
 */
import {
  reclaimProblem,
  redirectTargetProblem,
  termCreation,
  termReviewProblem,
} from "@cloudhal/agent-runtime";
import type { Redirect, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import {
  RedirectSchema,
  SnapshotSchema,
  TaxonomySchema,
  TermSchema,
} from "@cloudhal/core-contracts";
import type { GovernanceResult, Resolution, TermUsage } from "@cloudhal/core-ts";
import {
  REPORT_THRESHOLDS as CORE_REPORT_THRESHOLDS,
  canonicalJson,
  taxonomyReport as coreTaxonomyReport,
  foldName,
  slugify,
  splitTarget,
  termName,
} from "@cloudhal/core-ts";
import {
  autoSnapshot,
  id,
  type JsonSchema,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  strip,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "./common.ts";

const TAXONOMY = strip(TaxonomySchema);
const TERM = strip(TermSchema);
const REDIRECT = strip(RedirectSchema);
const SNAPSHOT = strip(SnapshotSchema);
const TERM_DEFS = (TERM.$defs ?? {}) as Record<string, JsonSchema>;
const TAX_PROPS = TAXONOMY.properties as Record<string, JsonSchema>;
const REDIRECT_PROPS = REDIRECT.properties as Record<string, JsonSchema>;

/** A sub-schema that uses the Term contract's `$defs` (hoisted to the tool schema's root). */
const withTermDefs = (schema: JsonSchema): JsonSchema => ({ ...schema, $defs: TERM_DEFS });
/** A tool schema whose properties come from the Taxonomy contract (its `$defs` at the root). */
const withTaxonomyDefs = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  $defs: TAXONOMY.$defs as JsonSchema,
});

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const USAGE = obj(
  {
    total: { type: "integer", description: "Entries assigned (any status)" },
    published: { type: "integer", description: "Published entries assigned" },
    lastUsedAt: { type: "string", description: "Latest update among those entries" },
  },
  ["total", "published"],
);
const TERM_VIEW: JsonSchema = {
  ...TERM,
  properties: { ...(TERM.properties as JsonSchema), usage: USAGE },
  required: [...(TERM.required as string[]), "usage"],
};
const TERM_REF = obj(
  { termId: { type: "string" }, slug: { type: "string" }, name: { type: "string" } },
  ["termId", "slug", "name"],
);
const OPERATION = obj(
  {
    opId: { type: "string", description: "Operation id (audit, snapshot metadata)" },
    entries: { type: "integer", description: "Articles re-filed by the operation" },
    terms: { type: "array", items: TERM, description: "Terms written, as stored" },
    redirects: {
      type: "array",
      items: REDIRECT,
      description: "Redirects created or updated, as stored",
    },
  },
  ["opId", "entries", "terms", "redirects"],
);
const GOVERNANCE_OUT = obj({ operation: OPERATION, snapshot: SNAPSHOT }, ["operation", "snapshot"]);
const TAXONOMY_KEY = str("Taxonomy key, e.g. category or tag (list_taxonomies)", {
  pattern: SLUG_PATTERN,
  maxLength: 128,
});

// ───────────────────────────── helpers ─────────────────────────────

function isPublic(t: Term): boolean {
  return t.status === "active" && t.visibility === "public";
}

function archivePath(tax: Taxonomy, slug: string): string {
  return `${tax.archive.basePath}/${slug}`;
}

async function requireTerm(ctx: ToolContext, siteId: string, termId: string): Promise<Term> {
  const term = await ctx.store.getTerm(termId);
  if (!term || term.siteId !== siteId)
    throw new ToolError("not_found", `term ${termId} not found; call list_terms or resolve_terms`);
  return term;
}

async function requireTaxonomy(ctx: ToolContext, siteId: string, key: string): Promise<Taxonomy> {
  const tax = await ctx.store.getTaxonomyByKey(siteId, key);
  if (!tax) {
    const keys = (await ctx.store.listTaxonomies(siteId)).map((t) => t.key);
    throw new ToolError(
      "unknown_taxonomy",
      `this site has no taxonomy "${key}" (it has: ${keys.sort().join(", ") || "none"}); call list_taxonomies`,
    );
  }
  return tax;
}

async function taxonomyOf(ctx: ToolContext, term: Term): Promise<Taxonomy> {
  const tax = await ctx.store.getTaxonomy(term.taxonomyId);
  if (!tax) throw new ToolError("not_found", `taxonomy ${term.taxonomyId} not found`);
  return tax;
}

async function defaultLocale(ctx: ToolContext, siteId: string): Promise<string | undefined> {
  return (await ctx.store.getSite(siteId))?.defaultLocale;
}

/** `tag "Machine learning" (machine-learning)`, quoted for prompts. */
function named(tax: Taxonomy, t: Term, locale: string | undefined): string {
  return `${tax.key} "${quote(termName(t, locale), 50)}" (${t.slug})`;
}

/** Articles assigned to any of `ids` in taxonomy `key` (by filter, in chunks of ids). */
async function entriesUsing(
  ctx: ToolContext,
  siteId: string,
  key: string,
  ids: readonly string[],
): Promise<number> {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    for (const e of await ctx.store.listContentEntries(siteId, {
      filter: `${key}:[${chunk.join(",")}]`,
    }))
      seen.add(e.id);
  }
  return seen.size;
}

const articles = (n: number) => `${n} article${n === 1 ? "" : "s"}`;

/**
 * The redirect lines a person sees before a governance operation: new redirects, redirects
 * re-pointed onto the new path (no chains) and redirects removed because their path is served again.
 * Mirrors the store's redirect plan (RFC-0002 §4.3, invariant 14).
 */
async function redirectLines(
  ctx: ToolContext,
  siteId: string,
  plan: {
    serve?: string[];
    moves?: { from: string; to: string }[];
    repoints?: { from: string; to: string }[];
  },
): Promise<string[]> {
  const existing = await ctx.store.listRedirects(siteId);
  const out: string[] = [];
  const gone = new Set<string>();
  for (const p of plan.serve ?? [])
    for (const r of existing)
      if (r.from === p || r.from.startsWith(`${p}/`)) {
        gone.add(r.id);
        out.push(`− redirect ${r.from} → ${quote(r.to, 80)} (its path is served again)`);
      }
  const repoint = (from: string, to: string) => {
    for (const r of existing) {
      if (gone.has(r.id)) continue;
      const target = splitTarget(r.to);
      if (!target) continue;
      let next: string | undefined;
      if (target.path === from) next = `${to}${target.suffix}`;
      else if (target.path.startsWith(`${from}/`))
        next = `${to}${target.path.slice(from.length)}${target.suffix}`;
      if (next === undefined) continue;
      if (splitTarget(next)?.path === r.from) {
        gone.add(r.id);
        out.push(`− redirect ${r.from} → ${quote(r.to, 80)} (it would point to itself)`);
      } else out.push(`~ redirect ${r.from} → ${quote(next, 80)} (was ${quote(r.to, 80)})`);
    }
  };
  for (const { from, to } of plan.repoints ?? []) repoint(from, to);
  for (const { from, to } of plan.moves ?? []) {
    repoint(from, to);
    out.push(`+ redirect ${from} → ${to} (301; pages and feed below it follow)`);
  }
  return out;
}

const withLines = (head: string, lines: string[]) =>
  lines.length ? `${head}\n${lines.join("\n")}` : head;

/** One snapshot after a governance operation, its summary in the audit row and the result. */
async function governed(
  ctx: ToolContext,
  siteId: string,
  tool: string,
  op: GovernanceResult,
): Promise<unknown> {
  const snapshot = await autoSnapshot(ctx, siteId, tool, { "cloudhal.opId": op.opId });
  ctx.report?.({
    operation: {
      opId: op.opId,
      terms: op.terms.length,
      entries: op.entries,
      redirects: op.redirects.map((r) => `${r.from} → ${r.to}`),
    },
  });
  return {
    operation: {
      opId: op.opId,
      entries: op.entries,
      terms: op.terms,
      redirects: op.redirects,
    },
    snapshot,
  };
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw toToolError(e);
  }
}

function termRef(t: Term, locale: string | undefined) {
  return { termId: t.id, slug: t.slug, name: termName(t, locale) };
}

/** Exactly one existing live term matching any of `inputs`, in order (propose_term idempotency). */
async function existingMatch(
  ctx: ToolContext,
  siteId: string,
  key: string,
  inputs: string[],
): Promise<Extract<Resolution, { matched: true }> | undefined> {
  const values = inputs.filter((x) => x.trim() !== "");
  if (values.length === 0) return undefined;
  for (const r of await guarded(() => ctx.store.resolveTerms(siteId, key, values))) {
    if (r.matched) return r;
    if (r.reason === "ambiguous")
      throw new ToolError(
        "ambiguous_term",
        `"${quote(r.input, 40)}" already matches several ${key} terms (${r.suggestions.map((s) => s.slug).join(", ")}); reuse one of them`,
        { candidates: r.candidates },
      );
  }
  return undefined;
}

/** A term's folded names and slug (`main`) and synonyms (`alt`), for `list_terms` search. */
function forms(t: Term): { main: string[]; alt: string[] } {
  const main = new Set<string>([t.slug]);
  const alt = new Set<string>();
  for (const label of Object.values(t.labels)) {
    if (!label) continue;
    main.add(foldName(label.name));
    for (const a of label.altNames ?? []) alt.add(foldName(a));
  }
  return { main: [...main].filter(Boolean), alt: [...alt].filter(Boolean) };
}

// ───────────────────────────── taxonomy_report ─────────────────────────────

/**
 * Thresholds of `taxonomy_report` (returned with it): the core report's own, plus how many findings
 * of one kind are listed.
 */
export const REPORT_THRESHOLDS = {
  ...CORE_REPORT_THRESHOLDS,
  /** Findings listed per kind (counts are complete). */
  maxPerKind: 50,
} as const;

type FindingKind =
  | "single-use"
  | "unused"
  | "near-duplicate"
  | "synonym-collision"
  | "empty-category"
  | "oversized-category"
  | "proposed"
  | "no-intro"
  | "missing-primary"
  | "unfiled";

interface Finding {
  kind: FindingKind;
  taxonomy: string;
  terms: { termId: string; slug: string; name: string }[];
  detail: string;
}

/**
 * The hygiene report agents read. The findings come from core-ts `taxonomyReport` — the function
 * Studio's "Vocabulary health" card calls with the same terms, usage and entries — and are only
 * worded here (a detail with the next step), so both surfaces always agree.
 */
async function taxonomyReport(ctx: ToolContext, site: Site, only?: string) {
  const locale = site.defaultLocale;
  const taxonomies = (await ctx.store.listTaxonomies(site.id)).filter(
    (t) => only === undefined || t.key === only,
  );
  if (only !== undefined && taxonomies.length === 0) await requireTaxonomy(ctx, site.id, only);
  const entries = await ctx.store.listContentEntries(site.id, {});
  const findings: Finding[] = [];
  const counts: Record<string, number> = {};
  const add = (f: Finding) => {
    counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    if (findings.filter((x) => x.kind === f.kind).length < REPORT_THRESHOLDS.maxPerKind)
      findings.push(f);
  };
  for (const tax of taxonomies) {
    const usage: Map<string, TermUsage> = await ctx.store.termUsage(site.id, tax.key);
    const terms = await ctx.store.listTerms(site.id, { taxonomy: tax.key });
    const report = coreTaxonomyReport({ taxonomy: tax, terms, usage, entries, locale });
    const byId = new Map(terms.map((t) => [t.id, t]));
    const use = (id: string) => usage.get(id) ?? { total: 0, published: 0 };
    const each = (ids: readonly string[], kind: FindingKind, detail: (t: Term) => string) => {
      for (const id of ids) {
        const t = byId.get(id);
        if (t) add({ kind, taxonomy: tax.key, terms: [termRef(t, locale)], detail: detail(t) });
      }
    };
    const entryList = (ids: readonly string[]) =>
      `${ids.slice(0, 10).join(", ")}${ids.length > 10 ? ", …" : ""}`;

    each(
      report.proposed,
      "proposed",
      (t) =>
        `proposed${t.proposedBy ? ` by ${t.proposedBy.name ?? t.proposedBy.id}` : ""} on ${t.createdAt.slice(0, 10)}, used by ${articles(use(t.id).total)}${t.metadata?.["cloudhal.reason"] ? `: "${quote(t.metadata["cloudhal.reason"], 80)}"` : ""}; a person approves, rejects or merges it`,
    );
    each(
      report.emptyCategories,
      "empty-category",
      () =>
        "no published article in it or below it; its archive answers 404 — file articles under it, or merge or retire it",
    );
    each(report.oversizedCategories, "oversized-category", (t) => {
      const total = use(t.id).total;
      return `${articles(total)} (${Math.round((100 * total) / Math.max(report.filed, 1))}% of filed articles) and no sub-categories; consider splitting it (a person creates categories)`;
    });
    each(report.unused, "unused", () => "no article uses it; retire it or file articles under it");
    each(
      report.singleUse,
      "single-use",
      () => "used by one article only; reuse it or merge it into a broader term",
    );
    each(
      report.noIntro,
      "no-intro",
      () => "indexed archive without an intro text; add one with update_term",
    );
    for (const d of report.nearDuplicates) {
      const source = byId.get(d.source);
      const target = byId.get(d.target);
      if (!source || !target) continue;
      const pair = [termRef(source, locale), termRef(target, locale)];
      const merge = `merge "${termName(source, locale)}" into "${termName(target, locale)}"`;
      if (d.reason === "synonym")
        add({
          kind: "synonym-collision",
          taxonomy: tax.key,
          terms: pair,
          detail: `"${d.forms[0]}" is a synonym of one and a name, slug or synonym of the other; ${merge}`,
        });
      else
        add({
          kind: "near-duplicate",
          taxonomy: tax.key,
          terms: pair,
          detail:
            d.reason === "plural"
              ? `singular and plural ("${d.forms[0]}" / "${d.forms[1]}"); ${merge}`
              : `"${d.forms[0]}" and "${d.forms[1]}" differ by ${d.distance ?? 0} character${d.distance === 1 ? "" : "s"}; ${merge} if they mean the same`,
        });
    }
    if (report.missingPrimary.length > 0)
      add({
        kind: "missing-primary",
        taxonomy: tax.key,
        terms: [],
        detail: `${articles(report.missingPrimary.length)} without a primary ${tax.key} (they cannot go to review or published): ${entryList(report.missingPrimary)}`,
      });
    if (report.unfiled.length > 0)
      add({
        kind: "unfiled",
        taxonomy: tax.key,
        terms: [],
        detail: `${articles(report.unfiled.length)} without any ${tax.key}; file them so readers find them in its archives: ${entryList(report.unfiled)}`,
      });
  }
  return { findings, counts, thresholds: REPORT_THRESHOLDS };
}

// ───────────────────────────── tools ─────────────────────────────

const LOCALE_KEY = {
  minLength: 2,
  maxLength: 35,
  pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$",
};

/** Text fields of a term label that `update_term` may change (all optional). */
const LABEL_PATCH = obj({
  name: str("Display name", { minLength: 1, maxLength: 200 }),
  altNames: {
    type: "array",
    description: "Synonyms (replaces the list; [] removes them)",
    items: { type: "string", minLength: 1, maxLength: 200 },
    maxItems: 50,
    uniqueItems: true,
  },
  description: str('Markdown intro shown on the archive ("" removes it)', { maxLength: 20000 }),
  seo: withTermDefs({ $ref: "#/$defs/Seo" }),
});

export function taxonomyTools(): ToolDefinition[] {
  return [
    {
      name: "list_taxonomies",
      title: "List taxonomies",
      description:
        "The site's taxonomies (e.g. category, tag) and their rules: `required` (review/published articles need a primary term), `maxPerEntry`, `allowNewTerms` (none: only people add terms; propose: you may propose terms a person approves; free), `collections`, `hierarchical` and the archive path. Read this before filing articles.",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj({ taxonomies: { type: "array", items: TAXONOMY } }, ["taxonomies"]),
      annotations: READ,
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        await requireSite(ctx, a.siteId as string);
        const taxonomies = await ctx.store.listTaxonomies(a.siteId as string);
        return { taxonomies: taxonomies.sort((x, y) => x.key.localeCompare(y.key)) };
      },
    },
    {
      name: "list_terms",
      title: "List terms",
      description:
        "Terms of one taxonomy with names per locale, synonyms (altNames), old slugs (slugHistory), parent, status, visibility and usage (articles in total and published, last used). Default: active and proposed terms. Reuse these before proposing anything new.",
      inputSchema: obj(
        {
          siteId: id,
          taxonomy: TAXONOMY_KEY,
          query: str("Only terms whose slug, name or synonym contains this", {
            minLength: 1,
            maxLength: 200,
          }),
          status: {
            type: "array",
            description: "Statuses to include (default: active, proposed)",
            items: { type: "string", enum: ["active", "proposed", "retired"] },
            minItems: 1,
            uniqueItems: true,
          },
          parentId: {
            type: ["string", "null"],
            description: "Only children of this term; null: top-level terms only",
          },
          cursor: str("nextCursor of the previous page", { pattern: "^[0-9]{1,6}$" }),
          limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        },
        ["siteId", "taxonomy"],
      ),
      outputSchema: obj(
        {
          terms: { type: "array", items: TERM_VIEW },
          nextCursor: { type: "string" },
        },
        ["terms"],
      ),
      annotations: READ,
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const siteId = a.siteId as string;
        await requireSite(ctx, siteId);
        const key = a.taxonomy as string;
        await requireTaxonomy(ctx, siteId, key);
        let terms = await ctx.store.listTerms(siteId, {
          taxonomy: key,
          status: (a.status as Term["status"][] | undefined) ?? ["active", "proposed"],
          ...(a.parentId !== undefined ? { parentId: a.parentId as string | null } : {}),
        });
        if (typeof a.query === "string") {
          const q = foldName(a.query);
          terms = terms.filter((t) => {
            const f = forms(t);
            return [...f.main, ...f.alt, ...(t.slugHistory ?? [])].some((x) => x.includes(q));
          });
        }
        const usage = await ctx.store.termUsage(siteId, key);
        const offset = Number((a.cursor as string | undefined) ?? 0);
        const limit = (a.limit as number | undefined) ?? 100;
        const page = terms.slice(offset, offset + limit).map((t) => {
          const u = usage.get(t.id);
          return {
            ...t,
            usage: {
              total: u?.total ?? 0,
              published: u?.published ?? 0,
              ...(u?.lastUsedAt ? { lastUsedAt: u.lastUsedAt } : {}),
            },
          };
        });
        return {
          terms: page,
          ...(offset + limit < terms.length ? { nextCursor: String(offset + limit) } : {}),
        };
      },
    },
    {
      name: "resolve_terms",
      title: "Resolve terms",
      description:
        "Which existing terms of a taxonomy the given ids, slugs, names or synonyms mean (the same rules as assigning `terms`: id → slug → old slug → name → synonym → singular/plural). Unmatched or ambiguous inputs come with up to 5 suggestions. Never creates anything.",
      inputSchema: obj(
        {
          siteId: id,
          taxonomy: TAXONOMY_KEY,
          inputs: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 200 },
            minItems: 1,
            maxItems: 50,
          },
        },
        ["siteId", "taxonomy", "inputs"],
      ),
      outputSchema: obj(
        {
          results: {
            type: "array",
            items: obj(
              {
                input: { type: "string" },
                matched: { type: "boolean" },
                termId: { type: "string" },
                slug: { type: "string" },
                name: { type: "string" },
                via: {
                  type: "string",
                  enum: ["id", "slug", "slugHistory", "name", "altName", "plural"],
                },
                reason: { type: "string", enum: ["none", "ambiguous"] },
                suggestions: { type: "array", items: TERM_REF },
              },
              ["input", "matched"],
            ),
          },
        },
        ["results"],
      ),
      annotations: READ,
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const key = a.taxonomy as string;
        await requireTaxonomy(ctx, site.id, key);
        const resolutions = await guarded(() =>
          ctx.store.resolveTerms(site.id, key, a.inputs as string[]),
        );
        const results = [];
        for (const r of resolutions) {
          if (r.matched) {
            const t = await ctx.store.getTerm(r.termId);
            results.push({
              input: r.input,
              matched: true,
              termId: r.termId,
              via: r.via,
              ...(t ? { slug: t.slug, name: termName(t, site.defaultLocale) } : {}),
            });
          } else
            results.push({
              input: r.input,
              matched: false,
              reason: r.reason,
              suggestions: r.suggestions.map((s) => ({ ...s })),
            });
        }
        return { results };
      },
    },
    {
      name: "propose_term",
      title: "Propose a term",
      description:
        "Suggest a new term when no existing one fits (check list_terms / resolve_terms first). Under allowNewTerms `propose` it becomes a proposed term: assignable, never public, until a person approves it; under `free` it is active; under `none` (categories) only a person adds terms — ask instead. If the name, slug or a synonym already matches a term, that term is returned with existing: true and nothing is created.",
      inputSchema: obj(
        {
          siteId: id,
          taxonomy: TAXONOMY_KEY,
          name: str("Display name in `locale`", { minLength: 1, maxLength: 200 }),
          locale: str("Locale of the name; defaults to the site's default locale", LOCALE_KEY),
          slug: str("URL slug; derived from the name when absent", {
            pattern: SLUG_PATTERN,
            maxLength: 128,
          }),
          altNames: {
            type: "array",
            description: "Synonyms",
            items: { type: "string", minLength: 1, maxLength: 200 },
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
          },
          parentId: { ...id, description: "Parent term (hierarchical taxonomies)" },
          reason: str("Why this term is needed, for the person who reviews it", {
            minLength: 3,
            maxLength: 300,
          }),
        },
        ["siteId", "taxonomy", "name", "reason"],
      ),
      outputSchema: obj(
        {
          term: TERM,
          existing: { type: "boolean" },
          via: { type: "string" },
          snapshot: SNAPSHOT,
        },
        ["term", "existing"],
      ),
      annotations: { ...WRITE, idempotentHint: true },
      scopes: ["content:draft:own"],
      precheck: async (a, ctx) => {
        const siteId = a.siteId as string;
        const tax = await requireTaxonomy(ctx, siteId, a.taxonomy as string);
        const rule = termCreation(ctx.principal, tax.allowNewTerms);
        if (rule.allowed) return;
        const inputs = [a.name as string, (a.slug as string | undefined) ?? ""];
        if (await existingMatch(ctx, siteId, tax.key, inputs)) return;
        throw new ToolError(
          "denied",
          `${rule.reason}. "${tax.key}" takes new terms from people only: pick an existing one (list_terms) or ask a person to add "${quote(a.name as string, 40)}"`,
        );
      },
      approvalPrompt: async (a, ctx) => {
        const tax = await requireTaxonomy(ctx, a.siteId as string, a.taxonomy as string);
        const rule = termCreation(ctx.principal, tax.allowNewTerms);
        const status = rule.allowed ? rule.status : "proposed";
        return `Add ${status} ${tax.key} "${quote(a.name as string, 50)}" (${(a.slug as string | undefined) ?? slugify(a.name as string)})? Reason: "${quote(a.reason as string, 120)}"`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const tax = await requireTaxonomy(ctx, site.id, a.taxonomy as string);
        const name = (a.name as string).replace(/\s+/g, " ").trim();
        const altNames = (a.altNames as string[] | undefined) ?? [];
        const match = await existingMatch(ctx, site.id, tax.key, [
          name,
          (a.slug as string | undefined) ?? "",
          ...altNames,
        ]);
        if (match)
          return {
            term: await requireTerm(ctx, site.id, match.termId),
            existing: true,
            via: match.via,
          };
        const rule = termCreation(ctx.principal, tax.allowNewTerms);
        if (!rule.allowed) throw new ToolError("denied", rule.reason);
        const slug = (a.slug as string | undefined) ?? slugify(name);
        if (!slug)
          throw new ToolError(
            "invalid",
            "the name has no letters or digits for a slug; pass `slug`",
          );
        const locale = (a.locale as string | undefined) ?? site.defaultLocale;
        const label = { name, ...(altNames.length ? { altNames } : {}) };
        const actor = ctx.principal.actor;
        const term = await guarded(() =>
          ctx.store.createTerm({
            siteId: site.id,
            taxonomyId: tax.id,
            slug,
            status: rule.status,
            visibility: "public",
            labels: {
              [site.defaultLocale]: { name },
              [locale]: label,
            } as Term["labels"],
            ...(a.parentId ? { parentId: a.parentId as string } : {}),
            ...(actor.kind === "agent" ? { proposedBy: actor } : {}),
            metadata: { "cloudhal.reason": quote(a.reason as string, 300) },
          }),
        );
        const snapshot = await autoSnapshot(ctx, site.id, "propose_term");
        return { term, existing: false, snapshot };
      },
    },
    {
      name: "update_term",
      title: "Update term text",
      description:
        "Change a term's text only: names, synonyms, archive intro (description) and SEO per locale, and its image. Slugs, status, parent and visibility change through the approval-gated tools. Requires the current `rev`. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          termId: id,
          rev: { type: "integer", minimum: 0 },
          labels: {
            type: "object",
            description: "Per locale, the fields to change; others stay",
            propertyNames: LOCALE_KEY,
            minProperties: 1,
            maxProperties: 20,
            additionalProperties: LABEL_PATCH,
          },
          image: {
            anyOf: [withTermDefs({ $ref: "#/$defs/ImageRef" }), { type: "null" }],
            description: "Image shared across locales; null removes it",
          },
        },
        ["siteId", "termId", "rev"],
      ),
      outputSchema: obj({ term: TERM, snapshot: SNAPSHOT }, ["term", "snapshot"]),
      annotations: WRITE,
      scopes: ["content:write"],
      approvalPrompt: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const tax = await taxonomyOf(ctx, term);
        const locale = await defaultLocale(ctx, term.siteId);
        const fields = Object.entries((a.labels as Record<string, object> | undefined) ?? {}).map(
          ([loc, l]) => `${loc}: ${Object.keys(l).join(", ")}`,
        );
        if (a.image !== undefined) fields.push("image");
        return `Change the text of ${named(tax, term, locale)} (${fields.join("; ") || "nothing"})?`;
      },
      handler: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        if (term.status === "retired")
          throw new ToolError("invalid_status", "a retired term cannot be edited");
        if (term.rev !== a.rev)
          throw new ToolError(
            "conflict",
            `term ${term.id} is at rev ${term.rev}, you sent ${a.rev}; reload and retry`,
          );
        const labels: Term["labels"] = JSON.parse(JSON.stringify(term.labels));
        for (const [loc, patch] of Object.entries(
          (a.labels as Record<string, Record<string, unknown>> | undefined) ?? {},
        )) {
          const cur = labels[loc] as Record<string, unknown> | undefined;
          const next: Record<string, unknown> = { ...(cur ?? {}), ...patch };
          if (typeof next.name !== "string" || next.name.trim() === "")
            throw new ToolError("invalid", `labels.${loc}.name is required for a new locale`);
          if (Array.isArray(next.altNames) && next.altNames.length === 0) delete next.altNames;
          if (next.description === "") delete next.description;
          if (next.seo && Object.keys(next.seo as object).length === 0) delete next.seo;
          labels[loc] = next as unknown as NonNullable<Term["labels"][string]>;
        }
        const { image: _i, ...rest } = term;
        const next: Term = {
          ...rest,
          labels,
          ...(a.image === undefined
            ? term.image
              ? { image: term.image }
              : {}
            : a.image === null
              ? {}
              : { image: a.image as NonNullable<Term["image"]> }),
        };
        const saved = await guarded(() => ctx.store.updateTerm(next));
        const snapshot = await autoSnapshot(ctx, term.siteId, "update_term");
        return { term: saved, snapshot };
      },
    },
    {
      name: "rename_term",
      title: "Rename a term's slug",
      description:
        "Change a term's slug (its archive URL). The old slug keeps resolving and its archive redirects (301) to the new one; no article changes. Always waits for a person, who sees the redirects. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          termId: id,
          slug: str("New slug", { pattern: SLUG_PATTERN, maxLength: 128 }),
          reclaim: {
            type: "boolean",
            description: "People only: take a slug back from another term's history",
          },
        },
        ["siteId", "termId", "slug"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      precheck: async (a, ctx) => {
        const problem = a.reclaim === true ? reclaimProblem(ctx.principal.actor) : undefined;
        if (problem) throw new ToolError("denied", problem);
      },
      approvalPrompt: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const tax = await taxonomyOf(ctx, term);
        const locale = await defaultLocale(ctx, term.siteId);
        const to = archivePath(tax, a.slug as string);
        const lines =
          tax.archive.enabled && (isPublic(term) || a.reclaim === true)
            ? await redirectLines(ctx, term.siteId, {
                serve: [to],
                ...(isPublic(term) ? { moves: [{ from: archivePath(tax, term.slug), to }] } : {}),
              })
            : [];
        return withLines(
          `Rename ${named(tax, term, locale)} to slug "${a.slug as string}"? No article changes${lines.length ? "; redirects:" : "; no public URL changes."}`,
          lines,
        );
      },
      handler: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const problem = a.reclaim === true ? reclaimProblem(ctx.principal.actor) : undefined;
        if (problem) throw new ToolError("denied", problem);
        const op = await guarded(() =>
          ctx.store.renameTerm(term, a.slug as string, { reclaim: a.reclaim === true }),
        );
        return governed(ctx, term.siteId, "rename_term", op);
      },
    },
    {
      name: "merge_terms",
      title: "Merge terms",
      description:
        "Merge duplicate terms into one target term of the same taxonomy: every article is re-filed under the target (primary terms follow), the sources retire and their names and slugs become the target's synonyms and old slugs, and their archives redirect (301) to the target's. Always waits for a person, who sees the article count and the redirects. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          sourceIds: {
            type: "array",
            description: "Terms to merge away (list_terms ids)",
            items: id,
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
          },
          targetId: { ...id, description: "The active term that stays" },
        },
        ["siteId", "sourceIds", "targetId"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const siteId = a.siteId as string;
        const target = await requireTerm(ctx, siteId, a.targetId as string);
        const sources = await Promise.all(
          (a.sourceIds as string[]).map((x) => requireTerm(ctx, siteId, x)),
        );
        return mergePrompt(ctx, sources, target);
      },
      handler: async (a, ctx) => {
        const siteId = a.siteId as string;
        const target = await requireTerm(ctx, siteId, a.targetId as string);
        const sources = await Promise.all(
          (a.sourceIds as string[]).map((x) => requireTerm(ctx, siteId, x)),
        );
        const op = await guarded(() => ctx.store.mergeTerms(sources, target));
        return governed(ctx, siteId, "merge_terms", op);
      },
    },
    {
      name: "retire_term",
      title: "Retire a term",
      description:
        "Retire a term: it is removed from every article, its sub-terms move up, and its archive redirects (301) to `redirectToId` (or, for categories, to its parent) — without a redirect it answers 410 Gone. Refused when a review or published article would lose its required primary term: merge instead. Always waits for a person. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          termId: id,
          redirectToId: { ...id, description: "Active term of the same taxonomy to redirect to" },
        },
        ["siteId", "termId"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: { ...WRITE, destructiveHint: true },
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const siteId = a.siteId as string;
        const term = await requireTerm(ctx, siteId, a.termId as string);
        const target = a.redirectToId
          ? await requireTerm(ctx, siteId, a.redirectToId as string)
          : undefined;
        return retirePrompt(ctx, term, target);
      },
      handler: async (a, ctx) => {
        const siteId = a.siteId as string;
        const term = await requireTerm(ctx, siteId, a.termId as string);
        const target = a.redirectToId
          ? await requireTerm(ctx, siteId, a.redirectToId as string)
          : undefined;
        const op = await guarded(() =>
          ctx.store.retireTerm(term, target ? { redirectTo: target } : {}),
        );
        return governed(ctx, siteId, "retire_term", op);
      },
    },
    {
      name: "set_term_parent",
      title: "Move a term",
      description:
        "Move a term under another term of the same hierarchical taxonomy (null: to the top level). No URL changes; category archives include sub-categories. Always waits for a person. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          termId: id,
          parentId: { anyOf: [id, { type: "null" }], description: "New parent; null: top level" },
        },
        ["siteId", "termId", "parentId"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const siteId = a.siteId as string;
        const term = await requireTerm(ctx, siteId, a.termId as string);
        const tax = await taxonomyOf(ctx, term);
        const locale = await defaultLocale(ctx, siteId);
        const where = async (pid: string | undefined | null) => {
          if (!pid) return "the top level";
          const p = await ctx.store.getTerm(pid);
          return p ? `"${quote(termName(p, locale), 50)}"` : pid;
        };
        return `Move ${named(tax, term, locale)} from ${await where(term.parentId)} to ${await where(a.parentId as string | null)}? No URLs change.`;
      },
      handler: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const op = await guarded(() =>
          ctx.store.setTermParent(term, (a.parentId as string | null) ?? null),
        );
        return governed(ctx, term.siteId, "set_term_parent", op);
      },
    },
    {
      name: "set_term_visibility",
      title: "Set term visibility",
      description:
        "Make a term public (archive, feed and sitemap entry; shown on articles) or internal (no public URL; themes and filters may still use it). Always waits for a person. Snapshots afterwards.",
      inputSchema: obj(
        { siteId: id, termId: id, visibility: { type: "string", enum: ["public", "internal"] } },
        ["siteId", "termId", "visibility"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const tax = await taxonomyOf(ctx, term);
        const locale = await defaultLocale(ctx, term.siteId);
        const path = archivePath(tax, term.slug);
        const live = tax.archive.enabled && term.status === "active";
        if (a.visibility === "internal")
          return `Make ${named(tax, term, locale)} internal?${live && term.visibility === "public" ? ` Its archive ${path} and feed go offline (no redirect).` : ""}`;
        const lines = live ? await redirectLines(ctx, term.siteId, { serve: [path] }) : [];
        return withLines(
          `Make ${named(tax, term, locale)} public?${live ? ` ${path} becomes a public archive.` : ""}`,
          lines,
        );
      },
      handler: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const op = await guarded(() =>
          ctx.store.setTermVisibility(term, a.visibility as Term["visibility"]),
        );
        return governed(ctx, term.siteId, "set_term_visibility", op);
      },
    },
    {
      name: "review_term",
      title: "Review a proposed term",
      description:
        "Decide on a proposed term: approve (it becomes active and, if public, gets its archive), reject (retired and removed from articles) or merge (into an existing term, `mergeIntoId`). People normally do this in Studio; an agent never approves a term it proposed. Always waits for a person. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          termId: id,
          decision: { type: "string", enum: ["approve", "reject", "merge"] },
          mergeIntoId: { ...id, description: "With decision merge: the active term to merge into" },
        },
        ["siteId", "termId", "decision"],
      ),
      outputSchema: GOVERNANCE_OUT,
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      precheck: async (a, ctx) => {
        const term = await requireTerm(ctx, a.siteId as string, a.termId as string);
        const problem = termReviewProblem(
          ctx.principal.actor,
          term,
          a.decision as "approve" | "reject" | "merge",
        );
        if (problem) throw new ToolError("denied", problem);
        if (a.decision === "merge" && !a.mergeIntoId)
          throw new ToolError("invalid", "decision merge needs mergeIntoId");
      },
      approvalPrompt: async (a, ctx) => {
        const siteId = a.siteId as string;
        const term = await requireTerm(ctx, siteId, a.termId as string);
        const tax = await taxonomyOf(ctx, term);
        const locale = await defaultLocale(ctx, siteId);
        const by = term.proposedBy
          ? ` proposed by ${term.proposedBy.name ?? term.proposedBy.id}`
          : "";
        const why = term.metadata?.["cloudhal.reason"]
          ? ` ("${quote(term.metadata["cloudhal.reason"], 120)}")`
          : "";
        if (a.decision === "merge") {
          const target = await requireTerm(ctx, siteId, a.mergeIntoId as string);
          return mergePrompt(ctx, [term], target, `Review${by}${why}: `);
        }
        if (a.decision === "reject")
          return retirePrompt(ctx, term, undefined, `Reject${by}${why}: `);
        const path = archivePath(tax, term.slug);
        const opens = tax.archive.enabled && term.visibility === "public";
        const lines = opens ? await redirectLines(ctx, siteId, { serve: [path] }) : [];
        return withLines(
          `Approve ${named(tax, term, locale)}${by}${why}? It becomes active${opens ? ` with a public archive at ${path}` : ""}.`,
          lines,
        );
      },
      handler: async (a, ctx) => {
        const siteId = a.siteId as string;
        const term = await requireTerm(ctx, siteId, a.termId as string);
        const decision = a.decision as "approve" | "reject" | "merge";
        const problem = termReviewProblem(ctx.principal.actor, term, decision);
        if (problem) throw new ToolError("denied", problem);
        let target: Term | undefined;
        if (decision === "merge") {
          if (!a.mergeIntoId) throw new ToolError("invalid", "decision merge needs mergeIntoId");
          target = await requireTerm(ctx, siteId, a.mergeIntoId as string);
        }
        const op = await guarded(() =>
          ctx.store.reviewTerm(
            term,
            decision === "approve"
              ? { approve: true }
              : decision === "reject"
                ? { reject: true }
                : { mergeInto: target as Term },
          ),
        );
        return governed(ctx, siteId, "review_term", op);
      },
    },
    {
      name: "taxonomy_report",
      title: "Taxonomy hygiene report",
      description:
        "Findings about the vocabulary: single-use and unused terms, near-duplicates (edit distance ≤ 2, singular/plural) and synonym collisions, empty or oversized categories, archives without an intro, articles without a required primary term or without any category, and the backlog of proposed terms. Near-duplicates name the term to merge away first and the one to keep second. The same report as Studio's vocabulary health card. Read-only: suggest merges or retirements to a person.",
      inputSchema: obj({ siteId: id, taxonomy: TAXONOMY_KEY }, ["siteId"]),
      outputSchema: obj(
        {
          findings: {
            type: "array",
            items: obj(
              {
                kind: {
                  type: "string",
                  enum: [
                    "single-use",
                    "unused",
                    "near-duplicate",
                    "synonym-collision",
                    "empty-category",
                    "oversized-category",
                    "proposed",
                    "no-intro",
                    "missing-primary",
                    "unfiled",
                  ],
                },
                taxonomy: { type: "string" },
                terms: { type: "array", items: TERM_REF },
                detail: { type: "string" },
              },
              ["kind", "taxonomy", "terms", "detail"],
            ),
          },
          counts: {
            type: "object",
            description: "Findings per kind (complete; `findings` lists at most maxPerKind each)",
            additionalProperties: { type: "integer" },
          },
          thresholds: {
            type: "object",
            additionalProperties: { type: "number" },
          },
        },
        ["findings", "counts", "thresholds"],
      ),
      annotations: READ,
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        return taxonomyReport(ctx, site, a.taxonomy as string | undefined);
      },
    },
    {
      name: "create_taxonomy",
      title: "Create taxonomy",
      description:
        "Create a taxonomy (e.g. series, region) with its rules and archive path. Always waits for a person. Snapshots afterwards.",
      inputSchema: withTaxonomyDefs(
        obj(
          {
            siteId: id,
            key: TAX_PROPS.key as JsonSchema,
            labels: TAX_PROPS.labels as JsonSchema,
            hierarchical: TAX_PROPS.hierarchical as JsonSchema,
            allowNewTerms: TAX_PROPS.allowNewTerms as JsonSchema,
            required: TAX_PROPS.required as JsonSchema,
            maxPerEntry: TAX_PROPS.maxPerEntry as JsonSchema,
            collections: TAX_PROPS.collections as JsonSchema,
            archive: TAX_PROPS.archive as JsonSchema,
            feed: TAX_PROPS.feed as JsonSchema,
            minEntriesToIndex: TAX_PROPS.minEntriesToIndex as JsonSchema,
          },
          [
            "siteId",
            "key",
            "labels",
            "hierarchical",
            "allowNewTerms",
            "required",
            "archive",
            "feed",
            "minEntriesToIndex",
          ],
        ),
      ),
      outputSchema: obj({ taxonomy: TAXONOMY, snapshot: SNAPSHOT }, ["taxonomy", "snapshot"]),
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a) => {
        const archive = a.archive as Taxonomy["archive"];
        return `Create taxonomy "${a.key as string}": ${a.hierarchical ? "hierarchical" : "flat"}, new terms by ${a.allowNewTerms === "none" ? "people only" : a.allowNewTerms === "propose" ? "agent proposals a person approves" : "agents freely"}, ${a.required ? "required on review/published articles" : "optional"}${a.maxPerEntry ? `, at most ${a.maxPerEntry} per article` : ""}, archive ${archive?.enabled ? `at ${archive.basePath}` : "off"}${a.feed ? " with feeds" : ""}?`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const { siteId: _s, ...fields } = a;
        const input = { ...fields, siteId: site.id } as unknown as Parameters<
          typeof ctx.store.createTaxonomy
        >[0];
        const taxonomy = await guarded(() => ctx.store.createTaxonomy(input));
        const snapshot = await autoSnapshot(ctx, site.id, "create_taxonomy");
        return { taxonomy, snapshot };
      },
    },
    {
      name: "update_taxonomy",
      title: "Update taxonomy",
      description:
        "Change a taxonomy's rules, labels or archive (the key never changes). Moving an enabled archive leaves a prefix redirect. Requires the current `rev`. Always waits for a person. Snapshots afterwards.",
      inputSchema: withTaxonomyDefs(
        obj(
          {
            siteId: id,
            taxonomyId: id,
            rev: { type: "integer", minimum: 0 },
            labels: TAX_PROPS.labels as JsonSchema,
            hierarchical: TAX_PROPS.hierarchical as JsonSchema,
            allowNewTerms: TAX_PROPS.allowNewTerms as JsonSchema,
            required: TAX_PROPS.required as JsonSchema,
            maxPerEntry: { anyOf: [TAX_PROPS.maxPerEntry, { type: "null" }] },
            collections: { anyOf: [TAX_PROPS.collections, { type: "null" }] },
            archive: TAX_PROPS.archive as JsonSchema,
            feed: TAX_PROPS.feed as JsonSchema,
            minEntriesToIndex: TAX_PROPS.minEntriesToIndex as JsonSchema,
          },
          ["siteId", "taxonomyId", "rev"],
        ),
      ),
      outputSchema: obj({ taxonomy: TAXONOMY, snapshot: SNAPSHOT }, ["taxonomy", "snapshot"]),
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const tax = await ctx.store.getTaxonomy(a.taxonomyId as string);
        if (!tax || tax.siteId !== a.siteId) return `Update taxonomy ${a.taxonomyId}?`;
        const next = patchTaxonomy(tax, a);
        const changed = TAXONOMY_FIELDS.filter(
          (f) => canonicalJson(tax[f] ?? null) !== canonicalJson(next[f] ?? null),
        ).map((f) => (f === "labels" ? "labels" : `${f}: ${show(tax, f)} → ${show(next, f)}`));
        const moves =
          tax.archive.enabled &&
          next.archive.enabled &&
          tax.archive.basePath !== next.archive.basePath
            ? [{ from: tax.archive.basePath, to: next.archive.basePath }]
            : [];
        const lines = moves.length ? await redirectLines(ctx, tax.siteId, { moves }) : [];
        return withLines(
          `Update taxonomy "${tax.key}" (${changed.join("; ") || "no change"})?`,
          lines,
        );
      },
      handler: async (a, ctx) => {
        const tax = await ctx.store.getTaxonomy(a.taxonomyId as string);
        if (!tax || tax.siteId !== a.siteId)
          throw new ToolError("not_found", `taxonomy ${a.taxonomyId} not found`);
        if (tax.rev !== a.rev)
          throw new ToolError(
            "conflict",
            `taxonomy ${tax.id} is at rev ${tax.rev}, you sent ${a.rev}; reload and retry`,
          );
        const taxonomy = await guarded(() => ctx.store.updateTaxonomy(patchTaxonomy(tax, a)));
        const snapshot = await autoSnapshot(ctx, tax.siteId, "update_taxonomy");
        return { taxonomy, snapshot };
      },
    },
    {
      name: "list_redirects",
      title: "List redirects",
      description:
        "The site's redirects (from → to, 301/302, exact/prefix, reason, source node). Slug changes of published articles and term renames, merges and retirements create them automatically.",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj({ redirects: { type: "array", items: REDIRECT } }, ["redirects"]),
      annotations: READ,
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        await requireSite(ctx, a.siteId as string);
        return { redirects: await ctx.store.listRedirects(a.siteId as string) };
      },
    },
    {
      name: "create_redirect",
      title: "Create redirect",
      description:
        "Redirect a path the site no longer serves to another path of this site (agents cannot redirect to other hosts). Chains are collapsed and loops refused. Always waits for a person. Snapshots afterwards.",
      inputSchema: obj(
        {
          siteId: id,
          from: REDIRECT_PROPS.from as JsonSchema,
          to: REDIRECT_PROPS.to as JsonSchema,
          status: { type: "integer", enum: [301, 302], default: 301 },
          match: { type: "string", enum: ["exact", "prefix"], default: "exact" },
          note: str("Why (shown to people)", { maxLength: 500 }),
        },
        ["siteId", "from", "to"],
      ),
      outputSchema: obj({ redirect: REDIRECT, snapshot: SNAPSHOT }, ["redirect", "snapshot"]),
      annotations: WRITE,
      scopes: ["site:write"],
      requiresApproval: true,
      precheck: async (a, ctx) => {
        const problem = redirectTargetProblem(ctx.principal.actor, a.to as string);
        if (problem) throw new ToolError("denied", problem);
      },
      approvalPrompt: async (a) =>
        `Create a ${(a.status as number | undefined) ?? 301} redirect ${quote(a.from as string, 120)} → ${quote(a.to as string, 120)} (${(a.match as string | undefined) ?? "exact"})${a.note ? `: "${quote(a.note as string, 120)}"` : ""}?`,
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const problem = redirectTargetProblem(ctx.principal.actor, a.to as string);
        if (problem) throw new ToolError("denied", problem);
        const redirect = await guarded(() =>
          ctx.store.createRedirect({
            siteId: site.id,
            from: a.from as string,
            to: a.to as string,
            status: ((a.status as number | undefined) ?? 301) as Redirect["status"],
            match: ((a.match as string | undefined) ?? "exact") as Redirect["match"],
            reason: "manual",
            ...(a.note ? { note: a.note as string } : {}),
          }),
        );
        const snapshot = await autoSnapshot(ctx, site.id, "create_redirect");
        return { redirect, snapshot };
      },
    },
    {
      name: "delete_redirect",
      title: "Delete redirect",
      description:
        "Delete a redirect; its old path then answers 404 unless something serves it. Always waits for a person. Snapshots afterwards.",
      inputSchema: obj({ siteId: id, redirectId: id }, ["siteId", "redirectId"]),
      outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
      annotations: { ...WRITE, destructiveHint: true },
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a, ctx) => {
        const r = await ctx.store.getRedirect(a.redirectId as string);
        return r
          ? `Delete the redirect ${quote(r.from, 120)} → ${quote(r.to, 120)} (${r.reason})? ${quote(r.from, 120)} will answer 404 unless something serves it.`
          : `Delete redirect ${a.redirectId}?`;
      },
      handler: async (a, ctx) => {
        const r = await ctx.store.getRedirect(a.redirectId as string);
        if (!r || r.siteId !== a.siteId)
          throw new ToolError("not_found", `redirect ${a.redirectId} not found`);
        await guarded(() => ctx.store.deleteRedirect(r));
        return { snapshot: await autoSnapshot(ctx, r.siteId, "delete_redirect") };
      },
    },
  ];
}

const TAXONOMY_FIELDS = [
  "labels",
  "hierarchical",
  "allowNewTerms",
  "required",
  "maxPerEntry",
  "collections",
  "archive",
  "feed",
  "minEntriesToIndex",
] as const;

/** A taxonomy setting as a person reads it in a prompt. */
function show(tax: Taxonomy, f: (typeof TAXONOMY_FIELDS)[number]): string {
  const v = tax[f];
  if (v === undefined) return "unset";
  if (f === "archive") return tax.archive.enabled ? tax.archive.basePath : "off";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** `update_taxonomy` arguments over the stored taxonomy (`null` clears an optional field). */
function patchTaxonomy(tax: Taxonomy, a: Record<string, unknown>): Taxonomy {
  const next: Record<string, unknown> = { ...tax };
  for (const f of TAXONOMY_FIELDS) {
    if (a[f] === undefined) continue;
    if (a[f] === null) delete next[f];
    else next[f] = a[f];
  }
  return next as unknown as Taxonomy;
}

async function mergePrompt(
  ctx: ToolContext,
  sources: Term[],
  target: Term,
  prefix = "",
): Promise<string> {
  const tax = await taxonomyOf(ctx, target);
  const locale = await defaultLocale(ctx, target.siteId);
  const n = await entriesUsing(
    ctx,
    target.siteId,
    tax.key,
    sources.map((s) => s.id),
  );
  const lines = tax.archive.enabled
    ? await redirectLines(ctx, target.siteId, {
        serve: [archivePath(tax, target.slug)],
        moves: sources
          .filter(isPublic)
          .map((s) => ({ from: archivePath(tax, s.slug), to: archivePath(tax, target.slug) })),
        repoints: sources
          .filter((s) => !isPublic(s))
          .map((s) => ({ from: archivePath(tax, s.slug), to: archivePath(tax, target.slug) })),
      })
    : [];
  const names = sources.map((s) => `"${quote(termName(s, locale), 40)}" (${s.slug})`).join(", ");
  return withLines(
    `${prefix}Merge ${tax.key} ${names} into ${named(tax, target, locale)}? ${articles(n)} re-filed under it; the merged terms retire and their names and slugs keep resolving to it.${lines.length ? " Redirects:" : ""}`,
    lines,
  );
}

async function retirePrompt(
  ctx: ToolContext,
  term: Term,
  target: Term | undefined,
  prefix = "",
): Promise<string> {
  const tax = await taxonomyOf(ctx, term);
  const locale = await defaultLocale(ctx, term.siteId);
  const n = await entriesUsing(ctx, term.siteId, tax.key, [term.id]);
  let to = target;
  if (!to && tax.hierarchical && term.parentId) {
    const parent = await ctx.store.getTerm(term.parentId);
    if (parent && isPublic(parent)) to = parent;
  }
  const children = (await ctx.store.listTerms(term.siteId, { taxonomy: tax.key })).filter(
    (t) => t.parentId === term.id && t.status !== "retired",
  ).length;
  const from = archivePath(tax, term.slug);
  const lines =
    tax.archive.enabled && to
      ? await redirectLines(ctx, term.siteId, {
          ...(isPublic(term)
            ? { moves: [{ from, to: archivePath(tax, to.slug) }] }
            : { repoints: [{ from, to: archivePath(tax, to.slug) }] }),
        })
      : [];
  const gone =
    tax.archive.enabled && isPublic(term) && !to
      ? ` Its archive ${from} will answer 410 Gone.`
      : "";
  return withLines(
    `${prefix}Retire ${named(tax, term, locale)}? It is removed from ${articles(n)}${children ? `; its ${children} sub-term${children === 1 ? "" : "s"} move up` : ""}.${gone}${lines.length ? " Redirects:" : ""}`,
    lines,
  );
}
