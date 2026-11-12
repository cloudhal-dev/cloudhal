/**
 * RFC-0045 §2 "The index": what `entry_refs` holds for one stored body. One row per (node, field
 * path, stored group id), whatever the target's state; `field` is `venue` or `speakers.person`,
 * `root_key` the top-level key as stored (a running `rename_field` keeps the old key until the
 * entry is rewritten, so keys are read through `migration.fromKey`, as `resolveFields` does).
 * Pairs are deduplicated after the writer canonicalized member ids to group ids. Pure.
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { fieldDefinitions, isRecord, renamedFrom } from "../fields/types.ts";
import { referenceUses } from "./values.ts";

/** One row's varying part: target group, field path, top-level key. */
export interface RefPair {
  /** The stored translation group id. */
  t: string;
  /** `venue`, or `speakers.person` inside a repeater. */
  f: string;
  /** The top-level key the value is stored under. */
  k: string;
}

/** A row as the rebuild writes it (`shared` computed from the definition). */
export interface EntryRefRow extends RefPair {
  shared: 1 | 2;
}

/** `shared`: 1 for `localized: false` (every inheriting member shows it), 2 for `localized: true`. */
export const sharedOf = (def: Pick<FieldDefinition, "localized">): 1 | 2 => (def.localized ? 2 : 1);

/** The JSON path of a collection's definitions in the site body (keys are slugs). */
export const definitionsPath = (collection: string): string =>
  `$.collections."${collection}".fields`;

/** The key `def`'s value is stored under in `values`: its own, else a running rename's old one. */
export function storedKey(
  def: FieldDefinition,
  values: Record<string, unknown>,
): string | undefined {
  if (Object.hasOwn(values, def.key)) return def.key;
  const from = renamedFrom(def);
  return from !== undefined && Object.hasOwn(values, from) ? from : undefined;
}

/** True for definitions whose values can hold group ids. */
export const holdsReferences = (def: FieldDefinition): boolean =>
  def.type === "reference" ||
  (def.type === "repeater" && def.fields.some((s) => s.type === "reference"));

/**
 * The rows of one body's values under `defs`, in order, each (field, target) once. A value that is
 * not a reference value (a malformed import) yields nothing; readers treat it as unresolved.
 */
export function entryRefRows(defs: readonly FieldDefinition[], values: unknown): EntryRefRow[] {
  if (!isRecord(values)) return [];
  const out: EntryRefRow[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (!holdsReferences(def)) continue;
    const k = storedKey(def, values);
    if (k === undefined) continue;
    for (const use of referenceUses(def, values[k], "")) {
      // "/1/person" → "person"; "" or "/2" → the field itself.
      const sub = def.type === "repeater" ? use.path.split("/")[2] : undefined;
      const f = sub === undefined ? k : `${k}.${sub}`;
      const id = `${f}\u0000${use.groupId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ t: use.groupId, f, k, shared: sharedOf(def) });
    }
  }
  return out;
}

/** The rows of an entry body under its site's definitions. */
export function entryRefRowsOf(
  site: Pick<Site, "collections">,
  entry: { collection: string; fields?: unknown },
): EntryRefRow[] {
  return entryRefRows(fieldDefinitions(site, entry.collection), entry.fields);
}

/** The definition (or sub-field) a row's field path names, by key or a running rename's old key. */
export function definitionOfPath(
  defs: readonly FieldDefinition[],
  field: string,
): { def: FieldDefinition; collections: readonly string[] } | undefined {
  const [root, sub] = field.split(".");
  const def = defs.find((d) => d.key === root) ?? defs.find((d) => renamedFrom(d) === root);
  if (!def) return undefined;
  if (def.type === "reference" && sub === undefined) return { def, collections: def.collections };
  if (def.type !== "repeater" || sub === undefined) return undefined;
  // A row written before a sub-field rename names the old sub-key (RFC-0045 §7 `sub`).
  const m = def.migration;
  const key = m?.sub !== undefined && m.fromKey === sub ? m.sub : sub;
  const s = def.fields.find((x) => x.key === key);
  return s?.type === "reference" ? { def, collections: s.collections } : undefined;
}
