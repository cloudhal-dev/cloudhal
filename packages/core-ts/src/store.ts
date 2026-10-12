import {
  type Actor,
  type Asset,
  assertValid,
  type ContentEntry,
  type Menu,
  type NodeRef,
  type Page,
  type Project,
  type Redirect,
  type Site,
  type Snapshot,
  type Taxonomy,
  type Term,
} from "@cloudhal/core-contracts";
import {
  type BlobStore,
  migrate,
  migrations,
  type SqlDriver,
  type SqlStatement,
} from "@cloudhal/storage";
import {
  AssetEngine,
  type AssetPage,
  type AssetQuery,
  type AssetUsage,
  type BlobLedgerRow,
  type GcResult,
  type IngestAssetInput,
  type IngestAssetResult,
  type StreamIngestInput,
  type UploadTicket,
  type UploadTicketRequest,
} from "./assets.ts";
import { type CachePurgeOptions, type CachePurgePlan, planCachePurge } from "./cache-purge.ts";
import {
  ConflictError,
  InvariantError,
  isUniqueViolation,
  NotFoundError,
  UniqueConstraintError,
} from "./errors.ts";
import { canonicalJson, nodeHash, sha256Hex } from "./hash.ts";
import { ID_PREFIX, newId } from "./ids.ts";
import { fillMissingSrc } from "./media/refs.ts";
import { isReservedMediaPath, MEDIA_LIMITS } from "./media/types.ts";
import type { TargetRef } from "./menu.ts";
import { MenuEngine } from "./menu-store.ts";
import type { Resolution } from "./names.ts";
import {
  and,
  type Cond,
  casUpdateStatement,
  insertNodeStatement,
  OpBatch,
  type Row,
  runOpBatch,
} from "./node-sql.ts";
import { type Creatable, type NodeKind, type SiteNode, uniquenessKey } from "./nodes.ts";
import type { RedirectMatch } from "./redirects.ts";
import {
  migrateTagsToTerms,
  revertTagsToTerms,
  type TagsMigrationResult,
  type TagsRevertResult,
} from "./tags-migration.ts";
import {
  canonicalTerms,
  type DefaultTaxonomyOptions,
  type EntryQuery,
  type GovernanceResult,
  type ReviewDecision,
  TaxonomyEngine,
  type TermQuery,
  type TermUsage,
} from "./taxonomy.ts";

export {
  type Creatable,
  isNodeKind,
  NODE_KINDS,
  NODE_SPEC,
  type NodeKind,
  type NodeSpec,
  type NodeTypes,
  type SiteNode,
  siteIdOf,
  uniquenessKey,
} from "./nodes.ts";

export interface SiteGraphStoreOptions {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  /** Clock, injectable for tests. */
  readonly now?: () => Date;
  readonly idGen?: (prefix: string) => string;
  /**
   * Called after the published pointer moved (publish and rollback). Deployments use it to purge
   * edge caches — `planCachePurge(change)` says which tags. Failures are reported to `onHookError`
   * and never undo the publish.
   */
  readonly onPublished?: (site: Site, change: PublishChange) => Promise<void>;
  readonly onHookError?: (error: unknown) => void;
  /** Media (RFC-0004): per-site quota of stored bytes (default 10 GB; 0 = unlimited). */
  readonly media?: { readonly quotaBytes?: number };
  /**
   * Called after a takedown removed content (`purgeBlob`): deployments purge the edge cache of the
   * asset's media URLs (`cloudhal-asset-<id>`). Failures go to `onHookError`.
   */
  readonly onMediaPurged?: (siteId: string, assetIds: string[]) => Promise<void>;
}

/**
 * Where the published pointer moved from and to: `from` is absent on a first publish, `to` when the
 * site is no longer published (an import that replaced it).
 */
export interface PublishChange {
  readonly from?: string;
  readonly to?: string;
}

export interface SnapshotInput {
  readonly actor: Actor;
  readonly reason: Snapshot["reason"];
  readonly label?: string;
  /** Namespaced keys (e.g. `cloudhal.migration`), kept on the snapshot. */
  readonly metadata?: Record<string, string>;
}

export interface SnapshotDiff {
  readonly added: NodeRef[];
  readonly removed: NodeRef[];
  readonly changed: Array<{ before: NodeRef; after: NodeRef }>;
}

/**
 * The first time an entry is marked published it gets its publication date, whichever path made
 * the change (Studio, REST, MCP, import). An explicit `publishedAt` (e.g. imported) is kept.
 */
function firstPublication(
  entry: Pick<ContentEntry, "status" | "publishedAt">,
  ts: string,
): { publishedAt?: string } {
  return entry.status === "published" && !entry.publishedAt ? { publishedAt: ts } : {};
}

/**
 * The Site Graph store: typed CRUD with optimistic locking, snapshots, diff, publish, rollback,
 * taxonomies, terms and redirects. Every multi-statement write is one atomic `batch()`; see
 * ADR-0002, RFC-0001 and RFC-0002.
 */
export class SiteGraphStore {
  readonly #sql: SqlDriver;
  readonly #blobs: BlobStore;
  readonly #now: () => Date;
  readonly #newId: (prefix: string) => string;
  readonly #tax: TaxonomyEngine;
  readonly #menus: MenuEngine;
  readonly #assets: AssetEngine;

