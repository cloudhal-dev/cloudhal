/**
 * RFC-0041 §1, §4, §6 for site writes: field definitions follow the code rules and caps
 * (`checkFieldDefinitions`), and a plain edit never loses a value. Changes no plain edit may make
 * (type, localization, `multiple`, the migration marker) are refused outright; dropping a key or a
 * select option is refused only while an entry of the collection still holds it, counted with one
 * `json_type` / `json_each` query per change (sqlite and D1 alike) and kept true by a guard on the
 * site CAS (rule 4). Refusals name the field operation to use (`field_change_needs_operation`).
 */
import type { Site } from "@cloudhal/core-contracts";
import {
  checkFieldDefinitions,
  type FieldDefinitionChange,
  type FieldIssue,
  fieldDefinitionChanges,
  refuseFieldIssues,
} from "../fields/index.ts";
import { sameJson } from "../fields/types.ts";
import { and, type Cond } from "../node-sql.ts";
import type { StoreContext } from "./context.ts";

/** What a site write's definition changes add: the guard that keeps "no entry uses it" true. */
export interface SiteFieldsPlan {
  readonly guard: Cond | undefined;
  diagnose(): Promise<void>;
}

type DataChange = Extract<FieldDefinitionChange, { change: "removed" | "optionsRemoved" }>;

const IN_COLLECTION =
  "site_id = ? AND kind = 'contentEntry' AND json_extract(body, '$.collection') = ?";

/** Entries of the collection that hold the dropped key, or one of the dropped options. */
function usage(siteId: string, c: DataChange): Cond {
  const path = `$.fields.${c.key}`;
  if (c.change === "removed")
    return {
      sql: `SELECT count(*) AS n FROM nodes WHERE ${IN_COLLECTION} AND json_type(body, ?) IS NOT NULL`,
      params: [siteId, c.collection, path],
    };
  // A single select stores a string, a multiple one a list: json_each reads both.
  return {
    sql: `SELECT count(*) AS n FROM nodes WHERE ${IN_COLLECTION} AND json_type(body, ?) IS NOT NULL
      AND EXISTS (SELECT 1 FROM json_each(body, ?) v WHERE v.value IN (SELECT value FROM json_each(?)))`,
    params: [siteId, c.collection, path, path, JSON.stringify(c.options)],
  };
}

function refusal(c: DataChange, count: number): FieldIssue {
  const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
  return c.change === "removed"
    ? {
        path: `collections/${c.collection}/fields/${c.key}`,
        code: "field_change_needs_operation",
        message: `${entries} of ${c.collection} still hold ${c.key}; use remove_field or rename_field`,
      }
    : {
        path: `collections/${c.collection}/fields/${c.key}/options`,
        code: "field_change_needs_operation",
        message: `${entries} of ${c.collection} use ${c.options.join(", ")}; change them first, or use change_field_type`,
      };
}

/** Counts what each data-dependent change would lose; throws when anything is in use. */
async function checkUsage(ctx: StoreContext, siteId: string, changes: readonly DataChange[]) {
  const issues: FieldIssue[] = [];
  for (const c of changes) {
    const q = usage(siteId, c);
    const row = await ctx.sql.get<{ n: number }>(q.sql, q.params);
    const n = Number(row?.n ?? 0);
    if (n > 0) issues.push(refusal(c, n));
  }
  refuseFieldIssues(issues);
}

/**
 * Checks `next`'s field definitions against `stored` (throws on any issue) and returns the guard
 * for drops that depend on stored values; undefined when there are none.
 */
export async function planFieldDefinitions(
  ctx: StoreContext,
  stored: Site | undefined,
  next: Site,
): Promise<SiteFieldsPlan | undefined> {
  if (!stored?.collections && !next.collections) return undefined;
  // Only a change is checked: other site writes never re-run the caps on stored settings.
  if (stored && sameJson(stored.collections, next.collections)) return undefined;
  refuseFieldIssues(checkFieldDefinitions(next, stored));
  if (!stored) return undefined;
  // A collection that goes away entirely is RFC-0040's (`collection_in_use` while it has entries).
  const changes = fieldDefinitionChanges(stored, next).filter(
    (c): c is DataChange =>
      (c.change === "removed" || c.change === "optionsRemoved") &&
      next.collections?.[c.collection] !== undefined,
  );
  if (changes.length === 0) return undefined;
  await checkUsage(ctx, next.id, changes);
  return {
    guard: and(
      ...changes.map((c) => {
        const q = usage(next.id, c);
        return { sql: `(${q.sql}) = 0`, params: q.params };
      }),
    ),
    diagnose: () => checkUsage(ctx, next.id, changes),
  };
}
