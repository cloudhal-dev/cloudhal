/**
 * RFC-0041 §5: typed fields in a translation of the same site. Localized values are each language
 * version's own (absent ones fall back to the original's); non-localized values live on the
 * group's original only and are never copied into a translation. Machine translation gets only
 * the localized `text` and `richText` values to translate. Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { FieldIssue } from "./types.ts";

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

/** The localized `text` and `richText` values to translate. */
export function translatableFieldValues(
  defs: readonly FieldDefinition[],
  values: Values | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of defs) {
    const value = values?.[def.key];
    if (def.localized && TRANSLATABLE.has(def.type) && typeof value === "string" && value !== "")
      out[def.key] = value;
  }
  return out;
}

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
    .filter((key) => shared.has(key))
    .map((key) => ({
      path: `fields/${key}`,
      code: "field_not_localized" as const,
      message: `${key} is not localized: set it on ${originalId}`,
    }));
}
