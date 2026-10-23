/**
 * RFC-0041 §6: what an operation asks of the site node. The checks a request must pass, the
 * definition it ends with, the marker phase A writes, the SQL predicate of entries it still has
 * to rewrite (phase C's `NOT EXISTS` guard), and the site transforms of phases A and C. Pure
 * except for the predicates' SQL text.
 */
import type { FieldDefinition, FieldMigration, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { RESERVED_FIELD_KEYS } from "../fields/types.ts";
import type { Cond } from "../node-sql.ts";
import { renameSettingsReferences } from "../store/collection-settings.ts";
import { FIELD_OPERATIONS, type FieldOperation, finalKey, operationKey } from "./types.ts";

const KEY = /^[a-z][A-Za-z0-9]{0,39}$/;
const COLLECTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function refuse(code: "unknown_field" | "field_key_duplicate" | "field_key_reserved", msg: string) {
  return new InvariantError(code, msg, { issues: [] });
}

/** The collection's definitions; throws when the collection or the field does not exist. */
export function currentDefinition(
  site: Site,
  op: FieldOperation,
): { defs: readonly FieldDefinition[]; def: FieldDefinition; index: number } {
  if (!FIELD_OPERATIONS.includes(op.op))
    throw new InvariantError("invalid_fields", `unknown field operation ${String(op.op)}`);
  if (!COLLECTION.test(op.collection) || !site.collections?.[op.collection])
    throw new InvariantError(
      "collection_undeclared",
      `${op.collection} is not a declared collection of this site`,
      { collection: op.collection },
    );
  const defs = site.collections[op.collection]?.fields ?? [];
  const key = operationKey(op);
  const index = defs.findIndex((d) => d.key === key);
  const def = defs[index];
  if (!def)
    throw refuse(
      "unknown_field",
      `${key} is not a field of ${op.collection}${defs.length ? `; its fields are ${defs.map((d) => d.key).join(", ")}` : ""}`,
    );
  return { defs, def, index };
}

/** The field another operation is rewriting in this collection, if any. */
export function runningMarker(defs: readonly FieldDefinition[]): FieldMigration | undefined {
  return defs.find((d) => d.migration)?.migration;
}

const COMMON = ["key", "type", "labels", "localized", "requiredToPublish"] as const;

/** The definition `change_field_type` ends with: the shared properties plus the new type's. */
function retyped(def: FieldDefinition, op: Extract<FieldOperation, { op: "change_field_type" }>) {
  const base: Record<string, unknown> = {};
  const was = def as unknown as Record<string, unknown>;
  for (const k of COMMON) if (was[k] !== undefined) base[k] = was[k];
  base.type = op.type;
  if (op.type === "boolean") delete base.requiredToPublish;
  const searchable = "searchable" in def ? def.searchable : undefined;
  if ((op.type === "text" || op.type === "richText") && searchable !== undefined)
    base.searchable = searchable;
  if (op.type === "select") {
    const options = op.options ?? (def.type === "select" ? def.options : undefined);
    if (!options?.length)
      throw new InvariantError("invalid_fields", "a select needs its options", {
        issues: [{ path: "options", code: "invalid_value", message: "at least one option" }],
      });
    base.options = options;
    const multiple = op.multiple ?? (def.type === "select" ? def.multiple : undefined);
    if (multiple) base.multiple = true;
  }
  return base as unknown as FieldDefinition;
}

/** The definition the operation ends with; `null` for `remove_field`. */
export function targetDefinition(def: FieldDefinition, op: FieldOperation): FieldDefinition | null {
  switch (op.op) {
    case "rename_field":
      return { ...def, key: op.to };
    case "set_field_localized":
      return { ...def, localized: op.localized };
    case "remove_field":
      return null;
    case "change_field_type":
      return retyped(def, op);
  }
}

/** Checks the request against the collection; throws when it can never run as written. */
export function checkOperation(site: Site, op: FieldOperation): void {
  const { defs, def } = currentDefinition(site, op);
  if (op.op === "rename_field") {
    if (!KEY.test(op.to))
      throw refuse("field_key_reserved", `${op.to} is not a field key (lower camelCase)`);
    if (RESERVED_FIELD_KEYS.has(op.to))
      throw refuse("field_key_reserved", `${op.to} is reserved (a built-in entry property)`);
    if (defs.some((d) => d.key === op.to))
      throw refuse("field_key_duplicate", `${op.to} is already a field of ${op.collection}`);
  }
  if (op.op === "change_field_type" && def.type === op.type && op.type !== "select")
    throw new InvariantError("invalid_fields", `${def.key} already is a ${op.type} field`);
}

/** Phase A's marker: the operation id and what readers fall back to. */
export function markerOf(id: string, def: FieldDefinition, op: FieldOperation): FieldMigration {
  switch (op.op) {
    case "rename_field":
      return { id, fromKey: def.key };
    case "change_field_type":
      return { id, fromType: def.type };
    case "set_field_localized":
      return { id, fromLocalized: def.localized };
    case "remove_field":
      return { id };
  }
}

/** The site with the collection's field list replaced. */
export function withFields(site: Site, collection: string, fields: FieldDefinition[]): Site {
  const settings = site.collections?.[collection] ?? {};
  const { fields: _old, ...rest } = settings;
  const next = fields.length ? { ...rest, fields: fields as [FieldDefinition] } : rest;
  return { ...site, collections: { ...site.collections, [collection]: next } };
}

/**
 * Phase A: the target definition (or, for a removal, the field as it is) with the marker; a rename
 * also renames the field in the collection's stage 3 settings (RFC-0042 §4).
 */
export function phaseASite(site: Site, op: FieldOperation, id: string): Site {
  const { defs, def, index } = currentDefinition(site, op);
  const marked = { ...(targetDefinition(def, op) ?? def), migration: markerOf(id, def, op) };
  const fields = defs.map((d, i) => (i === index ? (marked as FieldDefinition) : d));
  const next = withFields(site, op.collection, fields);
  return op.op === "rename_field"
    ? renameSettingsReferences(next, op.collection, op.from, op.to)
    : next;
}

/** The field carrying the operation's marker, if the site still has it. */
export function markedField(site: Site, collection: string, id: string) {
  const defs = site.collections?.[collection]?.fields ?? [];
  const index = defs.findIndex((d) => d.migration?.id === id);
  return index < 0 ? undefined : { defs, def: defs[index] as FieldDefinition, index };
}

/** Phase C: the marker dropped (a removed field goes entirely); undefined when it is gone. */
export function phaseCSite(site: Site, collection: string, id: string): Site | undefined {
  const found = markedField(site, collection, id);
  if (!found) return undefined;
  const { defs, def, index } = found;
  const { migration, ...plain } = def;
  const removing = migration && Object.keys(migration).length === 1;
  const fields = removing
    ? defs.filter((_, i) => i !== index)
    : defs.map((d, i) => (i === index ? (plain as FieldDefinition) : d));
  return withFields(site, collection, fields);
}

/** True when the site already shows the operation's end state (phase C ran). */
export function isApplied(site: Site, op: FieldOperation, target: FieldDefinition | null): boolean {
  const defs = site.collections?.[op.collection]?.fields ?? [];
  if (defs.some((d) => d.migration)) return false;
  const now = defs.find((d) => d.key === finalKey(op));
  if (op.op === "remove_field") return now === undefined;
  if (!now || !target) return false;
  if (op.op === "rename_field") return !defs.some((d) => d.key === op.from);
  if (op.op === "set_field_localized") return now.localized === op.localized;
  return (
    now.type === target.type &&
    (now.type !== "select" ||
      (target.type === "select" && (now.multiple === true) === (target.multiple === true)))
  );
}

const IN_COLLECTION =
  "site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ?";

/** JSON types a value of `def` is stored as (phase C's mismatch test after a type change). */
function jsonTypes(def: FieldDefinition): string[] {
  if (def.type === "number") return ["integer", "real"];
  if (def.type === "boolean") return ["true", "false"];
  if (def.type === "datetime") return ["object"];
  if (def.type === "select" && def.multiple) return ["array"];
  return ["text"];
}

/**
 * Entries of the collection the marker still has work for, as a SQL condition (one predicate
 * per operation; keys match the FieldKey pattern, so they are safe in a JSON path).
 */
export function pendingCondition(
  siteId: string,
  collection: string,
  def: FieldDefinition,
): Cond | undefined {
  const m = def.migration;
  if (!m) return undefined;
  const path = `$.fields.${def.key}`;
  const base = { sql: IN_COLLECTION, params: [siteId, collection] };
  if (m.fromKey !== undefined)
    return {
      sql: `${base.sql} AND json_type(body, ?) IS NOT NULL`,
      params: [...base.params, `$.fields.${m.fromKey}`],
    };
  if (m.fromType !== undefined) {
    const types = jsonTypes(def);
    return {
      sql: `${base.sql} AND json_type(body, ?) IS NOT NULL AND json_type(body, ?) NOT IN (${types.map(() => "?").join(", ")})`,
      params: [...base.params, path, path, ...types],
    };
  }
  if (m.fromLocalized !== undefined) {
    if (def.localized) return undefined;
    return {
      sql: `${base.sql} AND json_type(body, ?) IS NOT NULL
        AND json_extract(body, '$.translation.group') IS NOT NULL
        AND json_extract(body, '$.translation.group') != id
        AND json_extract(body, '$.translation.source.siteId') IS NULL`,
      params: [...base.params, path],
    };
  }
  return { sql: `${base.sql} AND json_type(body, ?) IS NOT NULL`, params: [...base.params, path] };
}

/** The site still carries the operation's marker in the collection (phase B's guard). */
export function markerGuard(siteId: string, collection: string, id: string): Cond {
  return {
    sql: `EXISTS (SELECT 1 FROM nodes s, json_each(s.body, '$.collections."${collection}".fields') f
            WHERE s.id = ? AND s.kind = 'site' AND json_extract(f.value, '$.migration.id') = ?)`,
    params: [siteId, id],
  };
}
