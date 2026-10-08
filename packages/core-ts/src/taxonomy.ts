/**
 * Taxonomies, terms, governance operations, redirects and term assignments (RFC-0002 §3–§4).
 * `SiteGraphStore` delegates to this engine; every multi-node write is one `batch()` ending in
 * `op_guards` assertions (node-sql.ts). Worker-safe.
 */
import {
  assertValid,
  type ContentEntry,
  type Page,
  type PublishStatus,
  type Redirect,
  type Site,
  type Taxonomy,
  type Term,
} from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import {
  ConflictError,
  InvariantError,
  isUniqueViolation,
  NotFoundError,
  UniqueConstraintError,
} from "./errors.ts";
import { parseFilter, RESERVED_FIELDS, resolveFilter, toSql } from "./filter.ts";
import { ID_PREFIX } from "./ids.ts";
import { foldName, humanizeSlug, type Resolution, resolveTermInputs, termName } from "./names.ts";
import {
  type Cond,
  casUpdateStatement,
  insertNodeStatement,
  OpBatch,
  parseRows,
  type Row,
  runOpBatch,
  termsPath,
} from "./node-sql.ts";
import type { Creatable, NodeKind, NodeTypes } from "./nodes.ts";
import {
  assertNoLoop,
  matchRedirect,
  normalisePath,
  type RedirectMatch,
  RedirectPlan,
  splitTarget,
} from "./redirects.ts";

/** What the engine needs from the store. */
export interface StoreKernel {
  readonly sql: SqlDriver;
  stamp(): string;
  newId(prefix: string): string;
}

/** Governance operations refuse to touch more entries than this in one batch (RFC-0002 §4.3). */
export const GOVERNANCE_ENTRY_LIMIT = 400;
/** Term ids on one entry, across taxonomies (D1's 100 bound parameters, invariant 5). */
export const MAX_TERM_IDS_PER_ENTRY = 60;
/** Deepest hierarchy (a root term has depth 1). */
export const MAX_TERM_DEPTH = 5;
const BATCH_STATEMENT_LIMIT = 1000;

export interface GovernanceResult {
  /** Operation id (its `op_guards` rows; audit). */
  readonly opId: string;
  /** Terms written by the operation, as stored. */
  readonly terms: Term[];
  /** Entries rewritten (merge, retire). */
  readonly entries: number;
  /** Redirects created or updated, as stored. */
  readonly redirects: Redirect[];
}

export interface TermQuery {
  /** Taxonomy key. */
  readonly taxonomy?: string;
  readonly status?: readonly Term["status"][];
  /** `null`: root terms only. */
  readonly parentId?: string | null;
}

export interface TermUsage {
  readonly total: number;
  readonly published: number;
  /** Latest `updatedAt` among the entries that use the term. */
  readonly lastUsedAt?: string;
}

export interface EntryQuery {
  readonly collection?: string;
  /** Filter expression (RFC-0002 §5), resolved against the site's taxonomies and terms. */
  readonly filter?: string;
  readonly locale?: string;
  readonly status?: readonly PublishStatus[];
}

export type ReviewDecision = { approve: true } | { reject: true } | { mergeInto: Term };

export interface DefaultTaxonomyOptions {
  /** `category.required`; true for new sites, false for migrated ones (RFC-0002 migration step 2). */
  readonly categoryRequired?: boolean;
  /** `tag.maxPerEntry` (default 10); the migration raises it to fit existing entries. */
  readonly tagMaxPerEntry?: number;
  readonly metadata?: Record<string, string>;
}

const DEFAULT_LABELS: Record<
  string,
  Record<"category" | "tag", { singular: string; plural: string }>
> = {
  en: {
    category: { singular: "Category", plural: "Categories" },
    tag: { singular: "Tag", plural: "Tags" },
  },
  tr: {
    category: { singular: "Kategori", plural: "Kategoriler" },
    tag: { singular: "Etiket", plural: "Etiketler" },
  },
};

function taxonomyLabels(site: Site, key: "category" | "tag"): Taxonomy["labels"] {
  const labels: Taxonomy["labels"] = {};
  for (const loc of new Set([site.defaultLocale, ...site.locales])) {
    const lang = loc.split("-")[0] ?? loc;
    labels[loc] = (DEFAULT_LABELS[lang] ?? DEFAULT_LABELS.en)?.[key] as {
      singular: string;
      plural: string;
    };
  }
  return labels;
}

function applies(tax: Taxonomy, collection: string): boolean {
  return !tax.collections || tax.collections.includes(collection);
}

function isPublic(t: Term): boolean {
  return t.status === "active" && t.visibility === "public";
}

function archivePath(tax: Taxonomy, slug: string): string {
  return `${tax.archive.basePath}/${slug}`;
}

/** `a` equals `b` or one lies under the other. */
function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function cap<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(items.length - max) : items;
}

function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Drops empty assignments and an empty `terms` (invariant 6). */
export function canonicalTerms(entry: ContentEntry): ContentEntry {
  if (!entry.terms) return entry;
  const terms: NonNullable<ContentEntry["terms"]> = {};
  for (const [key, a] of Object.entries(entry.terms)) {
    if (!a || !Array.isArray(a.ids) || a.ids.length === 0) continue;
    terms[key] = {
      ids: dedupe(a.ids) as [string, ...string[]],
      ...(a.primary !== undefined ? { primary: a.primary } : {}),
    };
  }
  const { terms: _t, ...rest } = entry;
  return Object.keys(terms).length > 0 ? { ...rest, terms } : rest;
}

/**
 * Rewrites one taxonomy's assignment: each id in `map` becomes its value (`null`: removed),
 * de-duplicated keeping the first position; the primary follows. `undefined` when nothing changes.
 */
function rewriteAssignment(
  entry: ContentEntry,
  key: string,
  map: ReadonlyMap<string, string | null>,
): ContentEntry | undefined {
  const a = entry.terms?.[key];
  if (!a?.ids.some((id) => map.has(id))) return undefined;
  const ids: string[] = [];
  for (const id of a.ids) {
    const r = map.has(id) ? map.get(id) : id;
    if (r && !ids.includes(r)) ids.push(r);
  }
  const primary =
    a.primary === undefined ? undefined : map.has(a.primary) ? map.get(a.primary) : a.primary;
  return canonicalTerms({
    ...entry,
    terms: {
      ...entry.terms,
      [key]: { ids: ids as [string, ...string[]], ...(primary ? { primary } : {}) },
    },
  });
}

function json(values: readonly string[]): string {
  return JSON.stringify(values);
}

export class TaxonomyEngine {
  readonly #k: StoreKernel;

  constructor(kernel: StoreKernel) {
    this.#k = kernel;
  }

