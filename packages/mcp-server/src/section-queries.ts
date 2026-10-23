/**
 * RFC-0042 §4 for `create_page` / `update_page`: a `contentList` section's `where`/`orderBy` is
 * checked against its collection's list fields in precheck, before anyone is asked or anything is
 * written, with the store's rule (only sections whose query changed; `sections/2/where/0/value`).
 * The store checks again on write.
 */
import type { Section } from "@cloudhal/core-contracts";
import { InvariantError } from "@cloudhal/core-ts";
import { checkFieldQuery, type FieldQueryIssue, fieldDefinitions } from "@cloudhal/core-ts/fields";
import { requireSite, type ToolContext, toToolError } from "./common.ts";

type ListSection = Extract<Section, { kind: "contentList" }>;

const queryText = (s: ListSection) =>
  JSON.stringify([s.collection, s.where ?? null, s.orderBy ?? null]);

/** True when the section filters or sorts by a field, and did not do so the same way before. */
function changed(section: ListSection, before: Section | undefined): boolean {
  if (section.where === undefined && section.orderBy === undefined) return false;
  return before?.kind !== "contentList" || queryText(section) !== queryText(before);
}

/** Refuses (`invalid_query`, every issue at its path) a changed section query that cannot run. */
export async function checkSectionQueries(
  ctx: ToolContext,
  siteId: string,
  sections: unknown,
  stored: readonly Section[] = [],
): Promise<void> {
  if (!Array.isArray(sections)) return;
  const lists = (sections as Section[]).filter((s) => s?.kind === "contentList");
  if (lists.length === 0) return;
  const site = await requireSite(ctx, siteId);
  const before = new Map(stored.map((s) => [s.id, s]));
  const issues: FieldQueryIssue[] = [];
  (sections as Section[]).forEach((section, i) => {
    if (section?.kind !== "contentList" || !changed(section, before.get(section.id))) return;
    const listFields = site.collections?.[section.collection]?.listFields;
    for (const issue of checkFieldQuery(
      fieldDefinitions(site, section.collection),
      listFields,
      section,
    ))
      issues.push({ ...issue, path: `sections/${i}/${issue.path}` });
  });
  if (issues.length === 0) return;
  const shown = issues
    .slice(0, 5)
    .map((i) => `${i.path}: ${i.message}`)
    .join("; ");
  throw toToolError(new InvariantError("invalid_query", shown, { issues }));
}