  constructor(options: SiteGraphStoreOptions) {
    this.#sql = options.sql;
    this.#blobs = options.blobs;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.idGen ?? newId;
    this.#onPublished = options.onPublished;
    this.#onHookError = options.onHookError ?? ((e) => console.error("onPublished failed:", e));
    this.#assets = new AssetEngine({
      sql: this.#sql,
      blobs: this.#blobs,
      stamp: () => this.#stamp(),
      newId: (prefix) => this.#newId(prefix),
      quotaBytes: options.media?.quotaBytes ?? MEDIA_LIMITS.siteQuota,
      onMediaPurged: options.onMediaPurged,
      onHookError: (e) => this.#onHookError(e),
    });
    this.#tax = new TaxonomyEngine({
      sql: this.#sql,
      stamp: () => this.#stamp(),
      newId: (prefix) => this.#newId(prefix),
      refs: (siteId, draft, stored) => this.#assets.planRefs("term", siteId, draft, stored),
    });
    this.#menus = new MenuEngine({
      sql: this.#sql,
      stamp: () => this.#stamp(),
      newId: (prefix) => this.#newId(prefix),
      getSite: (id) => this.getSite(id),
    });
  }

  readonly #onPublished: SiteGraphStoreOptions["onPublished"];
  readonly #onHookError: (error: unknown) => void;

  /** Applies pending storage migrations. Safe to call on every start. */
  async init(): Promise<void> {
    await migrate(this.#sql, migrations);
  }

  #stamp(): string {
    return this.#now().toISOString();
  }

  // ───────────────────────────── projects ─────────────────────────────

  async createProject(input: Creatable<Project>): Promise<Project> {
    const ts = this.#stamp();
    const project: Project = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.project),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("project", project);
    await this.#sql.run(
      "INSERT INTO projects (id, rev, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [project.id, project.rev, canonicalJson(project), project.createdAt, project.updatedAt],
    );
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const row = await this.#sql.get<{ body: string }>("SELECT body FROM projects WHERE id = ?", [
      id,
    ]);
    return row ? (JSON.parse(row.body) as Project) : undefined;
  }

  /** Compare-and-swap on `project.rev`; returns the stored document with `rev + 1`. */
  async updateProject(project: Project): Promise<Project> {
    const next: Project = { ...project, rev: project.rev + 1, updatedAt: this.#stamp() };
    assertValid("project", next);
    const r = await this.#sql.run(
      "UPDATE projects SET rev = ?, body = ?, updated_at = ? WHERE id = ? AND rev = ?",
      [next.rev, canonicalJson(next), next.updatedAt, project.id, project.rev],
    );
    if (r.changes !== 1)
      throw new ConflictError(
        "project",
        project.id,
        project.rev,
        (await this.getProject(project.id))?.rev,
      );
    return next;
  }

  // ───────────────────────────── nodes (site / page / contentEntry) ─────────────────────────────

  async #getNode<T extends SiteNode>(kind: NodeKind, id: string): Promise<T | undefined> {
    const row = await this.#sql.get<Row>("SELECT * FROM nodes WHERE id = ? AND kind = ?", [
      id,
      kind,
    ]);
    return row ? (JSON.parse(row.body) as T) : undefined;
  }

  async #revOf(id: string): Promise<number | undefined> {
    return (await this.#sql.get<{ rev: number }>("SELECT rev FROM nodes WHERE id = ?", [id]))?.rev;
  }

  async createSite(input: Creatable<Site>): Promise<Site> {
    const ts = this.#stamp();
    const site: Site = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.site),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("site", site);
    await this.#runUnique(
      await insertNodeStatement("site", site, ts),
      "site",
      uniquenessKey("site", site),
    );
    return site;
  }

  async getSite(id: string): Promise<Site | undefined> {
    return this.#getNode<Site>("site", id);
  }

  /** All sites, optionally filtered by project. */
  async listSites(projectId?: string): Promise<Site[]> {
    const rows = await this.#sql.all<Row>(
      "SELECT body FROM nodes WHERE kind = 'site' ORDER BY created_at, id",
    );
    const sites = rows.map((r) => JSON.parse(r.body) as Site);
    return projectId ? sites.filter((s) => s.projectId === projectId) : sites;
  }

  async updateSite(site: Site): Promise<Site> {
    const next: Site = { ...site, rev: site.rev + 1, updatedAt: this.#stamp() };
    assertValid("site", next);
    const s = await casUpdateStatement("site", next, site.rev);
    const r = await this.#sql.run(s.sql, s.params ?? []);
    if (r.changes !== 1)
      throw new ConflictError("site", site.id, site.rev, await this.#revOf(site.id));
    return next;
  }

  /**
   * Creates a page and appends it to `Site.pageIds` atomically: one batch with the site CAS, the
   * page insert (guarded on the site's new hash and on archive paths, invariant 13) and an
   * assertion, so a stale site revision changes nothing and raises a ConflictError.
   */
  async createPage(site: Site, input: Creatable<Page>): Promise<{ page: Page; site: Site }> {
    const ts = this.#stamp();
    const draft: Page = structuredClone({
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.page),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    fillMissingSrc("page", draft);
    assertValid("page", draft);
    if (draft.siteId !== site.id) throw new Error("page.siteId must match site.id");
    checkReservedPath(draft.path);
    const refs = await this.#assets.planRefs("page", site.id, draft, undefined);
    const page = refs.node;
    const nextSite: Site = {
      ...site,
      pageIds: [...site.pageIds, page.id],
      rev: site.rev + 1,
      updatedAt: ts,
    };
    assertValid("site", nextSite);
    await this.#tax.checkPagePath(page);
    const plan = await this.#tax.planPathChange(site, ts, {
      locale: page.locale,
      wasPublished: false,
      isPublished: page.status === "published",
      oldPath: undefined,
      newPath: page.path,
      source: { kind: "page", id: page.id },
    });
    const batch = new OpBatch(this.#newId(ID_PREFIX.operation), site.id, ts);
    await batch.update("site", site, nextSite);
    await batch.insert("page", page, and(this.#tax.pageGuard(page), refs.guard));
    batch.append(...refs.statements(await nodeHash(page)));
    await plan?.emit(batch);
    await runOpBatch(this.#sql, batch, {
      uniqueKind: "page",
      uniqueKey: uniquenessKey("page", page),
      diagnose: async () => {
        await this.#tax.checkPagePath(page);
        await refs.diagnose();
      },
    });
    return { page, site: nextSite };
  }

  async getPage(id: string): Promise<Page | undefined> {
    return this.#getNode<Page>("page", id);
  }

  async listPages(siteId: string): Promise<Page[]> {
    const rows = await this.#sql.all<Row>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'page' ORDER BY created_at, id",
      [siteId],
    );
    return rows.map((r) => JSON.parse(r.body) as Page);
  }

  /**
   * CAS update. The path may not enter an archive base path (invariant 13); a published page in the
   * default locale whose path changes leaves a 301 redirect (RFC-0002 accepted answer 5).
   */
  async updatePage(page: Page): Promise<Page> {
    const ts = this.#stamp();
    const draft: Page = structuredClone({ ...page, rev: page.rev + 1, updatedAt: ts });
    fillMissingSrc("page", draft);
    assertValid("page", draft);
    checkReservedPath(draft.path);
    const stored = await this.getPage(page.id);
    if (!stored || stored.rev !== page.rev)
      throw new ConflictError("page", page.id, page.rev, stored?.rev);
    const refs = await this.#assets.planRefs("page", draft.siteId, draft, stored);
    const next = refs.node;
    await this.#tax.checkPagePath(next);
    const site = await this.getSite(next.siteId);
    if (!site) throw new NotFoundError("site", next.siteId);
    const sameLocale = stored.locale === next.locale;
    const plan = await this.#tax.planPathChange(site, ts, {
      locale: next.locale,
      wasPublished: sameLocale && stored.status === "published",
      isPublished: next.status === "published",
      oldPath: sameLocale ? stored.path : undefined,
      newPath: next.path,
      source: { kind: "page", id: next.id },
    });
    const key = uniquenessKey("page", next);
    const extra = refs.statements(await nodeHash(next));
    if (!plan) {
      const r = await this.#runUnique(
        await casUpdateStatement(
          "page",
          next,
          page.rev,
          and(this.#tax.pageGuard(next), refs.guard),
        ),
        "page",
        key,
        extra,
      );
      if (r.changes !== 1) {
        const rev = await this.#revOf(page.id);
        if (rev === page.rev) {
          await this.#tax.checkPagePath(next);
          await refs.diagnose();
        }
        throw new ConflictError("page", page.id, page.rev, rev);
      }
      return next;
    }
    const batch = new OpBatch(this.#newId(ID_PREFIX.operation), site.id, ts);
    await batch.update("page", stored, next, and(this.#tax.pageGuard(next), refs.guard));
    batch.append(...extra);
    await plan.emit(batch);
    await runOpBatch(this.#sql, batch, {
      uniqueKind: "page",
      uniqueKey: key,
      diagnose: async () => {
        await this.#tax.checkPagePath(next);
        await refs.diagnose();
      },
    });
    return next;
  }

  /** Deletes a page and removes it from `Site.pageIds` atomically (CAS on both). */
  async deletePage(site: Site, page: Page): Promise<Site> {
    const ts = this.#stamp();
    const nextSite: Site = {
      ...site,
      pageIds: site.pageIds.filter((id) => id !== page.id),
      rev: site.rev + 1,
      updatedAt: ts,
    };
    assertValid("site", nextSite);
    const siteHash = await nodeHash(nextSite);
    const results = await this.#sql.batch([
      await casUpdateStatement("site", nextSite, site.rev),
      {
        sql: "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'page' AND site_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)",
        params: [page.id, page.rev, site.id, site.id, siteHash],
      },
      this.#assets.dropRefsStatement(page.id),
    ]);
    if (results[0]?.changes !== 1)
      throw new ConflictError("site", site.id, site.rev, await this.#revOf(site.id));
    if (results[1]?.changes !== 1) {
      // Site moved forward but the page was stale: surface as conflict on the page. The site change
      // stands (pageIds no longer lists the page); callers should reload both.
      throw new ConflictError("page", page.id, page.rev, await this.#revOf(page.id));
    }
    return nextSite;
  }

  /**
   * Creates an entry. Term assignments are checked (RFC-0002 invariants 1–5) and the insert is
   * guarded on every referenced term still being assignable; a deprecated non-empty `tags` is
   * translated into `terms.tag` (§4.4).
   */
  async createContentEntry(input: Creatable<ContentEntry>): Promise<ContentEntry> {
    const ts = this.#stamp();
    const entry: ContentEntry = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.contentEntry),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
      ...firstPublication(input, ts),
    };
    return this.#writeEntry(undefined, entry, ts);
  }

  async getContentEntry(id: string): Promise<ContentEntry | undefined> {
    return this.#getNode<ContentEntry>("contentEntry", id);
  }

  /**
   * Entries of a site in creation order. The string form filters by collection; the query form
   * also takes a locale, statuses and a filter expression (RFC-0002 §5), all compiled to SQL.
   */
  async listContentEntries(siteId: string, query?: string | EntryQuery): Promise<ContentEntry[]> {
    return this.#tax.listEntries(
      siteId,
      typeof query === "string" ? { collection: query } : (query ?? {}),
    );
  }

  /**
   * CAS update with the same assignment checks as create. A published entry in the default locale
   * whose slug (or collection) changes leaves a 301 redirect, with older redirects re-pointed
   * (RFC-0002 §4.5).
   */
  async updateContentEntry(entry: ContentEntry): Promise<ContentEntry> {
    const ts = this.#stamp();
    const next: ContentEntry = {
      ...entry,
      rev: entry.rev + 1,
      updatedAt: ts,
      ...firstPublication(entry, ts),
    };
    return this.#writeEntry(entry, next, ts);
  }

  async #writeEntry(
    prev: ContentEntry | undefined,
    draft: ContentEntry,
    ts: string,
  ): Promise<ContentEntry> {
    fillMissingSrc("contentEntry", draft);
    assertValid("content-entry", canonicalTerms(draft));
    const site = await this.getSite(draft.siteId);
    if (!site) throw new NotFoundError("site", draft.siteId);
    let stored: ContentEntry | undefined;
    if (prev) {
      stored = await this.getContentEntry(prev.id);
      if (!stored || stored.rev !== prev.rev)
        throw new ConflictError("contentEntry", prev.id, prev.rev, stored?.rev);
    }
    const refs = await this.#assets.planRefs("contentEntry", site.id, draft, stored);
    const prepared = await this.#tax.prepareEntry(refs.node, site, ts);
    const { entry, newTerms } = prepared;
    const guard = and(prepared.guard, refs.guard);
    const extra = refs.statements(await nodeHash(entry));
    const key = uniquenessKey("contentEntry", entry);
    const sameLocale = stored?.locale === entry.locale;
    const plan = await this.#tax.planPathChange(site, ts, {
      locale: entry.locale,
      wasPublished:
        !!stored && sameLocale && (stored.status === "published" || !!stored.publishedAt),
      isPublished: entry.status === "published",
      oldPath: stored && sameLocale ? `/${stored.collection}/${stored.slug}` : undefined,
      newPath: `/${entry.collection}/${entry.slug}`,
      source: { kind: "contentEntry", id: entry.id },
    });
    if (newTerms.length === 0 && !plan) {
      const statement = stored
        ? await casUpdateStatement("contentEntry", entry, stored.rev, guard)
        : await insertNodeStatement("contentEntry", entry, ts, guard);
      const r = await this.#runUnique(statement, "contentEntry", key, extra);
      if (r.changes !== 1) {
        const rev = await this.#revOf(entry.id);
        if (stored && rev !== stored.rev)
          throw new ConflictError("contentEntry", entry.id, stored.rev, rev);
        await this.#tax.diagnoseEntry(entry);
        await refs.diagnose();
        throw new ConflictError("contentEntry", entry.id, stored?.rev ?? 0, rev);
      }
      return entry;
    }
    const batch = new OpBatch(this.#newId(ID_PREFIX.operation), site.id, ts);
    for (const term of newTerms) await batch.insert("term", term, this.#tax.termSlugGuard(term));
    if (stored) await batch.update("contentEntry", stored, entry, guard);
    else await batch.insert("contentEntry", entry, guard);
    batch.append(...extra);
    await plan?.emit(batch);
    await runOpBatch(this.#sql, batch, {
      uniqueKind: "contentEntry",
      uniqueKey: key,
      diagnose: async () => {
        await this.#tax.diagnoseEntry(entry);
        await refs.diagnose();
      },
    });
    return entry;
  }

  async deleteContentEntry(entry: ContentEntry): Promise<void> {
    const [r] = await this.#sql.batch([
      {
        sql: "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'contentEntry' AND site_id = ?",
        params: [entry.id, entry.rev, entry.siteId],
      },
      this.#assets.dropRefsStatement(entry.id),
    ]);
    if (r?.changes !== 1)
      throw new ConflictError("contentEntry", entry.id, entry.rev, await this.#revOf(entry.id));
  }

  // ───────────────────────────── taxonomies (RFC-0002) ─────────────────────────────

  /** People only (structural). Key unique per site and not reserved; archive paths free (invariant 13). */
  async createTaxonomy(input: Creatable<Taxonomy>): Promise<Taxonomy> {
    checkReservedPath(`${input.archive?.basePath ?? ""}/`);
    return this.#tax.createTaxonomy(input);
  }

  /** `category` and `tag` with the RFC-0002 §1 settings, for those missing. Returns both. */
  createDefaultTaxonomies(site: Site, options?: DefaultTaxonomyOptions): Promise<Taxonomy[]> {
    return this.#tax.createDefaultTaxonomies(site, options);
  }

  getTaxonomy(id: string): Promise<Taxonomy | undefined> {
    return this.#tax.getTaxonomy(id);
  }

  getTaxonomyByKey(siteId: string, key: string): Promise<Taxonomy | undefined> {
    return this.#tax.getTaxonomyByKey(siteId, key);
  }

  listTaxonomies(siteId: string): Promise<Taxonomy[]> {
    return this.#tax.listTaxonomies(siteId);
  }

  /** CAS. The key is immutable; moving an enabled archive base path leaves a prefix redirect. */
  async updateTaxonomy(taxonomy: Taxonomy): Promise<Taxonomy> {
    checkReservedPath(`${taxonomy.archive?.basePath ?? ""}/`);
    return this.#tax.updateTaxonomy(taxonomy);
  }

  // ───────────────────────────── terms ─────────────────────────────

  /** `reclaim` (people only) frees a slug held by a slug history or a retired term, and its redirect. */
  async createTerm(input: Creatable<Term>, options?: { reclaim?: boolean }): Promise<Term> {
    const draft = structuredClone(input);
    fillMissingSrc("term", draft);
    return this.#tax.createTerm(draft, options);
  }

  getTerm(id: string): Promise<Term | undefined> {
    return this.#tax.getTerm(id);
  }

  /** Follows `slugHistory`, so old slugs still find the term. */
  getTermBySlug(siteId: string, key: string, slug: string): Promise<Term | undefined> {
    return this.#tax.getTermBySlug(siteId, key, slug);
  }

  listTerms(siteId: string, query?: TermQuery): Promise<Term[]> {
    return this.#tax.listTerms(siteId, query);
  }

  /** Labels, image, position and metadata; never slug, status, parent, visibility or merge state. */
  async updateTerm(term: Term): Promise<Term> {
    const draft = structuredClone(term);
    fillMissingSrc("term", draft);
    return this.#tax.updateTerm(draft);
  }

  termUsage(siteId: string, key?: string): Promise<Map<string, TermUsage>> {
    return this.#tax.termUsage(siteId, key);
  }

  resolveTerms(siteId: string, key: string, inputs: readonly string[]): Promise<Resolution[]> {
    return this.#tax.resolveTerms(siteId, key, inputs);
  }

  // ───────────────────────────── governance (one batch each; the caller snapshots once) ─────────────────────────────

  renameTerm(term: Term, slug: string, options?: { reclaim?: boolean }): Promise<GovernanceResult> {
    return this.#tax.renameTerm(term, slug, options);
  }

  mergeTerms(sources: readonly Term[], target: Term): Promise<GovernanceResult> {
    return this.#tax.mergeTerms(sources, target);
  }

  retireTerm(term: Term, options?: { redirectTo?: Term }): Promise<GovernanceResult> {
    return this.#tax.retireTerm(term, options);
  }

  setTermParent(term: Term, parentId: string | null): Promise<GovernanceResult> {
    return this.#tax.setTermParent(term, parentId);
  }

  setTermVisibility(term: Term, visibility: Term["visibility"]): Promise<GovernanceResult> {
    return this.#tax.setTermVisibility(term, visibility);
  }

  reviewTerm(term: Term, decision: ReviewDecision): Promise<GovernanceResult> {
    return this.#tax.reviewTerm(term, decision);
  }

  // ───────────────────────────── redirects ─────────────────────────────

  async createRedirect(input: Creatable<Redirect>): Promise<Redirect> {
    checkReservedPath(input.from);
    return this.#tax.createRedirect(input);
  }

  getRedirect(id: string): Promise<Redirect | undefined> {
    return this.#tax.getRedirect(id);
  }

  async updateRedirect(redirect: Redirect): Promise<Redirect> {
    checkReservedPath(redirect.from);
    return this.#tax.updateRedirect(redirect);
  }

  deleteRedirect(redirect: Redirect): Promise<void> {
    return this.#tax.deleteRedirect(redirect);
  }

  /** Ordered by `from`. */
  listRedirects(siteId: string): Promise<Redirect[]> {
    return this.#tax.listRedirects(siteId);
  }

  /** Exact `from` first, then the longest prefix redirect above `path` (rest appended to `to`). */
  redirectFor(siteId: string, path: string): Promise<RedirectMatch | undefined> {
    return this.#tax.redirectFor(siteId, path);
  }

  // ───────────────────────────── menus (RFC-0003) ─────────────────────────────

  /**
   * One guarded insert: the key is free (`key_taken`), the tree is valid (`validateMenuTree`) and
   * every target is a node of the site, no retired term (`unknown_target`). `maxDepth` comes from
   * the caller (`defaultMaxDepth(key)` for the well-known keys). The caller snapshots once.
   */
  createMenu(input: Creatable<Menu>): Promise<Menu> {
    return this.#menus.createMenu(input);
  }

  getMenu(id: string): Promise<Menu | undefined> {
    return this.#menus.getMenu(id);
  }

  getMenuByKey(siteId: string, key: string): Promise<Menu | undefined> {
    return this.#menus.getMenuByKey(siteId, key);
  }

  /** Ordered by key. */
  listMenus(siteId: string): Promise<Menu[]> {
    return this.#menus.listMenus(siteId);
  }

  /** Whole tree, CAS on `rev`, key immutable; targets the write adds are guarded (invariant 9). */
  updateMenu(menu: Menu): Promise<Menu> {
    return this.#menus.updateMenu(menu);
  }

  /** CAS delete; the site falls back to its derived default for that key. */
  deleteMenu(menu: Menu): Promise<void> {
    return this.#menus.deleteMenu(menu);
  }

  /** Menus and item ids linking to a page, entry or term (delete prompts, "In menu" badges). */
  menuReferences(siteId: string, target: TargetRef): Promise<{ menu: Menu; itemIds: string[] }[]> {
    return this.#menus.menuReferences(siteId, target);
  }

  /**
   * "Create menu from current pages" (RFC-0003 §8): page items without labels for the pages
   * today's derived header shows, plus top-level categories with a served archive on request.
   * `dryRun` returns the unsaved menu.
   */
  async createMenuFromPages(
    site: Site,
    key: string,
    options: { categories?: boolean; maxDepth?: number; dryRun?: boolean } = {},
  ): Promise<Menu> {
    const [pages, entries, taxonomies, terms] = await Promise.all([
      this.listPages(site.id),
      options.categories ? this.listContentEntries(site.id) : Promise.resolve([]),
      options.categories ? this.listTaxonomies(site.id) : Promise.resolve([]),
      options.categories ? this.listTerms(site.id) : Promise.resolve([]),
    ]);
    const items = await this.#menus.itemsFromPages(
      site,
      { pages, entries, taxonomies, terms },
      options,
    );
    const input = {
      siteId: site.id,
      key,
      maxDepth: options.maxDepth ?? this.#menus.defaultDepth(key),
      items,
    };
    if (!options.dryRun) return this.createMenu(input);
    const ts = this.#stamp();
    return {
      ...input,
      schemaVersion: 1,
      id: this.#newId(ID_PREFIX.menu),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
  }

  // ───────────────────────────── assets (RFC-0004) ─────────────────────────────

  /**
   * The buffered upload path (MCP, imports, REST images): §5.2 inspection, takedown and quota
   * checks, dedupe by content (`existing: true`), lease → put → stored → node insert.
   */
  ingestAsset(input: IngestAssetInput): Promise<IngestAssetResult> {
    return this.#assets.ingestAsset(input);
  }

  /** The streamed path for large non-image files (REST upload tickets, §5.5). */
  ingestAssetStream(input: StreamIngestInput): Promise<IngestAssetResult> {
    return this.#assets.ingestAssetStream(input);
  }

  /** Inserts an asset node once its blob is stored (or an external file, people only). */
  createAsset(input: Creatable<Asset>): Promise<{ asset: Asset; existing: boolean }> {
    return this.#assets.createAsset(input);
  }

  getAsset(id: string): Promise<Asset | undefined> {
    return this.#assets.getAsset(id);
  }

  getAssetBySha256(siteId: string, sha256: string): Promise<Asset | undefined> {
    return this.#assets.getAssetBySha256(siteId, sha256);
  }

  /** The asset behind a media URL's 16-hex prefix. */
  getAssetByPrefix(siteId: string, prefix16: string): Promise<Asset | undefined> {
    return this.#assets.getAssetByPrefix(siteId, prefix16);
  }

  getAssets(siteId: string, ids: readonly string[]): Promise<Map<string, Asset>> {
    return this.#assets.getAssets(siteId, ids);
  }

  /** Newest first, filtered, keyset-paginated. */
  listAssets(siteId: string, query?: AssetQuery): Promise<AssetPage> {
    return this.#assets.listAssets(siteId, query);
  }

  /** Title, alt, caption, credit, license, slug, decorative, placeholders, metadata (CAS). */
  updateAsset(asset: Asset): Promise<Asset> {
    return this.#assets.updateAsset(asset);
  }

  /** Hidden from pickers and not newly referable; existing uses keep rendering (invariant 6). */
  retireAsset(asset: Asset): Promise<Asset> {
    return this.#assets.retireAsset(asset);
  }

  restoreAsset(asset: Asset): Promise<Asset> {
    return this.#assets.restoreAsset(asset);
  }

  /** Invariant 9: refused while referenced (`in_use`); never deletes bytes. */
  deleteAsset(asset: Asset): Promise<void> {
    return this.#assets.deleteAsset(asset);
  }

  assetUsage(siteId: string, ids?: readonly string[]): Promise<Map<string, AssetUsage>> {
    return this.#assets.assetUsage(siteId, ids);
  }

  /** Assets an actor added since an instant (per-key daily limits, RFC-0004 §5.6). */
  assetUploadStats(actorId: string, since: string): Promise<{ count: number; bytes: number }> {
    return this.#assets.uploadStats(actorId, since);
  }

  verifyExternalAsset(asset: Asset, result: { sha256: string; bytes: number }): Promise<Asset> {
    return this.#assets.verifyExternalAsset(asset, result);
  }

  /** Upload lease (§4.5); `purged` refuses, `deleting` answers `retry`. */
  leaseBlob(
    siteId: string,
    sha256: string,
    until: string,
    meta: { bytes: number; mediaType: string; originalSha256?: string },
  ): Promise<"uploading" | "stored"> {
    return this.#assets.leaseBlob(siteId, sha256, until, meta);
  }

  markBlobStored(
    siteId: string,
    meta: { sha256: string; bytes: number; mediaType: string; originalSha256?: string },
  ): Promise<void> {
    return this.#assets.markBlobStored(siteId, meta);
  }

  blobState(siteId: string, sha256: string): Promise<BlobLedgerRow | undefined> {
    return this.#assets.blobState(siteId, sha256);
  }

  /** Deletes unreferenced, unleased content older than the grace period (default 24 h). */
  collectMediaGarbage(
    siteId: string,
    options?: { graceHours?: number; limit?: number; dryRun?: boolean },
  ): Promise<GcResult> {
    return this.#assets.collectMediaGarbage(siteId, options);
  }

  /** Takedown (owner only; the caller checks and audits): 410, or 451 when `legal`. */
  purgeBlob(
    siteId: string,
    sha256: string,
    by: Actor,
    reason: { text: string; legal: boolean },
  ): Promise<{ asset?: Asset }> {
    return this.#assets.purgeBlob(siteId, sha256, by, reason);
  }

  liftPurge(siteId: string, sha256: string, by: Actor): Promise<boolean> {
    return this.#assets.liftPurge(siteId, sha256, by);
  }

  /** The stored bytes of a site's content (static builds, verification). */
  readMediaBlob(siteId: string, sha256: string): Promise<Uint8Array | undefined> {
    return this.#assets.readBlob(siteId, sha256);
  }

  /** Recomputes a stored blob's SHA-256 (`cloudhal media verify`). */
  verifyMediaBlob(siteId: string, sha256: string): Promise<"ok" | "missing" | "mismatch"> {
    return this.#assets.verifyBlob(siteId, sha256);
  }

  /** The asset holding this content (stored or as-uploaded SHA-256); refuses taken-down content. */
  assetForUploadedContent(siteId: string, sha256: string): Promise<Asset | undefined> {
    return this.#assets.assetForUploadedContent(siteId, sha256);
  }

  /** Single-use upload tickets (§5.5), all or none; undefined past `maxOpen` open tickets. */
  openUploadTickets(
    siteId: string,
    actor: Pick<Actor, "kind" | "id">,
    files: readonly UploadTicketRequest[],
    options: { ttlMs: number; maxOpen: number; now?: Date | undefined },
  ): Promise<UploadTicket[] | undefined> {
    return this.#assets.openUploadTickets(siteId, actor, files, options);
  }

  /** Open, unexpired upload tickets an actor holds. */
  openUploadCount(actor: Pick<Actor, "kind" | "id">, now?: Date): Promise<number> {
    return this.#assets.openUploadCount(actor, now);
  }

  getUploadTicket(id: string): Promise<UploadTicket | undefined> {
    return this.#assets.getUploadTicket(id);
  }

  /** `open` → `used` once; false for a used, expired or unknown ticket. */
  claimUploadTicket(id: string, now?: Date): Promise<boolean> {
    return this.#assets.claimUploadTicket(id, now);
  }

  /** The added assets an `auto`-mode publish may carry with their articles (§6.3). */
  ridingAssets(siteId: string, diff: SnapshotDiff): Promise<Set<string>> {
    return this.#assets.ridingAssets(siteId, diff);
  }

  /** The blob store, for media routes and adapters that stream (`getStream`). */
  get blobs(): BlobStore {
    return this.#blobs;
  }

  // ───────────────────────────── migration (RFC-0002 Compatibility) ─────────────────────────────

  /** `tags` → `terms.tag`, resumable and idempotent; snapshots before and after. */
  migrateTagsToTerms(
    siteId: string,
    actor: Actor,
    options?: { dryRun?: boolean },
  ): Promise<TagsMigrationResult> {
    return migrateTagsToTerms(this.#migrationContext(), siteId, actor, options);
  }

  /** Restores `tags` for entries unchanged since the migration and removes what it created. */
  revertTagsToTerms(
    siteId: string,
    migrationId: string,
    options?: { actor?: Actor },
  ): Promise<TagsRevertResult> {
    return revertTagsToTerms(this.#migrationContext(), siteId, migrationId, options);
  }

  #migrationContext() {
    return {
      store: this,
      sql: this.#sql,
      stamp: () => this.#stamp(),
      newId: (prefix: string) => this.#newId(prefix),
      termSlugGuard: (term: Term): Cond => this.#tax.termSlugGuard(term),
    };
  }

  // ───────────────────────────── snapshots ─────────────────────────────

  /** All node refs of a site at this instant, sorted by id. */
  async currentNodeRefs(siteId: string): Promise<NodeRef[]> {
    const rows = await this.#sql.all<Pick<Row, "id" | "kind" | "rev" | "hash">>(
      "SELECT id, kind, rev, hash FROM nodes WHERE site_id = ? ORDER BY id",
      [siteId],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, rev: r.rev, hash: r.hash }));
  }

  /**
   * Records an immutable snapshot of the site: node refs with content hashes, node bodies copied to
   * the blob store under `nodes/<hash>.json`, summary relative to the previous snapshot.
   */
  async createSnapshot(siteId: string, input: SnapshotInput): Promise<Snapshot> {
    const site = await this.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    const rows = await this.#sql.all<Row>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
      siteId,
    ]);
    for (const row of rows) {
      const key = `nodes/${row.hash}.json`;
      if (!(await this.#blobs.head(key))) {
        await this.#blobs.put(key, new TextEncoder().encode(row.body), {
          contentType: "application/json",
        });
      }
    }
    const nodes: NodeRef[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      rev: r.rev,
      hash: r.hash,
    }));
    const parent = await this.latestSnapshot(siteId);
    const diff = diffNodeRefs(parent?.nodes ?? [], nodes);
    const snapshot: Snapshot = {
      schemaVersion: 1,
      id: this.#newId(ID_PREFIX.snapshot),
      siteId,
      ...(parent ? { parentId: parent.id } : {}),
      siteRev: site.rev,
      reason: input.reason,
      ...(input.label !== undefined ? { label: input.label } : {}),
      actor: input.actor,
      nodes,
      summary: {
        added: diff.added.length,
        changed: diff.changed.length,
        removed: diff.removed.length,
      },
      createdAt: this.#stamp(),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    };
    assertValid("snapshot", snapshot);
    // Snapshots record the content their blob assets need, in the same batch (RFC-0004 §4.4).
    const blobs = this.#assets.snapshotBlobsStatement(
      snapshot.id,
      siteId,
      rows.filter((r) => r.kind === "asset").map((r) => r.body),
    );
    await this.#sql.batch([
      {
        sql: "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          snapshot.id,
          siteId,
          snapshot.parentId ?? null,
          snapshot.siteRev,
          canonicalJson(snapshot),
          snapshot.createdAt,
        ],
      },
      ...(blobs ? [blobs] : []),
    ]);
    return snapshot;
  }

  async getSnapshot(id: string): Promise<Snapshot | undefined> {
    const row = await this.#sql.get<{ body: string }>("SELECT body FROM snapshots WHERE id = ?", [
      id,
    ]);
    return row ? (JSON.parse(row.body) as Snapshot) : undefined;
  }

  async latestSnapshot(siteId: string): Promise<Snapshot | undefined> {
    const row = await this.#sql.get<{ body: string }>(
      "SELECT body FROM snapshots WHERE site_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      [siteId],
    );
    return row ? (JSON.parse(row.body) as Snapshot) : undefined;
  }

  /** Newest first. */
  async listSnapshots(siteId: string, limit = 50): Promise<Snapshot[]> {
    const rows = await this.#sql.all<{ body: string }>(
      "SELECT body FROM snapshots WHERE site_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      [siteId, limit],
    );
    return rows.map((r) => JSON.parse(r.body) as Snapshot);
  }

  /** Reads a node body as it was captured in a snapshot (from the blob store). */
  async readSnapshotNode<T extends SiteNode = SiteNode>(ref: NodeRef): Promise<T> {
    const bytes = await this.#blobs.get(`nodes/${ref.hash}.json`);
    if (!bytes) throw new NotFoundError("blob", ref.hash);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  /**
   * A digest of the site's current content (every node's id, rev and hash). Approvals are bound to
   * it: if anything changes between "may I publish?" and the publish, the approval no longer holds.
   */
  async stateHash(siteId: string): Promise<string> {
    const refs = await this.currentNodeRefs(siteId);
    return sha256Hex(refs.map((r) => `${r.id}@${r.rev}:${r.hash}`).join("\n"));
  }

  /** What would change if the current state were published, against the live snapshot. */
  async pendingChanges(siteId: string): Promise<SnapshotDiff> {
    const site = await this.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    const live = site.publishedSnapshotId
      ? await this.getSnapshot(site.publishedSnapshotId)
      : undefined;
    const diff = diffNodeRefs(live?.nodes ?? [], await this.currentNodeRefs(siteId));
    // Publishing itself rewrites the site node (its pointer, rev and timestamp). That is not a
    // change a person needs to approve, so a site node that differs only there is left out.
    const siteChange = diff.changed.find((c) => c.after.kind === "site");
    if (siteChange) {
      const before = await this.readSnapshotNode<Site>(siteChange.before);
      const strip = ({ publishedSnapshotId: _p, rev: _r, updatedAt: _u, ...rest }: Site) => rest;
      if (canonicalJson(strip(before)) === canonicalJson(strip(site)))
        return { ...diff, changed: diff.changed.filter((c) => c !== siteChange) };
    }
    return diff;
  }

  async diffSnapshots(fromId: string, toId: string): Promise<SnapshotDiff> {
    const [from, to] = await Promise.all([this.getSnapshot(fromId), this.getSnapshot(toId)]);
    if (!from) throw new NotFoundError("snapshot", fromId);
    if (!to) throw new NotFoundError("snapshot", toId);
    return diffNodeRefs(from.nodes, to.nodes);
  }

  /**
   * Runs the `onPublished` hook (cache purge) for a pointer change that did not go through
   * `publish` — e.g. a site imported with `cloudhal push --replace`. Pass the snapshot that was
   * live before, so the purge can be limited to what changed; without it everything is purged.
   */
  async notifyPublished(site: Site, previousSnapshotId?: string): Promise<void> {
    await this.#runOnPublished(site, {
      ...(previousSnapshotId ? { from: previousSnapshotId } : {}),
      ...(site.publishedSnapshotId ? { to: site.publishedSnapshotId } : {}),
    });
  }

  /**
   * Which edge-cache tags a pointer move from `change.from` to `change.to` must purge (RFC-0002
   * §7): the tags of the nodes that differ between the two snapshots, or everything when that
   * cannot be worked out. See `cache-purge.ts` for the rules.
   */
  planCachePurge(change: PublishChange, options?: CachePurgeOptions): Promise<CachePurgePlan> {
    return planCachePurge(this, change.from, change.to, options);
  }

  /** Points production at a snapshot (CAS on the site). */
  async publish(site: Site, snapshotId: string): Promise<Site> {
    const snap = await this.getSnapshot(snapshotId);
    if (!snap || snap.siteId !== site.id) throw new NotFoundError("snapshot", snapshotId);
    const updated = await this.updateSite({ ...site, publishedSnapshotId: snapshotId });
    await this.#runOnPublished(updated, {
      ...(site.publishedSnapshotId ? { from: site.publishedSnapshotId } : {}),
      to: snapshotId,
    });
    return updated;
  }

  async #runOnPublished(site: Site, change: PublishChange): Promise<void> {
    if (!this.#onPublished) return;
    try {
      await this.#onPublished(site, change);
    } catch (e) {
      this.#onHookError(e);
    }
  }

  /**
   * Rolls production back to an earlier snapshot: the target must be an ancestor of the currently
   * published snapshot. Records a `rollback` snapshot so the history shows what happened.
   */
  async rollback(
    site: Site,
    targetSnapshotId: string,
    actor: Actor,
  ): Promise<{ site: Site; snapshot: Snapshot }> {
    if (!site.publishedSnapshotId)
      throw new Error("site has no published snapshot to roll back from");
    if (!(await this.#isAncestor(targetSnapshotId, site.publishedSnapshotId))) {
      throw new Error(
        `snapshot ${targetSnapshotId} is not an ancestor of the published snapshot ${site.publishedSnapshotId}`,
      );
    }
    const updated = await this.publish(site, targetSnapshotId);
    const snapshot = await this.createSnapshot(site.id, {
      actor,
      reason: "rollback",
      label: `rollback to ${targetSnapshotId}`,
    });
    return { site: updated, snapshot };
  }

  async #isAncestor(ancestorId: string, descendantId: string): Promise<boolean> {
    let cursor: string | undefined = descendantId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const snap = await this.getSnapshot(cursor);
      if (!snap) return false;
      if (snap.parentId === ancestorId) return true;
      cursor = snap.parentId;
    }
    return false;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  /** One write (plus anchored index statements, in one batch); unique violations mapped. */
  async #runUnique(
    statement: SqlStatement,
    kind: string,
    key: string,
    extra: readonly SqlStatement[] = [],
  ): Promise<{ changes: number }> {
    try {
      if (extra.length === 0) return await this.#sql.run(statement.sql, statement.params ?? []);
      const [first] = await this.#sql.batch([statement, ...extra]);
      return { changes: first?.changes ?? 0 };
    } catch (e) {
      if (isUniqueViolation(e)) throw new UniqueConstraintError(kind, key);
      throw e;
    }
  }
}

/** Invariant 12 (RFC-0004): `/media/<16 hex>/…` belongs to the media route. */
function checkReservedPath(path: string | undefined): void {
  if (path && isReservedMediaPath(path))
    throw new InvariantError(
      "reserved_path",
      `${path} is reserved for media URLs (/media/<16 hex>/…); choose another path`,
    );
}

/** Set difference of node refs by id; a node is "changed" when its hash differs. */
export function diffNodeRefs(before: readonly NodeRef[], after: readonly NodeRef[]): SnapshotDiff {
  const b = new Map(before.map((n) => [n.id, n]));
  const a = new Map(after.map((n) => [n.id, n]));
  const added: NodeRef[] = [];
  const removed: NodeRef[] = [];
  const changed: Array<{ before: NodeRef; after: NodeRef }> = [];
  for (const [id, node] of a) {
    const prev = b.get(id);
    if (!prev) added.push(node);
    else if (prev.hash !== node.hash) changed.push({ before: prev, after: node });
  }
  for (const [id, node] of b) if (!a.has(id)) removed.push(node);
  return { added, removed, changed };
}
