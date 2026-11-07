import {
  type Actor,
  type Asset,
  assertValid,
  type ContentEntry,
  type Correction,
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
import { checkAvailability, type GateSupport, sameAvailability } from "./availability.ts";
import { type BlockRegistry, createBlockRegistry, type PropsSchema } from "./blocks.ts";
import { readSnapshotBundle, writeSnapshotBundle } from "./bundles.ts";
import { type CachePurgeOptions, type CachePurgePlan, planCachePurge } from "./cache-purge.ts";
import type { CollectionInfo } from "./collections.ts";
import { addedCorrections, type CorrectionInput } from "./corrections.ts";
import { ConflictError, InvariantError, NotFoundError } from "./errors.ts";
import { canonicalJson, nodeHash, sha256Hex } from "./hash.ts";
import {
  assertHoldsKept,
  assertUnlocked,
  composeWithHolds,
  type NodeHold,
  readHolds,
} from "./holds.ts";
import { ID_PREFIX, newId } from "./ids.ts";
import { fillMissingSrc } from "./media/refs.ts";
import { MEDIA_LIMITS } from "./media/types.ts";
import type { TargetRef } from "./menu.ts";
import { MenuEngine } from "./menu-store.ts";
import type { Resolution } from "./names.ts";
import { type Cond, mapUniqueViolation, type Row } from "./node-sql.ts";
import type { Creatable, NodeKind, SiteNode } from "./nodes.ts";
import { BodyProposals } from "./proposals.ts";
import type { RedirectMatch } from "./redirects.ts";
import {
  type PublishReleaseInput,
  type PublishReleaseResult,
  publishRelease,
} from "./release-apply.ts";
import { type SearchOptions, type SearchResults, searchStatements } from "./search.ts";
import {
  migrateTagsToTerms,
  revertTagsToTerms,
  type TagsMigrationResult,
  type TagsRevertResult,
} from "./tags-migration.ts";
import {
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

import type { StoreContext } from "./store/context.ts";
import { EntryEngine } from "./store/entries.ts";
import { GlossaryEngine } from "./store/glossary.ts";
import { PageEngine } from "./store/pages.ts";
import { SearchEngine } from "./store/search.ts";
import { SiteEngine } from "./store/sites.ts";
import { isAncestor, SnapshotEngine } from "./store/snapshots.ts";
import { readTranslationGroup, type TranslationGroup } from "./store/translations.ts";
import {
  firstPublication,
  type NodeWriteOptions,
  type PublishChange,
  type SiteGraphStoreOptions,
  type SnapshotDiff,
  type SnapshotInput,
} from "./store/types.ts";
import { checkReservedPath, diffNodeRefs } from "./store/validation.ts";

export type { TranslationGroup, TranslationMember } from "./store/translations.ts";
export type {
  NodeWriteOptions,
  PublishChange,
  SiteGraphStoreOptions,
  SnapshotDiff,
  SnapshotInput,
} from "./store/types.ts";
export { diffNodeRefs } from "./store/validation.ts";

export class SiteGraphStore {
  readonly #sql: SqlDriver;
  readonly #blobs: BlobStore;
  readonly #now: () => Date;
  readonly #newId: (prefix: string) => string;
  /** Body proposals (RFC-0014 §5): operations agents filed for a person to accept or reject. */
  readonly proposals: BodyProposals;
  readonly glossary: GlossaryEngine; // RFC-0033: the site's translation glossary
  readonly #tax: TaxonomyEngine;
  readonly #menus: MenuEngine;
  readonly #assets: AssetEngine;
  readonly #sites: SiteEngine;
  readonly #pages: PageEngine;
  readonly #entries: EntryEngine;
  readonly #snapshots: SnapshotEngine;
  readonly #search: SearchEngine;

  constructor(options: SiteGraphStoreOptions) {
    this.#sql = options.sql;
    this.#blobs = options.blobs;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.idGen ?? newId;
    this.#gates = options.gates;
    this.blocks = options.blocks ?? createBlockRegistry();
    this.themeSettings = options.themeSettings;
    this.themeDesign = options.themeDesign;
    this.#onPublished = options.onPublished;
    this.#onHookError = options.onHookError ?? ((e) => console.error("onPublished failed:", e));
    this.proposals = new BodyProposals({
      sql: this.#sql,
      graph: this,
      newId: () => this.#newId(ID_PREFIX.proposal),
      now: () => this.#stamp(),
    });
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
    const ctx: StoreContext = {
      graph: this,
      sql: this.#sql,
      blobs: this.#blobs,
      stamp: () => this.#stamp(),
      newId: (prefix) => this.#newId(prefix),
      tax: this.#tax,
      assets: this.#assets,
      revOf: (id) => this.#revOf(id),
      runUnique: (statement, kind, key, extra) => this.#runUnique(statement, kind, key, extra),
      checkGates: (siteId, before, after) => this.#checkGates(siteId, before, after),
      liveEntry: (site, id) => this.#liveEntry(site, id),
      shownLive: (site, id) => this.#shownLive(site, id),
    };
    this.#sites = new SiteEngine(ctx);
    this.#pages = new PageEngine(ctx);
    this.glossary = new GlossaryEngine(ctx);
    this.#entries = new EntryEngine(ctx);
    this.#snapshots = new SnapshotEngine(ctx);
    this.#search = new SearchEngine({
      sql: this.#sql,
      graph: this,
      stamp: () => this.#stamp(),
      onError: (e) => this.#onHookError(e),
      provider: options.search,
    });
  }

  readonly #onPublished: SiteGraphStoreOptions["onPublished"];
  readonly #onHookError: (error: unknown) => void;
  readonly #gates: GateSupport | undefined;
  /** RFC-0015: the block types component sections are checked against. */
  readonly blocks: BlockRegistry;
  /** RFC-0017: the theme's design settings, when it declares any. */
  readonly themeSettings: PropsSchema | undefined;
  /** RFC-0021: the theme's DESIGN.md, when it ships one. */
  readonly themeDesign: string | undefined;

  /**
   * Whether `availability` may be written for this site (S15): the renderer serving it has
   * confirmed it enforces gates (`version` 2: derived gates, RFC-0042 §3.6). Imports ask it too.
   */
  async gatesEnforced(siteId: string, version = 1): Promise<boolean> {
    return (await this.#gates?.enforced(siteId, version)) === true;
  }

  /**
   * The gate rules of a page or entry write (RFC-0008 §4.1, §7.7): gates that parse, `from` before
   * `until`, and none set or changed until the site's renderer enforces them. Removing gates is
   * always allowed here; who may lift an embargo is the policy layer's decision (D8).
   */
  async #checkGates(
    siteId: string,
    before: Page["availability"],
    after: Page["availability"],
  ): Promise<void> {
    if (sameAvailability(before, after) || !after) return;
    checkAvailability(after);
    if (!(await this.gatesEnforced(siteId)))
      throw new InvariantError(
        "gates_unsupported",
        "this site's renderer has not confirmed it enforces time gates (availability); deploy the current site Worker first",
        { siteId },
      );
  }

  /**
   * Whether the live (published) version of an entry has been shown: it is published there and
   * its embargo, if any, has passed. One snapshot row and one body read; only asked when a write
   * moves an embargo.
   */
  /** The live version of an entry (in the published snapshot), if any. */
  async #liveEntry(site: Site, id: string): Promise<ContentEntry | undefined> {
    if (!site.publishedSnapshotId) return undefined;
    const live = await this.getSnapshot(site.publishedSnapshotId);
    const ref = live?.nodes.find((n) => n.id === id && n.kind === "contentEntry");
    return ref ? this.readSnapshotNode<ContentEntry>(ref) : undefined;
  }

  async #shownLive(site: Site, id: string): Promise<boolean> {
    const node = await this.#liveEntry(site, id);
    if (!node) return false;
    const from = node.availability?.from;
    return (
      node.status === "published" &&
      (from === undefined || Date.parse(from) <= this.#now().getTime())
    );
  }

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
    return this.#sites.create(input);
  }

  async getSite(id: string): Promise<Site | undefined> {
    return this.#getNode<Site>("site", id);
  }

  /** RFC-0033: every language version of `group` in the site's project, with staleness. */
  translationGroup(site: Site, group: string): Promise<TranslationGroup> {
    return readTranslationGroup(this, this.#sql, site, group);
  }

  /** All sites, optionally filtered by project. */
  async listSites(projectId?: string): Promise<Site[]> {
    const rows = await this.#sql.all<Row>(
      "SELECT body FROM nodes WHERE kind = 'site' ORDER BY created_at, id",
    );
    const sites = rows.map((r) => JSON.parse(r.body) as Site);
    return projectId ? sites.filter((s) => s.projectId === projectId) : sites;
  }

  async updateSite(site: Site, options?: { dryRun?: boolean }): Promise<Site> {
    return this.#sites.update(site, undefined, options);
  }

  /**
   * Creates a page and appends it to `Site.pageIds` atomically: one batch with the site CAS, the
   * page insert (guarded on the site's new hash and on archive paths, invariant 13) and an
   * assertion, so a stale site revision changes nothing and raises a ConflictError.
   */
  async createPage(
    site: Site,
    input: Creatable<Page>,
    options: NodeWriteOptions = {},
  ): Promise<{ page: Page; site: Site }> {
    return this.#pages.createPage(site, input, options);
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
  async updatePage(page: Page, options: NodeWriteOptions = {}): Promise<Page> {
    return this.#pages.updatePage(page, options);
  }

  /** Deletes a page and removes it from `Site.pageIds` atomically (CAS on both). */
  async deletePage(site: Site, page: Page): Promise<Site> {
    return this.#pages.deletePage(site, page);
  }

  /**
   * Creates an entry. Term assignments are checked (RFC-0002 invariants 1–5) and the insert is
   * guarded on every referenced term still being assignable; a deprecated non-empty `tags` is
   * translated into `terms.tag` (§4.4).
   */
  async createContentEntry(
    input: Creatable<ContentEntry>,
    options: NodeWriteOptions = {},
  ): Promise<ContentEntry> {
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
    return this.#entries.write(undefined, entry, ts, options);
  }

  /** RFC-0040: declared collections, those inferred from entries, and `posts`, with counts. */
  listCollections(siteId: string): Promise<CollectionInfo[]> {
    return this.#sites.collections(siteId);
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
  async updateContentEntry(
    entry: ContentEntry,
    options: NodeWriteOptions = {},
  ): Promise<ContentEntry> {
    const ts = this.#stamp();
    const next: ContentEntry = {
      ...entry,
      rev: entry.rev + 1,
      updatedAt: ts,
      ...firstPublication(entry, ts),
    };
    return this.#entries.write(entry, next, ts, options);
  }

  /**
   * RFC-0019 §2: appends a correction to the entry's working version (CAS on `entry.rev`). The
   * store sets its id and time; it goes live with the next publish.
   */
  async addCorrection(
    entry: ContentEntry,
    correction: Pick<CorrectionInput, "kind" | "note">,
    options: NodeWriteOptions = {},
  ): Promise<ContentEntry> {
    const item = { kind: correction.kind, note: correction.note } as CorrectionInput;
    return this.updateContentEntry(
      {
        ...entry,
        corrections: [...(entry.corrections ?? []), item] as Correction[],
      },
      options,
    );
  }

  /**
   * RFC-0019 §2.4: the entries in a pending publish that add a correction to their live version.
   * Such a publish waits for a person even in `auto` mode.
   */
  async correctingEntries(siteId: string, diff: SnapshotDiff): Promise<Set<string>> {
    const site = await this.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    const out = new Set<string>();
    const refs = [...diff.added, ...diff.changed.map((c) => c.after)].filter(
      (r) => r.kind === "contentEntry",
    );
    for (const ref of refs) {
      const working = await this.getContentEntry(ref.id);
      if (!working?.corrections?.length) continue;
      if (addedCorrections(await this.#liveEntry(site, ref.id), working).length > 0)
        out.add(ref.id);
    }
    return out;
  }

  deleteContentEntry(entry: ContentEntry): Promise<void> {
    return this.#entries.delete(entry);
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

  /** RFC-0019 §1: the `author` taxonomy for bylines, created when missing. */
  createAuthorTaxonomy(site: Site): Promise<Taxonomy> {
    return this.#tax.createAuthorTaxonomy(site);
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
    await assertUnlocked(this.#sql, taxonomy.siteId, [taxonomy.id]);
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
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
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

  async renameTerm(
    term: Term,
    slug: string,
    options?: { reclaim?: boolean },
  ): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
    return this.#tax.renameTerm(term, slug, options);
  }

  async mergeTerms(sources: readonly Term[], target: Term): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, target.siteId, [...sources.map((t) => t.id), target.id]);
    return this.#tax.mergeTerms(sources, target);
  }

  async retireTerm(term: Term, options?: { redirectTo?: Term }): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
    return this.#tax.retireTerm(term, options);
  }

  async setTermParent(term: Term, parentId: string | null): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
    return this.#tax.setTermParent(term, parentId);
  }

  async setTermVisibility(term: Term, visibility: Term["visibility"]): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
    return this.#tax.setTermVisibility(term, visibility);
  }

  async reviewTerm(term: Term, decision: ReviewDecision): Promise<GovernanceResult> {
    await assertUnlocked(this.#sql, term.siteId, [term.id]);
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
    await assertUnlocked(this.#sql, redirect.siteId, [redirect.id]);
    return this.#tax.updateRedirect(redirect);
  }

  async deleteRedirect(redirect: Redirect): Promise<void> {
    await assertUnlocked(this.#sql, redirect.siteId, [redirect.id]);
    return this.#tax.deleteRedirect(redirect);
  }

  /** Ordered by `from`. */
  listRedirects(siteId: string): Promise<Redirect[]> {
    return this.#tax.listRedirects(siteId);
  }

  /** Exact `from` first, then the longest prefix redirect above `path` (rest appended to `to`). */
  redirectFor(siteId: string, path: string, locale?: string): Promise<RedirectMatch | undefined> {
    return this.#tax.redirectFor(siteId, path, locale);
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
  async updateMenu(menu: Menu): Promise<Menu> {
    await assertUnlocked(this.#sql, menu.siteId, [menu.id]);
    return this.#menus.updateMenu(menu);
  }

  /** CAS delete; the site falls back to its derived default for that key. */
  async deleteMenu(menu: Menu): Promise<void> {
    await assertUnlocked(this.#sql, menu.siteId, [menu.id]);
    return this.#menus.deleteMenu(menu);
  }

  /** Menus and item ids linking to a page, entry or term (delete prompts, "In menu" badges). */
  menuReferences(siteId: string, target: TargetRef): Promise<{ menu: Menu; itemIds: string[] }[]> {
    return this.#menus.menuReferences(siteId, target);
  }

  /**
   * "Create menu from current pages" (RFC-0003 §8): unlabelled items for the pages the derived
   * header shows, plus top-level categories with a served archive on request; `dryRun` unsaved.
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
    const id = this.#newId(ID_PREFIX.menu);
    return { ...input, schemaVersion: 1, id, rev: 0, createdAt: ts, updatedAt: ts };
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
  async updateAsset(asset: Asset): Promise<Asset> {
    await assertUnlocked(this.#sql, asset.siteId, [asset.id]);
    return this.#assets.updateAsset(asset);
  }

  /** Hidden from pickers and not newly referable; existing uses keep rendering (invariant 6). */
  async retireAsset(asset: Asset): Promise<Asset> {
    await assertUnlocked(this.#sql, asset.siteId, [asset.id]);
    return this.#assets.retireAsset(asset);
  }

  async restoreAsset(asset: Asset): Promise<Asset> {
    await assertUnlocked(this.#sql, asset.siteId, [asset.id]);
    return this.#assets.restoreAsset(asset);
  }

  /** Invariant 9: refused while referenced (`in_use`); never deletes bytes. */
  async deleteAsset(asset: Asset): Promise<void> {
    await assertUnlocked(this.#sql, asset.siteId, [asset.id]);
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

  /**
   * The SQL driver, for packages that keep their own tables in the same database and must write
   * in step with the graph (`@cloudhal/core-ts/releases` over `@cloudhal/schedules`).
   */
  get sql(): SqlDriver {
    return this.#sql;
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
    return this.#snapshots.create(siteId, input);
  }

  /** The bodies of `snapshot` by node hash from its bundle, or undefined (RFC-0010). */
  readSnapshotBundle(snapshot: Snapshot): Promise<Map<string, unknown> | undefined> {
    return readSnapshotBundle(this.#blobs, snapshot);
  }

  /**
   * Writes `snapshot`'s bundle (RFC-0010). Bodies come from `known` (hash → stored JSON text) or are
   * read from `nodes/<hash>.json`.
   */
  async writeSnapshotBundle(
    snapshot: Snapshot,
    known: ReadonlyMap<string, string> = new Map(),
  ): Promise<void> {
    const decoder = new TextDecoder();
    await writeSnapshotBundle(this.#blobs, snapshot, async (ref) => {
      const text = known.get(ref.hash);
      if (text !== undefined) return text;
      const bytes = await this.#blobs.get(`nodes/${ref.hash}.json`);
      if (!bytes) throw new NotFoundError("blob", ref.hash);
      return decoder.decode(bytes);
    });
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
    const lines = refs.map((r) => `${r.id}@${r.rev}:${r.hash}`);
    // RFC-0008 §6.2: what a publish would take changes when a node is held or released, so the
    // holds are part of the state an approval is bound to (no holds: the digest is unchanged).
    const held = [...(await readHolds(this.#sql, siteId)).keys()].sort();
    for (const id of held) lines.push(`held ${id}`);
    return sha256Hex(lines.join("\n"));
  }

  /**
   * Nodes held by releases awaiting approval, scheduled or running (RFC-0008 §6.2): node id → the
   * releases holding it, in time order. Locked against edits, kept live-as-is by publishes.
   */
  heldNodes(siteId: string, nodeIds?: readonly string[]): Promise<Map<string, NodeHold[]>> {
    return readHolds(this.#sql, siteId, nodeIds);
  }

  /**
   * What would change if the current state were published, against the live snapshot. Nodes held
   * by a release stay at their live version (RFC-0008 §6.2), exactly as `createSnapshot` with
   * reason `publish` composes them, so what a person approves is what goes live.
   */
  async pendingChanges(siteId: string): Promise<SnapshotDiff> {
    const site = await this.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    const live = site.publishedSnapshotId
      ? await this.getSnapshot(site.publishedSnapshotId)
      : undefined;
    const held = new Set((await readHolds(this.#sql, siteId)).keys());
    const diff = diffNodeRefs(
      live?.nodes ?? [],
      composeWithHolds(await this.currentNodeRefs(siteId), live?.nodes, held),
    );
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
    await this.refreshSearch(site.id).catch((e: unknown) => this.#onHookError(e));
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

  /**
   * Points production at a snapshot (CAS on the site). A snapshot that would move a node held by a
   * release away from its live version is refused (`scheduled_locked`, RFC-0008 S5): publish one
   * made with reason `publish`, which keeps held nodes live-as-is.
   */
  async publish(site: Site, snapshotId: string): Promise<Site> {
    const snap = await this.getSnapshot(snapshotId);
    if (!snap || snap.siteId !== site.id) throw new NotFoundError("snapshot", snapshotId);
    const holds = await readHolds(this.#sql, site.id);
    if (holds.size > 0) {
      const live = site.publishedSnapshotId
        ? await this.getSnapshot(site.publishedSnapshotId)
        : undefined;
      assertHoldsKept(snap.nodes, live?.nodes, holds);
    }
    return this.#publishPointer(site, snapshotId);
  }

  async #publishPointer(site: Site, snapshotId: string): Promise<Site> {
    // RFC-0019 §3: the search index follows the pointer in the same batch.
    const plan = await this.#search.plan(site.id, snapshotId);
    const updated = await this.#sites.update(
      { ...site, publishedSnapshotId: snapshotId },
      plan ? (guard, at) => searchStatements(plan, guard, at) : undefined,
    );
    await this.#search.synced(site.id, plan);
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
    if (
      !(await isAncestor((id) => this.getSnapshot(id), targetSnapshotId, site.publishedSnapshotId))
    ) {
      throw new Error(
        `snapshot ${targetSnapshotId} is not an ancestor of the published snapshot ${site.publishedSnapshotId}`,
      );
    }
    // A rollback may move held nodes: their releases become conflicts when they run (§6.2).
    const target = await this.getSnapshot(targetSnapshotId);
    if (!target || target.siteId !== site.id) throw new NotFoundError("snapshot", targetSnapshotId);
    const updated = await this.#publishPointer(site, targetSnapshotId);
    const snapshot = await this.createSnapshot(site.id, {
      actor,
      reason: "rollback",
      label: `rollback to ${targetSnapshotId}`,
    });
    return { site: updated, snapshot };
  }

  /**
   * Applies a claimed release on top of whatever is live (RFC-0008 §6.3; `release-apply.ts`):
   * conflicts checked before the batch and the site CAS inside it (S4), `nodes(S) = nodes(L) − ids
   * + targets` (S1), a `scheduled` snapshot, the pointer flip and the release, run and audit rows in
   * one guarded batch of at most eight statements. Reads: the site row, the live snapshot and the
   * latest one (a recovered run: one more). It does not call `onPublished`: the release's purge plan
   * was computed when it was pinned, and the caller (`releaseExecutor`) sends it.
   */
  async publishRelease(input: PublishReleaseInput): Promise<PublishReleaseResult> {
    const result = await publishRelease(
      {
        sql: this.#sql,
        blobs: this.#blobs,
        newId: (prefix) => this.#newId(prefix),
        getSnapshot: (id) => this.getSnapshot(id),
        latestSnapshot: (id) => this.latestSnapshot(id),
      },
      input,
    );
    // RFC-0019 §3: the release's batch has no room for the index; it follows right after.
    await this.refreshSearch(input.release.siteId).catch((e: unknown) => this.#onHookError(e));
    return result;
  }

  /**
   * RFC-0019 §3: brings the site's search index to its live snapshot (after a release or an
   * import, or `cloudhal search reindex` with `full`). Guarded on the site row as read here.
   */
  refreshSearch(siteId: string, options: { full?: boolean } = {}): Promise<void> {
    return this.#search.refresh(siteId, options);
  }

  /** RFC-0019 §3: the snapshot the site's search index reflects and how many rows it holds. */
  searchStatus(siteId: string): Promise<{ snapshotId: string; entries: number } | undefined> {
    return this.#search.status(siteId);
  }

  /** RFC-0029 §1: what readers find, through the site's search provider (FTS5 by default). */
  search(siteId: string, query: string, options: SearchOptions): Promise<SearchResults> {
    return this.#search.search(siteId, query, options);
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
      throw mapUniqueViolation(e, kind, key);
    }
  }
}
