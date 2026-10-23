/**
 * RFC-0041 §10: `text` and `richText` fields marked `searchable` add their words to an entry's
 * search text (no new column, no FTS5 change). Off by default: a theme may not show a field, and
 * a snippet would leak it. Values are read as `resolveFields` reads them — a translation's empty
 * localized field and its non-localized ones come from the original when it is passed — but only
 * strings count, so the site Worker needs no checker here. Worker-safe, imports types only.
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import type { PermalinkSite } from "./permalinks.ts";

type Original = Pick<ContentEntry, "id" | "fields">;

/** The collection's searchable text fields (empty for most sites, which then index as before). */
export function searchableFields(
  site: PermalinkSite | undefined,
  collection: string,
): FieldDefinition[] {
  return (site?.collections?.[collection]?.fields ?? []).filter(
    (d) => (d.type === "text" || d.type === "richText") && d.searchable === true,
  );
}

/** True when the entry reads values from `original` (a translation in the same site). */
function readsOriginal(entry: ContentEntry, original: Original | undefined): boolean {
  const t = entry.translation;
  if (!t || t.group === entry.id || t.source?.siteId !== undefined) return false;
  return original?.id === t.group;
}

/** The entry's searchable field values in definition order, as markdown or plain text. */
export function searchableFieldTexts(
  site: PermalinkSite | undefined,
  entry: ContentEntry,
  original?: Original,
): string[] {
  const defs = searchableFields(site, entry.collection);
  if (defs.length === 0) return [];
  const fromOriginal = readsOriginal(entry, original);
  const out: string[] = [];
  for (const def of defs) {
    const own = entry.fields?.[def.key];
    const theirs = fromOriginal ? original?.fields?.[def.key] : undefined;
    const value = !def.localized && fromOriginal ? theirs : (own ?? theirs);
    if (typeof value === "string" && value.trim() !== "") out.push(value);
  }
  return out;
}

/** Whether the searchable definitions differ between two site versions (every entry row is rewritten). */
export function searchableChanged(
  before: PermalinkSite | undefined,
  after: PermalinkSite | undefined,
): boolean {
  const keys = (site: PermalinkSite | undefined) =>
    JSON.stringify(
      Object.entries(site?.collections ?? {})
        .map(([c]) => [c, searchableFields(site, c).map((d) => [d.key, d.localized])])
        .filter(([, defs]) => (defs as unknown[]).length > 0)
        .sort(),
    );
  return keys(before) !== keys(after);
}
