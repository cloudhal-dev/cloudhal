/**
 * RFC-0041 §5: typed fields in machine translation. `get_translation_source` hands over only the
 * localized `text` and `richText` values to translate and names the shared (non-localized) fields a
 * translation reads from its original; `save_translation` takes translated values of localized
 * fields and refuses shared ones in precheck (`field_not_localized`). Within a site, a new
 * translation holds only the values sent (absent localized ones fall back to the original's) and
 * never a copy of a shared value; a language edition copies the source's values (§5: the other
 * site's definitions may differ).
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  fieldDefinitions,
  refuseFieldIssues,
  sharedFieldIssues,
  sharedFieldKeys,
  translatableFieldValues,
} from "@cloudhal/core-ts/fields";
import type { JsonSchema } from "./common.ts";

type Values = Record<string, unknown>;

/** `save_translation`'s `fields`. */
export const TRANSLATED_FIELDS: JsonSchema = {
  type: "object",
  description:
    "Entries: your translation of each value in get_translation_source's `fields` (localized text and rich-text fields), by key. Shared fields (`sharedFields`) are read from the original and refused here",
};

/** What `get_translation_source` returns about an entry's typed fields (nothing for a page). */
export function translationSourceFields(
  site: Site,
  source: object,
): { source: object; fields?: Record<string, string>; sharedFields?: string[] } {
  if (!("collection" in source)) return { source };
  const entry = source as ContentEntry;
  const defs = fieldDefinitions(site, entry.collection);
  if (defs.length === 0) return { source };
  const { fields, ...rest } = entry;
  const shared = sharedFieldKeys(defs);
  return {
    source: rest,
    fields: translatableFieldValues(defs, fields),
    ...(shared.length > 0 ? { sharedFields: shared } : {}),
  };
}

/** The precheck: translated values of shared fields are refused, before anything is written. */
export function refuseSharedFields(site: Site, source: ContentEntry, values: unknown): void {
  if (!values || typeof values !== "object") return;
  const defs = fieldDefinitions(site, source.collection);
  const original = source.translation?.group ?? source.id;
  refuseFieldIssues(sharedFieldIssues(defs, values as Values, original));
}

/** The `fields` of a translated entry: the sent values on what the translation may start from. */
export function translatedFields(input: {
  site: Site;
  source: ContentEntry;
  existing: ContentEntry | undefined;
  given: Values | undefined;
  /** A language edition: the source's values come along. */
  cross: boolean;
}): Values {
  const { site, source, existing, given, cross } = input;
  const defined = fieldDefinitions(site, source.collection).length > 0;
  const base = existing?.fields ?? (cross || !defined ? (source.fields ?? {}) : {});
  return { ...base, ...(given ?? {}) };
}
