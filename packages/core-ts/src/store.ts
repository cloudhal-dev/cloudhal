import {
  type Actor,
  assertValid,
  type ContentEntry,
  type NodeRef,
  type Page,
  type Project,
  type Site,
  type Snapshot,
} from "@cloudhal/core-contracts";
import {
  type BlobStore,
  migrate,
  migrations,
  type SqlDriver,
  type SqlStatement,
} from "@cloudhal/storage";
import {
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  UniqueConstraintError,
} from "./errors.ts";
import { canonicalJson, nodeHash, sha256Hex } from "./hash.ts";
import { ID_PREFIX, newId } from "./ids.ts";

export type NodeKind = NodeRef["kind"];
export type SiteNode = Site | Page | ContentEntry;

type Row = {
  id: string;
  site_id: string;
  kind: NodeKind;
  key: string;
  rev: number;
  hash: string;
  body: string;
};

export interface SiteGraphStoreOptions {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  /** Clock, injectable for tests. */
  readonly now?: () => Date;
  readonly idGen?: (prefix: string) => string;
  /**
   * Called after the published pointer moved (publish and rollback). Deployments use it to purge
   * edge caches. Failures are reported to `onHookError` and never undo the publish.
   */
  readonly onPublished?: (site: Site) => Promise<void>;
  readonly onHookError?: (error: unknown) => void;
}

/** Fields the store fills in on create. */
type Creatable<
  T extends { id: string; rev: number; createdAt: string; updatedAt: string; schemaVersion: 1 },
> = Omit<T, "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"> & { id?: string };

export interface SnapshotInput {
  readonly actor: Actor;
  readonly reason: Snapshot["reason"];
  readonly label?: string;
}

export interface SnapshotDiff {
  readonly added: NodeRef[];
  readonly removed: NodeRef[];
  readonly changed: Array<{ before: NodeRef; after: NodeRef }>;
}

export function uniquenessKey(node: SiteNode): string {
  if ("pageIds" in node) return "site";
  if ("path" in node) return `${node.locale}:${node.path}`;
  return `${node.collection}:${node.locale}:${node.slug}`;
}

export function kindOf(node: SiteNode): NodeKind {
  if ("pageIds" in node) return "site";
  if ("path" in node) return "page";
  return "contentEntry";
}

export function siteIdOf(node: SiteNode): string {
  return "pageIds" in node ? node.id : node.siteId;
}

/**
 * The Site Graph store: typed CRUD with optimistic locking, snapshots, diff, publish, rollback.
 * Every multi-statement write is one atomic `batch()`; see ADR-0002 and RFC-0001.
 */
export class SiteGraphStore {
  readonly #sql: SqlDriver;
  readonly #blobs: BlobStore;
  readonly #now: () => Date;
  readonly #newId: (prefix: string) => string;

