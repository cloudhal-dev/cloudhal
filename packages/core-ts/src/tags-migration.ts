/**
 * Data migration `tags → terms` (RFC-0002, Compatibility & migration): resumable, idempotent and
 * revertible. Snapshots record the run: `before tags-to-terms` (its id is the migration id) and
 * `tags-to-terms`, both with `metadata["cloudhal.migration"] = "0002-tags"`.
 */
import {
  type Actor,
  assertValid,
  type ContentEntry,
  type Snapshot,
  type Taxonomy,
  type Term,
} from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";
import { NotFoundError } from "./errors.ts";
import { ID_PREFIX } from "./ids.ts";
import { humanizeSlug } from "./names.ts";
import { type Cond, casUpdateStatement, OpBatch, runOpBatch } from "./node-sql.ts";
import type { SiteGraphStore } from "./store.ts";

export const TAGS_MIGRATION = "0002-tags";
const KEY = "cloudhal.migration";
const KEY_ID = "cloudhal.migration.id";
const KEY_PHASE = "cloudhal.migration.phase";
/** Entries rewritten per batch. */
export const TAGS_MIGRATION_BATCH = 200;
const TERM_INSERTS_PER_BATCH = 400;
const SYSTEM: Actor = { kind: "system", id: "sys_tagsmigration" };

export interface MigrationContext {
  readonly store: SiteGraphStore;
  readonly sql: SqlDriver;
  stamp(): string;
  newId(prefix: string): string;
  termSlugGuard(term: Term): Cond;
}

export interface TagsMigrationResult {
  /** Id of the `before tags-to-terms` snapshot; pass it to `revertTagsToTerms`. Empty when nothing ran. */
  readonly migrationId: string;
  readonly dryRun: boolean;
  /** An interrupted run was continued (same migration id). */
  readonly resumed: boolean;
  /** Nothing to do: no entry has tags and the default taxonomies exist. */
  readonly upToDate: boolean;
  readonly taxonomiesCreated: string[];
  /** Distinct tag slugs found on entries that still carry `tags`, sorted. */
  readonly tags: string[];
  readonly termsCreated: number;
  readonly termsReused: number;
  /** Entries rewritten (or, in a dry run, that would be). */
  readonly entries: number;
  /** Entries left untouched, with the reason; running the migration again retries them. */
  readonly skipped: { entryId: string; reason: string }[];
  readonly beforeSnapshotId?: string;
  readonly afterSnapshotId?: string;
}

export interface TagsRevertResult {
  readonly migrationId: string;
  /** Entries whose `tags` were restored. */
  readonly restored: number;
  /** Entries edited since the migration, left untouched. */
  readonly edited: string[];
  readonly termsDeleted: number;
  readonly taxonomiesDeleted: string[];
  readonly snapshotId: string;
}

async function migrationSnapshots(store: SiteGraphStore, siteId: string): Promise<Snapshot[]> {
  return (await store.listSnapshots(siteId, 1000)).filter(
    (s) => s.metadata?.[KEY] === TAGS_MIGRATION,
  );
}

async function pendingEntries(sql: SqlDriver, siteId: string): Promise<ContentEntry[]> {
  const rows = await sql.all<{ body: string }>(
    "SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry' AND json_array_length(body, '$.tags') > 0 ORDER BY created_at, id",
    [siteId],
  );
  return rows.map((r) => JSON.parse(r.body) as ContentEntry);
}

/** slug → term id for tags that already have a term; `null` when the slug belongs to a retired term. */
function existingMapping(
  terms: readonly Term[],
  slugs: readonly string[],
): Map<string, string | null> {
  const byId = new Map(terms.map((t) => [t.id, t]));
  const out = new Map<string, string | null>();
  for (const slug of slugs) {
    const live =
      terms.find((t) => t.status !== "retired" && t.slug === slug) ??
      terms.find((t) => t.status !== "retired" && t.slugHistory?.includes(slug) === true);
    if (live) {
      out.set(slug, live.id);
      continue;
    }
    const retired = terms.find((t) => t.status === "retired" && t.slug === slug);
    if (retired) {
      const target = retired.mergedInto ? byId.get(retired.mergedInto) : undefined;
      out.set(slug, target && target.status !== "retired" ? target.id : null);
    }
  }
  return out;
}

