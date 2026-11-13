/**
 * RFC-0041 §6: running a field operation. Dry run first (always); then the `before` snapshot,
 * phase A (the site CAS writes the new definition with its `migration` marker), phase B (entries
 * in guarded batches, resumable), phase C (the site CAS drops the marker, guarded by `NOT EXISTS`
 * over what is still pending) and the `after` snapshot. Only the draft graph changes: the published
 * snapshot keeps the old definitions with the old values until the next publish.
 */
import {
  assertValid,
  type FieldDefinition,
  type Site,
  type Snapshot,
} from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { checkFieldDefinitions, refuseFieldIssues } from "../fields/index.ts";
import { convertContext, rewriteFields, type ValueChange } from "../fields/migration.ts";
import type { FieldRows } from "../fields/text-reference.ts";
import { fieldDefinitions } from "../fields/types.ts";
import { referenceDefinitionOptions } from "../references/capability.ts";
import { loadConversionEntries } from "../references/conversion-load.ts";
import { convertingPath, loadFieldRows } from "../references/conversion-rows.ts";
import { withinReferenceCap } from "./cap.ts";
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
import { checkSectionReferences, checkSettingsReferences, renamedPages } from "./references.ts";
import { buildReport } from "./report.ts";
import { type Decide, loadEntries, rewritePass } from "./rewrite.ts";
import {
  labelOf,
  nothingPending,
  type OperationRecord,
  readOperation,
  refuseRunning,
  requireSite,
  settleLists,
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
  operationKeys,
} from "./types.ts";

/** Passes per call while concurrent edits keep entries skipped. */
const PASSES = 3;
const DRY_RUN_ID = "snap_fielddryrun";

/**
 * How entries change under `def`'s marker; `pristine` per entry from the `before` snapshot. A
 * text ↔ reference conversion's maps and its `entry_refs` rows are read once here, before the
 * pass (RFC-0045 §7): its values are decided by the rows phase C reads.
 */
async function decider(
  ctx: OperationContext,
  site: Site,
  def: FieldDefinition,
  input: {
    op: FieldOperation;
    pristine: (id: string, hash: string) => boolean;
    /** A continuing call's `onInvalid` (RFC-0045 §7), else the request's. */
    onInvalid?: "clear" | undefined;
    /** The pass's rows, when the caller read them for its guard too. */
    rowsOf?: ((nodeId: string) => FieldRows) | undefined;
  },
): Promise<Decide> {
  const { op, pristine } = input;
  const entries = await loadConversionEntries(ctx.store, site, [def]);
  const rowsOf =
    input.rowsOf ??
    (await loadFieldRows(ctx.store.sql, { siteId: site.id, collection: op.collection, def }));
  const convert = { ...convertContext(site), entries };
  const onInvalid = input.onInvalid ?? (op.op === "change_field_type" ? op.onInvalid : undefined);
  const defs = fieldDefinitions(site, op.collection);
  return (row, translation) => {
    const r = rewriteFields({
      def,
      values: row.entry.fields,
      convert: { ...convert, group: row.entry.translation?.group ?? row.entry.id },
      translation,
      pristine: pristine(row.entry.id, row.hash),
      onInvalid,
      rows: rowsOf?.(row.entry.id),
    });
    if (!r.values) return r.change ? { fields: undefined, change: r.change } : undefined;
    return withinReferenceCap(defs, def, { values: r.values, change: r.change, onInvalid });
  };
}

/** The dry run of `op` on the site as it is (every entry counts as untouched). */
async function dryRun(
  ctx: OperationContext,
  site: Site,
  op: FieldOperation,
): Promise<FieldOperationReport> {
  const { def } = currentDefinition(site, op);
  const phaseA = phaseASite(site, op, DRY_RUN_ID);
  const marked = markedField(phaseA, op.collection, DRY_RUN_ID);
  const rows = await loadEntries(ctx, site.id, op.collection);
  return buildReport({
    op,
    before: def,
    after: targetDefinition(def, op),
    rows,
    decide: await decider(ctx, phaseA, marked?.def as FieldDefinition, {
      op,
      pristine: () => true,
    }),
  });
}

/**
 * RFC-0045 §7: the definitions the operation ends with pass the contract and
 * `checkFieldDefinitions` (with the store's capability: the types stay refused until rollout step
 * 7), so the dry run refuses what phase A or C could not write.
 */
