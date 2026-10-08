import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import { foldName, type GovernanceResult, type TermUsage } from "@cloudhal/core-ts";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { type PreviewOp, previewGovernance, requireSite, snapshotAfter } from "../governance.ts";
import { param } from "../params.ts";

type TermInput = Omit<Term, "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId">;

const STATUSES = new Set<Term["status"]>(["active", "proposed", "retired"]);
const VISIBILITIES = new Set<Term["visibility"]>(["public", "internal"]);
const NO_USAGE: TermUsage = { total: 0, published: 0 };

/** One row of `GET /terms`: the term and how many entries use it. */
export interface TermListItem {
  term: Term;
  usage: TermUsage;
}

function statusList(raw: string | undefined): Term["status"][] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((s) => s.trim()) as Term["status"][];
  for (const v of values)
    if (!STATUSES.has(v)) throw badRequest(`status must be active, proposed or retired (got ${v})`);
  return values;
}

/** Does the term's slug, a name or an alternative name (folded) contain the folded query? */
function matchesQuery(term: Term, folded: string): boolean {
  if (term.slug.includes(folded)) return true;
  for (const label of Object.values(term.labels)) {
    if (!label) continue;
    if (foldName(label.name).includes(folded)) return true;
    if ((label.altNames ?? []).some((a) => foldName(a).includes(folded))) return true;
  }
  return (term.slugHistory ?? []).some((s) => s.includes(folded));
}

async function loadTerm(c: Context<Env>): Promise<{ term: Term; tax: Taxonomy }> {
  const store = c.get("store");
  const term = await store.getTerm(param(c, "termId"));
  if (!term || term.siteId !== param(c, "siteId")) throw notFound("term not found");
  const tax = await store.getTaxonomy(term.taxonomyId);
  if (!tax) throw notFound("taxonomy not found");
  return { term, tax };
}

/** Another term of the same site, by id (merge targets, redirect targets). */
async function otherTerm(c: Context<Env>, id: unknown, field: string): Promise<Term> {
  if (typeof id !== "string" || !id) throw badRequest(`${field} must be a term id`);
  const term = await c.get("store").getTerm(id);
  if (!term || term.siteId !== param(c, "siteId")) throw notFound(`${field}: term not found`);
  return term;
}

/** The term at the revision the person saw (`rev` in the body), so a stale dialog gets a 409. */
function at(term: Term, rev: unknown): Term {
  if (rev === undefined) return term;
  if (!Number.isInteger(rev)) throw badRequest("rev must be an integer");
  return { ...term, rev: rev as number };
}

interface OpBody {
  rev?: number;
  dryRun?: boolean;
  [key: string]: unknown;
}

async function body(c: Context<Env>): Promise<OpBody> {
  const b = (await c.req.json().catch(() => ({}))) as unknown;
  return b && typeof b === "object" ? (b as OpBody) : {};
}

/**
 * Runs a governance operation (or previews it with `dryRun`), then takes its one snapshot. The
 * answer carries the changed terms, the entry count, the redirects and the snapshot.
 */
async function govern(
  c: Context<Env>,
  b: OpBody,
  name: string,
  preview: () => Promise<PreviewOp>,
  run: () => Promise<GovernanceResult>,
) {
  const { term, tax } = await loadTerm(c);
  if (b.dryRun === true)
    return c.json({ preview: await previewGovernance(c.get("store"), tax, term, await preview()) });
  const result = await run();
  const changed = result.terms.length > 0 || result.redirects.length > 0 || result.entries > 0;
  const snapshot = changed ? await snapshotAfter(c, term.siteId, name, result.opId) : null;
  return c.json({ result, snapshot });
}

