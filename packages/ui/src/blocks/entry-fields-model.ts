/**
 * The pure part of `EntryFieldsForm` (RFC-0041 §7): reading and writing one typed value in an
 * entry's `fields`, through a running field operation's marker, and the words a translation shows
 * for its original's value. No React, no English: words come from the caller.
 */
import type { FieldDefinition, SubFieldDefinition } from "@cloudhal/core-contracts";
import { optionLabel, renamedFrom } from "@cloudhal/core-ts/fields";
import { dateTimeFormat, formatList, formatNumber } from "@cloudhal/messages/format";
import { formatDay } from "./schedule-model.ts";

export type FieldValues = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A field's stored value; while a rename runs, the old key's (RFC-0041 §6 phase A). */
export function readField(values: FieldValues | undefined, def: FieldDefinition): unknown {
  if (!values) return undefined;
  if (Object.hasOwn(values, def.key)) return values[def.key];
  const from = renamedFrom(def);
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
  const from = renamedFrom(def);
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
  /** RFC-0045: a target's title, when the host knows it. */
  referenceTitle?: ((groupId: string) => string | undefined) | undefined;
  /** RFC-0045: a list of items without names ("3 items"). */
  items?: ((count: number) => string) | undefined;
}

/**
 * The original's value as one line of text, in the Studio language: what an empty localized field
 * of a translation shows as its placeholder, or under the control when it has none.
 */
export function fallbackText(
  def: FieldDefinition | SubFieldDefinition,
  v: unknown,
  ctx: FallbackContext,
): string {
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
    case "reference": {
      const titles = referenceIds(v).map((id) => ctx.referenceTitle?.(id));
      return titles.every((x) => x !== undefined) ? formatList(ctx.locale, titles as string[]) : "";
    }
    case "repeater": {
      const items = repeaterItems(v);
      const names = items.map((item) => itemName(def, item, ctx));
      if (names.every((x) => x !== undefined)) return formatList(ctx.locale, names as string[]);
      return ctx.items?.(items.length) ?? "";
    }
    default:
      return typeof v === "string" ? v : JSON.stringify(v);
  }
}

/** A reference value as a list of group ids: one id, a list of them, or none. */
export function referenceIds(v: unknown): string[] {
  if (typeof v === "string") return v === "" ? [] : [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** A repeater value as its items (anything that is not a flat object is left out). */
export function repeaterItems(v: unknown): FieldValues[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

type Repeater = Extract<FieldDefinition, { type: "repeater" }>;

/** The sub-field that names an item (RFC-0045 §1): `itemLabel`, else the first text, select or reference. */
export function itemLabelSub(def: Repeater): SubFieldDefinition | undefined {
  const named = (s: SubFieldDefinition) =>
    s.type === "text" || s.type === "select" || s.type === "reference";
  return def.fields.find((s) => s.key === def.itemLabel && named(s)) ?? def.fields.find(named);
}

/** What `itemName` needs to word a reference or a choice. */
export interface ItemNameContext {
  locale: string;
  defaultLocale: string;
  /** A target's title, when the host knows it. */
  referenceTitle?: ((groupId: string) => string | undefined) | undefined;
}

/** An item's name from its label sub-field ("Ada Lovelace"), or undefined when it has none. */
export function itemName(
  def: Repeater,
  item: FieldValues,
  ctx: ItemNameContext,
): string | undefined {
  const sub = itemLabelSub(def);
  const v = sub ? item[sub.key] : undefined;
  if (!sub || !hasValue(v) || typeof v !== "string") return undefined;
  if (sub.type === "select") return optionLabel(sub, v, ctx.locale, ctx.defaultLocale);
  if (sub.type === "reference") return ctx.referenceTitle?.(v);
  const line = v.trim().split("\n")[0]?.trim();
  return line || undefined;
}

/**
 * The first message at or under `key` in `errors` (paths relative to `fields`: `venue`,
 * `startsAt/at`, `speakers/2/person`): what a field that is not a repeater shows.
 */
export function errorUnder(
  errors: Readonly<Record<string, string>> | undefined,
  key: string,
): string | undefined {
  if (!errors) return undefined;
  if (errors[key] !== undefined) return errors[key];
  const prefix = `${key}/`;
  for (const [path, message] of Object.entries(errors)) if (path.startsWith(prefix)) return message;
  return undefined;
}

/** A repeater's messages: its own, and each item's own and per sub-field (`speakers/2/person`). */
export interface RepeaterErrors {
  field: string | undefined;
  items: Map<number, { item?: string; subs: Map<string, string> }>;
}

export function repeaterErrors(
  errors: Readonly<Record<string, string>> | undefined,
  key: string,
): RepeaterErrors {
  const out: RepeaterErrors = { field: errors?.[key], items: new Map() };
  const prefix = `${key}/`;
  for (const [path, message] of Object.entries(errors ?? {})) {
    if (!path.startsWith(prefix)) continue;
    const [index, sub] = path.slice(prefix.length).split("/");
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0) {
      out.field ??= message;
      continue;
    }
    const slot = out.items.get(i) ?? { subs: new Map<string, string>() };
    if (sub === undefined || sub === "") slot.item ??= message;
    else if (!slot.subs.has(sub)) slot.subs.set(sub, message);
    out.items.set(i, slot);
  }
  return out;
}

/**
 * A repeater's items as the form shows them while a sub-field rename runs (RFC-0045 §7, `sub` with
 * `fromKey`): an item not rewritten yet holds the value under the old key, shown under the new one.
 * Writing these items back leaves only the new key, as `writeField` does for a field.
 */
export function shownItems(def: Repeater, value: unknown): FieldValues[] {
  const items = repeaterItems(value);
  const m = def.migration;
  if (m?.sub === undefined || !m.fromKey) return items;
  const { sub, fromKey } = m;
  return items.map((item) => {
    if (!Object.hasOwn(item, fromKey)) return item;
    const { [fromKey]: old, ...rest } = item;
    return Object.hasOwn(rest, sub) ? rest : { ...rest, [sub]: old };
  });
}

const isString = (v: unknown) => typeof v === "string";

/** True when a value has the shape of its type (not its limits): what a control can show and edit. */
export function fitsShape(def: FieldDefinition | SubFieldDefinition, v: unknown): boolean {
  const several = "multiple" in def && def.multiple === true;
  switch (def.type) {
    case "number":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "datetime":
      return instantOf(v) !== undefined;
    case "select":
    case "reference":
      return several ? Array.isArray(v) && v.every(isString) : isString(v);
    case "repeater":
      return Array.isArray(v) && v.every(isRecord);
    default:
      return isString(v);
  }
}

/**
 * True for a stored value a running type change has not converted yet (RFC-0041 §6, RFC-0045 §7):
 * the definition (or `sub`'s) carries `fromType` and the value is not of the new type's shape. The
 * form shows it read-only rather than letting an edit overwrite it; phase B converts it.
 */
export function unconverted(
  repeaterOrField: FieldDefinition,
  def: FieldDefinition | SubFieldDefinition,
  v: unknown,
): boolean {
  const m = repeaterOrField.migration;
  if (m?.fromType === undefined || !hasValue(v)) return false;
  const marked = def === repeaterOrField ? m.sub === undefined : m.sub === def.key;
  return marked && !fitsShape(def, v);
}
