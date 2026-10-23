/**
 * RFC-0042 §4 for page writes: a `contentList` section's `where`/`orderBy` must run against its
 * collection's list fields (`checkFieldQuery`), or the write is refused as `invalid_query` with
 * every problem at its slash path (`sections/2/where/0/value`). Only sections whose query changed
 * are checked, so a page stays editable after a definition change elsewhere; the caller guards its
 * CAS on the site it checked against (rule 4).
 */
import type { Page, Section, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { checkFieldQuery, type FieldQueryIssue, fieldDefinitions } from "../fields/index.ts";
import { sameJson } from "../fields/types.ts";

type ListSection = Extract<Section, { kind: "contentList" }>;

const queryOf = (s: ListSection) => ({
  collection: s.collection,
  where: s.where,
  orderBy: s.orderBy,
});

/** True when the section filters or sorts by a field, and did not do so the same way before. */
function changed(section: ListSection, before: Section | undefined): boolean {
  if (section.where === undefined && section.orderBy === undefined) return false;
  if (before?.kind !== "contentList") return true;
  return !sameJson(queryOf(section), queryOf(before));
}

/**
 * Throws `invalid_query` when a changed `contentList` section's field query does not check against
 * `site`; true when the page has such a section (the write then guards on the site's hash).
 */
export function checkPageQueries(site: Site, page: Page, stored?: Page): boolean {
  const before = new Map((stored?.sections ?? []).map((s) => [s.id, s]));
  const issues: FieldQueryIssue[] = [];
  let checked = false;
  page.sections.forEach((section, i) => {
    if (section.kind !== "contentList" || !changed(section, before.get(section.id))) return;
    checked = true;
    const defs = fieldDefinitions(site, section.collection);
    const listFields = site.collections?.[section.collection]?.listFields;
    for (const issue of checkFieldQuery(defs, listFields, section))
      issues.push({ ...issue, path: `sections/${i}/${issue.path}` });
  });
  if (issues.length > 0) {
    const shown = issues
      .slice(0, 5)
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ");
    throw new InvariantError("invalid_query", shown, { issues });
  }
  return checked;
}
