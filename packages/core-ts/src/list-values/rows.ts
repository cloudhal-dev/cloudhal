/**
 * RFC-0042 §4, #110: the rows of `entry_list_values` for one entry. One row per listed field,
 * whether or not the entry has a value (so `ne`, `unset`, boolean `eq false` and missing values
 * last are answerable), plus one row per option a multiple select holds. Values are
 * `resolveFields`, the evaluator's own resolution (a translation reads its original's
 * non-localized values), and numbers, days and instants are `sortKey`'s, so the table means what
 * `fields/query.ts` reads. Pure and Worker-safe.
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import { FIELD_QUERY_LIMITS, sortKey } from "../fields/query.ts";
import { type FieldsOriginal, hasFieldValue, resolveFields } from "../fields/resolve.ts";
import type { SiteFields } from "../fields/types.ts";

/** One row: `has` is 0/1 on a field row and 2 on an option row of a multiple select. */
export interface ListValueRow {
  readonly field: string;
  readonly has: 0 | 1 | 2;
  readonly num: number | null;
  readonly text: string | null;
}

/** An entry's rows with the columns they share. */
export interface EntryListValues {
  readonly nodeId: string;
  readonly collection: string;
  readonly locale: string;
  readonly status: string;
  readonly tie: string;
  readonly rows: readonly ListValueRow[];
}

/** What rows read of an entry. */
export type ListEntry = Pick<
  ContentEntry,
  "id" | "collection" | "locale" | "status" | "title" | "publishedAt" | "createdAt" | "fields"
> & { translation?: ContentEntry["translation"] | undefined };

/** A `YYYY-MM-DD` day as the integer YYYYMMDD, built from its digits (same order as the string). */
export function dayNumber(day: string): number {
  return (
    Number(day.slice(0, 4)) * 10_000 + Number(day.slice(5, 7)) * 100 + Number(day.slice(8, 10))
  );
}

/** `num` of a number, date or datetime sort key (`sortKey`/`operandKey`); -0 is stored as 0. */
export function encodeKey(key: number | string): number {
  if (typeof key === "string") return dayNumber(key);
  return key === 0 ? 0 : key;
}

/**
 * A string whose SQLite BINARY order (UTF-8, by code point) is JavaScript's `<` order (by UTF-16
 * unit): every unit below U+D800 stays, every other unit u becomes code point u + 0x800, so lone
 * surrogates and U+E000–U+FFFF keep their places relative to astral characters.
 */
export function utf16Key(s: string): string {
  let out = "";
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u < 0xd800) continue;
    out += s.slice(from, i) + String.fromCodePoint(u + 0x800);
    from = i + 1;
  }
  return from === 0 ? s : out + s.slice(from);
}

/** A text or url value as stored in `text`: itself when exact through UTF-8 and short, else NULL. */
export function textKey(value: string): string | null {
  return value.length <= FIELD_QUERY_LIMITS.valueLength && value.isWellFormed() ? value : null;
}

type Sort = "newest" | "oldest" | "title";

/** The collection sort's key of an entry; the direction is applied at query time. */
export function tieOf(sort: Sort | undefined, entry: ListEntry): string {
  if (sort === "title") return utf16Key(entry.title);
  return entry.publishedAt ?? entry.createdAt;
}

const row = (field: string, has: 0 | 1 | 2, num: number | null, text: string | null) => ({
  field,
  has,
  num,
  text,
});

/** The rows of one listed field from its resolved value. */
export function fieldRows(
  key: string,
  def: FieldDefinition | undefined,
  value: unknown,
): ListValueRow[] {
  if (!def) return [row(key, 0, null, null)];
  const has = hasFieldValue(value) ? 1 : 0;
  switch (def.type) {
    case "number":
    case "date":
    case "datetime": {
      const k = sortKey(def, value);
      return [row(key, has, k === undefined ? null : encodeKey(k), null)];
    }
    case "boolean":
      return [row(key, has, value === true ? 1 : 0, null)];
    case "select": {
      if (!def.multiple) return [row(key, has, null, typeof value === "string" ? value : null)];
      const held = Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
      return [row(key, has, null, null), ...[...new Set(held)].map((o) => row(key, 2, null, o))];
    }
    case "text":
    case "url":
      return [row(key, has, null, typeof value === "string" ? textKey(value) : null)];
    default:
      return [row(key, has, null, null)];
  }
}

/** The listed keys of a collection (empty when it lists none). */
export const listedKeys = (site: SiteFields, collection: string): readonly string[] =>
  site.collections?.[collection]?.listFields ?? [];

/**
 * The entry's rows under `site`, `original` being its translation group's original (read only
 * for a same-site translation, as `queryContentEntries` does); undefined when its collection
 * lists no fields.
 */
export function listValueRows(
  site: SiteFields,
  entry: ListEntry,
  original?: FieldsOriginal,
): EntryListValues | undefined {
  const settings = site.collections?.[entry.collection];
  const keys = settings?.listFields;
  if (!keys?.length) return undefined;
  const resolved = resolveFields(site, entry, original);
  return {
    nodeId: entry.id,
    collection: entry.collection,
    locale: entry.locale,
    status: entry.status,
    tie: tieOf(settings?.sort, entry),
    rows: keys.flatMap((k) => fieldRows(k, resolved[k]?.def, resolved[k]?.value)),
  };
}

/** The original's id when `entry` is a translation whose original would be in the same site. */
export function originalIdOf(entry: ListEntry): string | undefined {
  const t = entry.translation;
  if (!t || t.group === entry.id || t.source?.siteId !== undefined) return undefined;
  return t.group;
}

function ownKey(fields: ListEntry["fields"], def: FieldDefinition): boolean {
  if (!fields) return false;
  const from = def.migration?.fromKey;
  return Object.hasOwn(fields, def.key) || (from !== undefined && Object.hasOwn(fields, from));
}

/**
 * True when one of the entry's listed values comes from its original: a non-localized listed
 * field, or a localized one without its own key (`resolve.ts`'s fallback).
 */
export function dependsOnOriginal(site: SiteFields, entry: ListEntry): boolean {
  if (originalIdOf(entry) === undefined) return false;
  const settings = site.collections?.[entry.collection];
  const defs = settings?.fields ?? [];
  return (settings?.listFields ?? []).some((k) => {
    const def = defs.find((d) => d.key === k);
    return def !== undefined && (!def.localized || !ownKey(entry.fields, def));
  });
}
