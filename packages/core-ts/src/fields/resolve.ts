/**
 * RFC-0041 §5: the values a reader sees. Pure: callers pass the translation group's original when
 * the entry is a translation; nothing here loads nodes or throws.
 *
 * - localized: the entry's own value, else the original's (`fromOriginal`);
 * - non-localized: the original's value on a translation, the entry's own otherwise;
 * - a language edition (an original in another site) owns all its values;
 * - during a field operation the `migration` marker is read through: a missing key falls back to
 *   `fromKey`; a value still in `fromType` that does not fit the new type is converted by RFC-0041
 *   §6's closed table (`conversions.ts`), and resolves to `undefined` with an issue only when the
 *   table cannot convert it; a field being removed is already gone.
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import { convertFieldValue } from "./conversions.ts";
import { convertContext, isBeingRemoved } from "./migration.ts";
import { type FieldIssue, fieldDefinitions, isRecord, type SiteFields } from "./types.ts";
import { valueIssues } from "./value-checks.ts";

export interface ResolvedField {
  def: FieldDefinition;
  /** `undefined` when there is no value, or the stored one does not fit `def`. */
  value: unknown;
  /** The value came from the translation group's original. */
  fromOriginal: boolean;
  /** Why a stored value resolved to `undefined`. */
  issue?: FieldIssue;
}

/** Every defined field by key, in definition order. */
export type ResolvedFields = Record<string, ResolvedField>;

export type FieldsEntry = Pick<ContentEntry, "id" | "collection" | "fields"> & {
  translation?: ContentEntry["translation"] | undefined;
};
export type FieldsOriginal = Pick<ContentEntry, "id" | "fields">;

/** True when the entry is a translation whose original is in the same site. */
function readsOriginal(entry: FieldsEntry, original: FieldsOriginal | undefined): boolean {
  const t = entry.translation;
  if (!t || t.group === entry.id || t.source?.siteId !== undefined) return false;
  return original !== undefined && original.id === t.group;
}

function read(values: unknown, def: FieldDefinition): unknown {
  if (!isRecord(values)) return undefined;
  if (Object.hasOwn(values, def.key)) return values[def.key];
  const from = def.migration?.fromKey;
  return from && Object.hasOwn(values, from) ? values[from] : undefined;
}

function pick(
  def: FieldDefinition,
  entry: FieldsEntry,
  original: FieldsOriginal | undefined,
): { value: unknown; fromOriginal: boolean } {
  const fromOriginal = readsOriginal(entry, original);
  if (!def.localized)
    return fromOriginal
      ? { value: read(original?.fields, def), fromOriginal: true }
      : { value: read(entry.fields, def), fromOriginal: false };
  const own = read(entry.fields, def);
  if (own !== undefined || !fromOriginal) return { value: own, fromOriginal: false };
  const theirs = read(original?.fields, def);
  return { value: theirs, fromOriginal: theirs !== undefined };
}

/** The entry's typed values under its collection's definitions (`{}` when it has none). */
export function resolveFields(
  site: SiteFields,
  entry: FieldsEntry,
  original?: FieldsOriginal,
): ResolvedFields {
  const out: ResolvedFields = {};
  for (const def of fieldDefinitions(site, entry.collection)) {
    if (isBeingRemoved(def)) continue;
    const { value, fromOriginal } = pick(def, entry, original);
    if (value === undefined) {
      out[def.key] = { def, value: undefined, fromOriginal: false };
      continue;
    }
    const issues = valueIssues(def, value, `fields/${def.key}`);
    const first = issues[0];
    if (!first) {
      out[def.key] = { def, value, fromOriginal };
      continue;
    }
    const converting = def.migration?.fromType;
    const converted = converting
      ? convertFieldValue(converting, def, value, convertContext(site))
      : undefined;
    if (converted?.ok) {
      out[def.key] = {
        def,
        value: converted.value,
        fromOriginal: converted.value !== undefined && fromOriginal,
      };
      continue;
    }
    out[def.key] = {
      def,
      value: undefined,
      fromOriginal,
      issue: {
        path: first.path,
        code: "field_value_unreadable",
        message: converting
          ? `a ${converting} value that does not convert to ${def.type}`
          : first.message,
      },
    };
  }
  return out;
}

/** "Has a value" for `requiredToPublish`: not absent, not an empty string, not an empty list. */
export function hasFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
