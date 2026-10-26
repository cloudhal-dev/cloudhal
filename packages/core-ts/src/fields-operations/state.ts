/**
 * RFC-0041 §6: an operation's durable state. The `before` snapshot (its id is the operation id)
 * keeps the request in its metadata; the site's `migration` marker says phase A ran and C has
 * not; the `after` and `reverted` snapshots close it. Site writes of phases A and C are the site
 * CAS itself, not `updateSite`: the plain-edit guard refuses markers by design, so only these
 * writes may set or drop one. They still pass the precompiled validator and the definition rules.
 */
import { assertValid, type Site, type Snapshot } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { ConflictError, InvariantError, NotFoundError } from "../errors.ts";
import { checkFieldDefinitions, refuseFieldIssues } from "../fields/index.ts";
import { nodeHash } from "../hash.ts";
import { ID_PREFIX, newId } from "../ids.ts";
import { settleListValues } from "../list-values/backfill.ts";
import { planListState } from "../list-values/site-plan.ts";
import { type Cond, casUpdateStatement, OpBatch, runOpBatch } from "../node-sql.ts";
import type { PageRewrite } from "./references.ts";
import {
  FIELD_MIGRATION,
  type FieldOperation,
  META,
  type OperationContext,
  operationKey,
} from "./types.ts";

export interface OperationRecord {
  readonly before: Snapshot;
  readonly op: FieldOperation;
  readonly after: Snapshot | undefined;
  readonly reverted: Snapshot | undefined;
}

/** The snapshot label of a phase: `before rename_field events.speaker`. */
export const labelOf = (prefix: string, op: FieldOperation) =>
  `${prefix}${op.op} ${op.collection}.${operationKey(op)}`.slice(0, 200);

/** The operation `id` of `siteId`, or NotFoundError. */
export async function readOperation(
  ctx: OperationContext,
  siteId: string,
  id: string,
): Promise<OperationRecord> {
  const before = await ctx.store.getSnapshot(id);
  const meta = before?.metadata;
  if (
    !before ||
    before.siteId !== siteId ||
    meta?.[META.kind] !== FIELD_MIGRATION ||
    meta[META.phase] !== "before" ||
    !meta[META.op]
  )
    throw new NotFoundError("field operation", id);
  const later = (await ctx.store.listSnapshots(siteId, 1000)).filter(
    (s) => s.metadata?.[META.kind] === FIELD_MIGRATION && s.metadata[META.id] === id,
  );
  return {
    before,
    op: JSON.parse(meta[META.op] as string) as FieldOperation,
    after: later.find((s) => s.metadata?.[META.phase] === "after"),
    reverted: later.find((s) => s.metadata?.[META.phase] === "reverted"),
  };
}

export async function requireSite(ctx: OperationContext, siteId: string): Promise<Site> {
  const site = await ctx.store.getSite(siteId);
  if (!site) throw new NotFoundError("site", siteId);
  return site;
}

export type SiteWrite = "written" | "unchanged" | "guarded";

/**
 * Writes `transform(site)` with the site CAS (plus `guard`), re-reading on a concurrent site
 * write. `unchanged` when the transform has nothing to do, `guarded` when `guard` failed.
 */
export async function writeSite(
  ctx: OperationContext,
  siteId: string,
  transform: (site: Site) => Site | undefined,
  options: {
    guard?: Cond | undefined;
    /** Pages rewritten in the same batch (a rename's `contentList` sections, RFC-0042 §4). */
    pages?: ((site: Site) => Promise<readonly PageRewrite[]>) | undefined;
  } = {},
): Promise<SiteWrite> {
  const { guard, pages } = options;
  let rev: number | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const site = await requireSite(ctx, siteId);
    const changed = transform(site);
    if (!changed) return "unchanged";
    const next: Site = { ...changed, rev: site.rev + 1, updatedAt: ctx.stamp() };
    assertValid("site", next);
    refuseFieldIssues(checkFieldDefinitions(next));
    const rewrites = (await pages?.(site)) ?? [];
    // RFC-0042 §4: a marker on a listed field changes its fingerprint (phases A and C both).
    const lists = (await planListState(site, next)).statements(
      await nodeHash(next),
      next.updatedAt,
    );
    if (rewrites.length > 0) {
      if (await writeWithPages(ctx, { site, next, guard, rewrites, lists })) return "written";
    } else {
      const s = await casUpdateStatement("site", next, site.rev, guard);
      const sql = ctx.store.sql;
      const r = lists.length
        ? (await sql.batch([s, ...lists]))[0]
        : await sql.run(s.sql, s.params ?? []);
      if (r?.changes === 1) return "written";
    }
    rev = (await ctx.store.getSite(siteId))?.rev;
    if (rev === site.rev && rewrites.length === 0) return "guarded";
  }
  throw new ConflictError("site", siteId, rev ?? 0, rev);
}

/**
 * The site CAS and the pages' CAS in one batch (RFC-0042 §4: a rename's sections), asserted by
 * `op_guards` so that either all land or none (rule 4); false when a node moved meanwhile.
 */
async function writeWithPages(
  ctx: OperationContext,
  write: {
    site: Site;
    next: Site;
    guard: Cond | undefined;
    rewrites: readonly PageRewrite[];
    lists: readonly SqlStatement[];
  },
): Promise<boolean> {
  const batch = new OpBatch(newId(ID_PREFIX.operation), write.site.id, write.next.updatedAt);
  await batch.update("site", write.site, write.next, write.guard);
  for (const p of write.rewrites) {
    assertValid("page", p.next);
    await batch.update("page", p.prev, p.next);
  }
  batch.append(...write.lists);
  try {
    await runOpBatch(ctx.store.sql, batch);
    return true;
  } catch (e) {
    // An `OperationConflictError` is a ConflictError too.
    if (e instanceof ConflictError) return false;
    throw e;
  }
}

/** `NOT EXISTS` over a pending-entries condition (phase C's guard). */
export function nothingPending(pending: Cond | undefined): Cond | undefined {
  if (!pending) return undefined;
  return { sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE ${pending.sql})`, params: pending.params };
}

export function refuseRunning(collection: string, id: string): never {
  throw new InvariantError(
    "operation_in_progress",
    `field operation ${id} is still rewriting ${collection}; continue or revert it first`,
    { operationId: id, collection },
  );
}

/**
 * RFC-0042 §4: once an operation is done, the list values it reset are rebuilt with what is left
 * of its budget (`used` entries so far); the admin job finishes larger collections.
 */
export async function settleLists(ctx: OperationContext, siteId: string, used: number) {
  const ms = ctx.budget.ms - (Date.now() - ctx.started);
  const entries = ctx.budget.entries - used;
  if (entries <= 0 || ms <= 0) return;
  await settleListValues(ctx.store.sql, siteId, { budget: { entries, ms } });
}
