/**
 * RFC-0041 §6: running a field operation. Dry run first (always); then the `before` snapshot,
 * phase A (the site CAS writes the new definition with its `migration` marker), phase B (entries
 * in guarded batches, resumable), phase C (the site CAS drops the marker, guarded by `NOT EXISTS`
 * over what is still pending) and the `after` snapshot. Only the draft graph changes: the published
 * snapshot keeps the old definitions with the old values until the next publish.
 */
import type { FieldDefinition, Site, Snapshot } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { convertContext, rewriteFields } from "../fields/migration.ts";
import {
  checkOperation,
  currentDefinition,
  isApplied,
  markedField,
  markerGuard,
  pendingCondition,
  phaseASite,
  phaseCSite,
  runningMarker,
  targetDefinition,
} from "./plan.ts";
import { buildReport } from "./report.ts";
import { type Decide, loadEntries, rewritePass } from "./rewrite.ts";
import {
  labelOf,
  nothingPending,
  type OperationRecord,
  readOperation,
  refuseRunning,
  requireSite,
  writeSite,
} from "./state.ts";
import {
  FIELD_MIGRATION,
  type FieldOperation,
  type FieldOperationOptions,
  type FieldOperationReport,
  type FieldOperationResult,
  type FieldOperationStatus,
  META,
  type OperationContext,
  operationContext,
} from "./types.ts";

/** Passes per call while concurrent edits keep entries skipped. */
const PASSES = 3;
const DRY_RUN_ID = "snap_fielddryrun";

/** How entries change under `def`'s marker; `pristine` per entry from the `before` snapshot. */
function decider(
  site: Site,
  def: FieldDefinition,
  op: FieldOperation,
  pristine: (id: string, hash: string) => boolean,
): Decide {
  const convert = convertContext(site);
  const onInvalid = op.op === "change_field_type" ? op.onInvalid : undefined;
  return (row, translation) => {
    const r = rewriteFields({
      def,
      values: row.entry.fields,
      convert,
      translation,
      pristine: pristine(row.entry.id, row.hash),
      onInvalid,
    });
    return r.values || r.change ? { fields: r.values, change: r.change } : undefined;
  };
}

/** The dry run of `op` on the site as it is (every entry counts as untouched). */
async function dryRun(
  ctx: OperationContext,
  site: Site,
  op: FieldOperation,
): Promise<FieldOperationReport> {
  const { def } = currentDefinition(site, op);
  const marked = markedField(phaseASite(site, op, DRY_RUN_ID), op.collection, DRY_RUN_ID);
  const rows = await loadEntries(ctx, site.id, op.collection);
  return buildReport({
    op,
    before: def,
    after: targetDefinition(def, op),
    rows,
    decide: decider(site, marked?.def as FieldDefinition, op, () => true),
  });
}

function result(
  record: Pick<OperationRecord, "before"> & { after?: Snapshot | undefined },
  report: FieldOperationReport,
  extra: Partial<FieldOperationResult>,
): FieldOperationResult {
  return {
    operationId: record.before.id,
    dryRun: false,
    done: record.after !== undefined,
    resumed: false,
    report,
    rewritten: 0,
    skipped: [],
    beforeSnapshotId: record.before.id,
    ...(record.after ? { afterSnapshotId: record.after.id } : {}),
    ...extra,
  };
}

/**
 * Runs `op` (or only reports it with `dryRun`). Refuses while another operation rewrites the
 * collection (`operation_in_progress`) and, for a type change, values the table cannot convert
 * without `onInvalid: "clear"` (`field_values_unconvertible`, the report in `details.report`).
 * Answers `done: false` when the budget ran out; `continueFieldOperation` resumes.
 */
export async function runFieldOperation(
  store: OperationContext["store"],
  siteId: string,
  op: FieldOperation,
  options: FieldOperationOptions & { dryRun?: boolean },
): Promise<FieldOperationResult> {
  const ctx = operationContext(store, options);
  const site = await requireSite(ctx, siteId);
  checkOperation(site, op);
  const running = runningMarker(site.collections?.[op.collection]?.fields ?? []);
  if (running) refuseRunning(op.collection, running.id);
  const report = await dryRun(ctx, site, op);
  if (options.dryRun)
    return {
      operationId: "",
      dryRun: true,
      done: false,
      resumed: false,
      report,
      rewritten: 0,
      skipped: [],
    };
  if (report.refusal)
    throw new InvariantError("field_values_unconvertible", report.refusal.message, { report });
  const before = await store.createSnapshot(siteId, {
    actor: options.actor,
    reason: "manual",
    label: labelOf("before ", op),
    metadata: {
      [META.kind]: FIELD_MIGRATION,
      [META.phase]: "before",
      [META.op]: JSON.stringify(op),
    },
  });
  return proceed(ctx, { before, op, after: undefined, reverted: undefined }, report, options);
}

/** Resumes an interrupted or budget-limited operation from its marker. */
export async function continueFieldOperation(
  store: OperationContext["store"],
  siteId: string,
  operationId: string,
  options: FieldOperationOptions,
): Promise<FieldOperationResult> {
  const ctx = operationContext(store, options);
  const record = await readOperation(ctx, siteId, operationId);
  const site = await requireSite(ctx, siteId);
  const report = await remaining(ctx, site, record);
  if (record.after || record.reverted) return result(record, report, { resumed: true });
  return { ...(await proceed(ctx, record, report, options)), resumed: true };
}

