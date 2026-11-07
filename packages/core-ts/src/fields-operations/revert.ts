/**
 * RFC-0041 §6: `revertFieldOperation` restores the `before` snapshot's definition and the entries
 * the operation touched, as `revertTagsToTerms` does, through the same phases:
 *
 * 1. the site CAS puts the earlier definition back with an inverse marker (a rename reads the new
 *    key as `fromKey`, a type change converts from the new type, …), so readers stay consistent;
 * 2. entries exactly as the operation left them get their earlier body back (new revision);
 *    entries edited since are converted back through the inverse marker instead (`edited`);
 *    translations that were fresh stay fresh;
 * 3. the site CAS drops the marker once nothing is pending, and a `revert …` snapshot closes it.
 *
 * Resumable: a call that ran out of budget answers `done: false`; calling again continues.
 */
import type { ContentEntry, FieldDefinition, FieldMigration, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { convertContext, rewriteFields } from "../fields/migration.ts";
import { sameJson } from "../fields/types.ts";
import { renameSettingsReferences } from "../store/collection-settings.ts";
import { markedField, markerGuard, pendingCondition, phaseCSite, withFields } from "./plan.ts";
import { checkSectionReferences, checkSettingsReferences, renamedPages } from "./references.ts";
import { type Decision, loadEntries, type Row, rewritePass } from "./rewrite.ts";
import { beforeSiteOf } from "./run.ts";
import {
  labelOf,
  nothingPending,
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
  type FieldRevertResult,
  finalKey,
  META,
  type OperationContext,
  operationContext,
  operationKey,
  operationKeys,
} from "./types.ts";

/** The marker that reads the operation's end state as the earlier one's source. */
function inverseMarker(
  id: string,
  op: FieldOperation,
  now: FieldDefinition | undefined,
): FieldMigration | undefined {
  switch (op.op) {
    case "rename_field":
      return { id, fromKey: op.to };
    case "change_field_type":
      return now ? { id, fromType: now.type } : undefined;
    case "set_field_localized":
      return { id, fromLocalized: op.localized };
    case "remove_field":
      return undefined;
  }
}

/** Step 1: the earlier definition back in place, with the inverse marker. */
function restoredSite(site: Site, op: FieldOperation, beforeSite: Site, id: string): Site {
  const was = beforeSite.collections?.[op.collection]?.fields ?? [];
  const index = was.findIndex((d) => d.key === operationKey(op));
  const earlier = was[index] as FieldDefinition;
  const defs = [...(site.collections?.[op.collection]?.fields ?? [])];
  const at = defs.findIndex((d) => d.key === finalKey(op));
  const marker = inverseMarker(id, op, defs[at]);
  const def = (marker ? { ...earlier, migration: marker } : earlier) as FieldDefinition;
  if (at >= 0) defs[at] = def;
  else defs.splice(Math.min(index, defs.length), 0, def);
  const restored = withFields(site, op.collection, defs);
  // RFC-0042 §4: a rename's references in the stage 3 settings follow the key back.
  return op.op === "rename_field"
    ? renameSettingsReferences(restored, op.collection, op.to, op.from)
    : restored;
}

/** The operation that undoes `op` as far as references are concerned (RFC-0042 §4). */
function inverseOf(op: FieldOperation, beforeSite: Site): FieldOperation | undefined {
  if (op.op === "rename_field") return { ...op, from: op.to, to: op.from };
  if (op.op !== "change_field_type") return undefined;
  const was = beforeSite.collections?.[op.collection]?.fields?.find((d) => d.key === op.key);
  if (!was) return undefined;
  return {
    op: "change_field_type",
    collection: op.collection,
    key: op.key,
    type: was.type,
    ...(was.type === "select" ? { options: was.options, multiple: was.multiple === true } : {}),
  };
}

/** Step 1's site write, with a rename's sections renamed back in the same batch. */
async function restoreDefinition(
  ctx: OperationContext,
  record: { op: FieldOperation; beforeSite: Site; id: string },
): Promise<void> {
  const { op, beforeSite, id } = record;
  const site = await requireSite(ctx, beforeSite.id);
  const inverse = inverseOf(op, beforeSite);
  const current = site.collections?.[op.collection]?.fields?.some(
    (d) => inverse && d.key === operationKey(inverse),
  );
  if (inverse && current) {
    await checkSectionReferences(ctx, site, inverse);
    checkSettingsReferences(site, inverse);
  }
  const sections =
    inverse?.op === "rename_field"
      ? (s: Site) =>
          renamedPages(ctx, s, {
            collection: op.collection,
            from: inverse.from,
            to: inverse.to,
          })
      : undefined;
  await writeSite(ctx, site.id, (s) => restoredSite(s, op, beforeSite, id), { pages: sections });
}

/** The entry without what an operation writes: values, the source it points at, stamps. */
function rest(entry: ContentEntry) {
  const { fields: _f, rev: _r, updatedAt: _u, translation, ...others } = entry;
  const { source: _s, ...t } = translation ?? {};
  return { ...others, translation: t };
}

interface Snapshots {
  readonly before: Map<string, string>;
  readonly after: Map<string, string>;
}

/** The earlier bodies of entries the operation alone changed and nobody edited since. */
async function restorable(
  ctx: OperationContext,
  rows: readonly Row[],
  snaps: Snapshots,
): Promise<Map<string, ContentEntry>> {
  const out = new Map<string, ContentEntry>();
  for (const row of rows) {
    const id = row.entry.id;
    const [was, then] = [snaps.before.get(id), snaps.after.get(id)];
    if (!was || !then || was === then || row.hash !== then) continue;
    const earlier = await ctx.store.readSnapshotNode<ContentEntry>({
      id,
      kind: "contentEntry",
      rev: 0,
      hash: was,
    });
    if (sameJson(rest(earlier), rest(row.entry))) out.set(id, earlier);
  }
  return out;
}

export async function revertFieldOperation(
  store: OperationContext["store"],
  siteId: string,
  operationId: string,
  options: FieldOperationOptions,
): Promise<FieldRevertResult> {
  const ctx = operationContext(store, options);
  const record = await readOperation(ctx, siteId, operationId);
  const { op, before, after } = record;
  if (!after)
    throw new InvariantError(
      "field_operation_incomplete",
      `field operation ${operationId} did not finish; continue it, then revert`,
      { operationId },
    );
  if (record.reverted)
    throw new InvariantError(
      "field_operation_incomplete",
      `field operation ${operationId} was already reverted (${record.reverted.id})`,
      { operationId },
    );
  const beforeSite = await beforeSiteOf(ctx, before);
  let site = await requireSite(ctx, siteId);
  const removal = op.op === "remove_field";
  const restoredDef = (site.collections?.[op.collection]?.fields ?? []).some((d) =>
    removal ? d.key === op.key : d.migration?.id === operationId,
  );
  if (!restoredDef) {
    const running = (site.collections?.[op.collection]?.fields ?? []).find((d) => d.migration);
    if (running?.migration) refuseRunning(op.collection, running.migration.id);
    await restoreDefinition(ctx, { op, beforeSite, id: operationId });
  }
  const snaps: Snapshots = {
    before: new Map(before.nodes.map((n) => [n.id, n.hash])),
    after: new Map(after.nodes.map((n) => [n.id, n.hash])),
  };
  const out: FieldRevertResult = { operationId, done: false, restored: 0, edited: [], skipped: [] };
  for (let pass = 0; pass < 3; pass++) {
    site = await requireSite(ctx, siteId);
    const marked = markedField(site, op.collection, operationId);
    const rows = await loadEntries(ctx, siteId, op.collection);
    const earlier = await restorable(ctx, rows, snaps);
    const convert = convertContext(site);
    const decide = (row: Row, translation: boolean): Decision | undefined => {
      const body = earlier.get(row.entry.id);
      if (body) return { replace: body };
      if (!marked) return undefined;
      const r = rewriteFields({
        def: marked.def,
        values: row.entry.fields,
        convert,
        translation,
        pristine: false,
      });
      return r.values ? { fields: r.values, change: r.change } : undefined;
    };
    const r = await rewritePass({
      ctx,
      site,
      rows,
      defs: site.collections?.[op.collection]?.fields ?? [],
      decide,
      guard: marked ? markerGuard(siteId, op.collection, operationId) : undefined,
      freshAlso: (sourceId) => (earlier.has(sourceId) ? snaps.before.get(sourceId) : undefined),
      done: out.restored + out.edited.length,
      lists: { collection: op.collection, keys: operationKeys(op) },
    });
    for (const w of r.written)
      if (w.decision?.replace) out.restored++;
      else if (w.decision?.fields) out.edited.push(w.id);
    out.skipped = r.skipped;
    if (r.exhausted) return out;
    if (r.skipped.length === 0) break;
  }
  const marked = markedField(site, op.collection, operationId);
  if (marked) {
    const pending = pendingCondition(siteId, op.collection, marked.def);
    const wrote = await writeSite(ctx, siteId, (s) => phaseCSite(s, op.collection, operationId), {
      guard: nothingPending(pending),
    });
    if (wrote === "guarded") return out;
  }
  const snapshot = await store.createSnapshot(siteId, {
    actor: options.actor,
    reason: "manual",
    label: labelOf("revert ", op),
    metadata: { [META.kind]: FIELD_MIGRATION, [META.id]: operationId, [META.phase]: "reverted" },
  });
  await settleLists(ctx, siteId, out.restored + out.edited.length);
  return { ...out, done: true, skipped: [], snapshotId: snapshot.id };
}
