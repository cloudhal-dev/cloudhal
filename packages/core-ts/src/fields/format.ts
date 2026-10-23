/**
 * RFC-0041 §9: a field value as plain text in a reader's language. Worker-safe and Temporal-free
 * (`Intl` only, formatters cached). Themes render the result as text (always escaped); rich text,
 * links and images as markup come from the renderer's `entryFields`, which uses this for the rest.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { markdownToPlain } from "./conversions.ts";
import { optionLabel } from "./types.ts";
import { isCalendarDay, isKnownTimeZone } from "./value-checks.ts";

export interface FormatFieldOptions {
  /** The reader's language (BCP 47); an unknown tag formats as `en`. */
  locale: string;
  /** Option labels fall back to this language, then any (default: `locale`). */
  defaultLocale?: string | undefined;
  /** `datetime` values show in this zone (default: the value's own zone, RFC-0008 §9.1). */
  timeZone?: string | undefined;
  /** The words for `boolean` values (default: English "Yes" / "No"). */
  words?: { yes: string; no: string } | undefined;
}

const cache = new Map<string, unknown>();

/** One cached `Intl` formatter per kind, locale and options; an unknown locale falls back to `en`. */
function cached<T>(key: string, make: (locale: string) => T, locale: string): T {
  const id = `${key}|${locale}`;
  let f = cache.get(id) as T | undefined;
  if (f === undefined) {
    try {
      f = make(locale);
    } catch {
      f = make("en");
    }
    if (cache.size > 500) cache.clear();
    cache.set(id, f);
  }
  return f;
}

const numberFormat = (locale: string) =>
  cached("n", (l) => new Intl.NumberFormat(l, { maximumFractionDigits: 20 }), locale);

const dayFormat = (locale: string) =>
  cached(
    "d",
    (l) =>
      new Intl.DateTimeFormat(l, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    locale,
  );

const instantFormat = (locale: string, zone: string) =>
  cached(
    `t:${zone}`,
    (l) =>
      new Intl.DateTimeFormat(l, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: zone,
        timeZoneName: "short",
      }),
    locale,
  );

const listFormat = (locale: string) =>
  cached("l", (l) => new Intl.ListFormat(l, { type: "conjunction", style: "long" }), locale);

function formatDate(value: unknown, locale: string): string {
  if (typeof value !== "string" || !isCalendarDay(value)) return "";
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return dayFormat(locale).format(Date.UTC(y, m - 1, d));
}

function formatInstant(value: unknown, locale: string, zone: string | undefined): string {
  if (typeof value !== "object" || value === null) return "";
  const { at, timeZone } = value as { at?: unknown; timeZone?: unknown };
  const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(ms)) return "";
  const own = typeof timeZone === "string" && isKnownTimeZone(timeZone) ? timeZone : "UTC";
  const shown = zone && isKnownTimeZone(zone) ? zone : own;
  return instantFormat(locale, shown).format(ms);
}

function formatSelect(value: unknown, def: FieldDefinition, o: FormatFieldOptions): string {
  const values = Array.isArray(value) ? value : [value];
  const labels = values
    .filter((v): v is string => typeof v === "string" && v !== "")
    .map((v) => optionLabel(def, v, o.locale, o.defaultLocale ?? o.locale));
  return labels.length > 1 ? listFormat(o.locale).format(labels) : (labels[0] ?? "");
}

/**
 * A resolved value (`resolveFields(...)[key].value`) as text: text as stored; rich text as its
 * plain words (lines kept); numbers, dates and instants by `Intl` in `locale` (an instant in its own
 * zone unless `timeZone` says otherwise); `boolean` as `words`; a select as its option labels (a
 * list for `multiple`); a URL as written. Images and absent or unreadable values give "".
 */
export function formatFieldValue(
  value: unknown,
  def: FieldDefinition,
  options: FormatFieldOptions,
): string {
  if (value === undefined || value === null) return "";
  switch (def.type) {
    case "text":
    case "url":
      return typeof value === "string" ? value : "";
    case "richText":
      return typeof value === "string" ? markdownToPlain(value, true) : "";
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? numberFormat(options.locale).format(value)
        : "";
    case "boolean": {
      if (typeof value !== "boolean") return "";
      const words = options.words ?? { yes: "Yes", no: "No" };
      return value ? words.yes : words.no;
    }
    case "date":
      return formatDate(value, options.locale);
    case "datetime":
      return formatInstant(value, options.locale, options.timeZone);
    case "select":
      return formatSelect(value, def, options);
    default:
      return "";
  }
}