  get #sql(): SqlDriver {
    return this.#k.sql;
  }

  // ───────────────────────────── reads ─────────────────────────────

  async #get<K extends NodeKind>(kind: K, id: string): Promise<NodeTypes[K] | undefined> {
    const row = await this.#sql.get<Row>("SELECT body FROM nodes WHERE id = ? AND kind = ?", [
      id,
      kind,
    ]);
    return row ? (JSON.parse(row.body) as NodeTypes[K]) : undefined;
  }

  async #list<K extends NodeKind>(
    siteId: string,
    kind: K,
    where?: Cond,
    order = "created_at, id",
  ): Promise<NodeTypes[K][]> {
    const rows = await this.#sql.all<{ body: string }>(
      `SELECT body FROM nodes WHERE site_id = ? AND kind = ?${where ? ` AND ${where.sql}` : ""} ORDER BY ${order}`,
      [siteId, kind, ...(where?.params ?? [])],
    );
    return parseRows<NodeTypes[K]>(rows);
  }

  async #hashes(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.#sql.all<{ id: string; hash: string }>(
      "SELECT id, hash FROM nodes WHERE id IN (SELECT value FROM json_each(?))",
      [json(ids)],
    );
    return new Map(rows.map((r) => [r.id, r.hash]));
  }

  async #revOf(id: string): Promise<number | undefined> {
    return (await this.#sql.get<{ rev: number }>("SELECT rev FROM nodes WHERE id = ?", [id]))?.rev;
  }

  async site(siteId: string): Promise<Site> {
    const site = await this.#get("site", siteId);
    if (!site) throw new NotFoundError("site", siteId);
    return site;
  }

  /** The stored node at the caller's revision; ConflictError when it moved, NotFoundError when gone. */
  async #fresh<K extends NodeKind>(kind: K, node: NodeTypes[K]): Promise<NodeTypes[K]> {
    const stored = await this.#get(kind, node.id);
    if (!stored) throw new NotFoundError(kind, node.id);
    if (stored.rev !== node.rev) throw new ConflictError(kind, node.id, node.rev, stored.rev);
    return stored;
  }

  async #runUnique(statement: SqlStatement, kind: string, key: string) {
    try {
      return await this.#sql.run(statement.sql, statement.params ?? []);
    } catch (e) {
      if (isUniqueViolation(e)) throw new UniqueConstraintError(kind, key);
      throw e;
    }
  }

  #batch(siteId: string, ts: string): OpBatch {
    return new OpBatch(this.#k.newId(ID_PREFIX.operation), siteId, ts);
  }

  // ───────────────────────────── taxonomies ─────────────────────────────

  getTaxonomy(id: string): Promise<Taxonomy | undefined> {
    return this.#get("taxonomy", id);
  }

  async getTaxonomyByKey(siteId: string, key: string): Promise<Taxonomy | undefined> {
    const row = await this.#sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'taxonomy' AND key = ?",
      [siteId, key],
    );
    return row ? (JSON.parse(row.body) as Taxonomy) : undefined;
  }

  listTaxonomies(siteId: string): Promise<Taxonomy[]> {
    return this.#list(siteId, "taxonomy");
  }

  async #collections(siteId: string): Promise<string[]> {
    const rows = await this.#sql.all<{ c: string }>(
      "SELECT DISTINCT json_extract(body, '$.collection') AS c FROM nodes WHERE site_id = ? AND kind = 'contentEntry'",
      [siteId],
    );
    return rows.map((r) => r.c);
  }

  /** Invariants 7 and 13 for a taxonomy, checked against the current site. */
  async #checkTaxonomy(tax: Taxonomy, site: Site): Promise<void> {
    if ((RESERVED_FIELDS as readonly string[]).includes(tax.key))
      throw new InvariantError("reserved_key", `"${tax.key}" is reserved by the filter grammar`);
    if (!tax.labels[site.defaultLocale])
      throw new InvariantError(
        "invalid_labels",
        `taxonomy labels must include the site's default locale "${site.defaultLocale}"`,
      );
    if (tax.feed && !tax.archive.enabled)
      throw new InvariantError("path_conflict", "a feed requires archive.enabled");
    const base = tax.archive.basePath;
    if (base === "/")
      throw new InvariantError("path_conflict", "an archive cannot live at the site root");
    for (const other of await this.listTaxonomies(tax.siteId))
      if (other.id !== tax.id && pathsOverlap(other.archive.basePath, base))
        throw new InvariantError(
          "path_conflict",
          `archive path ${base} collides with taxonomy "${other.key}" (${other.archive.basePath})`,
        );
    if (tax.archive.enabled)
      for (const page of await this.#list(tax.siteId, "page"))
        if (page.path === base || page.path.startsWith(`${base}/`))
          throw new InvariantError(
            "path_conflict",
            `page ${page.path} lies in archive path ${base}`,
            {
              pageId: page.id,
            },
          );
    const collections = new Set([
      ...(await this.#collections(tax.siteId)),
      ...(tax.collections ?? []),
    ]);
    for (const c of collections)
      if (pathsOverlap(`/${c}`, base))
        throw new InvariantError(
          "path_conflict",
          `archive path ${base} collides with the collection prefix /${c}`,
        );
  }

  /** Race guard for invariant 13 on taxonomy writes (the JS check above gives the message). */
  #archiveGuard(tax: Taxonomy): Cond {
    const base = tax.archive.basePath;
    const otherBase = "json_extract(body, '$.archive.basePath')";
    const taxonomies: Cond = {
      sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'taxonomy' AND id != ? AND (${otherBase} = ? OR substr(${otherBase}, 1, ?) = ? OR substr(?, 1, length(${otherBase}) + 1) = ${otherBase} || '/'))`,
      params: [tax.siteId, tax.id, base, base.length + 1, `${base}/`, base],
    };
    if (!tax.archive.enabled) return taxonomies;
    return {
      sql: `${taxonomies.sql} AND NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'page' AND (json_extract(body, '$.path') = ? OR substr(json_extract(body, '$.path'), 1, ?) = ?))`,
      params: [...taxonomies.params, tax.siteId, base, base.length + 1, `${base}/`],
    };
  }

  async createTaxonomy(input: Creatable<Taxonomy>): Promise<Taxonomy> {
    const ts = this.#k.stamp();
    const tax: Taxonomy = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#k.newId(ID_PREFIX.taxonomy),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("taxonomy", tax);
    await this.#checkTaxonomy(tax, await this.site(tax.siteId));
    const r = await this.#runUnique(
      await insertNodeStatement("taxonomy", tax, ts, this.#archiveGuard(tax)),
      "taxonomy",
      tax.key,
    );
    if (r.changes !== 1)
      throw new InvariantError("path_conflict", `archive path ${tax.archive.basePath} is taken`);
    return tax;
  }

  /**
   * Creates the default `category` and `tag` taxonomies (RFC-0002 §1) that are missing, in one
   * batch, and returns both.
   */
  async createDefaultTaxonomies(
    site: Site,
    options: DefaultTaxonomyOptions = {},
  ): Promise<Taxonomy[]> {
    const existing = await this.listTaxonomies(site.id);
    const ts = this.#k.stamp();
    const make = (key: "category" | "tag"): Taxonomy => ({
      schemaVersion: 1,
      id: this.#k.newId(ID_PREFIX.taxonomy),
      siteId: site.id,
      key,
      labels: taxonomyLabels(site, key),
      hierarchical: key === "category",
      allowNewTerms: key === "category" ? "none" : "propose",
      required: key === "category" ? (options.categoryRequired ?? true) : false,
      maxPerEntry: key === "category" ? 3 : (options.tagMaxPerEntry ?? 10),
      archive: { enabled: true, basePath: `/${key}` },
      feed: true,
      minEntriesToIndex: 3,
      ...(options.metadata ? { metadata: { ...options.metadata } } : {}),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    const created: Taxonomy[] = [];
    for (const key of ["category", "tag"] as const) {
      if (existing.some((t) => t.key === key)) continue;
      const tax = make(key);
      assertValid("taxonomy", tax);
      await this.#checkTaxonomy(tax, site);
      created.push(tax);
    }
    if (created.length > 0) {
      const batch = this.#batch(site.id, ts);
      for (const tax of created) await batch.insert("taxonomy", tax, this.#archiveGuard(tax));
      await runOpBatch(this.#sql, batch, { uniqueKind: "taxonomy", uniqueKey: "category|tag" });
    }
    const all = [...existing, ...created];
    return (["category", "tag"] as const).map((k) => all.find((t) => t.key === k) as Taxonomy);
  }

  /** CAS update. The key is immutable; moving an enabled archive leaves a prefix redirect behind. */
  async updateTaxonomy(t: Taxonomy): Promise<Taxonomy> {
    const stored = await this.#fresh("taxonomy", t);
    if (t.key !== stored.key)
      throw new InvariantError("reserved_key", "a taxonomy key is immutable");
    if (t.siteId !== stored.siteId)
      throw new InvariantError("immutable_field", "siteId is immutable");
    const ts = this.#k.stamp();
    const next: Taxonomy = { ...t, rev: stored.rev + 1, updatedAt: ts };
    assertValid("taxonomy", next);
    const site = await this.site(next.siteId);
    await this.#checkTaxonomy(next, site);
    const terms = await this.#termsOf(next);
    if (!next.hierarchical && terms.some((x) => x.parentId && x.status !== "retired"))
      throw new InvariantError(
        "invalid_parent",
        "terms have parents; flatten them before making the taxonomy flat",
      );
    if (next.allowNewTerms === "none" && terms.some((x) => x.status === "proposed"))
      throw new InvariantError(
        "not_allowed",
        "review the proposed terms before setting allowNewTerms to none",
      );
    const batch = this.#batch(next.siteId, ts);
    await batch.update("taxonomy", stored, next, this.#archiveGuard(next));
    if (
      stored.archive.enabled &&
      next.archive.enabled &&
      stored.archive.basePath !== next.archive.basePath
    ) {
      const plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
      plan.move(stored.archive.basePath, next.archive.basePath, {
        match: "prefix",
        reason: "slug-change",
      });
      await plan.emit(batch);
    }
    await runOpBatch(this.#sql, batch, {
      diagnose: async () => {
        await this.#checkTaxonomy(next, site);
      },
    });
    return next;
  }

  // ───────────────────────────── terms ─────────────────────────────

  getTerm(id: string): Promise<Term | undefined> {
    return this.#get("term", id);
  }

  #termsOf(tax: Pick<Taxonomy, "id" | "siteId">): Promise<Term[]> {
    return this.#list(tax.siteId, "term", {
      sql: "json_extract(body, '$.taxonomyId') = ?",
      params: [tax.id],
    });
  }

  async #termsByIds(siteId: string, ids: readonly string[]): Promise<Map<string, Term>> {
    if (ids.length === 0) return new Map();
    const terms = await this.#list(siteId, "term", {
      sql: "id IN (SELECT value FROM json_each(?))",
      params: [json(ids)],
    });
    return new Map(terms.map((t) => [t.id, t]));
  }

  /** By current slug, then slug history, then a retired term's slug. */
  async getTermBySlug(siteId: string, key: string, slug: string): Promise<Term | undefined> {
    const tax = await this.getTaxonomyByKey(siteId, key);
    if (!tax) return undefined;
    const terms = await this.#termsOf(tax);
    return (
      terms.find((t) => t.status !== "retired" && t.slug === slug) ??
      terms.find((t) => t.status !== "retired" && t.slugHistory?.includes(slug) === true) ??
      terms.filter((t) => t.slug === slug).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    );
  }

  /** Ordered by `position` (unset last), then name in the site's default locale, then slug. */
  async listTerms(siteId: string, q: TermQuery = {}): Promise<Term[]> {
    const conds: Cond[] = [];
    if (q.taxonomy !== undefined) {
      const tax = await this.getTaxonomyByKey(siteId, q.taxonomy);
      if (!tax) return [];
      conds.push({ sql: "json_extract(body, '$.taxonomyId') = ?", params: [tax.id] });
    }
    if (q.status)
      conds.push({
        sql: "json_extract(body, '$.status') IN (SELECT value FROM json_each(?))",
        params: [json(q.status)],
      });
    if (q.parentId === null)
      conds.push({ sql: "json_extract(body, '$.parentId') IS NULL", params: [] });
    else if (q.parentId !== undefined)
      conds.push({ sql: "json_extract(body, '$.parentId') = ?", params: [q.parentId] });
    const where: Cond | undefined = conds.length
      ? {
          sql: conds.map((c) => `(${c.sql})`).join(" AND "),
          params: conds.flatMap((c) => c.params),
        }
      : undefined;
    const terms = await this.#list(siteId, "term", where);
    const locale = (await this.#get("site", siteId))?.defaultLocale;
    return terms.sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        termName(a, locale).localeCompare(termName(b, locale)) ||
        a.slug.localeCompare(b.slug),
    );
  }

  /** Invariant 12: default-locale label; alternative names never equal another term's name, synonym or slug. */
  #checkLabels(term: Term, site: Site, taxonomyTerms: readonly Term[]): void {
    if (!term.labels[site.defaultLocale])
      throw new InvariantError(
        "invalid_labels",
        `term labels must include the site's default locale "${site.defaultLocale}"`,
      );
    const mine = new Set<string>();
    for (const label of Object.values(term.labels))
      for (const a of label?.altNames ?? []) mine.add(foldName(a));
    if (mine.size === 0) return;
    for (const other of taxonomyTerms) {
      if (other.id === term.id || other.status === "retired") continue;
      const theirs = [other.slug];
      for (const label of Object.values(other.labels)) {
        if (!label) continue;
        theirs.push(foldName(label.name), ...(label.altNames ?? []).map(foldName));
      }
      const hit = theirs.find((x) => mine.has(x));
      if (hit)
        throw new InvariantError(
          "invalid_labels",
          `alternative name "${hit}" already names term "${other.slug}"`,
          { termId: other.id },
        );
    }
  }

  /** Ancestors of a term, nearest first (stops on a corrupt cycle). */
  #ancestors(start: Term | undefined, byId: ReadonlyMap<string, Term>): Term[] {
    const out: Term[] = [];
    let cur = start;
    while (cur?.parentId && out.length <= MAX_TERM_DEPTH * 2) {
      const parent = byId.get(cur.parentId);
      if (!parent || out.includes(parent)) break;
      out.push(parent);
      cur = parent;
    }
    return out;
  }

  /** Height of the live subtree rooted at `id` (a leaf is 1). */
  #height(id: string, terms: readonly Term[], seen = new Set<string>()): number {
    if (seen.has(id)) return 0;
    seen.add(id);
    let h = 0;
    for (const t of terms)
      if (t.parentId === id && t.status !== "retired")
        h = Math.max(h, this.#height(t.id, terms, seen));
    return h + 1;
  }

  /**
   * Who holds `slug` in a taxonomy besides `selfId`: live terms by current slug, retired terms by
   * current slug (unless merged: their target's history holds it), and terms by slug history.
   */
  #slugHolders(terms: readonly Term[], slug: string, selfId: string) {
    const others = terms.filter((t) => t.id !== selfId);
    return {
      live: others.filter((t) => t.status !== "retired" && t.slug === slug),
      retired: others.filter((t) => t.status === "retired" && !t.mergedInto && t.slug === slug),
      history: others.filter((t) => t.slugHistory?.includes(slug) === true),
    };
  }

  #checkSlug(terms: readonly Term[], slug: string, selfId: string, reclaim: boolean): Term[] {
    const h = this.#slugHolders(terms, slug, selfId);
    const holder = h.live[0] ?? (!reclaim ? (h.retired[0] ?? h.history[0]) : undefined);
    if (holder)
      throw new InvariantError(
        "slug_taken",
        holder.status !== "retired" && holder.slug === slug
          ? `slug "${slug}" is used by another term`
          : `slug "${slug}" is reserved by term ${holder.id}'s history${reclaim ? "" : " (a person may reclaim it)"}`,
        { termId: holder.id },
      );
    return h.history;
  }

  /** Race guard for invariant 8 on term inserts and slug changes. */
  #slugGuard(term: Term, reclaim: boolean): Cond {
    const slugHeld = reclaim
      ? "(json_extract(n.body, '$.slug') = ? AND json_extract(n.body, '$.status') != 'retired')"
      : "(json_extract(n.body, '$.slug') = ? AND (json_extract(n.body, '$.status') != 'retired' OR json_extract(n.body, '$.mergedInto') IS NULL))";
    return {
      sql: `NOT EXISTS (SELECT 1 FROM nodes n WHERE n.site_id = ? AND n.kind = 'term' AND n.id != ? AND json_extract(n.body, '$.taxonomyId') = ? AND (${slugHeld} OR EXISTS (SELECT 1 FROM json_each(n.body, '$.slugHistory') h WHERE h.value = ?)))`,
      params: [term.siteId, term.id, term.taxonomyId, term.slug, term.slug],
    };
  }

  /** Slug guard for a term inserted alongside an entry (deprecated `tags` translation). */
  termSlugGuard(term: Term): Cond {
    return this.#slugGuard(term, false);
  }

  /** Frees `slug` from other terms' slug histories (people only: `reclaim`). */
  async #releaseSlug(
    batch: OpBatch,
    holders: readonly Term[],
    slug: string,
    ts: string,
  ): Promise<Term[]> {
    const out: Term[] = [];
    for (const h of holders) {
      const rest = (h.slugHistory ?? []).filter((s) => s !== slug);
      const { slugHistory: _s, ...base } = h;
      const next: Term = {
        ...base,
        ...(rest.length ? { slugHistory: rest as [string, ...string[]] } : {}),
        rev: h.rev + 1,
        updatedAt: ts,
      };
      await batch.update("term", h, next);
      out.push(next);
    }
    return out;
  }

  async createTerm(input: Creatable<Term>, opts: { reclaim?: boolean } = {}): Promise<Term> {
    const ts = this.#k.stamp();
    const term: Term = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#k.newId(ID_PREFIX.term),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("term", term);
    const tax = await this.getTaxonomy(term.taxonomyId);
    if (!tax || tax.siteId !== term.siteId) throw new NotFoundError("taxonomy", term.taxonomyId);
    const site = await this.site(term.siteId);
    if (term.status === "retired" || term.mergedInto)
      throw new InvariantError("invalid_status", "a new term is active or proposed");
    if (term.slugHistory)
      throw new InvariantError(
        "immutable_field",
        "slugHistory is kept by renameTerm and mergeTerms",
      );
    if (term.status === "proposed" && tax.allowNewTerms === "none")
      throw new InvariantError("not_allowed", `taxonomy "${tax.key}" does not take proposed terms`);
    const terms = await this.#termsOf(tax);
    const byId = new Map(terms.map((t) => [t.id, t]));
    this.#checkLabels(term, site, terms);
    const chain = this.#checkParent(tax, term, term.parentId, byId, terms);
    const reclaim = opts.reclaim === true;
    const holders = this.#checkSlug(terms, term.slug, term.id, reclaim);

    const batch = this.#batch(site.id, ts);
    if (reclaim) await this.#releaseSlug(batch, holders, term.slug, ts);
    await batch.insert("term", term, this.#slugGuard(term, reclaim));
    for (const [id, hash] of await this.#hashes(chain.map((t) => t.id)))
      batch.expectUnchanged(id, hash);
    if (tax.archive.enabled && (reclaim || isPublic(term))) {
      const plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
      plan.serve(archivePath(tax, term.slug), true);
      await plan.emit(batch);
    }
    await runOpBatch(this.#sql, batch, {
      uniqueKind: "term",
      uniqueKey: `${tax.key}:${term.slug}`,
      diagnose: async () => {
        const now = await this.#termsOf(tax);
        this.#checkSlug(now, term.slug, term.id, reclaim);
        this.#checkParent(tax, term, term.parentId, new Map(now.map((t) => [t.id, t])), now);
      },
    });
    return term;
  }

  /** Invariant 9 for `term` under `parentId`; returns the new ancestor chain (nearest first). */
  #checkParent(
    tax: Taxonomy,
    term: Term,
    parentId: string | undefined,
    byId: ReadonlyMap<string, Term>,
    terms: readonly Term[],
  ): Term[] {
    if (!parentId) return [];
    if (!tax.hierarchical)
      throw new InvariantError(
        "invalid_parent",
        `taxonomy "${tax.key}" is flat; terms have no parent`,
      );
    const parent = byId.get(parentId);
    if (!parent || parent.taxonomyId !== tax.id || parent.status === "retired")
      throw new InvariantError(
        "invalid_parent",
        `parent ${parentId} is not a live term of "${tax.key}"`,
      );
    if (parent.id === term.id) throw new InvariantError("cycle", "a term cannot be its own parent");
    const chain = [parent, ...this.#ancestors(parent, byId)];
    if (chain.some((t) => t.id === term.id))
      throw new InvariantError(
        "cycle",
        `${parent.slug} lies under ${term.slug}; that would be a cycle`,
      );
    const depth = chain.length + this.#height(term.id, terms);
    if (depth > MAX_TERM_DEPTH)
      throw new InvariantError(
        "too_deep",
        `the hierarchy would be ${depth} levels deep; the limit is ${MAX_TERM_DEPTH}`,
      );
    return chain;
  }

  /** Text and presentation only: labels, image, position, metadata. */
  async updateTerm(t: Term): Promise<Term> {
    const stored = await this.#fresh("term", t);
    const fixed = [
      "siteId",
      "taxonomyId",
      "slug",
      "status",
      "parentId",
      "visibility",
      "mergedInto",
      "slugHistory",
      "proposedBy",
    ] as const;
    for (const f of fixed)
      if (JSON.stringify(t[f]) !== JSON.stringify(stored[f]))
        throw new InvariantError(
          "immutable_field",
          `updateTerm cannot change ${f}; use the governance operation`,
        );
    const ts = this.#k.stamp();
    const next: Term = { ...t, createdAt: stored.createdAt, rev: stored.rev + 1, updatedAt: ts };
    assertValid("term", next);
    const tax = (await this.getTaxonomy(next.taxonomyId)) as Taxonomy;
    this.#checkLabels(next, await this.site(next.siteId), await this.#termsOf(tax));
    const r = await this.#sql.run(...stmt(await casUpdateStatement("term", next, stored.rev)));
    if (r.changes !== 1) throw new ConflictError("term", t.id, t.rev, await this.#revOf(t.id));
    return next;
  }

  /** Entries per term: all statuses, published, and the latest `updatedAt` of those entries. */
  async termUsage(siteId: string, key?: string): Promise<Map<string, TermUsage>> {
    const rows = await this.#sql.all<{
      id: string;
      total: number;
      published: number;
      last: string | null;
    }>(
      `SELECT t.value AS id, count(*) AS total,
              sum(CASE WHEN json_extract(n.body, '$.status') = 'published' THEN 1 ELSE 0 END) AS published,
              max(n.updated_at) AS last
         FROM nodes n, json_each(n.body, '$.terms') a, json_each(a.value, '$.ids') t
        WHERE n.site_id = ? AND n.kind = 'contentEntry'${key !== undefined ? " AND a.key = ?" : ""}
        GROUP BY t.value`,
      key !== undefined ? [siteId, key] : [siteId],
    );
    return new Map(
      rows.map((r) => [
        r.id,
        { total: r.total, published: r.published, ...(r.last ? { lastUsedAt: r.last } : {}) },
      ]),
    );
  }

  /** Resolves ids, slugs or names within one taxonomy (RFC-0002 §6.3). Never creates terms. */
  async resolveTerms(
    siteId: string,
    key: string,
    inputs: readonly string[],
  ): Promise<Resolution[]> {
    const tax = await this.getTaxonomyByKey(siteId, key);
    if (!tax) throw new NotFoundError("taxonomy", key);
    const site = await this.site(siteId);
    return resolveTermInputs(await this.#termsOf(tax), inputs, { locale: site.defaultLocale });
  }

  // ───────────────────────────── governance ─────────────────────────────

  #entriesWhere(key: string, ids: readonly string[]): Cond {
    return {
      sql: "EXISTS (SELECT 1 FROM json_each(body, ?) AS t WHERE t.value IN (SELECT value FROM json_each(?)))",
      params: [termsPath(key, "ids"), json(ids)],
    };
  }

  /** Entries assigned to any of `ids`; refuses more than the governance limit. */
  async #entriesUsing(
    siteId: string,
    key: string,
    ids: readonly string[],
  ): Promise<ContentEntry[]> {
    const where = this.#entriesWhere(key, ids);
    const count = await this.#sql.get<{ n: number }>(
      `SELECT count(*) AS n FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND ${where.sql}`,
      [siteId, ...where.params],
    );
    const n = count?.n ?? 0;
    if (n > GOVERNANCE_ENTRY_LIMIT)
      throw new InvariantError(
        "too_large",
        `this operation would change ${n} entries; the limit is ${GOVERNANCE_ENTRY_LIMIT}. Split it, or ask for the staged job`,
        { entries: n, limit: GOVERNANCE_ENTRY_LIMIT },
      );
    return this.#list(siteId, "contentEntry", where);
  }

  /** After the batch, no entry references `ids` (catches entries written after the operation's read). */
  #noReferences(siteId: string, key: string, ids: readonly string[]): Cond {
    const where = this.#entriesWhere(key, ids);
    return {
      sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND ${where.sql})`,
      params: [siteId, ...where.params],
    };
  }

  /** After the batch, no live term has a parent in `ids`. */
  #noChildren(siteId: string, ids: readonly string[]): Cond {
    return {
      sql: "NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'term' AND json_extract(body, '$.status') != 'retired' AND json_extract(body, '$.parentId') IN (SELECT value FROM json_each(?)))",
      params: [siteId, json(ids)],
    };
  }

  #checkSize(batch: OpBatch, plan?: RedirectPlan): void {
    const statements = batch.writes + (plan?.writes ?? 0) + 8;
    if (statements > BATCH_STATEMENT_LIMIT)
      throw new InvariantError(
        "too_large",
        `this operation needs ${statements} statements; one batch takes ${BATCH_STATEMENT_LIMIT}`,
        { statements, limit: BATCH_STATEMENT_LIMIT },
      );
  }

  async #context(
    t: Term,
  ): Promise<{ tax: Taxonomy; site: Site; terms: Term[]; byId: Map<string, Term> }> {
    const tax = await this.getTaxonomy(t.taxonomyId);
    if (!tax) throw new NotFoundError("taxonomy", t.taxonomyId);
    const site = await this.site(t.siteId);
    const terms = await this.#termsOf(tax);
    return { tax, site, terms, byId: new Map(terms.map((x) => [x.id, x])) };
  }

  #noop(): GovernanceResult {
    return { opId: this.#k.newId(ID_PREFIX.operation), terms: [], entries: 0, redirects: [] };
  }

  /** New slug; the old one joins `slugHistory` and its archive redirects (prefix 301). No entry changes. */
  async renameTerm(
    t: Term,
    slug: string,
    opts: { reclaim?: boolean } = {},
  ): Promise<GovernanceResult> {
    const stored = await this.#fresh("term", t);
    if (stored.status === "retired")
      throw new InvariantError("invalid_status", "a retired term cannot be renamed");
    if (slug === stored.slug) return this.#noop();
    const { tax, site, terms } = await this.#context(stored);
    const reclaim = opts.reclaim === true;
    const holders = this.#checkSlug(terms, slug, stored.id, reclaim);
    const ts = this.#k.stamp();
    const history = cap([...(stored.slugHistory ?? []).filter((s) => s !== slug), stored.slug], 50);
    const next: Term = {
      ...stored,
      slug,
      slugHistory: history as [string, ...string[]],
      rev: stored.rev + 1,
      updatedAt: ts,
    };
    assertValid("term", next);
    const batch = this.#batch(site.id, ts);
    // Released first: the term's slug guard runs after the histories no longer hold the slug.
    const released = reclaim ? await this.#releaseSlug(batch, holders, slug, ts) : [];
    await batch.update("term", stored, next, this.#slugGuard(next, reclaim));
    let redirects: Redirect[] = [];
    if (tax.archive.enabled && (reclaim || isPublic(stored))) {
      const plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
      const to = archivePath(tax, slug);
      plan.serve(to, true);
      if (isPublic(stored))
        plan.move(archivePath(tax, stored.slug), to, {
          match: "prefix",
          reason: "slug-change",
          source: { kind: "term", id: stored.id },
        });
      redirects = await plan.emit(batch);
    }
    await runOpBatch(this.#sql, batch, {
      uniqueKind: "term",
      uniqueKey: `${tax.key}:${slug}`,
      diagnose: async () => {
        this.#checkSlug(await this.#termsOf(tax), slug, stored.id, reclaim);
      },
    });
    return { opId: batch.opId, terms: [next, ...released], entries: 0, redirects };
  }

  /**
   * Merges `sources` into `target` (RFC-0002 §4.3): sources retire with `mergedInto`, the target
   * takes their names as alternative names and their slugs into its history, entries and child terms
   * are re-pointed, and each public source's archive redirects to the target's.
   */
  async mergeTerms(sources: readonly Term[], target: Term): Promise<GovernanceResult> {
    const unique = [...new Map(sources.map((s) => [s.id, s])).values()];
    if (unique.length === 0) throw new InvariantError("invalid_status", "nothing to merge");
    if (unique.some((s) => s.id === target.id))
      throw new InvariantError("invalid_status", "a term cannot be merged into itself");
    const tgt = await this.#fresh("term", target);
    const srcs: Term[] = [];
    for (const s of unique) srcs.push(await this.#fresh("term", s));
    if (tgt.status !== "active" || tgt.mergedInto)
      throw new InvariantError("invalid_status", "the merge target must be an active term");
    for (const s of srcs) {
      if (s.status === "retired")
        throw new InvariantError("invalid_status", `term ${s.slug} is already retired`);
      if (s.taxonomyId !== tgt.taxonomyId)
        throw new InvariantError(
          "invalid_assignment",
          `term ${s.slug} belongs to another taxonomy`,
        );
    }
    const { tax, site, terms, byId } = await this.#context(tgt);
    const srcIds = new Set(srcs.map((s) => s.id));
    const ts = this.#k.stamp();

    // Hierarchy: children of a source move under the target.
    const tChain = this.#ancestors(tgt, byId);
    if (tChain.some((a) => srcIds.has(a.id)))
      throw new InvariantError("cycle", `${tgt.slug} lies under a source; move it out first`);
    const children = terms.filter((x) => x.parentId && srcIds.has(x.parentId) && !srcIds.has(x.id));
    const tDepth = tChain.length + 1;
    for (const c of children) {
      const depth = tDepth + this.#height(c.id, terms);
      if (depth > MAX_TERM_DEPTH)
        throw new InvariantError(
          "too_deep",
          `moving ${c.slug} under ${tgt.slug} would be ${depth} levels deep`,
        );
    }
    const earlier = terms.filter((x) => x.mergedInto && srcIds.has(x.mergedInto));
    const entries = await this.#entriesUsing(site.id, tax.key, [...srcIds]);

    // The target keeps the sources' names and slugs so they still resolve.
    const others = terms.filter(
      (x) => x.status !== "retired" && x.id !== tgt.id && !srcIds.has(x.id),
    );
    const taken = new Set<string>();
    for (const o of others) {
      taken.add(o.slug);
      for (const label of Object.values(o.labels)) {
        if (!label) continue;
        taken.add(foldName(label.name));
        for (const a of label.altNames ?? []) taken.add(foldName(a));
      }
    }
    const labels: Term["labels"] = JSON.parse(JSON.stringify(tgt.labels));
    const fallback = labels[site.defaultLocale]
      ? site.defaultLocale
      : (Object.keys(labels)[0] as string);
    for (const s of srcs)
      for (const [loc, label] of Object.entries(s.labels)) {
        if (!label) continue;
        const dest = labels[loc] ?? labels[fallback];
        if (!dest) continue;
        const known = new Set([foldName(dest.name), ...(dest.altNames ?? []).map(foldName)]);
        const add: string[] = [];
        for (const n of [label.name, ...(label.altNames ?? [])]) {
          const f = foldName(n);
          if (!f || known.has(f) || taken.has(f)) continue;
          known.add(f);
          add.push(n);
        }
        if (add.length)
          dest.altNames = cap([...(dest.altNames ?? []), ...add], 50) as [string, ...string[]];
      }
    const slugHistory = cap(
      dedupe([
        ...(tgt.slugHistory ?? []),
        ...srcs.flatMap((s) => [...(s.slugHistory ?? []), s.slug]),
      ]).filter((x) => x !== tgt.slug),
      50,
    );
    const tNext: Term = {
      ...tgt,
      labels,
      ...(slugHistory.length ? { slugHistory: slugHistory as [string, ...string[]] } : {}),
      rev: tgt.rev + 1,
      updatedAt: ts,
    };
    assertValid("term", tNext);

    const batch = this.#batch(site.id, ts);
    const written: Term[] = [];
    for (const s of srcs) {
      const next: Term = {
        ...s,
        status: "retired",
        mergedInto: tgt.id,
        rev: s.rev + 1,
        updatedAt: ts,
      };
      await batch.update("term", s, next);
      written.push(next);
    }
    await batch.update("term", tgt, tNext);
    written.push(tNext);
    for (const x of earlier) {
      const next: Term = { ...x, mergedInto: tgt.id, rev: x.rev + 1, updatedAt: ts };
      await batch.update("term", x, next);
      written.push(next);
    }
    for (const c of children) {
      const next: Term = { ...c, parentId: tgt.id, rev: c.rev + 1, updatedAt: ts };
      await batch.update("term", c, next);
      written.push(next);
    }
    const map = new Map<string, string | null>([...srcIds].map((id) => [id, tgt.id]));
    let changed = 0;
    for (const e of entries) {
      const rewritten = rewriteAssignment(e, tax.key, map);
      if (!rewritten) continue;
      await batch.update("contentEntry", e, { ...rewritten, rev: e.rev + 1, updatedAt: ts });
      changed++;
    }
    let redirects: Redirect[] = [];
    let plan: RedirectPlan | undefined;
    if (tax.archive.enabled) {
      plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
      const to = archivePath(tax, tgt.slug);
      plan.serve(to, true);
      for (const s of srcs) {
        const from = archivePath(tax, s.slug);
        if (isPublic(s))
          plan.move(from, to, {
            match: "prefix",
            reason: "merge",
            source: { kind: "term", id: s.id },
          });
        else plan.repoint(from, to, "prefix");
      }
    }
    this.#checkSize(batch, plan);
    if (plan) redirects = await plan.emit(batch);
    batch.assert(this.#noReferences(site.id, tax.key, [...srcIds]));
    batch.assert(this.#noChildren(site.id, [...srcIds]));
    await runOpBatch(this.#sql, batch);
    return { opId: batch.opId, terms: written, entries: changed, redirects };
  }

  /**
   * Retires a term: removed from every entry, children move up to its parent, and with `redirectTo`
   * (or, in hierarchical taxonomies, a public parent) its archive redirects there. Without a redirect
   * the archive answers 410 (renderer). Refused when a review/published entry would lose the primary
   * term of a required taxonomy: merge instead, or reassign those entries first.
   */
  async retireTerm(t: Term, opts: { redirectTo?: Term } = {}): Promise<GovernanceResult> {
    const stored = await this.#fresh("term", t);
    if (stored.status === "retired")
      throw new InvariantError("invalid_status", "the term is already retired");
    const { tax, site, terms, byId } = await this.#context(stored);
    let target: Term | undefined;
    if (opts.redirectTo) {
      target = byId.get(opts.redirectTo.id);
      if (!target || target.id === stored.id || target.status !== "active" || target.mergedInto)
        throw new InvariantError(
          "invalid_status",
          "redirectTo must be another active term of the same taxonomy",
        );
    } else if (tax.hierarchical && stored.parentId) {
      const parent = byId.get(stored.parentId);
      if (parent && isPublic(parent)) target = parent;
    }
    const entries = await this.#entriesUsing(site.id, tax.key, [stored.id]);
    const map = new Map<string, string | null>([[stored.id, null]]);
    const rewrites: [ContentEntry, ContentEntry][] = [];
    const orphaned: string[] = [];
    for (const e of entries) {
      const next = rewriteAssignment(e, tax.key, map);
      if (!next) continue;
      if (
        tax.required &&
        applies(tax, e.collection) &&
        (e.status === "review" || e.status === "published") &&
        !next.terms?.[tax.key]?.primary
      )
        orphaned.push(e.id);
      rewrites.push([e, next]);
    }
    if (orphaned.length > 0)
      throw new InvariantError(
        "required_term",
        `${orphaned.length} review/published entries would lose their primary ${tax.key}; merge the term instead or reassign them first`,
        { entries: orphaned.slice(0, 20), count: orphaned.length },
      );
    const ts = this.#k.stamp();
    const batch = this.#batch(site.id, ts);
    const next: Term = { ...stored, status: "retired", rev: stored.rev + 1, updatedAt: ts };
    await batch.update("term", stored, next);
    const written: Term[] = [next];
    for (const c of terms.filter((x) => x.parentId === stored.id)) {
      const { parentId: _p, ...base } = c;
      const moved: Term = {
        ...base,
        ...(stored.parentId ? { parentId: stored.parentId } : {}),
        rev: c.rev + 1,
        updatedAt: ts,
      };
      await batch.update("term", c, moved);
      written.push(moved);
    }
    for (const x of terms.filter((x) => x.mergedInto === stored.id)) {
      const { mergedInto: _m, ...base } = x;
      const moved: Term = {
        ...base,
        ...(target ? { mergedInto: target.id } : {}),
        rev: x.rev + 1,
        updatedAt: ts,
      };
      await batch.update("term", x, moved);
      written.push(moved);
    }
    for (const [e, n] of rewrites)
      await batch.update("contentEntry", e, { ...n, rev: e.rev + 1, updatedAt: ts });
    let plan: RedirectPlan | undefined;
    if (tax.archive.enabled && target) {
      plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
      const from = archivePath(tax, stored.slug);
      const to = archivePath(tax, target.slug);
      if (isPublic(stored))
        plan.move(from, to, {
          match: "prefix",
          reason: "retire",
          source: { kind: "term", id: stored.id },
        });
      else plan.repoint(from, to, "prefix");
    }
    this.#checkSize(batch, plan);
    const redirects = plan ? await plan.emit(batch) : [];
    batch.assert(this.#noReferences(site.id, tax.key, [stored.id]));
    batch.assert(this.#noChildren(site.id, [stored.id]));
    await runOpBatch(this.#sql, batch);
    return { opId: batch.opId, terms: written, entries: rewrites.length, redirects };
  }

  /**
   * Moves a term in a hierarchical taxonomy (`null`: to the root). The batch asserts that the new
   * parent's ancestors are unchanged, so two concurrent moves cannot build a cycle.
   */
  async setTermParent(t: Term, parentId: string | null): Promise<GovernanceResult> {
    const stored = await this.#fresh("term", t);
    if (stored.status === "retired")
      throw new InvariantError("invalid_status", "a retired term cannot move");
    if ((stored.parentId ?? null) === parentId) return this.#noop();
    const { tax, site, terms, byId } = await this.#context(stored);
    const chain = this.#checkParent(tax, stored, parentId ?? undefined, byId, terms);
    const ts = this.#k.stamp();
    const { parentId: _p, ...base } = stored;
    const next: Term = {
      ...base,
      ...(parentId ? { parentId } : {}),
      rev: stored.rev + 1,
      updatedAt: ts,
    };
    const batch = this.#batch(site.id, ts);
    await batch.update("term", stored, next);
    for (const [id, hash] of await this.#hashes(chain.map((x) => x.id)))
      batch.expectUnchanged(id, hash);
    await runOpBatch(this.#sql, batch, {
      diagnose: async () => {
        const now = await this.#termsOf(tax);
        this.#checkParent(
          tax,
          stored,
          parentId ?? undefined,
          new Map(now.map((x) => [x.id, x])),
          now,
        );
      },
    });
    return { opId: batch.opId, terms: [next], entries: 0, redirects: [] };
  }

  /** public ↔ internal. Becoming public frees the archive path from stale redirects. */
  async setTermVisibility(t: Term, visibility: Term["visibility"]): Promise<GovernanceResult> {
    const stored = await this.#fresh("term", t);
    if (stored.status === "retired")
      throw new InvariantError("invalid_status", "a retired term has no visibility to change");
    if (stored.visibility === visibility) return this.#noop();
    const ts = this.#k.stamp();
    const next: Term = { ...stored, visibility, rev: stored.rev + 1, updatedAt: ts };
    const batch = this.#batch(stored.siteId, ts);
    await batch.update("term", stored, next);
    await this.#serveArchive(batch, next, ts);
    await runOpBatch(this.#sql, batch);
    return { opId: batch.opId, terms: [next], entries: 0, redirects: [] };
  }

  async #serveArchive(batch: OpBatch, term: Term, ts: string): Promise<void> {
    if (!isPublic(term)) return;
    const tax = await this.getTaxonomy(term.taxonomyId);
    if (!tax?.archive.enabled) return;
    const plan = new RedirectPlan(
      term.siteId,
      await this.listRedirects(term.siteId),
      ts,
      this.#k.newId,
    );
    plan.serve(archivePath(tax, term.slug), true);
    await plan.emit(batch);
  }

  /** A person's decision on a proposed term: approve (→ active), reject (a retire), or merge into an existing term. */
  async reviewTerm(t: Term, decision: ReviewDecision): Promise<GovernanceResult> {
    const stored = await this.#fresh("term", t);
    if (stored.status !== "proposed")
      throw new InvariantError("invalid_status", "only proposed terms are reviewed");
    if ("mergeInto" in decision) return this.mergeTerms([stored], decision.mergeInto);
    if ("reject" in decision) return this.retireTerm(stored);
    const ts = this.#k.stamp();
    const next: Term = { ...stored, status: "active", rev: stored.rev + 1, updatedAt: ts };
    const batch = this.#batch(stored.siteId, ts);
    await batch.update("term", stored, next);
    await this.#serveArchive(batch, next, ts);
    await runOpBatch(this.#sql, batch);
    return { opId: batch.opId, terms: [next], entries: 0, redirects: [] };
  }

  // ───────────────────────────── redirects ─────────────────────────────

  getRedirect(id: string): Promise<Redirect | undefined> {
    return this.#get("redirect", id);
  }

  listRedirects(siteId: string): Promise<Redirect[]> {
    return this.#list(siteId, "redirect", undefined, "key, id");
  }

  /** The redirect for a request path: exact `from` first, then the longest prefix redirect above it. */
  async redirectFor(siteId: string, path: string): Promise<RedirectMatch | undefined> {
    const p = normalisePath(path);
    const ancestors: string[] = [];
    for (let q = p; q.length > 1; ) {
      q = q.slice(0, q.lastIndexOf("/")) || "/";
      ancestors.push(q);
    }
    const candidates = await this.#list(siteId, "redirect", {
      sql: "key IN (SELECT value FROM json_each(?))",
      params: [json([p, ...ancestors])],
    });
    return matchRedirect(candidates, p);
  }

  /** Paths the site serves right now that equal `path` (invariant 14). */
  async #servedBy(site: Site, path: string): Promise<string | undefined> {
    const page = await this.#sql.get<{ id: string }>(
      "SELECT id FROM nodes WHERE site_id = ? AND kind = 'page' AND json_extract(body, '$.path') = ?",
      [site.id, path],
    );
    if (page) return `page ${page.id}`;
    const segs = path.split("/").filter(Boolean);
    if (segs.length === 2) {
      const entry = await this.#sql.get<{ id: string }>(
        "SELECT id FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND key = ? AND json_extract(body, '$.status') = 'published'",
        [site.id, `${segs[0]}:${site.defaultLocale}:${segs[1]}`],
      );
      if (entry) return `entry ${entry.id}`;
    }
    for (const tax of await this.listTaxonomies(site.id)) {
      if (!tax.archive.enabled || !path.startsWith(`${tax.archive.basePath}/`)) continue;
      const slug = path.slice(tax.archive.basePath.length + 1).split("/")[0] as string;
      const term = (await this.#termsOf(tax)).find((x) => x.slug === slug && isPublic(x));
      if (term) return `term ${term.id}`;
    }
    return undefined;
  }

  async #checkManual(r: Redirect, site: Site): Promise<void> {
    const served = await this.#servedBy(site, r.from);
    if (served)
      throw new InvariantError(
        "invalid_redirect",
        `${r.from} is served by ${served}; a redirect cannot shadow it`,
      );
    if (r.status === 302 && r.reason !== "manual")
      throw new InvariantError("invalid_redirect", "302 is only for manual redirects");
  }

  /**
   * Creates a redirect (people; agents only to site paths, enforced by the MCP layer). Its target is
   * collapsed through existing redirects, redirects that pointed at `from` now point at the target,
   * and loops are refused.
   */
  async createRedirect(input: Creatable<Redirect>): Promise<Redirect> {
    const ts = this.#k.stamp();
    const draft: Redirect = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#k.newId(ID_PREFIX.redirect),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("redirect", draft);
    const site = await this.site(draft.siteId);
    await this.#checkManual(draft, site);
    const existing = await this.listRedirects(site.id);
    if (existing.some((x) => x.from === draft.from))
      throw new UniqueConstraintError("redirect", draft.from);
    const to = this.#collapse(existing, draft.to);
    if (splitTarget(to)?.path === draft.from)
      throw new InvariantError(
        "invalid_redirect",
        `a redirect from ${draft.from} to ${draft.to} would loop`,
      );
    const plan = new RedirectPlan(site.id, existing, ts, () => draft.id);
    plan.move(draft.from, to, {
      match: draft.match,
      reason: draft.reason,
      status: draft.status,
      ...(draft.source ? { source: draft.source } : {}),
      ...(draft.note !== undefined ? { note: draft.note } : {}),
      ...(draft.metadata ? { metadata: draft.metadata } : {}),
    });
    const batch = this.#batch(site.id, ts);
    const written = await plan.emit(batch);
    await runOpBatch(this.#sql, batch, { uniqueKind: "redirect", uniqueKey: draft.from });
    return written.find((x) => x.id === draft.id) as Redirect;
  }

  /** Follows site-path targets through existing exact/prefix redirects (no chains, invariant 14). */
  #collapse(redirects: readonly Redirect[], to: string): string {
    let cur = to;
    for (let hop = 0; hop < 25; hop++) {
      const target = splitTarget(cur);
      if (!target) return cur;
      const m = matchRedirect(redirects, target.path);
      if (!m) return cur;
      const next = splitTarget(m.location);
      cur = next ? `${next.path}${target.suffix || next.suffix}` : m.location;
    }
    throw new InvariantError("invalid_redirect", `target ${to} is part of a redirect loop`);
  }

  /**
   * Changes a redirect's target, status, match, note or metadata (CAS). `from` is immutable: delete
   * the redirect and create another. The target is collapsed and loops are refused.
   */
  async updateRedirect(r: Redirect): Promise<Redirect> {
    const stored = await this.#fresh("redirect", r);
    if (r.from !== stored.from || r.siteId !== stored.siteId)
      throw new InvariantError(
        "immutable_field",
        "a redirect's from is immutable; delete it and create another",
      );
    const others = (await this.listRedirects(stored.siteId)).filter((x) => x.id !== stored.id);
    const ts = this.#k.stamp();
    const next: Redirect = {
      ...r,
      to: this.#collapse(others, r.to),
      createdAt: stored.createdAt,
      rev: stored.rev + 1,
      updatedAt: ts,
    };
    assertValid("redirect", next);
    if (next.status === 302 && next.reason !== "manual")
      throw new InvariantError("invalid_redirect", "302 is only for manual redirects");
    if (splitTarget(next.to)?.path === next.from)
      throw new InvariantError(
        "invalid_redirect",
        `a redirect from ${next.from} cannot point to itself`,
      );
    assertNoLoop([...others, next], next.from);
    const res = await this.#sql.run(
      ...stmt(await casUpdateStatement("redirect", next, stored.rev)),
    );
    if (res.changes !== 1)
      throw new ConflictError("redirect", r.id, r.rev, await this.#revOf(r.id));
    return next;
  }

  async deleteRedirect(r: Redirect): Promise<void> {
    const res = await this.#sql.run(
      "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'redirect' AND site_id = ?",
      [r.id, r.rev, r.siteId],
    );
    if (res.changes !== 1)
      throw new ConflictError("redirect", r.id, r.rev, await this.#revOf(r.id));
  }

  // ───────────────────────────── entries ─────────────────────────────

  /**
   * Prepares an entry write (RFC-0002 §4.4): translates a deprecated non-empty `tags` into
   * `terms.tag` (creating `proposed` terms for agents under `propose`, `active` ones for people),
   * normalises empty assignments away and checks invariants 1–5 and 13. Returns the entry to store,
   * the terms to create with it and the guard its write carries.
   */
  async prepareEntry(
    entry: ContentEntry,
    site: Site,
    ts: string,
  ): Promise<{ entry: ContentEntry; newTerms: Term[]; guard: Cond | undefined }> {
    const taxonomies = await this.listTaxonomies(site.id);
    let next = canonicalTerms(entry);
    const newTerms: Term[] = [];
    const tagTax = taxonomies.find((t) => t.key === "tag");
    if (tagTax && Array.isArray(next.tags) && next.tags.length > 0) {
      const terms = await this.#termsOf(tagTax);
      const ids: string[] = [];
      for (const slug of next.tags) {
        const r = resolveTermInputs([...terms, ...newTerms], [slug], {
          locale: site.defaultLocale,
        })[0] as Resolution;
        if (r.matched) {
          ids.push(r.termId);
          continue;
        }
        if (r.reason === "ambiguous")
          throw new InvariantError("invalid_assignment", `tag "${slug}" matches several terms`, {
            candidates: r.candidates,
          });
        if (
          terms.some(
            (t) =>
              (t.status === "retired" && t.slug === slug) || t.slugHistory?.includes(slug) === true,
          )
        )
          throw new InvariantError("term_not_assignable", `tag "${slug}" was retired`);
        const agent = next.author.kind === "agent";
        if (agent && tagTax.allowNewTerms === "none")
          throw new InvariantError(
            "not_allowed",
            `agents cannot add tags here ("${slug}"); ask a person`,
          );
        const status: Term["status"] =
          agent && tagTax.allowNewTerms === "propose" ? "proposed" : "active";
        const term: Term = {
          schemaVersion: 1,
          id: this.#k.newId(ID_PREFIX.term),
          siteId: site.id,
          taxonomyId: tagTax.id,
          slug,
          status,
          visibility: "public",
          labels: { [site.defaultLocale]: { name: humanizeSlug(slug) } },
          ...(status === "proposed" ? { proposedBy: next.author } : {}),
          rev: 0,
          createdAt: ts,
          updatedAt: ts,
        };
        assertValid("term", term);
        newTerms.push(term);
        ids.push(term.id);
      }
      const existing = next.terms?.tag;
      next = {
        ...next,
        terms: {
          ...next.terms,
          tag: {
            ids: dedupe([...(existing?.ids ?? []), ...ids]) as [string, ...string[]],
            ...(existing?.primary ? { primary: existing.primary } : {}),
          },
        },
      };
    }
    if (tagTax) next = { ...next, tags: [] };
    next = canonicalTerms(next);
    assertValid("content-entry", next);
    const known = await this.#checkAssignments(next, taxonomies, newTerms);
    const ids = [...known];
    // The write conflicts if a referenced term was retired or merged since this read (invariant 4).
    const guard: Cond | undefined =
      ids.length > 0
        ? {
            sql: "(SELECT count(*) FROM nodes WHERE kind = 'term' AND site_id = ? AND id IN (SELECT value FROM json_each(?)) AND json_extract(body, '$.status') IN ('active', 'proposed')) = ?",
            params: [site.id, json(ids), ids.length],
          }
        : undefined;
    return { entry: next, newTerms, guard };
  }

  /** Invariants 1–5 and 13 (collection prefix); returns the referenced term ids. */
  async #checkAssignments(
    entry: ContentEntry,
    taxonomies: readonly Taxonomy[],
    newTerms: readonly Term[],
  ): Promise<Set<string>> {
    for (const tax of taxonomies)
      if (tax.archive.enabled && pathsOverlap(`/${entry.collection}`, tax.archive.basePath))
        throw new InvariantError(
          "path_conflict",
          `collection /${entry.collection} collides with the ${tax.key} archive ${tax.archive.basePath}`,
        );
    const byKey = new Map(taxonomies.map((t) => [t.key, t]));
    const all = Object.values(entry.terms ?? {}).flatMap((a) => a?.ids ?? []);
    if (all.length > MAX_TERM_IDS_PER_ENTRY)
      throw new InvariantError(
        "too_many_terms",
        `an entry carries at most ${MAX_TERM_IDS_PER_ENTRY} terms`,
      );
    const terms = await this.#termsByIds(entry.siteId, all);
    for (const t of newTerms) terms.set(t.id, t);
    for (const [key, a] of Object.entries(entry.terms ?? {})) {
      if (!a) continue;
      const tax = byKey.get(key);
      if (!tax) throw new InvariantError("invalid_assignment", `site has no taxonomy "${key}"`);
      if (!applies(tax, entry.collection))
        throw new InvariantError(
          "invalid_assignment",
          `taxonomy "${key}" does not apply to collection "${entry.collection}"`,
        );
      if (a.primary !== undefined && !a.ids.includes(a.primary))
        throw new InvariantError(
          "primary_not_assigned",
          `terms.${key}.primary must be one of terms.${key}.ids`,
        );
      const max = tax.maxPerEntry ?? 50;
      if (a.ids.length > max)
        throw new InvariantError(
          "too_many_terms",
          `"${key}" takes at most ${max} terms per entry`,
          { max },
        );
      for (const id of a.ids) {
        const term = terms.get(id);
        if (!term || term.taxonomyId !== tax.id)
          throw new InvariantError("invalid_assignment", `${id} is not a term of "${key}"`, {
            termId: id,
          });
        if (term.status === "retired")
          throw new InvariantError("term_not_assignable", `term ${term.slug} is retired`, {
            termId: id,
          });
      }
    }
    if (entry.status === "review" || entry.status === "published")
      for (const tax of taxonomies)
        if (tax.required && applies(tax, entry.collection) && !entry.terms?.[tax.key]?.primary)
          throw new InvariantError(
            "required_term",
            `a ${entry.status} entry needs a primary ${tax.key} (terms.${tax.key}.primary)`,
            { taxonomy: tax.key },
          );
    return new Set(all);
  }

  /** After a failed entry write: the more specific reason, if a referenced term moved. */
  async diagnoseEntry(entry: ContentEntry): Promise<void> {
    const taxonomies = await this.listTaxonomies(entry.siteId);
    await this.#checkAssignments(entry, taxonomies, []);
  }

  /**
   * Redirect work for an entry or page write in the site's default locale: a published node that
   * moved leaves `old → new` (exact 301) with chains collapsed; a published node frees its path from
   * redirects (renaming back).
   */
  async planPathChange(
    site: Site,
    ts: string,
    change: {
      readonly locale: string;
      readonly wasPublished: boolean;
      readonly isPublished: boolean;
      readonly oldPath: string | undefined;
      readonly newPath: string;
      readonly source: { kind: "page" | "contentEntry"; id: string };
    },
  ): Promise<RedirectPlan | undefined> {
    if (change.locale !== site.defaultLocale) return undefined;
    const moved =
      change.wasPublished && change.oldPath !== undefined && change.oldPath !== change.newPath;
    if (!moved) {
      if (!change.isPublished) return undefined;
      // Cheap check first: most writes have no redirect at their path.
      const hit = await this.#sql.get<{ id: string }>(
        "SELECT id FROM nodes WHERE site_id = ? AND kind = 'redirect' AND key = ?",
        [site.id, change.newPath],
      );
      if (!hit) return undefined;
    }
    const plan = new RedirectPlan(site.id, await this.listRedirects(site.id), ts, this.#k.newId);
    plan.serve(change.newPath, false);
    if (moved)
      plan.move(change.oldPath as string, change.newPath, {
        match: "exact",
        reason: "slug-change",
        source: change.source,
      });
    return plan.writes > 0 ? plan : undefined;
  }

  /** Invariant 13 for pages: no page path equals or lies under an enabled archive base path. */
  async checkPagePath(page: Page): Promise<void> {
    for (const tax of await this.listTaxonomies(page.siteId))
      if (
        tax.archive.enabled &&
        (page.path === tax.archive.basePath || page.path.startsWith(`${tax.archive.basePath}/`))
      )
        throw new InvariantError(
          "path_conflict",
          `page path ${page.path} lies in the ${tax.key} archive ${tax.archive.basePath}`,
        );
  }

  /** Race guard for `checkPagePath`. */
  pageGuard(page: Page): Cond {
    const base = "json_extract(body, '$.archive.basePath')";
    return {
      sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'taxonomy' AND json_extract(body, '$.archive.enabled') = 1 AND (${base} = ? OR substr(?, 1, length(${base}) + 1) = ${base} || '/'))`,
      params: [page.siteId, page.path, page.path],
    };
  }

  /** `listContentEntries` with a query, compiled to SQL (RFC-0002 §4.6). */
  async listEntries(siteId: string, q: EntryQuery): Promise<ContentEntry[]> {
    const conds: Cond[] = [];
    if (q.collection !== undefined)
      conds.push({ sql: "json_extract(body, '$.collection') = ?", params: [q.collection] });
    if (q.locale !== undefined)
      conds.push({ sql: "json_extract(body, '$.locale') = ?", params: [q.locale] });
    if (q.status)
      conds.push({
        sql: "json_extract(body, '$.status') IN (SELECT value FROM json_each(?))",
        params: [json(q.status)],
      });
    if (q.filter !== undefined) {
      const site = await this.site(siteId);
      const resolved = resolveFilter(
        parseFilter(q.filter),
        { taxonomies: await this.listTaxonomies(siteId), terms: await this.#list(siteId, "term") },
        { locale: site.defaultLocale },
      );
      const f = toSql(resolved, { column: "body" });
      conds.push({ sql: f.sql, params: f.params });
    }
    const where: Cond | undefined = conds.length
      ? {
          sql: conds.map((c) => `(${c.sql})`).join(" AND "),
          params: conds.flatMap((c) => c.params),
        }
      : undefined;
    return this.#list(siteId, "contentEntry", where);
  }
}

function stmt(s: SqlStatement): [string, readonly SqlValue[]] {
  return [s.sql, s.params ?? []];
}