/** The report of what is left: through the marker when phase A ran, else the dry run. */
async function remaining(
  ctx: OperationContext,
  site: Site,
  record: OperationRecord,
): Promise<FieldOperationReport> {
  const { op, before } = record;
  const marked = markedField(site, op.collection, before.id);
  const beforeSite = await beforeSiteOf(ctx, before);
  const { def } = currentDefinition(beforeSite, op);
  const closed = record.after !== undefined || record.reverted !== undefined;
  if (!marked && !closed && !isApplied(site, op, targetDefinition(def, op)))
    return dryRun(ctx, site, op);
  const hashes = new Map(before.nodes.map((n) => [n.id, n.hash]));
  return buildReport({
    op,
    before: def,
    after: targetDefinition(def, op),
    rows: marked ? await loadEntries(ctx, site.id, op.collection) : [],
    decide: marked
      ? decider(site, marked.def, op, (id, hash) => hashes.get(id) === hash)
      : () => undefined,
  });
}

/** The site node as the `before` snapshot captured it. */
export async function beforeSiteOf(ctx: OperationContext, before: Snapshot): Promise<Site> {
  const ref = before.nodes.find((n) => n.kind === "site");
  if (!ref) throw new InvariantError("field_operation_incomplete", "the snapshot has no site");
  return ctx.store.readSnapshotNode<Site>(ref);
}

/** Phases A, B and C from wherever the operation stands. */
async function proceed(
  ctx: OperationContext,
  record: OperationRecord,
  report: FieldOperationReport,
  options: FieldOperationOptions,
): Promise<FieldOperationResult> {
  const { op, before } = record;
  const id = before.id;
  const siteId = before.siteId;
  let site = await requireSite(ctx, siteId);
  if (!markedField(site, op.collection, id)) {
    const { def } = currentDefinition(await beforeSiteOf(ctx, before), op);
    if (!isApplied(site, op, targetDefinition(def, op))) {
      const running = runningMarker(site.collections?.[op.collection]?.fields ?? []);
      if (running) refuseRunning(op.collection, running.id);
      await writeSite(ctx, siteId, (s) => phaseASite(s, op, id));
      site = await requireSite(ctx, siteId);
    }
  }
  const hashes = new Map(before.nodes.map((n) => [n.id, n.hash]));
  let rewritten = 0;
  let skipped: FieldOperationResult["skipped"] = [];
  for (let pass = 0; pass < PASSES; pass++) {
    site = await requireSite(ctx, siteId);
    const marked = markedField(site, op.collection, id);
    if (!marked) break;
    const r = await rewritePass({
      ctx,
      site,
      rows: await loadEntries(ctx, siteId, op.collection),
      defs: marked.defs,
      decide: decider(site, marked.def, op, (eid, hash) => hashes.get(eid) === hash),
      guard: markerGuard(siteId, op.collection, id),
      done: rewritten,
    });
    rewritten += r.rewritten;
    skipped = r.skipped;
    if (r.exhausted) return result(record, report, { rewritten, skipped, done: false });
    if (skipped.length === 0) break;
  }
  const marked = markedField(site, op.collection, id);
  if (marked) {
    const pending = pendingCondition(siteId, op.collection, marked.def);
    const wrote = await writeSite(
      ctx,
      siteId,
      (s) => phaseCSite(s, op.collection, id),
      nothingPending(pending),
    );
    if (wrote === "guarded") return result(record, report, { rewritten, skipped, done: false });
  }
  const after = await ctx.store.createSnapshot(siteId, {
    actor: options.actor,
    reason: "manual",
    label: labelOf("", op),
    metadata: { [META.kind]: FIELD_MIGRATION, [META.id]: id, [META.phase]: "after" },
  });
  return result({ before, after }, report, { rewritten, skipped: [], done: true });
}

/** Where an operation stands, with the entries still to rewrite or restore. */
export async function fieldOperationStatus(
  store: OperationContext["store"],
  siteId: string,
  operationId: string,
): Promise<FieldOperationStatus> {
  const ctx = operationContext(store, {});
  const record = await readOperation(ctx, siteId, operationId);
  const site = await requireSite(ctx, siteId);
  const marked = markedField(site, record.op.collection, operationId);
  let pending = 0;
  const cond = marked ? pendingCondition(siteId, record.op.collection, marked.def) : undefined;
  if (cond) {
    const row = await store.sql.get<{ n: number }>(
      `SELECT count(*) AS n FROM nodes WHERE ${cond.sql}`,
      cond.params,
    );
    pending = Number(row?.n ?? 0);
  }
  const state = record.reverted
    ? "reverted"
    : record.after
      ? marked
        ? "reverting"
        : "done"
      : "running";
  return {
    operationId,
    operation: record.op,
    state,
    pending,
    beforeSnapshotId: record.before.id,
    ...(record.after ? { afterSnapshotId: record.after.id } : {}),
    ...(record.reverted ? { revertSnapshotId: record.reverted.id } : {}),
  };
}
