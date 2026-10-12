/**
 * Shared pieces of the taxonomy, term and redirect routes (RFC-0002 §6.1): the one snapshot each
 * mutation takes, and the read-only preview a person sees before a governance operation runs.
 */
import type {
  Actor,
  ContentEntry,
  Redirect,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { GOVERNANCE_ENTRY_LIMIT, type SiteGraphStore, splitTarget } from "@cloudhal/core-ts";
import type { Context } from "hono";
import type { Env } from "./context.ts";
import { notFound } from "./errors.ts";
import { param } from "./params.ts";

export const API_ACTOR: Actor = { kind: "system", id: "sys_api00000001" };

export function actorOf(c: Context<Env>): Actor {
  return c.get("actor") ?? API_ACTOR;
}

export async function requireSite(c: Context<Env>): Promise<Site> {
  const site = await c.get("store").getSite(param(c, "siteId"));
  if (!site) throw notFound("site not found");
  return site;
}

/**
 * The one snapshot of a mutating operation (RFC-0002 §4.2): reason `manual`, labelled
 * `<op> by <actor>`, with the operation id in `cloudhal.op` when the store gave one.
 */
export function snapshotAfter(
  c: Context<Env>,
  siteId: string,
  op: string,
  opId?: string,
): Promise<Snapshot> {
  const actor = actorOf(c);
  return c.get("store").createSnapshot(siteId, {
    actor,
    reason: "manual",
    label: `${op} by ${actor.name ?? actor.id}`.slice(0, 200),
    ...(opId ? { metadata: { "cloudhal.op": opId } } : {}),
  });
}

/** An entry as a preview lists it. */
export interface EntrySummary {
  id: string;
  title: string;
  collection: string;
  slug: string;
  locale: string;
  status: ContentEntry["status"];
}

/** A redirect the operation will create (or re-point onto the new path). */
export interface PlannedRedirect {
  from: string;
  to: string;
  status: 301;
  match: "prefix";
  reason: "slug-change" | "merge" | "retire";
}

/**
 * What a governance operation would do, computed from the current state without writing anything.
 * The operation itself re-checks everything in its batch; this is for the person deciding.
 */
export interface GovernancePreview {
  /** Entries that carry the term(s) the operation touches. */
  entries: { count: number; items: EntrySummary[]; rewritten: boolean };
  /** Archive redirects the operation creates. */
  redirects: PlannedRedirect[];
  /** Existing redirects whose target moves along (chains are collapsed). */
  repointed: number;
  /** More entries than one operation may touch (`too_large`, RFC-0002 §4.3). */
  tooLarge?: { entries: number; limit: number };
  /** Review/published entries that would lose the primary term of a required taxonomy. */
  blocked?: { code: "required_term"; count: number; items: EntrySummary[] };
  /** The term's public archive disappears without a redirect: 410 when retired, 404 when hidden. */
  archiveGone?: "gone" | "not_found";
  /** The term's archive becomes public (approve, internal → public). */
  archiveAppears?: string;
}

const PREVIEW_ITEMS = 50;

function summary(e: ContentEntry): EntrySummary {
  return {
    id: e.id,
    title: e.title,
    collection: e.collection,
    slug: e.slug,
    locale: e.locale,
    status: e.status,
  };
}

function isPublic(t: Term): boolean {
  return t.status === "active" && t.visibility === "public";
}

export function archivePath(tax: Taxonomy, slug: string): string {
  return `${tax.archive.basePath}/${slug}`;
}

function repointedCount(redirects: readonly Redirect[], from: string): number {
  return redirects.filter((r) => {
    const target = splitTarget(r.to);
    return target && (target.path === from || target.path.startsWith(`${from}/`));
  }).length;
}

export type PreviewOp =
  | { op: "rename"; slug: string }
  | { op: "merge"; into: Term }
  | { op: "retire"; redirectTo?: Term | undefined }
  | { op: "parent"; parentId: string | null }
  | { op: "visibility"; visibility: Term["visibility"] }
  | { op: "approve" };

/** Previews `op` on `term` (RFC-0002 §8: affected entries, redirects, the 400-entry limit). */
export async function previewGovernance(
  store: SiteGraphStore,
  tax: Taxonomy,
  term: Term,
  op: PreviewOp,
): Promise<GovernancePreview> {
  const entries = await store.listContentEntries(term.siteId, { filter: `${tax.key}:${term.id}` });
  const redirects = await store.listRedirects(term.siteId);
  const from = archivePath(tax, term.slug);
  const rewritten = op.op === "merge" || op.op === "retire";
  const preview: GovernancePreview = {
    entries: {
      count: entries.length,
      items: entries.slice(0, PREVIEW_ITEMS).map(summary),
      rewritten,
    },
    redirects: [],
    repointed: 0,
  };
  if (rewritten && entries.length > GOVERNANCE_ENTRY_LIMIT)
    preview.tooLarge = { entries: entries.length, limit: GOVERNANCE_ENTRY_LIMIT };
  const archive = tax.archive.enabled;
  switch (op.op) {
    case "rename": {
      if (archive && isPublic(term) && op.slug !== term.slug) {
        const to = archivePath(tax, op.slug);
        preview.redirects.push({ from, to, status: 301, match: "prefix", reason: "slug-change" });
        preview.repointed = repointedCount(redirects, from);
      }
      break;
    }
    case "merge": {
      if (archive) {
        const to = archivePath(tax, op.into.slug);
        if (isPublic(term))
          preview.redirects.push({ from, to, status: 301, match: "prefix", reason: "merge" });
        preview.repointed = repointedCount(redirects, from);
      }
      break;
    }
    case "retire": {
      let target = op.redirectTo;
      if (!target && tax.hierarchical && term.parentId) {
        const parent = await store.getTerm(term.parentId);
        if (parent && isPublic(parent)) target = parent;
      }
      if (archive && target) {
        if (isPublic(term))
          preview.redirects.push({
            from,
            to: archivePath(tax, target.slug),
            status: 301,
            match: "prefix",
            reason: "retire",
          });
        preview.repointed = repointedCount(redirects, from);
      } else if (archive && isPublic(term)) preview.archiveGone = "gone";
      const orphaned = tax.required
        ? entries.filter(
            (e) =>
              (e.status === "review" || e.status === "published") &&
              (!tax.collections || tax.collections.includes(e.collection)) &&
              e.terms?.[tax.key]?.primary === term.id,
          )
        : [];
      if (orphaned.length > 0)
        preview.blocked = {
          code: "required_term",
          count: orphaned.length,
          items: orphaned.slice(0, PREVIEW_ITEMS).map(summary),
        };
      break;
    }
    case "visibility": {
      if (archive && term.status === "active" && op.visibility !== term.visibility) {
        if (op.visibility === "internal") preview.archiveGone = "not_found";
        else preview.archiveAppears = from;
      }
      break;
    }
    case "approve": {
      if (archive && term.visibility === "public") preview.archiveAppears = from;
      break;
    }
    case "parent":
      break;
  }
  return preview;
}
