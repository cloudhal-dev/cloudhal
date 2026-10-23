/**
 * The pure part of `EntryFieldsForm` (RFC-0041 §7): reading and writing one typed value in an
 * entry's `fields`, through a running field operation's marker, and the words a translation shows
 * for its original's value. No React, no English: words come from the caller.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { optionLabel } from "@cloudhal/core-ts/fields";
import { dateTimeFormat, formatList, formatNumber } from "@cloudhal/messages/format";
import { formatDay } from "./schedule-model.ts";

export type FieldValues = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A field's stored value; while a rename runs, the old key's (RFC-0041 §6 phase A). */
export function readField(values: FieldValues | undefined, def: FieldDefinition): unknown {
  if (!values) return undefined;
  if (Object.hasOwn(values, def.key)) return values[def.key];
  const from = def.migration?.fromKey;
  return from && Object.hasOwn(values, from) ? values[from] : undefined;
}

/** True when a value counts as set (empty strings and lists are no value). */
export function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  return !(Array.isArray(v) && v.length === 0);
}

/**
 * `values` with the field set to `v`, or removed when `v` is no value. A rename's old key goes
 * at the same time, so a write never leaves both.
 */
export function writeField(
  values: FieldValues | undefined,
  def: FieldDefinition,
  v: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(values ?? {}) };
  const from = def.migration?.fromKey;
  if (from) delete next[from];
  if (hasValue(v)) next[def.key] = v;
  else delete next[def.key];
  return next;
}

/** A `datetime` value (`{ at, timeZone }`) or none. */
export function instantOf(v: unknown): { at: string; timeZone: string } | undefined {
  if (!isRecord(v) || typeof v.at !== "string" || typeof v.timeZone !== "string") return undefined;
  return { at: v.at, timeZone: v.timeZone };
}

/** What `fallbackText` needs besides the value. */
export interface FallbackContext {
  locale: string;
  defaultLocale: string;
  yes: string;
  no: string;
  /** An image field's words ("The original's image"). */
  image: string;
}

/**
 * The original's value as one line of text, in the Studio language: what an empty localized field
 * of a translation shows as its placeholder, or under the control when it has none.
 */
export function fallbackText(def: FieldDefinition, v: unknown, ctx: FallbackContext): string {
  if (!hasValue(v) && def.type !== "boolean") return "";
  switch (def.type) {
    case "boolean":
      return v === true ? ctx.yes : ctx.no;
    case "number":
      return typeof v === "number" ? formatNumber(ctx.locale, v) : String(v);
    case "date":
      return typeof v === "string" ? formatDay(v, ctx.locale, "medium") : "";
    case "datetime": {
      const i = instantOf(v);
      if (!i) return "";
      return dateTimeFormat(ctx.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: i.timeZone,
      }).format(new Date(i.at));
    }
    case "select": {
      const list = Array.isArray(v) ? v : [v];
      return formatList(
        ctx.locale,
        list.map((x) => optionLabel(def, String(x), ctx.locale, ctx.defaultLocale)),
      );
    }
    case "image":
      return ctx.image;
    default:
      return typeof v === "string" ? v : JSON.stringify(v);
  }
}
