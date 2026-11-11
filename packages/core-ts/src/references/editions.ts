/**
 * RFC-0045 §3 "Language editions": the references a node keeps when it is written on another site
 * of the project. Group ids are shared across sites, so a copied id stays the same id; it is kept
 * when the edition site has a member of that group (by the membership rule, not archived) in a
 * collection the edition's own field allows, and dropped and reported otherwise. A repeater item
 * left with no value is dropped and reported too, so the edition write never fails on "no empty
 * item"; a `requiredToPublish` field emptied this way is fine, the copy is a draft.
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { fieldDefinitions, isRecord, type SiteFields } from "../fields/types.ts";
import { memberGroup } from "./members.ts";
import { entryRefRows, holdsReferences } from "./rows.ts";

/** A value an edition copy did not carry: a reference (`groupId`) or an emptied item. */
export interface EditionDrop {
  /** `fields/venue`, `fields/speakers/1/person`, or an item `fields/speakers/1`. */
  path: string;
  groupId?: string;
}

type Usable = (groupId: string, collections: readonly string[]) => boolean;

/** One value as carried: kept ids only; emptied items and lists dropped. */
function carry(
  def: FieldDefinition,
  value: unknown,
  at: { path: string; usable: Usable; dropped: EditionDrop[] },
): unknown {
  const { path, usable, dropped } = at;
  if (def.type === "reference") {
    const keep = (id: unknown, p: string) => {
      if (typeof id === "string" && usable(id, def.collections)) return true;
      dropped.push({ path: p, ...(typeof id === "string" ? { groupId: id } : {}) });
      return false;
    };
    if (!Array.isArray(value)) return keep(value, path) ? value : undefined;
    const kept = value.filter((id, i) => keep(id, `${path}/${i}`));
    return kept.length > 0 ? kept : undefined;
  }
  if (def.type !== "repeater" || !Array.isArray(value)) return value;
  const items: unknown[] = [];
  value.forEach((item, i) => {
    if (!isRecord(item)) {
      items.push(item);
      return;
    }
    const next: Record<string, unknown> = { ...item };
    for (const sub of def.fields) {
      const v = next[sub.key];
      if (sub.type !== "reference" || v === undefined) continue;
      if (typeof v === "string" && usable(v, sub.collections)) continue;
      delete next[sub.key];
      dropped.push({
        path: `${path}/${i}/${sub.key}`,
        ...(typeof v === "string" ? { groupId: v } : {}),
      });
    }
    if (Object.keys(next).length > 0) items.push(next);
    else dropped.push({ path: `${path}/${i}` });
  });
  return items.length > 0 ? items : undefined;
}

/**
 * `entry`'s fields as written on site `toSite` (its own definitions), with what was dropped.
 * One read of the edition's members of the named groups.
 */
export async function editionReferences(
  sql: SqlDriver,
  toSite: SiteFields & { id: string },
  entry: Pick<ContentEntry, "collection" | "fields">,
): Promise<{ fields: ContentEntry["fields"]; dropped: EditionDrop[] }> {
  const defs = fieldDefinitions(toSite, entry.collection).filter(holdsReferences);
  const ids = [...new Set(entryRefRows(defs, entry.fields).map((r) => r.t))];
  if (ids.length === 0) return { fields: entry.fields, dropped: [] };
  const rows = await sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
      AND json_extract(body, '$.status') <> 'archived'
      AND ((id IN (SELECT value FROM json_each(?)) AND json_extract(body, '$.translation.group') IS NULL)
           OR json_extract(body, '$.translation.group') IN (SELECT value FROM json_each(?)))`,
    [toSite.id, JSON.stringify(ids), JSON.stringify(ids)],
  );
  const where = new Map<string, Set<string>>();
  for (const r of rows) {
    const node = JSON.parse(r.body) as ContentEntry;
    const g = memberGroup(node);
    where.set(g, (where.get(g) ?? new Set()).add(node.collection));
  }
  const usable: Usable = (g, collections) => collections.some((c) => where.get(g)?.has(c));
  const dropped: EditionDrop[] = [];
  const fields: Record<string, unknown> = { ...(entry.fields ?? {}) };
  for (const def of defs) {
    if (!Object.hasOwn(fields, def.key)) continue;
    const value = carry(def, fields[def.key], { path: `fields/${def.key}`, usable, dropped });
    if (value === undefined) delete fields[def.key];
    else fields[def.key] = value;
  }
  return { fields, dropped };
}