export async function migrateTagsToTerms(
  ctx: MigrationContext,
  siteId: string,
  actor: Actor,
  options: { dryRun?: boolean } = {},
): Promise<TagsMigrationResult> {
  const { store, sql } = ctx;
  const site = await store.getSite(siteId);
  if (!site) throw new NotFoundError("site", siteId);
  const dryRun = options.dryRun === true;
  const history = await migrationSnapshots(store, siteId);
  const latest = history[0];
  const resumeId = latest?.metadata?.[KEY_PHASE] === "before" ? latest.id : undefined;
  const pending = await pendingEntries(sql, siteId);
  const taxonomies = await store.listTaxonomies(siteId);
  const missing = (["category", "tag"] as const).filter(
    (k) => !taxonomies.some((t) => t.key === k),
  );
  const tags = [...new Set(pending.flatMap((e) => e.tags))].sort();
  const maxTags = Math.max(0, ...pending.map((e) => e.tags.length));
  const base = {
    dryRun,
    resumed: resumeId !== undefined,
    taxonomiesCreated: dryRun ? [...missing] : ([] as string[]),
    tags,
  };
  if (pending.length === 0 && missing.length === 0 && !resumeId)
    return {
      ...base,
      migrationId: "",
      upToDate: true,
      taxonomiesCreated: [],
      termsCreated: 0,
      termsReused: 0,
      entries: 0,
      skipped: [],
    };

  let tagTax = taxonomies.find((t) => t.key === "tag");
  const tagMax = tagTax ? (tagTax.maxPerEntry ?? 50) : Math.min(50, Math.max(10, maxTags));
  const known = tagTax
    ? existingMapping(await store.listTerms(siteId, { taxonomy: "tag" }), tags)
    : new Map<string, string | null>();
  const toCreate = tags.filter((t) => !known.has(t));
  const plan = (mapping: ReadonlyMap<string, string | null>) => {
    const skipped: { entryId: string; reason: string }[] = [];
    const rewrites: { entry: ContentEntry; ids: string[] }[] = [];
    for (const e of pending) {
      const unmapped = e.tags.filter((t) => mapping.get(t) === null);
      if (unmapped.length) {
        skipped.push({
          entryId: e.id,
          reason: `tags ${unmapped.join(", ")} belong to retired terms`,
        });
        continue;
      }
      const ids = [
        ...new Set([
          ...(e.tags.map((t) => mapping.get(t)) as string[]),
          ...(e.terms?.tag?.ids ?? []),
        ]),
      ];
      const total =
        ids.length +
        Object.entries(e.terms ?? {}).reduce(
          (n, [k, a]) => n + (k === "tag" ? 0 : (a?.ids.length ?? 0)),
          0,
        );
      if (ids.length > tagMax || total > 60) {
        skipped.push({ entryId: e.id, reason: `${ids.length} tags exceed the limit of ${tagMax}` });
        continue;
      }
      rewrites.push({ entry: e, ids });
    }
    return { skipped, rewrites };
  };

  if (dryRun) {
    const fake = new Map(known);
    for (const t of toCreate)
      fake.set(t, `term_dryrun${t.replace(/[^a-z0-9]/g, "").slice(0, 20) || "x"}`);
    const { skipped, rewrites } = plan(fake);
    return {
      ...base,
      migrationId: resumeId ?? "",
      upToDate: false,
      termsCreated: toCreate.length,
      termsReused: tags.length - toCreate.length,
      entries: rewrites.length,
      skipped,
    };
  }

  // 1. Before-snapshot (unless an interrupted run is being continued).
  const before =
    resumeId === undefined
      ? await store.createSnapshot(siteId, {
          actor,
          reason: "manual",
          label: "before tags-to-terms",
          metadata: { [KEY]: TAGS_MIGRATION, [KEY_PHASE]: "before" },
        })
      : undefined;
  const migrationId = resumeId ?? (before as Snapshot).id;
  const marker = { [KEY]: TAGS_MIGRATION, [KEY_ID]: migrationId };

  // 2. Default taxonomies; on existing sites the category starts optional.
  const created: string[] = [];
  if (missing.length > 0) {
    const all = await store.createDefaultTaxonomies(site, {
      categoryRequired: false,
      tagMaxPerEntry: tagMax,
      metadata: marker,
    });
    for (const t of all) if (missing.includes(t.key as "category" | "tag")) created.push(t.key);
    tagTax = all.find((t) => t.key === "tag") as Taxonomy;
  }
  const tax = tagTax as Taxonomy;

  // 3. One active, public tag term per new slug (one batch, or a few for very large vocabularies).
  const ts = ctx.stamp();
  const mapping = new Map(known);
  const newTerms: Term[] = toCreate.map((slug) => ({
    schemaVersion: 1,
    id: ctx.newId(ID_PREFIX.term),
    siteId,
    taxonomyId: tax.id,
    slug,
    status: "active",
    visibility: "public",
    labels: { [site.defaultLocale]: { name: humanizeSlug(slug) } },
    metadata: { ...marker },
    rev: 0,
    createdAt: ts,
    updatedAt: ts,
  }));
  for (let i = 0; i < newTerms.length; i += TERM_INSERTS_PER_BATCH) {
    const batch = new OpBatch(ctx.newId(ID_PREFIX.operation), siteId, ts);
    for (const term of newTerms.slice(i, i + TERM_INSERTS_PER_BATCH)) {
      assertValid("term", term);
      await batch.insert("term", term, ctx.termSlugGuard(term));
    }
    await runOpBatch(sql, batch, { uniqueKind: "term", uniqueKey: "tag" });
  }
  for (const t of newTerms) mapping.set(t.slug, t.id);

  // 4. Entries in batches; each statement is its own CAS (a concurrent edit skips that entry).
  const { skipped, rewrites } = plan(mapping);
  let entries = 0;
  for (let i = 0; i < rewrites.length; i += TAGS_MIGRATION_BATCH) {
    const chunk = rewrites.slice(i, i + TAGS_MIGRATION_BATCH);
    const now = ctx.stamp();
    const statements: SqlStatement[] = [];
    for (const { entry, ids } of chunk) {
      const existing = entry.terms?.tag;
      const next: ContentEntry = {
        ...entry,
        tags: [],
        terms: {
          ...entry.terms,
          tag: {
            ids: ids as [string, ...string[]],
            ...(existing?.primary ? { primary: existing.primary } : {}),
          },
        },
        rev: entry.rev + 1,
        updatedAt: now,
      };
      assertValid("content-entry", next);
      statements.push(
        await casUpdateStatement("contentEntry", next, entry.rev, {
          sql: "(SELECT count(*) FROM nodes WHERE kind = 'term' AND site_id = ? AND id IN (SELECT value FROM json_each(?)) AND json_extract(body, '$.status') IN ('active', 'proposed')) = ?",
          params: [siteId, JSON.stringify(ids), ids.length],
        }),
      );
    }
    const results = await sql.batch(statements);
    results.forEach((r, j) => {
      if (r.changes === 1) entries++;
      else
        skipped.push({
          entryId: chunk[j]?.entry.id as string,
          reason: "changed during the migration; run it again",
        });
    });
  }

  // 5. After-snapshot. Nothing goes live until a person publishes.
  const after = await store.createSnapshot(siteId, {
    actor,
    reason: "manual",
    label: "tags-to-terms",
    metadata: { ...marker, [KEY_PHASE]: "after" },
  });
  return {
    ...base,
    migrationId,
    upToDate: false,
    taxonomiesCreated: created,
    termsCreated: newTerms.length,
    termsReused: tags.length - newTerms.length,
    entries,
    skipped,
    ...(before ? { beforeSnapshotId: before.id } : {}),
    afterSnapshotId: after.id,
  };
}