async function checkEndState(ctx: OperationContext, site: Site, op: FieldOperation) {
  const end = phaseCSite(phaseASite(site, op, DRY_RUN_ID), op.collection, DRY_RUN_ID) ?? site;
  assertValid("site", end);
  const options = await referenceDefinitionOptions(ctx.store, end, true);
  refuseFieldIssues(checkFieldDefinitions(end, undefined, options));
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
    unconvertible: [],
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
  // RFC-0042 §4: what list fields, expiry, structured data and sections make of the change.
  await checkSectionReferences(ctx, site, op);
  checkSettingsReferences(site, op);
  await checkEndState(ctx, site, op);
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
      unconvertible: [],
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
  const stored = await readOperation(ctx, siteId, operationId);
  // RFC-0045 §7: the call's `onInvalid: "clear"` applies to what is left, so the report counts
  // the values it drops as cleared, without the stored request's refusal.
  const record = { ...stored, op: withOnInvalid(stored.op, options.onInvalid) };
  const site = await requireSite(ctx, siteId);
  const report = await remaining(ctx, site, record);
  if (record.after || record.reverted) return result(record, report, { resumed: true });
  return { ...(await proceed(ctx, record, report, options)), resumed: true };
}

/** `op` with a continuing call's `onInvalid` (only a type change has one). */
function withOnInvalid(op: FieldOperation, onInvalid: "clear" | undefined): FieldOperation {
  return onInvalid !== undefined && op.op === "change_field_type" ? { ...op, onInvalid } : op;
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
      ? await decider(ctx, site, marked.def, {
          op,
          pristine: (id, hash) => hashes.get(id) === hash,
        })
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
      const sections =
        op.op === "rename_field" && op.sub === undefined
          ? (s: Site) =>
              renamedPages(ctx, s, { collection: op.collection, from: op.from, to: op.to })
          : undefined;
      await writeSite(ctx, siteId, (s) => phaseASite(s, op, id), { pages: sections });
      site = await requireSite(ctx, siteId);
    }
  }
  const hashes = new Map(before.nodes.map((n) => [n.id, n.hash]));
  let rewritten = 0;
  let skipped: FieldOperationResult["skipped"] = [];
  let unconvertible: FieldOperationResult["unconvertible"] = [];
  for (let pass = 0; pass < PASSES; pass++) {
    site = await requireSite(ctx, siteId);
    const marked = markedField(site, op.collection, id);
    if (!marked) break;
    // RFC-0045 §7: one read of the converting path's rows, for the decisions and the guard.
    const path = convertingPath(marked.def);
    const rowsOf = await loadFieldRows(ctx.store.sql, {
      siteId,
      collection: op.collection,
      def: marked.def,
    });
    const r = await rewritePass({
      ctx,
      site,
      rows: await loadEntries(ctx, siteId, op.collection),
      defs: marked.defs,
      decide: await decider(ctx, site, marked.def, {
        op,
        pristine: (eid, hash) => hashes.get(eid) === hash,
        onInvalid: options.onInvalid,
        rowsOf,
      }),
      converting: path !== undefined && rowsOf ? { path, rowsOf } : undefined,
      guard: markerGuard(siteId, op.collection, id),
      done: rewritten,
      lists: { collection: op.collection, keys: operationKeys(op) },
    });
    rewritten += r.rewritten;
    skipped = r.skipped;
    unconvertible = r.unconvertible;
    if (r.exhausted)
      return result(record, report, { rewritten, skipped, unconvertible, done: false });
    if (skipped.length === 0) break;
  }
  const marked = markedField(site, op.collection, id);
  if (marked) {
    const pending = pendingCondition(siteId, op.collection, marked.def);
    const wrote = await writeSite(ctx, siteId, (s) => phaseCSite(s, op.collection, id), {
      guard: nothingPending(pending),
    });
    if (wrote === "guarded")
      return result(record, report, { rewritten, skipped, unconvertible, done: false });
  }
  const after = await ctx.store.createSnapshot(siteId, {
    actor: options.actor,
    reason: "manual",
    label: labelOf("", op),
    metadata: { [META.kind]: FIELD_MIGRATION, [META.id]: id, [META.phase]: "after" },
  });
  await settleLists(ctx, siteId, rewritten);
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
