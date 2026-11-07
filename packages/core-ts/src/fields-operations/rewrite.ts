/**
 * RFC-0041 §6 phase B (and the revert's): entries rewritten in guarded batches. Each entry is its
 * own CAS on the revision read, guarded on the site still carrying the operation's marker; an
 * entry changed meanwhile is skipped and planned again from what is stored on the next pass. A
 * translation that was fresh (its `translation.source.hash` was its source's hash) is re-pointed
 * at the source's new hash in the same pass, guarded on that new hash (rule 4), so an operation
 * never makes translations look stale. `asset_refs` rows under `fields.*` follow each entry.
 */
import {
  assertValid,
  type ContentEntry,
  type FieldDefinition,
  type Site,
} from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import type { ValueChange } from "../fields/migration.ts";
import { sameJson } from "../fields/types.ts";
import { nodeHash } from "../hash.ts";
import { passResetStatement } from "../list-values/state-sql.ts";
import { fieldAssetRefs } from "../media/field-refs.ts";
import { and, type Cond, casUpdateStatement, hashIs } from "../node-sql.ts";
import { fieldRefStatements } from "../store/entry-fields.ts";
import { forwardedSource } from "../store/source-forward.ts";
import { FIELD_OPERATION_BATCH, type OperationContext } from "./types.ts";

export interface Row {
  readonly entry: ContentEntry;
  readonly hash: string;
}

/** What happens to one entry: new `fields`, or a whole earlier body (a revert's restore). */
export interface Decision {
  readonly fields?: Record<string, unknown> | undefined;
  readonly replace?: ContentEntry | undefined;
  readonly change?: ValueChange | undefined;
}

export type Decide = (row: Row, translation: boolean) => Decision | undefined;

/** Every entry of a collection, oldest first. */
export async function loadEntries(
  ctx: OperationContext,
  siteId: string,
  collection: string,
): Promise<Row[]> {
  const rows = await ctx.store.sql.all<{ body: string; hash: string }>(
    `SELECT body, hash FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
       AND json_extract(body, '$.collection') = ? ORDER BY created_at, id`,
    [siteId, collection],
  );
  return rows.map((r) => ({ entry: JSON.parse(r.body) as ContentEntry, hash: r.hash }));
}

/** A translation whose original is in the same site (RFC-0041 §5). */
export function isSameSiteTranslation(entry: ContentEntry): boolean {
  const t = entry.translation;
  return !!t && t.group !== entry.id && t.source?.siteId === undefined;
}

interface Planned {
  readonly stored: Row;
  readonly next: ContentEntry;
  readonly hash: string;
  readonly fieldsChanged: boolean;
  readonly anchor: Cond | undefined;
}

export interface PassInput {
  readonly ctx: OperationContext;
  readonly site: Site;
  readonly rows: readonly Row[];
  /** The collection's definitions as stored now (for `asset_refs`). */
  readonly defs: readonly FieldDefinition[];
  readonly decide: Decide;
  /** Every statement's guard: the site still carries the marker (absent: none). */
  readonly guard: Cond | undefined;
  /** A recorded source hash that counts as fresh besides the source's current one. */
  readonly freshAlso?: ((sourceId: string) => string | undefined) | undefined;
  /** Entries this call already rewrote (the budget counts across passes). */
  readonly done: number;
  /**
   * RFC-0042 §4: the collection and the field keys the operation rewrites. Each batch resets
   * (`passResetStatement`) the list values of collections listing one of them, or any other key a
   * body of the batch changes (a revert's restored body can carry an edit made while the
   * operation ran); the backfill rebuilds them once the operation is done.
   */
  readonly lists: { readonly collection: string; readonly keys: readonly string[] };
}

export interface PassResult {
  rewritten: number;
  skipped: { entryId: string; reason: string }[];
  /** Ids written by this pass with their decision (revert reports restored and edited ones). */
  written: { id: string; decision: Decision | undefined }[];
  /** The budget ran out before every planned entry was written. */
  exhausted: boolean;
}

/** Sources before the translations made from them (chains are short; capped at 8). */
function depthOf(row: Row, byId: ReadonlyMap<string, Row>): number {
  let depth = 0;
  let at: Row | undefined = row;
  while (at && depth < 8) {
    const src = at.entry.translation?.source;
    if (!src || src.siteId !== undefined) break;
    at = byId.get(src.id);
    if (at) depth++;
  }
  return depth;
}

