/**
 * RFC-0045 §3 "Language editions": the references a node keeps when it is written on another site
 * of the project. Group ids are shared across sites, so a copied id stays the same id. What is
 * kept is exactly what the edition's own write accepts (§2.1), so the edition write never fails
 * on what the edition cannot carry:
 *
 * - a group with a member of the edition site (membership rule, not archived) in a collection the
 *   edition's field allows, meeting the field's `where` (every value of a copy is newly chosen);
 * - for a single-target field, the first such id; for a multiple one, at most `maxItems`;
 * - at most 100 references per entry across fields and items;
 * - a repeater item left with no value is dropped, and at most `maxItems` items are kept.
 *
 * Values are read through a running rename's `migration.fromKey` and written back under the key
 * they were read from (`storedKey`, as `entryRefRows` reads them). Every value not carried is
 * reported with its path and why. A `requiredToPublish` field emptied this way is fine: the copy
 * is a draft.
 */
import type { ContentEntry, FieldCondition, FieldDefinition } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { matchesFieldQuery, parseFieldQuery } from "../fields/query.ts";
import { resolveFields } from "../fields/resolve.ts";
import { FIELD_LIMITS, fieldDefinitions, isRecord, type SiteFields } from "../fields/types.ts";
import { memberGroup } from "./members.ts";
import { entryRefRows, holdsReferences, storedKey } from "./rows.ts";

/** Why a value was not carried. */
export type EditionDropReason = "missing" | "where" | "single" | "maxItems" | "cap" | "empty";

/** A value an edition copy did not carry: a reference (`groupId`) or a whole item. */
export interface EditionDrop {
  /** `fields/venue`, `fields/speakers/1/person`, or an item `fields/speakers/1`. */
  path: string;
  groupId?: string;
  reason: EditionDropReason;
}

interface Target {
  collections: readonly string[];
  where?: readonly FieldCondition[] | undefined;
}

/** Whether the edition takes `groupId` for a target, and why not. */
type Usable = (groupId: string, target: Target) => "missing" | "where" | undefined;

interface Carry {
  usable: Usable;
  dropped: EditionDrop[];
  /** References still allowed in this entry (the per-entry cap). */
  budget: { left: number };
}

/** One reference id: kept, or dropped with its reason. */
function keep(id: unknown, at: { path: string; target: Target; carry: Carry }): id is string {
  const { path, target, carry } = at;
  const why =
    typeof id !== "string"
      ? "missing"
      : (carry.usable(id, target) ?? (carry.budget.left > 0 ? undefined : "cap"));
  if (why === undefined) {
    carry.budget.left--;
    return true;
  }
  carry.dropped.push({ path, ...(typeof id === "string" ? { groupId: id } : {}), reason: why });
  return false;
}

function carryReference(
  def: Extract<FieldDefinition, { type: "reference" }>,
  value: unknown,
  at: { path: string; carry: Carry },
): unknown {
  const { path, carry } = at;
  const ids = Array.isArray(value) ? value : [value];
  const pathOf = (i: number) => (Array.isArray(value) ? `${path}/${i}` : path);
  const target = { collections: def.collections, where: def.where };
  const kept: string[] = [];
  const max = def.multiple ? (def.maxItems ?? FIELD_LIMITS.listItems) : 1;
  ids.forEach((id, i) => {
    if (kept.length >= max) {
      const reason = def.multiple ? "maxItems" : "single";
      carry.dropped.push({
        path: pathOf(i),
        ...(typeof id === "string" ? { groupId: id } : {}),
        reason,
      });
      return;
    }
    if (keep(id, { path: pathOf(i), target, carry })) kept.push(id);
  });
  if (kept.length === 0) return undefined;
  return def.multiple ? kept : kept[0];
}

function carryRepeater(
  def: Extract<FieldDefinition, { type: "repeater" }>,
  value: unknown,
  at: { path: string; carry: Carry },
): unknown {
  const { path, carry } = at;
  if (!Array.isArray(value)) return value;
  const max = def.maxItems ?? FIELD_LIMITS.listItems;
  const items: unknown[] = [];
  value.forEach((item, i) => {
    if (items.length >= max) {
      carry.dropped.push({ path: `${path}/${i}`, reason: "maxItems" });
      return;
    }
    if (!isRecord(item)) {
      items.push(item);
      return;
    }
    const next: Record<string, unknown> = { ...item };
    for (const sub of def.fields) {
      if (sub.type !== "reference" || next[sub.key] === undefined) continue;
      const target = { collections: sub.collections };
      if (!keep(next[sub.key], { path: `${path}/${i}/${sub.key}`, target, carry }))
        delete next[sub.key];
    }
    if (Object.keys(next).length > 0) items.push(next);
    else carry.dropped.push({ path: `${path}/${i}`, reason: "empty" });
  });
  return items.length > 0 ? items : undefined;
}

/** The edition's members of `ids`, and the test a target applies to them. */
async function usableOn(
  sql: SqlDriver,
  site: SiteFields & { id: string },
  ids: readonly string[],
): Promise<Usable> {
  const rows = await sql.all<{ id: string; body: string }>(
    `SELECT id, body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
      AND json_extract(body, '$.status') <> 'archived'
      AND ((id IN (SELECT value FROM json_each(?)) AND json_extract(body, '$.translation.group') IS NULL)
           OR json_extract(body, '$.translation.group') IN (SELECT value FROM json_each(?)))`,
    [site.id, JSON.stringify(ids), JSON.stringify(ids)],
  );
  const members = rows.map((r) => JSON.parse(r.body) as ContentEntry);
  const byId = new Map(members.map((m) => [m.id, m]));
  return (groupId, target) => {
    const of = members.filter(
      (m) => memberGroup(m) === groupId && target.collections.includes(m.collection),
    );
    if (of.length === 0) return "missing";
    const [one] = target.collections;
    if (!target.where || one === undefined) return undefined;
    const parsed = parseFieldQuery(site, one, { where: [...target.where] });
    if (!parsed.ok) return undefined;
    // `where` cannot use `now` (§1), so the instant is irrelevant.
    const meets = of.some((m) =>
      matchesFieldQuery(resolveFields(site, m, byId.get(memberGroup(m))), parsed.query, 0),
    );
    return meets ? undefined : "where";
  };
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
  const carry: Carry = {
    usable: await usableOn(sql, toSite, ids),
    dropped: [],
    budget: { left: FIELD_LIMITS.referencesPerEntry },
  };
  const fields: Record<string, unknown> = { ...(entry.fields ?? {}) };
  for (const def of defs) {
    const key = storedKey(def, fields);
    if (key === undefined) continue;
    const at = { path: `fields/${key}`, carry };
    const value =
      def.type === "reference"
        ? carryReference(def, fields[key], at)
        : def.type === "repeater"
          ? carryRepeater(def, fields[key], at)
          : fields[key];
    if (value === undefined) delete fields[key];
    else fields[key] = value;
  }
  return { fields, dropped: carry.dropped };
}