/** `/api/sites/:siteId/terms` (RFC-0002 §6.1, people only). */
export const terms: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const site = await requireSite(c);
    const store = c.get("store");
    const taxonomy = c.req.query("taxonomy") || undefined;
    const status = statusList(c.req.query("status"));
    const list = await store.listTerms(site.id, {
      ...(taxonomy ? { taxonomy } : {}),
      ...(status ? { status } : {}),
    });
    const q = foldName(c.req.query("q") ?? "");
    const usage = await store.termUsage(site.id, taxonomy);
    const items: TermListItem[] = list
      .filter((t) => !q || matchesQuery(t, q))
      .map((term) => ({ term, usage: usage.get(term.id) ?? NO_USAGE }));
    return c.json({ items });
  })
  .post("/", async (c) => {
    const site = await requireSite(c);
    const { reclaim, ...input } = (await c.req.json()) as TermInput & { reclaim?: boolean };
    const tax = await c.get("store").getTaxonomy(input.taxonomyId);
    if (!tax || tax.siteId !== site.id) throw notFound("taxonomy not found");
    // People create active, public terms unless they say otherwise (RFC-0002 §6.4).
    const term = await c.get("store").createTerm(
      {
        ...input,
        status: input.status ?? "active",
        visibility: input.visibility ?? "public",
        siteId: site.id,
      },
      { reclaim: reclaim === true },
    );
    const snapshot = await snapshotAfter(c, site.id, "create_term");
    return c.json({ term, snapshot }, 201);
  })
  .get("/:termId", async (c) => {
    const { term, tax } = await loadTerm(c);
    const store = c.get("store");
    const usage = (await store.termUsage(term.siteId, tax.key)).get(term.id) ?? NO_USAGE;
    const redirects = (await store.listRedirects(term.siteId)).filter(
      (r) => r.source?.kind === "term" && r.source.id === term.id,
    );
    return c.json({ term, usage, redirects });
  })
  .put("/:termId", async (c) => {
    const { term: stored } = await loadTerm(c);
    const next = (await c.req.json()) as Term;
    if (next.id !== stored.id || next.siteId !== stored.siteId)
      throw badRequest("ids must match the URL");
    const term = await c.get("store").updateTerm(next);
    const snapshot = await snapshotAfter(c, term.siteId, "update_term");
    return c.json({ term, snapshot });
  })
  .post("/:termId/rename", async (c) => {
    const b = await body(c);
    if (typeof b.slug !== "string" || !b.slug) throw badRequest("slug is required");
    const slug = b.slug;
    return govern(
      c,
      b,
      "rename_term",
      async () => ({ op: "rename", slug }),
      async () => {
        const { term } = await loadTerm(c);
        return c.get("store").renameTerm(at(term, b.rev), slug, { reclaim: b.reclaim === true });
      },
    );
  })
  .post("/:termId/merge", async (c) => {
    const b = await body(c);
    const into = await otherTerm(c, b.into, "into");
    return govern(
      c,
      b,
      "merge_terms",
      async () => ({ op: "merge", into }),
      async () => {
        const { term } = await loadTerm(c);
        return c.get("store").mergeTerms([at(term, b.rev)], into);
      },
    );
  })
  .post("/:termId/retire", async (c) => {
    const b = await body(c);
    const redirectTo =
      b.redirectTo === undefined || b.redirectTo === null
        ? undefined
        : await otherTerm(c, b.redirectTo, "redirectTo");
    return govern(
      c,
      b,
      "retire_term",
      async () => ({ op: "retire", redirectTo }),
      async () => {
        const { term } = await loadTerm(c);
        return c.get("store").retireTerm(at(term, b.rev), redirectTo ? { redirectTo } : undefined);
      },
    );
  })
  .post("/:termId/parent", async (c) => {
    const b = await body(c);
    if (b.parentId !== null && typeof b.parentId !== "string")
      throw badRequest("parentId must be a term id or null");
    const parentId = b.parentId as string | null;
    return govern(
      c,
      b,
      "set_term_parent",
      async () => ({ op: "parent", parentId }),
      async () => {
        const { term } = await loadTerm(c);
        return c.get("store").setTermParent(at(term, b.rev), parentId);
      },
    );
  })
  .post("/:termId/visibility", async (c) => {
    const b = await body(c);
    const visibility = b.visibility as Term["visibility"];
    if (!VISIBILITIES.has(visibility)) throw badRequest("visibility must be public or internal");
    return govern(
      c,
      b,
      "set_term_visibility",
      async () => ({ op: "visibility", visibility }),
      async () => {
        const { term } = await loadTerm(c);
        return c.get("store").setTermVisibility(at(term, b.rev), visibility);
      },
    );
  })
  .post("/:termId/review", async (c) => {
    const b = await body(c);
    const decision = b.decision;
    if (decision !== "approve" && decision !== "reject" && decision !== "merge")
      throw badRequest("decision must be approve, reject or merge");
    const into = decision === "merge" ? await otherTerm(c, b.into, "into") : undefined;
    return govern(
      c,
      b,
      "review_term",
      async () =>
        decision === "approve"
          ? { op: "approve" }
          : decision === "reject"
            ? { op: "retire" }
            : { op: "merge", into: into as Term },
      async () => {
        const { term } = await loadTerm(c);
        return c
          .get("store")
          .reviewTerm(
            at(term, b.rev),
            decision === "approve"
              ? { approve: true }
              : decision === "reject"
                ? { reject: true }
                : { mergeInto: into as Term },
          );
      },
    );
  });