  constructor(options: SiteGraphStoreOptions) {
    this.#sql = options.sql;
    this.#blobs = options.blobs;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.idGen ?? newId;
    this.#onPublished = options.onPublished;
    this.#onHookError = options.onHookError ?? ((e) => console.error("onPublished failed:", e));
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

  async #insertNodeStatement(node: SiteNode, ts: string): Promise<SqlStatement> {
    return {
      sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        node.id,
        siteIdOf(node),
        kindOf(node),
        uniquenessKey(node),
        node.rev,
        await nodeHash(node),
        canonicalJson(node),
        ts,
        ts,
      ],
    };
  }

  async #casUpdateStatement(next: SiteNode, expectedRev: number): Promise<SqlStatement> {
    return {
      // Scoped by kind and site too: a body of one kind (or site) can never overwrite another's row.
      sql: "UPDATE nodes SET key = ?, rev = ?, hash = ?, body = ?, updated_at = ? WHERE id = ? AND rev = ? AND kind = ? AND site_id = ?",
      params: [
        uniquenessKey(next),
        next.rev,
        await nodeHash(next),
        canonicalJson(next),
        next.updatedAt,
        next.id,
        expectedRev,
        kindOf(next),
        siteIdOf(next),
      ],
    };
  }

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
    await this.#runInsert(await this.#insertNodeStatement(site, ts), "site", uniquenessKey(site));
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
    const r = await this.#sql.run(...stmt(await this.#casUpdateStatement(next, site.rev)));
    if (r.changes !== 1)
      throw new ConflictError("site", site.id, site.rev, await this.#revOf(site.id));
    return next;
  }

  /**
   * Creates a page and appends it to `Site.pageIds` atomically. The site update (CAS) runs first;
   * the page insert is conditional on the site having reached the new revision, so on a stale
   * site revision neither statement changes anything and a ConflictError is thrown.
   */
  async createPage(site: Site, input: Creatable<Page>): Promise<{ page: Page; site: Site }> {
    const ts = this.#stamp();
    const page: Page = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.page),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("page", page);
    if (page.siteId !== site.id) throw new Error("page.siteId must match site.id");
    const nextSite: Site = {
      ...site,
      pageIds: [...site.pageIds, page.id],
      rev: site.rev + 1,
      updatedAt: ts,
    };
    assertValid("site", nextSite);
    const insert = await this.#insertNodeStatement(page, ts);
    // The guard checks the site's new content hash, not just `rev + 1`: a stale caller whose rev is
    // exactly one behind would otherwise see `rev + 1` already present and insert anyway.
    const siteHash = await nodeHash(nextSite);
    const results = await this.#batchUnique(
      [
        await this.#casUpdateStatement(nextSite, site.rev),
        {
          sql: `INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)`,
          params: [...(insert.params ?? []), site.id, siteHash],
        },
      ],
      "page",
      uniquenessKey(page),
    );
    if (results[0]?.changes !== 1)
      throw new ConflictError("site", site.id, site.rev, await this.#revOf(site.id));
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

  async updatePage(page: Page): Promise<Page> {
    const next: Page = { ...page, rev: page.rev + 1, updatedAt: this.#stamp() };
    assertValid("page", next);
    const r = await this.#runUnique(
      await this.#casUpdateStatement(next, page.rev),
      "page",
      uniquenessKey(next),
    );
    if (r.changes !== 1)
      throw new ConflictError("page", page.id, page.rev, await this.#revOf(page.id));
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
      await this.#casUpdateStatement(nextSite, site.rev),
      {
        sql: "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'page' AND site_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)",
        params: [page.id, page.rev, site.id, site.id, siteHash],
      },
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

  async createContentEntry(input: Creatable<ContentEntry>): Promise<ContentEntry> {
    const ts = this.#stamp();
    const entry: ContentEntry = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#newId(ID_PREFIX.contentEntry),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("content-entry", entry);
    await this.#runInsert(
      await this.#insertNodeStatement(entry, ts),
      "contentEntry",
      uniquenessKey(entry),
    );
    return entry;
  }

  async getContentEntry(id: string): Promise<ContentEntry | undefined> {
    return this.#getNode<ContentEntry>("contentEntry", id);
  }

  async listContentEntries(siteId: string, collection?: string): Promise<ContentEntry[]> {
    const rows = await this.#sql.all<Row>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry' ORDER BY created_at, id",
      [siteId],
    );
    const all = rows.map((r) => JSON.parse(r.body) as ContentEntry);
    return collection ? all.filter((e) => e.collection === collection) : all;
  }

  async updateContentEntry(entry: ContentEntry): Promise<ContentEntry> {
    const next: ContentEntry = { ...entry, rev: entry.rev + 1, updatedAt: this.#stamp() };
    assertValid("content-entry", next);
    const r = await this.#runUnique(
      await this.#casUpdateStatement(next, entry.rev),
      "contentEntry",
      uniquenessKey(next),
    );
    if (r.changes !== 1)
      throw new ConflictError("contentEntry", entry.id, entry.rev, await this.#revOf(entry.id));
    return next;
  }

  async deleteContentEntry(entry: ContentEntry): Promise<void> {
    const r = await this.#sql.run(
      "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'contentEntry' AND site_id = ?",
      [entry.id, entry.rev, entry.siteId],
    );
    if (r.changes !== 1)
      throw new ConflictError("contentEntry", entry.id, entry.rev, await this.#revOf(entry.id));
  }

  // ───────────────────────────── snapshots ─────────────────────────────

  /** All node refs of a site at this instant (site, pages, content entries), sorted by id. */
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
    };
    assertValid("snapshot", snapshot);
    await this.#sql.run(
      "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        snapshot.id,
        siteId,
        snapshot.parentId ?? null,
        snapshot.siteRev,
        canonicalJson(snapshot),
        snapshot.createdAt,
      ],
    );
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
   * `publish` — e.g. a site imported with `cloudhal push --replace`.
   */
  async notifyPublished(site: Site): Promise<void> {
    if (!this.#onPublished) return;
    try {
      await this.#onPublished(site);
    } catch (e) {
      this.#onHookError(e);
    }
  }

  /** Points production at a snapshot (CAS on the site). */
  async publish(site: Site, snapshotId: string): Promise<Site> {
    const snap = await this.getSnapshot(snapshotId);
    if (!snap || snap.siteId !== site.id) throw new NotFoundError("snapshot", snapshotId);
    const updated = await this.updateSite({ ...site, publishedSnapshotId: snapshotId });
    if (this.#onPublished) {
      try {
        await this.#onPublished(updated);
      } catch (e) {
        this.#onHookError(e);
      }
    }
    return updated;
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

  async #runInsert(statement: SqlStatement, kind: NodeKind, key: string): Promise<void> {
    await this.#runUnique(statement, kind, key);
  }

  async #runUnique(statement: SqlStatement, kind: NodeKind, key: string) {
    try {
      return await this.#sql.run(...stmt(statement));
    } catch (e) {
      if (isUniqueViolation(e)) throw new UniqueConstraintError(kind, key);
      throw e;
    }
  }

  async #batchUnique(statements: SqlStatement[], kind: NodeKind, key: string) {
    try {
      return await this.#sql.batch(statements);
    } catch (e) {
      if (isUniqueViolation(e)) throw new UniqueConstraintError(kind, key);
      throw e;
    }
  }
}

function stmt(s: SqlStatement): [string, readonly import("@cloudhal/storage").SqlValue[]] {
  return [s.sql, s.params ?? []];
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
