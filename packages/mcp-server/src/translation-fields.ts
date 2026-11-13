/**
 * RFC-0041 §5: typed fields in machine translation. `get_translation_source` hands over only the
 * localized `text` and `richText` values to translate and names the shared (non-localized) fields a
 * translation reads from its original; `save_translation` takes translated values of localized
 * fields and refuses shared ones in precheck (`field_not_localized`). Within a site, a new
 * translation holds only the values sent (absent localized ones fall back to the original's) and
 * never a copy of a shared value; a language edition copies the source's values (§5: the other
 * site's definitions may differ).
 *
 * RFC-0045 §3: a localized repeater's text and rich-text sub-values are translated by item path
 * (`speakers/0/talk`), and folded back into the translation's own list, else a copy of the
 * source's (`translatedItemValues`), so each item keeps its other sub-values. Lists of another
 * length are `translation_shape_mismatch`. A path names an item by index, so a save with paths
 * names the source revision it was read from (`sourceRev`, `conflict` when it moved on).
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  fieldDefinitions,
  itemPathRepeater,
  refuseFieldIssues,
  sharedFieldIssues,
  sharedFieldKeys,
  translatableFieldValues,
  translatedItemValues,
} from "@cloudhal/core-ts/fields";
import { type JsonSchema, ToolError } from "./common.ts";

type Values = Record<string, unknown>;

/** `save_translation`'s `fields`. */
export const TRANSLATED_FIELDS: JsonSchema = {
  type: "object",
  description:
    "Entries: your translation of each value in get_translation_source's `fields` (localized text and rich-text fields), by the same key: a field key, or a repeater item's path such as speakers/0/talk (the item's other values are kept). Shared fields (`sharedFields`) are read from the original and refused here",
};

/** `save_translation`'s `sourceRev`. */
export const SOURCE_REV_INPUT: JsonSchema = {
  type: "integer",
  minimum: 0,
  description:
    "Entries: get_translation_source's sourceRev. Required when fields has repeater item paths, which name items by index: refused (conflict) when the source changed since",
};

/** True when `values` names a repeater item (`speakers/0/talk`); other keys with `/` are plain. */
const hasItemPaths = (defs: readonly FieldDefinition[], values: unknown): boolean =>
  !!values &&
  typeof values === "object" &&
  Object.keys(values).some((k) => itemPathRepeater(defs, k) !== undefined);

/** A translation made from the source's current revision: its items line up by index. */
const madeFromCurrent = (
  existing: Pick<ContentEntry, "translation"> | undefined,
  source: Pick<ContentEntry, "rev">,
): boolean => existing?.translation?.source?.rev === source.rev;

/** Item paths need the source revision they were read from, unchanged (RFC-0045 §3). */
export function checkSourceRev(
  a: Record<string, unknown>,
  site: Site,
  source: { id: string; rev: number; collection?: string },
) {
  if (source.collection === undefined) return;
  if (!hasItemPaths(fieldDefinitions(site, source.collection), a.fields)) return;
  if (typeof a.sourceRev !== "number")
    throw new ToolError(
      "invalid",
      "fields has repeater item paths: pass sourceRev from get_translation_source",
    );
  if (a.sourceRev !== source.rev)
    throw new ToolError(
      "conflict",
      `${source.id} is at rev ${source.rev}, its items were read at rev ${a.sourceRev}; call get_translation_source again and translate its current items`,
    );
}

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

/**
 * The precheck: translated values of shared fields, and item paths that do not fit (see
 * `translatedItemValues`), are refused before anything is written.
 */
export function refuseSharedFields(
  site: Site,
  source: ContentEntry,
  values: unknown,
  existing?: Pick<ContentEntry, "fields" | "translation"> | undefined,
): void {
  if (!values || typeof values !== "object") return;
  const defs = fieldDefinitions(site, source.collection);
  const original = source.translation?.group ?? source.id;
  const shared = sharedFieldIssues(defs, values as Values, original);
  const input = {
    source: source.fields,
    existing: existing?.fields,
    existingCurrent: madeFromCurrent(existing, source),
  };
  const items = translatedItemValues(defs, input, values as Values).issues;
  const sharedPaths = new Set(shared.map((i) => i.path));
  refuseFieldIssues([...shared, ...items.filter((i) => !sharedPaths.has(i.path))]);
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
  if (!given) return { ...base };
  const defs = fieldDefinitions(site, source.collection);
  const lists = {
    source: source.fields,
    existing: existing?.fields,
    existingCurrent: madeFromCurrent(existing, source),
  };
  // The source may have changed since the precheck: refuse, never drop a path.
  const folded = translatedItemValues(defs, lists, given);
  refuseFieldIssues(folded.issues);
  return { ...base, ...folded.values };
}
