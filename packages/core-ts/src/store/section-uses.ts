/**
 * RFC-0042 §4: which pages' `contentList` sections filter or sort a collection by a field. One SQL
 * predicate over a page body (`json_each` over its sections and their `where`), shared by
 * `updateSite`'s `list_field_in_use` refusal and its CAS guard (rule 4), and by the field
 * operations (rename rewrites those sections, removal and retyping refuse). sqlite and D1 alike.
 */
import type { Page } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import type { Cond } from "../node-sql.ts";

const LIST_SECTION =
  "json_extract(s.value, '$.kind') = 'contentList' AND json_extract(s.value, '$.collection') = ?";

/**
 * Pages of the site (table alias `p`) with a `contentList` section of `collection` that names
 * `field` in its `where` or `orderBy`; with `values`, only conditions on `field` whose `value` or
 * `values` hold one of them (a dropped select option).
 */
export function sectionUse(
  siteId: string,
  collection: string,
  field: string,
  values?: readonly string[],
): Cond {
  const head =
    "p.site_id = ? AND p.kind = 'page' AND EXISTS (SELECT 1 FROM json_each(p.body, '$.sections') s WHERE";
  if (values) {
    const list = JSON.stringify(values);
    return {
      sql: `${head} ${LIST_SECTION} AND EXISTS (SELECT 1 FROM json_each(s.value, '$.where') w
        WHERE json_extract(w.value, '$.field') = ? AND (json_extract(w.value, '$.value') IN (SELECT value FROM json_each(?))
          OR EXISTS (SELECT 1 FROM json_each(w.value, '$.values') v WHERE v.value IN (SELECT value FROM json_each(?))))))`,
      params: [siteId, collection, field, list, list],
    };
  }
  return {
    sql: `${head} ${LIST_SECTION} AND (json_extract(s.value, '$.orderBy.field') = ?
      OR EXISTS (SELECT 1 FROM json_each(s.value, '$.where') w WHERE json_extract(w.value, '$.field') = ?)))`,
    params: [siteId, collection, field, field],
  };
}

/** `NOT EXISTS` over a use: the guard that keeps "no section uses it" true until the CAS. */
export const noSectionUse = (use: Cond): Cond => ({
  sql: `NOT EXISTS (SELECT 1 FROM nodes p WHERE ${use.sql})`,
  params: use.params,
});

/** The pages a use matches, by path (what refusals name). */
export async function pagesUsing(sql: SqlDriver, use: Cond): Promise<Page[]> {
  const rows = await sql.all<{ body: string }>(
    `SELECT p.body FROM nodes p WHERE ${use.sql} ORDER BY json_extract(p.body, '$.path'), p.id`,
    use.params,
  );
  return rows.map((r) => JSON.parse(r.body) as Page);
}

/** A page's `contentList` sections of `collection` with `from` renamed to `to`; undefined when none name it. */
export function renameInSections(
  page: Page,
  collection: string,
  from: string,
  to: string,
): Page["sections"] | undefined {
  let changed = false;
  const sections = page.sections.map((section) => {
    if (section.kind !== "contentList" || section.collection !== collection) return section;
    const uses =
      section.orderBy?.field === from || (section.where ?? []).some((c) => c.field === from);
    if (!uses) return section;
    changed = true;
    return {
      ...section,
      ...(section.where
        ? { where: section.where.map((c) => (c.field === from ? { ...c, field: to } : c)) }
        : {}),
      ...(section.orderBy?.field === from ? { orderBy: { ...section.orderBy, field: to } } : {}),
    } as typeof section;
  });
  return changed ? (sections as Page["sections"]) : undefined;
}
