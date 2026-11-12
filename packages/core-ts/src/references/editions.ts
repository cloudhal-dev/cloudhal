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
import { GROUP_ID_PATTERN } from "../fields/props.ts";
import type { FieldRows } from "../fields/text-reference.ts";
import {
  FIELD_LIMITS,
  fieldDefinitions,
  isRecord,
  type SiteFields,
  sameJson,
} from "../fields/types.ts";
import { conversionCollections, conversionEntries, foldText } from "./conversion-maps.ts";
import { convertingPath, loadNodeRows } from "./conversion-rows.ts";
import { entryRefRows, holdsReferences, storedKey } from "./rows.ts";
import { readMembers, targetProblem } from "./targets.ts";
import { referenceUses } from "./values.ts";

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
  /**
   * RFC-0045 §7: under a running text → reference conversion, text the edition site's maps
   * convert to exactly one group (its own write converts it); any other text is dropped.
   */
  converts: (text: string) => boolean;
}

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/** A string that is no group id under a running text → reference marker (top-level or `sub`). */
function unconvertedText(
  m: FieldDefinition["migration"],
  key: string,
  value: unknown,
  sub = false,
): boolean {
  const converting = m?.fromType === "text" && (sub ? m.sub === key : m.sub === undefined);
  return converting && typeof value === "string" && !GROUP_ID.test(value);
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
  // Text a running text → reference conversion has not converted yet: the edition's own write
  // converts it through its markers, so it is carried as it is.
  if (unconvertedText(def.migration, def.key, value) && at.carry.converts(value as string))
    return value;
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
    // A running sub-field rename's items still hold the old key (as `referenceUses` reads them).
    const m = def.migration;
    for (const sub of def.fields) {
      if (sub.type !== "reference") continue;
      const key =
        next[sub.key] === undefined && m?.sub === sub.key && m.fromKey !== undefined
          ? m.fromKey
          : sub.key;
      if (next[key] === undefined) continue;
      if (unconvertedText(m, sub.key, next[key], true) && carry.converts(next[key] as string))
        continue;
      const target = { collections: sub.collections };
      if (!keep(next[key], { path: `${path}/${i}/${key}`, target, carry })) delete next[key];
    }
    if (Object.keys(next).length > 0) items.push(next);
    else carry.dropped.push({ path: `${path}/${i}`, reason: "empty" });
  });
  return items.length > 0 ? items : undefined;
}

/** The edition's members of `ids` (any status), and the write's own target rule over them. */
async function usableOn(
  sql: SqlDriver,
  site: SiteFields & { id: string },
  ids: readonly string[],
): Promise<(groupId: string, target: Target, fresh: boolean) => "missing" | "where" | undefined> {
  const members = await readMembers(sql, site.id, ids);
  return (groupId, target, fresh) => {
    const problem = targetProblem(site, { groupId, ...target, fresh }, members);
    return problem === undefined ? undefined : problem === "where" ? "where" : "missing";
  };
}

/**
 * Whether text converts to exactly one group on the edition site, under `defs`' running text →
 * reference conversion: the site's maps over its target collections (one read, only then).
 */
async function textConverts(
  sql: SqlDriver,
  toSite: SiteFields & { id: string },
  at: { defs: readonly FieldDefinition[]; group: string | undefined },
): Promise<(text: string) => boolean> {
  const { defs, group } = at;
  const needs = conversionCollections(defs);
  if (!needs) return () => false;
  const rows = await sql.all<{ body: string }>(
    `SELECT body FROM nodes WHERE site_id = ? AND kind = 'contentEntry'
      AND json_extract(body, '$.collection') IN (SELECT value FROM json_each(?))`,
    [toSite.id, JSON.stringify([...needs])],
  );
  const maps = conversionEntries(
    rows.map((r) => JSON.parse(r.body) as ContentEntry),
    toSite.defaultLocale ?? "en",
    needs,
  );
  // The converter's own rule: one group left once the entry's own is set aside.
  return (text) => (maps.byText.get(foldText(text)) ?? []).filter((g) => g !== group).length === 1;
}

/**
 * Whether a stored value already holds a group for `def` (the freshness test only, not a count).
 * On a path converting from text, only an id with its row is held (RFC-0045 §7); a repeater's
 * other sub-fields read their stored values.
 */
function heldByRows(
  def: FieldDefinition,
  value: unknown,
  rows: FieldRows | undefined,
): (group: string) => boolean {
  const path = convertingPath(def);
  const fromText = path !== undefined && def.migration?.fromType === "text";
  if (!fromText) {
    const ids = new Set(referenceUses(def, value, "").map((u) => u.groupId));
    return (g) => ids.has(g);
  }
  const sub = def.migration?.sub;
  const others = new Set(
    referenceUses(def, value, "")
      .filter((u) => sub === undefined || u.path.split("/")[2] !== sub)
      .map((u) => u.groupId),
  );
  return (g) => (sub !== undefined && others.has(g)) || rows?.has(g) === true;
}

/**
 * `entry`'s fields as written on site `toSite` (its own definitions), with what was dropped.
 * One read of the edition's members of the named groups.
 */
export async function editionReferences(
  sql: SqlDriver,
  toSite: SiteFields & { id: string },
  input: {
    entry: Pick<ContentEntry, "collection" | "fields"> &
      Partial<Pick<ContentEntry, "id" | "translation">>;
    /** The edition's stored version of the entry (a re-save): its values are not fresh. */
    stored?: Pick<ContentEntry, "collection" | "fields"> | undefined;
  },
): Promise<{ fields: ContentEntry["fields"]; dropped: EditionDrop[] }> {
  const { entry } = input;
  const defs = fieldDefinitions(toSite, entry.collection).filter(holdsReferences);
  const ids = [...new Set(entryRefRows(defs, entry.fields).map((r) => r.t))];
  if (ids.length === 0) return { fields: entry.fields, dropped: [] };
  const usable = await usableOn(sql, toSite, ids);
  const group = entry.translation?.group ?? entry.id;
  const converts = await textConverts(sql, toSite, { defs, group });
  // RFC-0045 §7: on a path converting from text, only an id with its row is already held.
  const rows = await loadNodeRows(sql, {
    siteId: toSite.id,
    nodeId: input.stored ? entry.id : undefined,
    defs,
  });
  const before: Record<string, unknown> =
    input.stored?.collection === entry.collection ? { ...(input.stored.fields ?? {}) } : {};
  const budget = { left: FIELD_LIMITS.referencesPerEntry };
  const dropped: EditionDrop[] = [];
  const fields: Record<string, unknown> = { ...(entry.fields ?? {}) };
  // Pass 1: unchanged values are the write's own business (it re-checks nothing unchanged), but
  // every one of their references counts toward the per-entry cap, before any changed key.
  const changed: { def: FieldDefinition; key: string }[] = [];
  for (const def of defs) {
    const key = storedKey(def, fields);
    if (key === undefined) continue;
    if (Object.hasOwn(before, key) && sameJson(before[key], fields[key]))
      budget.left -= referenceUses(def, fields[key], "").length;
    else changed.push({ def, key });
  }
  // Pass 2: the changed keys, carried under what the cap leaves.
  for (const { def, key } of changed) {
    const held = Object.hasOwn(before, key) ? heldByRows(def, before[key], rows) : () => false;
    const carry: Carry = {
      usable: (g, target) => usable(g, target, !held(g)),
      dropped,
      budget,
      converts,
    };
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
  return { fields, dropped };
}
