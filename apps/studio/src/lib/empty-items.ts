/**
 * RFC-0045 §1 "no empty item": the store refuses a repeater item without a value, and "Add item"
 * adds one that the person is about to fill. The editor keeps it while they type and drops it from
 * what a save sends; a list left with no item is no value. Only the collection's repeater
 * definitions are touched (a collection without definitions may store any JSON).
 *
 * Dependency-free on purpose: the editor's own chunk imports it, never the fields chunk.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";

const isItem = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The entry's fields without empty repeater items (the same entry when there are none). */
export function withoutEmptyItems(entry: ContentEntry, site: Site | undefined): ContentEntry {
  const defs = site?.collections?.[entry.collection]?.fields ?? [];
  const fields = entry.fields;
  if (!fields) return entry;
  let next: Record<string, unknown> | undefined;
  for (const def of defs) {
    const v = fields[def.key];
    if (def.type !== "repeater" || !Array.isArray(v)) continue;
    const kept = v.filter((item) => !isItem(item) || Object.keys(item).length > 0);
    if (kept.length === v.length) continue;
    next ??= { ...fields };
    if (kept.length) next[def.key] = kept;
    else delete next[def.key];
  }
  return next ? { ...entry, fields: next } : entry;
}
