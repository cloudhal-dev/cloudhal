/** Taxonomies, terms, governance, redirects and the tags migration. */
import type { PublishStatus, Redirect, Snapshot, Taxonomy, Term } from "@cloudhal/core-contracts";
import { json, query, request } from "./http.ts";

// ---- taxonomy (RFC-0002 §6.1, packages/api/src/routes/{taxonomies,terms,redirects}.ts) ----------

/** How many entries use a term (`termUsage`): all statuses, published, and the latest update. */
export interface TermUsage {
  total: number;
  published: number;
  lastUsedAt?: string;
}

export interface TermListItem {
  term: Term;
  usage: TermUsage;
}

export interface TermDetail {
  term: Term;
  usage: TermUsage;
  /** Redirects whose source is this term (its earlier archive paths). */
  redirects: Redirect[];
}

/**
 * Why a term's archive answers the way it does (RFC-0002 §7, the renderer's `archiveState`):
 * `indexed`; `thin` and `noindex` are a 200 with `noindex,follow`; `empty`, `proposed`, `internal`
 * and `archiveOff` a 404; `retired` a 410.
 */
export type ArchiveReason =
  | "indexed"
  | "thin"
  | "noindex"
  | "empty"
  | "proposed"
  | "internal"
  | "retired"
  | "archiveOff";

/** `POST …/terms/:id/preview`: the archive page with the unsaved text, and its public state. */
export interface TermPreview {
  html: string;
  archive: {
    status: 200 | 404 | 410;
    indexable: boolean;
    reason: ArchiveReason;
    /** Published articles the archive lists (sub-categories included). */
    total: number;
    minEntriesToIndex: number;
    path: string;
  };
}

/** A new taxonomy as Studio sends it (the server adds ids, revision and timestamps). */
export type NewTaxonomy = Omit<
  Taxonomy,
  "id" | "siteId" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
>;

/** An entry as a governance preview lists it. */
export interface EntrySummary {
  id: string;
  title: string;
  collection: string;
  slug: string;
  locale: string;
  status: PublishStatus;
}

export interface PlannedRedirect {
  from: string;
  to: string;
  status: 301;
  match: "prefix";
  reason: "slug-change" | "merge" | "retire";
}

/** What a governance operation would do (`dryRun: true`); nothing is written. */
export interface GovernancePreview {
  entries: { count: number; items: EntrySummary[]; rewritten: boolean };
  redirects: PlannedRedirect[];
  /** Existing redirects that follow the term to its new path. */
  repointed: number;
  /** The operation would touch more entries than one batch may (400). */
  tooLarge?: { entries: number; limit: number };
  /** Review/published entries that would lose their required primary category. */
  blocked?: { code: "required_term"; count: number; items: EntrySummary[] };
  /** The public archive disappears without a redirect: 410 (retired) or 404 (made internal). */
  archiveGone?: "gone" | "not_found";
  /** The archive becomes public at this path. */
  archiveAppears?: string;
}

export interface GovernanceResult {
  opId: string;
  terms: Term[];
  entries: number;
  redirects: Redirect[];
}

/** A governance answer: what changed and the one snapshot it took (`null` when nothing changed). */
export interface GovernanceResponse {
  result: GovernanceResult;
  snapshot: Snapshot | null;
}

export type GovernanceOp =
  | { op: "rename"; slug: string; reclaim?: boolean }
  | { op: "merge"; into: string }
  | { op: "retire"; redirectTo?: string }
  | { op: "parent"; parentId: string | null }
  | { op: "visibility"; visibility: Term["visibility"] }
  | { op: "review"; decision: "approve" | "reject" }
  | { op: "review"; decision: "merge"; into: string };

function governanceBody(op: GovernanceOp, rev: number, dryRun: boolean): Record<string, unknown> {
  const { op: _op, ...rest } = op;
  return { ...rest, rev, ...(dryRun ? { dryRun: true } : {}) };
}

export type NewTerm = Omit<
  Term,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId"
> & { reclaim?: boolean };

/** A manual redirect as a person enters it (the server sets `reason: "manual"`). */
export type NewRedirect = Pick<Redirect, "from" | "to" | "status" | "match"> &
  Partial<Pick<Redirect, "note">>;

/** `POST /migrations/tags-to-terms` (packages/core-ts/src/tags-migration.ts). */
export interface TagsMigrationResult {
  migrationId: string;
  dryRun: boolean;
  resumed: boolean;
  upToDate: boolean;
  taxonomiesCreated: string[];
  tags: string[];
  termsCreated: number;
  termsReused: number;
  entries: number;
  skipped: { entryId: string; reason: string }[];
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
}

