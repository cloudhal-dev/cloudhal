/**
 * RFC-0045 §7: the `entry_refs` rows a text ↔ reference decision reads (`text-reference.ts`), the
 * same facts phase C's pending check reads. A pass of the dry run, phase B or the revert loads the
 * collection's rows for the converting field path once; a person's write reads its own node's.
 * Every read filters `site_id`.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { type FieldRows, isTextReference } from "../fields/text-reference.ts";

/** The rows' field path of a running text ↔ reference conversion (`venue`, `speakers.host`). */
export function convertingPath(def: FieldDefinition): string | undefined {
  const m = def.migration;
  if (m?.fromType === undefined) return undefined;
  if (m.sub === undefined) return isTextReference(m.fromType, def.type) ? def.key : undefined;
  const sub = def.type === "repeater" ? def.fields.find((s) => s.key === m.sub) : undefined;
  return sub && isTextReference(m.fromType, sub.type) ? `${def.key}.${m.sub}` : undefined;
}

const NONE: FieldRows = { has: () => false, any: false };

function rowsOf(targets: readonly string[] | undefined): FieldRows {
  if (!targets?.length) return NONE;
  const set = new Set(targets);
  return { has: (t) => set.has(t), any: true };
}

/** Per node, its rows for `def`'s converting path; undefined when `def` converts no such row. */
export async function loadFieldRows(
  sql: SqlDriver,
  at: { siteId: string; collection: string; def: FieldDefinition },
): Promise<((nodeId: string) => FieldRows) | undefined> {
  const path = convertingPath(at.def);
  if (path === undefined) return undefined;
  const rows = await sql.all<{ s: string; t: string }>(
    "SELECT source_id AS s, target_id AS t FROM entry_refs WHERE site_id = ? AND source_collection = ? AND field = ?",
    [at.siteId, at.collection, path],
  );
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.s, [...(by.get(r.s) ?? []), r.t]);
  return (nodeId) => rowsOf(by.get(nodeId));
}

/** One node's rows for the converting path of `defs` (a person's write), or undefined. */
export async function loadNodeRows(
  sql: SqlDriver,
  at: {
    siteId: string;
    nodeId: string | undefined;
    /** The draft's collection: rows the node held in another one are not held here. */
    collection: string;
    defs: readonly FieldDefinition[];
  },
): Promise<FieldRows | undefined> {
  const path = at.defs.map(convertingPath).find((p) => p !== undefined);
  if (path === undefined) return undefined;
  if (at.nodeId === undefined) return NONE;
  const rows = await sql.all<{ t: string }>(
    "SELECT target_id AS t FROM entry_refs WHERE site_id = ? AND source_id = ? AND source_collection = ? AND field = ?",
    [at.siteId, at.nodeId, at.collection, path],
  );
  return rowsOf(rows.map((r) => r.t));
}