export async function revertTagsToTerms(
  ctx: MigrationContext,
  siteId: string,
  migrationId: string,
  options: { actor?: Actor } = {},
): Promise<TagsRevertResult> {
  const { store, sql } = ctx;
  const before = await store.getSnapshot(migrationId);
  if (
    !before ||
    before.siteId !== siteId ||
    before.metadata?.[KEY] !== TAGS_MIGRATION ||
    before.metadata?.[KEY_PHASE] !== "before"
  )
    throw new NotFoundError("tags-to-terms migration", migrationId);
  const after = (await migrationSnapshots(store, siteId)).find(
    (s) => s.metadata?.[KEY_ID] === migrationId && s.metadata?.[KEY_PHASE] === "after",
  );
  if (!after)
    throw new Error(
      `migration ${migrationId} did not finish; run it again to complete it, then revert`,
    );

  // 1. Entries still exactly as the migration left them get their earlier body back.
  const current = new Map((await store.currentNodeRefs(siteId)).map((r) => [r.id, r]));
  const beforeRefs = new Map(before.nodes.map((r) => [r.id, r]));
  const edited: string[] = [];
  const restores: SqlStatement[] = [];
  const restoreIds: string[] = [];
  const ts = ctx.stamp();
  for (const ref of after.nodes) {
    if (ref.kind !== "contentEntry") continue;
    const old = beforeRefs.get(ref.id);
    if (!old || old.hash === ref.hash) continue;
    const prev = await store.readSnapshotNode<ContentEntry>(old);
    if (!prev.tags?.length) continue;
    const now = current.get(ref.id);
    if (!now) continue;
    if (now.hash !== ref.hash) {
      edited.push(ref.id);
      continue;
    }
    const next: ContentEntry = { ...prev, rev: now.rev + 1, updatedAt: ts };
    assertValid("content-entry", next);
    restores.push(await casUpdateStatement("contentEntry", next, now.rev));
    restoreIds.push(ref.id);
  }
  let restored = 0;
  for (let i = 0; i < restores.length; i += TAGS_MIGRATION_BATCH) {
    const results = await sql.batch(restores.slice(i, i + TAGS_MIGRATION_BATCH));
    results.forEach((r, j) => {
      if (r.changes === 1) restored++;
      else edited.push(restoreIds[i + j] as string);
    });
  }

  // 2. Terms the migration created that nothing uses any more, then its empty taxonomies.
  const mine = (m?: Record<string, string | undefined>) => m?.[KEY_ID] === migrationId;
  const terms = (await store.listTerms(siteId)).filter((t) => mine(t.metadata));
  let termsDeleted = 0;
  if (terms.length > 0) {
    const results = await sql.batch(
      terms.map((t) => ({
        sql: `DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'term' AND site_id = ?
                AND NOT EXISTS (SELECT 1 FROM nodes e WHERE e.site_id = ? AND e.kind = 'contentEntry'
                                AND EXISTS (SELECT 1 FROM json_each(e.body, '$.terms') a, json_each(a.value, '$.ids') i WHERE i.value = ?))
                AND NOT EXISTS (SELECT 1 FROM nodes x WHERE x.site_id = ? AND x.kind = 'term'
                                AND (json_extract(x.body, '$.mergedInto') = ? OR json_extract(x.body, '$.parentId') = ?))`,
        params: [t.id, t.rev, siteId, siteId, t.id, siteId, t.id, t.id],
      })),
    );
    termsDeleted = results.filter((r) => r.changes === 1).length;
  }
  const taxonomiesDeleted: string[] = [];
  for (const tax of await store.listTaxonomies(siteId)) {
    if (!mine(tax.metadata)) continue;
    const r = await sql.run(
      `DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'taxonomy' AND site_id = ?
         AND NOT EXISTS (SELECT 1 FROM nodes t WHERE t.site_id = ? AND t.kind = 'term' AND json_extract(t.body, '$.taxonomyId') = ?)
         AND NOT EXISTS (SELECT 1 FROM nodes e WHERE e.site_id = ? AND e.kind = 'contentEntry' AND json_extract(e.body, ?) IS NOT NULL)`,
      [tax.id, tax.rev, siteId, siteId, tax.id, siteId, `$.terms."${tax.key}"`],
    );
    if (r.changes === 1) taxonomiesDeleted.push(tax.key);
  }

  const snapshot = await store.createSnapshot(siteId, {
    actor: options.actor ?? SYSTEM,
    reason: "manual",
    label: "revert tags-to-terms",
    metadata: { [KEY]: TAGS_MIGRATION, [KEY_ID]: migrationId, [KEY_PHASE]: "reverted" },
  });
  return {
    migrationId,
    restored,
    edited,
    termsDeleted,
    taxonomiesDeleted,
    snapshotId: snapshot.id,
  };
}