export interface TagsRevertResult {
  migrationId: string;
  restored: number;
  edited: string[];
  termsDeleted: number;
  taxonomiesDeleted: string[];
  snapshotId: string;
}

export const taxonomyApi = {
  taxonomies: {
    list: (siteId: string) => request<Taxonomy[]>(`/api/sites/${siteId}/taxonomies`),
    /** One snapshot; 400 `reserved_key`, 409 `path_conflict` or a taken key, 422 `invalid_labels`. */
    create: (siteId: string, taxonomy: NewTaxonomy) =>
      request<{ taxonomy: Taxonomy; snapshot: Snapshot }>(`/api/sites/${siteId}/taxonomies`, {
        method: "POST",
        ...json(taxonomy),
      }),
    update: (taxonomy: Taxonomy) =>
      request<{ taxonomy: Taxonomy; snapshot: Snapshot }>(
        `/api/sites/${taxonomy.siteId}/taxonomies/${taxonomy.id}`,
        { method: "PUT", ...json(taxonomy) },
      ),
  },
  terms: {
    /** Terms with usage; `status` narrows, `q` matches names, synonyms and slugs. */
    list: (siteId: string, q: { taxonomy?: string; status?: Term["status"][]; q?: string } = {}) =>
      request<{ items: TermListItem[] }>(
        `/api/sites/${siteId}/terms${query({ taxonomy: q.taxonomy, status: q.status?.join(","), q: q.q })}`,
      ).then((r) => r.items),
    get: (siteId: string, id: string) =>
      request<TermDetail>(`/api/sites/${siteId}/terms/${encodeURIComponent(id)}`),
    /** People create active, public terms directly; 409 `slug_taken`, 422 `invalid_labels`. */
    create: (siteId: string, term: NewTerm) =>
      request<{ term: Term; snapshot: Snapshot }>(`/api/sites/${siteId}/terms`, {
        method: "POST",
        ...json(term),
      }),
    /** Text and presentation only (names, synonyms, description, SEO, image, position). */
    update: (term: Term) =>
      request<{ term: Term; snapshot: Snapshot }>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}`,
        { method: "PUT", ...json(term) },
      ),
    /**
     * The archive page with the editor's unsaved names, intro, SEO and image, and what the public
     * route answers with them. Nothing is written.
     */
    previewDraft: (term: Pick<Term, "id" | "siteId" | "labels" | "image">) =>
      request<TermPreview>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/preview`,
        { method: "POST", ...json({ labels: term.labels, image: term.image ?? null }) },
      ),
    /** Previews a governance operation without writing anything. */
    preview: (term: Term, op: GovernanceOp) =>
      request<{ preview: GovernancePreview }>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/${op.op}`,
        { method: "POST", ...json(governanceBody(op, term.rev, true)) },
      ).then((r) => r.preview),
    /** One batch, one snapshot (RFC-0002 §4.3); 409 `too_large` over 400 entries. */
    govern: (term: Term, op: GovernanceOp) =>
      request<GovernanceResponse>(
        `/api/sites/${term.siteId}/terms/${encodeURIComponent(term.id)}/${op.op}`,
        { method: "POST", ...json(governanceBody(op, term.rev, false)) },
      ),
  },
  redirects: {
    list: (siteId: string) => request<Redirect[]>(`/api/sites/${siteId}/redirects`),
    create: (siteId: string, input: NewRedirect) =>
      request<{ redirect: Redirect; snapshot: Snapshot }>(`/api/sites/${siteId}/redirects`, {
        method: "POST",
        ...json(input),
      }),
    update: (redirect: Redirect) =>
      request<{ redirect: Redirect; snapshot: Snapshot }>(
        `/api/sites/${redirect.siteId}/redirects/${encodeURIComponent(redirect.id)}`,
        { method: "PUT", ...json(redirect) },
      ),
    remove: (redirect: Redirect) =>
      request<{ snapshot: Snapshot }>(
        `/api/sites/${redirect.siteId}/redirects/${encodeURIComponent(redirect.id)}?rev=${redirect.rev}`,
        { method: "DELETE" },
      ),
  },
  migrations: {
    /** `dryRun` writes nothing; a real run snapshots before and after. */
    tagsToTerms: (siteId: string, dryRun: boolean) =>
      request<TagsMigrationResult>(`/api/sites/${siteId}/migrations/tags-to-terms`, {
        method: "POST",
        ...json({ dryRun }),
      }),
    revertTagsToTerms: (siteId: string, migrationId: string) =>
      request<TagsRevertResult>(`/api/sites/${siteId}/migrations/tags-to-terms/revert`, {
        method: "POST",
        ...json({ migrationId }),
      }),
  },
};
