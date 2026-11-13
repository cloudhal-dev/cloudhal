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
  // Keep in step with `sentIndexes`, which maps the server's item indices back onto the draft.
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

/**
 * Per repeater whose save leaves items out, the draft index of each item it sends: the server's
 * issue paths count items of what was sent, the editor's of the draft.
 */
export function sentIndexes(entry: ContentEntry, site: Site | undefined): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const def of site?.collections?.[entry.collection]?.fields ?? []) {
    const v = entry.fields?.[def.key];
    if (def.type !== "repeater" || !Array.isArray(v)) continue;
    const sent = v.flatMap((item, i) =>
      isItem(item) && Object.keys(item).length === 0 ? [] : [i],
    );
    if (sent.length !== v.length) out.set(def.key, sent);
  }
  return out;
}

/** An issue path under `fields` of what was sent (`speakers/1/role`) as the draft's (`speakers/2/role`). */
export function draftPath(path: string, sent: ReadonlyMap<string, readonly number[]>): string {
  const [key = "", index, ...rest] = path.split("/");
  const map = sent.get(key);
  const i = Number(index);
  if (!map || !Number.isInteger(i) || map[i] === undefined) return path;
  return [key, String(map[i]), ...rest].join("/");
}
