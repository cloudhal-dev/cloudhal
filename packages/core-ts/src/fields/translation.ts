/**
 * RFC-0041 §5: typed fields in a translation of the same site. Localized values are each language
 * version's own (absent ones fall back to the original's); non-localized values live on the
 * group's original only and are never copied into a translation. Machine translation gets only
 * the localized `text` and `richText` values to translate: top-level by key, and inside a
 * localized repeater by item path, `speakers/0/talk` (RFC-0045 §3). Item paths write into a copy
 * of the source's list, so an item's other sub-values (references, selects, images) come along.
 * Once the translation holds its own list, that repeater is sent whole; other lengths are
 * `translation_shape_mismatch`. Worker-safe.
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

/**
 * The repeater an item path (`speakers/0/talk`) names: the part before the key's first `/`, when
 * it is a repeater of `defs`. Any other key is a plain key, `/` included (a collection without
 * definitions may hold `og/image`), as before item paths existed.
 */
export function itemPathRepeater(
  defs: readonly FieldDefinition[],
  key: string,
): string | undefined {
  const at = key.indexOf("/");
  if (at === -1) return undefined;
  const root = key.slice(0, at);
  return defs.some((d) => d.key === root && d.type === "repeater") ? root : undefined;
}

/** A key's field: an item path's repeater, else the key itself. */
const rootOf = (defs: readonly FieldDefinition[], key: string): string =>
  itemPathRepeater(defs, key) ?? key;

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
    .filter((key) => shared.has(rootOf(defs, key)))
    .map((key) => ({
      path: `fields/${key}`,
      code: "field_not_localized" as const,
      message: `${rootOf(defs, key)} is not localized: set it on ${originalId}`,
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

/** Where translated item paths are folded in. */
export interface TranslatedItemsInput {
  /** The source's values: the list a path's index refers to. */
  source: Values | undefined;
  /** The existing same-locale translation's own values, when there is one. */
  existing?: Values | undefined;
}

const shapeIssue = (key: string, message: string): FieldIssue => ({
  path: `fields/${key}`,
  code: "translation_shape_mismatch",
  message,
});

/**
 * The list a repeater's translated paths write into: a list given whole in the same call (of the
 * source's length), else a copy of the source's. When the translation already holds its own list,
 * a path cannot know which of its items matches the source's by index (either side may have been
 * reordered or edited since), so that repeater must be sent whole (`translation_shape_mismatch`).
 */
function baseList(
  key: string,
  input: TranslatedItemsInput,
  given: Values,
): { list: unknown[] } | { issue: FieldIssue } | undefined {
  const source = input.source?.[key];
  if (!Array.isArray(source)) return undefined;
  const whole = given[key];
  if (Array.isArray(whole)) {
    if (whole.length === source.length)
      return { list: whole.map((x) => (isRecord(x) ? { ...x } : x)) };
    return {
      issue: shapeIssue(
        key,
        `${key} has ${whole.length} items as given and ${source.length} in the source; give the whole list in the source's order`,
      ),
    };
  }
  if (Array.isArray(input.existing?.[key]))
    return {
      issue: shapeIssue(
        key,
        `the translation already holds its own ${key}: send the whole list (translated, in the source's order) instead of item paths`,
      ),
    };
  return { list: source.map((x) => (isRecord(x) ? { ...x } : x)) };
}

/**
 * The given translated values with item paths folded into lists (see `baseList`): each path's
 * text replaces that sub-value, and the item keeps its other sub-values (the source's targets,
 * images and selects). A path that names no translatable
 * sub-value of an item of the source is refused at `fields/<path>` (`invalid_value`).
 */
export function translatedItemValues(
  defs: readonly FieldDefinition[],
  input: TranslatedItemsInput,
  given: Values,
): { values: Record<string, unknown>; issues: FieldIssue[] } {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const issues: FieldIssue[] = [];
  const lists = new Map<string, { list: unknown[] } | { issue: FieldIssue } | undefined>();
  const plain: [string, unknown][] = [];
  const invalid = (path: string, message: string) =>
    issues.push({ path: `fields/${path}`, code: "invalid_value", message });
  for (const [path, value] of Object.entries(given)) {
    if (itemPathRepeater(defs, path) === undefined) {
      plain.push([path, value]);
      continue;
    }
    const at = itemPath(path);
    const def = at && byKey.get(at.key);
    if (!at || !def || !translatableSubs(def).has(at.sub)) {
      invalid(
        path,
        `${path} names no translatable text of an item of the source (get_translation_source lists them)`,
      );
      continue;
    }
    if (!lists.has(at.key)) lists.set(at.key, baseList(at.key, input, given));
    const base = lists.get(at.key);
    if (base && "issue" in base) continue;
    const item = base?.list[at.index];
    if (!base || !isRecord(item)) {
      invalid(path, `${path} names no item of the source (get_translation_source lists them)`);
      continue;
    }
    if (typeof value !== "string") {
      invalid(path, "a translation is text");
      continue;
    }
    item[at.sub] = value;
  }
  const folded: [string, unknown][] = [];
  for (const [key, base] of lists) {
    if (base && "issue" in base) issues.push(base.issue);
    else if (base) folded.push([key, base.list]);
  }
  return { values: Object.fromEntries([...plain, ...folded]), issues };
}