/** Plans every entry that changes: its decision and, for fresh translations, the new source. */
async function planPass(input: PassInput, ts: string) {
  const byId = new Map(input.rows.map((r) => [r.entry.id, r]));
  const order = [...input.rows].sort((a, b) => depthOf(a, byId) - depthOf(b, byId));
  const planned = new Map<string, Planned>();
  const decisions = new Map<string, Decision | undefined>();
  for (const row of order) {
    const d = input.decide(row, isSameSiteTranslation(row.entry));
    decisions.set(row.entry.id, d);
    let body: ContentEntry | undefined =
      d?.replace ?? (d?.fields ? { ...row.entry, fields: d.fields } : undefined);
    let anchor: Cond | undefined;
    const src = (body ?? row.entry).translation?.source;
    const from = src && src.siteId === undefined ? planned.get(src.id) : undefined;
    if (src && from) {
      const fresh = src.hash === from.stored.hash || src.hash === input.freshAlso?.(src.id);
      if (fresh) {
        body = forwardedSource(body ?? row.entry, { rev: from.next.rev, hash: from.hash }, ts);
        body = { ...body, rev: row.entry.rev };
        anchor = hashIs(from.next.id, from.hash);
      }
    }
    if (!body) continue;
    const next: ContentEntry = { ...body, rev: row.entry.rev + 1, updatedAt: ts };
    assertValid("content-entry", next);
    planned.set(row.entry.id, {
      stored: row,
      next,
      hash: await nodeHash(next),
      fieldsChanged: d?.fields !== undefined || d?.replace !== undefined,
      anchor,
    });
  }
  return { planned: [...planned.values()], decisions };
}

/** The statements of one entry: its CAS, then its `fields.*` asset rows when values moved. */
async function statementsOf(input: PassInput, p: Planned): Promise<SqlStatement[]> {
  const cas = await casUpdateStatement(
    "contentEntry",
    p.next,
    p.stored.entry.rev,
    and(input.guard, p.anchor),
  );
  if (!p.fieldsChanged) return [cas];
  const refs = fieldAssetRefs(input.defs, p.next.fields);
  return [cas, ...fieldRefStatements(input.site.id, p.next.id, refs, p.hash)];
}

const outOfBudget = (ctx: OperationContext, done: number) =>
  done >= ctx.budget.entries || Date.now() - ctx.started >= ctx.budget.ms;

/** The operation's keys, and every other field key a planned body changes. */
function resetKeys(keys: readonly string[], planned: readonly Planned[]): string[] {
  const out = new Set(keys);
  for (const p of planned) {
    const [was, now] = [p.stored.entry.fields ?? {}, p.next.fields ?? {}];
    for (const k of new Set([...Object.keys(was), ...Object.keys(now)]))
      if (!out.has(k) && !sameJson(was[k], now[k])) out.add(k);
  }
  return [...out];
}

/** One pass over the rows: plan, then write in batches until done or out of budget. */
export async function rewritePass(input: PassInput): Promise<PassResult> {
  const { ctx } = input;
  const { planned, decisions } = await planPass(input, ctx.stamp());
  const out: PassResult = { rewritten: 0, skipped: [], written: [], exhausted: false };
  let i = 0;
  while (i < planned.length) {
    if (outOfBudget(ctx, input.done + out.rewritten)) {
      out.exhausted = true;
      break;
    }
    const statements: SqlStatement[] = [];
    const heads: { index: number; p: Planned }[] = [];
    const room = ctx.budget.entries - input.done - out.rewritten;
    while (i < planned.length && statements.length < FIELD_OPERATION_BATCH && heads.length < room) {
      const p = planned[i++] as Planned;
      heads.push({ index: statements.length, p });
      statements.push(...(await statementsOf(input, p)));
    }
    const batch = heads.map((h) => h.p);
    const ids = batch.map((p) => p.next.id);
    const { collection } = input.lists;
    const keys = resetKeys(input.lists.keys, batch);
    statements.push(
      passResetStatement({ siteId: input.site.id, ids, at: ctx.stamp(), collection, keys }),
    );
    const results = await ctx.store.sql.batch(statements);
    for (const { index, p } of heads) {
      const id = p.next.id;
      if (results[index]?.changes === 1) {
        out.rewritten++;
        out.written.push({ id, decision: decisions.get(id) });
      } else out.skipped.push({ entryId: id, reason: "changed during the operation; retried" });
    }
  }
  return out;
}
