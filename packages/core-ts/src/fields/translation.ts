/**
 * RFC-0041 §5: typed fields in a translation of the same site. Localized values are each language
 * version's own (absent ones fall back to the original's); non-localized values live on the
 * group's original only and are never copied into a translation. Machine translation gets only
 * the localized `text` and `richText` values to translate: top-level by key, and inside a
 * localized repeater by item path, `speakers/0/talk` (RFC-0045). A translated item path writes
 * into a copy of the source's list, so the item's other sub-values (references, selects, images)
 * come along: a given list replaces the whole list. Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { type FieldIssue, isRecord } from "./types.ts";

type Values = Readonly<Record<string, unknown>>;

/** Field types whose values are words to translate. */
const TRANSLATABLE = new Set<FieldDefinition["type"]>(["text", "richText"]);

/**
 * The values a new translation in the same site starts from: the localized ones. In a collection
 * without definitions `fields` is any JSON and is kept whole.
 */
export function localizedFieldValues(
  defs: readonly FieldDefinition[],
  values: Values | undefined,
): Record<string, unknown> {
  if (defs.length === 0) return { ...(values ?? {}) };
  const out: Record<string, unknown> = {};
  for (const def of defs)
    if (def.localized && values?.[def.key] !== undefined) out[def.key] = values[def.key];
  return out;
}

const words = (value: unknown): value is string => typeof value === "string" && value !== "";

/** A localized repeater's translatable sub-field keys (text and rich text). */
function translatableSubs(def: FieldDefinition): Set<string> {
  if (def.type !== "repeater" || !def.localized) return new Set();
  return new Set(def.fields.filter((s) => TRANSLATABLE.has(s.type)).map((s) => s.key));
}

/**
 * The localized `text` and `richText` values to translate: by key, and for a localized repeater
 * by item path (`speakers/0/talk`).
 */
export function translatableFieldValues(
  defs: readonly FieldDefinition[],
  values: Values | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of defs) {
    const value = values?.[def.key];
    if (def.localized && TRANSLATABLE.has(def.type) && words(value)) out[def.key] = value;
    const subs = translatableSubs(def);
    if (subs.size === 0 || !Array.isArray(value)) continue;
    value.forEach((item, i) => {
      if (!isRecord(item)) return;
      for (const sub of subs)
        if (Object.hasOwn(item, sub) && words(item[sub])) out[`${def.key}/${i}/${sub}`] = item[sub];
    });
  }
  return out;
}

/** A key's field: the part before an item path's first `/`. */
const rootOf = (key: string): string => {
  const at = key.indexOf("/");
  return at === -1 ? key : key.slice(0, at);
};

/** Keys of the non-localized fields: a translation reads them from the original. */
export function sharedFieldKeys(defs: readonly FieldDefinition[]): string[] {
  return defs.filter((d) => !d.localized).map((d) => d.key);
}

/**
 * `field_not_localized` for each given value of a non-localized field (a translation's values
 * are translated text; shared ones are set on the original, `originalId`).
 */
export function sharedFieldIssues(
  defs: readonly FieldDefinition[],
  values: Values | undefined,
  originalId: string,
): FieldIssue[] {
  const shared = new Set(sharedFieldKeys(defs));
  return Object.keys(values ?? {})
    .filter((key) => shared.has(rootOf(key)))
    .map((key) => ({
      path: `fields/${key}`,
      code: "field_not_localized" as const,
      message: `${rootOf(key)} is not localized: set it on ${originalId}`,
    }));
}

/** Parses `key/index/sub`; undefined when `path` is not of that shape. */
function itemPath(path: string): { key: string; index: number; sub: string } | undefined {
  const parts = path.split("/");
  if (parts.length !== 3) return undefined;
  const [key = "", raw = "", sub = ""] = parts;
  if (!/^\d{1,3}$/.test(raw)) return undefined;
  return { key, index: Number(raw), sub };
}

/**
 * The given translated values with item paths folded into lists: each localized repeater named by
 * a path starts from the given whole list, else from the source's (`sourceValues`), and takes the
 * translated sub-values. A path that names no translatable sub-value of the source is refused at
 * `fields/<path>` (`invalid_value`).
 */
export function translatedItemValues(
  defs: readonly FieldDefinition[],
  sourceValues: Values | undefined,
  given: Values,
): { values: Record<string, unknown>; issues: FieldIssue[] } {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const issues: FieldIssue[] = [];
  const lists = new Map<string, unknown[]>();
  const plain: [string, unknown][] = [];
  for (const [path, value] of Object.entries(given)) {
    if (!path.includes("/")) {
      plain.push([path, value]);
      continue;
    }
    const at = itemPath(path);
    const def = at && byKey.get(at.key);
    const base = def && (Array.isArray(given[def.key]) ? given[def.key] : sourceValues?.[def.key]);
    const item = at && Array.isArray(base) ? base[at.index] : undefined;
    if (!at || !def || !translatableSubs(def).has(at.sub) || !isRecord(item)) {
      issues.push({
        path: `fields/${path}`,
        code: "invalid_value",
        message: `${path} names no translatable text of an item of the source (get_translation_source lists them)`,
      });
      continue;
    }
    if (typeof value !== "string") {
      issues.push({
        path: `fields/${path}`,
        code: "invalid_value",
        message: "a translation is text",
      });
      continue;
    }
    const list = lists.get(at.key) ?? (base as unknown[]).map((x) => (isRecord(x) ? { ...x } : x));
    (list[at.index] as Record<string, unknown>)[at.sub] = value;
    lists.set(at.key, list);
  }
  return { values: Object.fromEntries([...plain, ...lists]), issues };
}
