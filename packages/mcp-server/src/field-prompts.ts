/**
 * RFC-0041 §8 and RFC-0045 §6: typed field changes as a person reads them in an approval prompt.
 * Labels, option labels, dates in their zone; references by their target's title, id and
 * collection (`venue → "Main hall" (entry_…, Places)`); repeaters by item counts and the items
 * added or removed (`speakers: 2 items → 3 items (added "Ada Lovelace", Speaker)`). Every agent or
 * content text is quoted and truncated (`quote()`), so it cannot pose as the prompt's own words.
 */
import type {
  ContentEntry,
  FieldDefinition,
  Site,
  SubFieldDefinition,
} from "@cloudhal/core-contracts";
import { getGroupMembers } from "@cloudhal/core-ts";
import {
  fieldDefinitions,
  fieldLabel,
  optionLabel,
  referenceValues,
} from "@cloudhal/core-ts/fields";
import { quote, type ToolContext } from "./common.ts";

type Values = Record<string, unknown>;

/** "5 Nov 2026" (a calendar day: no zone). */
function day(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return quote(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** "5 Nov 2026 19:30 Istanbul" (the wall clock in the value's own zone). */
function instant(value: unknown): string {
  const v = value as { at?: unknown; timeZone?: unknown };
  if (typeof v?.at !== "string" || typeof v.timeZone !== "string") return quote(JSON.stringify(v));
  const at = new Date(v.at);
  if (Number.isNaN(at.getTime())) return quote(v.at);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: v.timeZone,
    }).format(at);
    const city = (v.timeZone.split("/").pop() ?? v.timeZone).replace(/_/g, " ");
    return `${parts.replace(",", "")} ${city}`;
  } catch {
    return `${quote(v.at)} ${quote(v.timeZone)}`;
  }
}

/** How a prompt names a translation group: its member's title and its collection's name. */
export interface Targets {
  /** `"Main hall" (entry_…, Places)`, or the id alone when the site has no member. */
  name(groupId: string): string;
}

const NO_TARGETS: Targets = { name: (id) => quote(id) };

/** Reads the members of every group id in `values` once, for the prompt. */
export async function loadTargets(
  ctx: ToolContext,
  site: Site,
  input: { collection: string; locale: string; values: readonly Values[] },
): Promise<Targets> {
  const defs = fieldDefinitions(site, input.collection);
  const ids = new Set<string>();
  for (const values of input.values)
    for (const def of defs) for (const id of referenceValues(def, values[def.key])) ids.add(id);
  if (ids.size === 0) return NO_TARGETS;
  const members = await getGroupMembers(ctx.store.sql, site.id, [...ids]);
  const plural = (c: string) => site.collections?.[c]?.labels?.[site.defaultLocale]?.plural ?? c;
  return {
    name: (id) => {
      const list = members.get(id) ?? [];
      const m =
        list.find((e) => e.locale === input.locale) ??
        list.find((e) => e.locale === site.defaultLocale) ??
        list[0];
      return m
        ? `"${quote(m.title, 40)}" (${quote(id)}, ${quote(plural(m.collection), 40)})`
        : `${quote(id)} (no entry in this site)`;
    },
  };
}

/** A list of up to three names, then how many more. */
function some(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/** A scalar or reference value of a field or sub-field. */
function describeScalar(
  def: FieldDefinition | SubFieldDefinition,
  value: unknown,
  locale: string,
  targets: Targets,
): string {
  switch (def.type) {
    case "number":
      return typeof value === "number" ? String(value) : `"${quote(String(value))}"`;
    case "boolean":
      return value === true ? "yes" : "no";
    case "date":
      return typeof value === "string" ? day(value) : `"${quote(String(value))}"`;
    case "datetime":
      return instant(value);
    case "select": {
      const list = Array.isArray(value) ? value : [value];
      const asField = def as FieldDefinition;
      return list.map((v) => quote(optionLabel(asField, String(v), locale, locale))).join(", ");
    }
    case "reference": {
      const list = Array.isArray(value) ? value : [value];
      return some(list.map((v) => (typeof v === "string" ? targets.name(v) : quote(String(v)))));
    }
    default:
      return `"${quote(typeof value === "string" ? value : JSON.stringify(value))}"`;
  }
}

/** The sub-field that names an item: `itemLabel`, else the first text, select or reference. */
function labelSub(def: Extract<FieldDefinition, { type: "repeater" }>) {
  const named = ["text", "select", "reference"];
  return (
    def.fields.find((s) => s.key === def.itemLabel) ??
    def.fields.find((s) => named.includes(s.type))
  );
}

/** An item as `"Ada Lovelace", Speaker`: its label sub-value, then its other selects' labels. */
function describeItem(
  def: Extract<FieldDefinition, { type: "repeater" }>,
  item: unknown,
  locale: string,
  targets: Targets,
): string {
  if (!item || typeof item !== "object") return `"${quote(JSON.stringify(item) ?? "")}"`;
  const values = item as Values;
  const label = labelSub(def);
  const parts: string[] = [];
  if (label && Object.hasOwn(values, label.key))
    parts.push(describeScalar(label, values[label.key], locale, targets));
  for (const sub of def.fields)
    if (sub.type === "select" && sub !== label && Object.hasOwn(values, sub.key))
      parts.push(describeScalar(sub, values[sub.key], locale, targets));
  return parts.length > 0 ? parts.join(", ") : "an item";
}

/** Items of `next` not in `before`, and the other way round (as multisets). */
function itemChanges(before: readonly unknown[], next: readonly unknown[]) {
  const left = before.map((x) => JSON.stringify(x));
  const added: unknown[] = [];
  for (const item of next) {
    const at = left.indexOf(JSON.stringify(item));
    if (at === -1) added.push(item);
    else left.splice(at, 1);
  }
  const removed = left.map((x) => JSON.parse(x) as unknown);
  return { added, removed };
}

const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/** `2 items → 3 items (added "Ada Lovelace", Speaker)`. */
function describeRepeater(
  def: Extract<FieldDefinition, { type: "repeater" }>,
  change: { before: unknown; value: unknown },
  words: { locale: string; targets: Targets },
): string {
  const { locale, targets } = words;
  const was = Array.isArray(change.before) ? change.before : [];
  const now = Array.isArray(change.value) ? change.value : [];
  const { added, removed } = itemChanges(was, now);
  const notes = [
    added.length ? `added ${some(added.map((i) => describeItem(def, i, locale, targets)))}` : "",
    removed.length
      ? `removed ${some(removed.map((i) => describeItem(def, i, locale, targets)))}`
      : "",
  ].filter(Boolean);
  if (notes.length === 0 && JSON.stringify(was) !== JSON.stringify(now)) notes.push("reordered");
  return `${items(was.length)} → ${items(now.length)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

/** A value as a person reads it in an approval prompt (agent text quoted and truncated). */
export function describeFieldValue(
  def: FieldDefinition | undefined,
  value: unknown,
  locale: string,
  targets: Targets = NO_TARGETS,
): string {
  if (!def) return `"${quote(JSON.stringify(value) ?? "")}"`;
  if (def.type === "repeater")
    return describeRepeater(def, { before: undefined, value }, { locale, targets });
  return describeScalar(def, value, locale, targets);
}

/**
 * "startsAt → 5 Nov 2026 19:30 Istanbul, venue → "Main hall" (entry_…, Places), speakers: 2
 * items → 3 items (added "Ada Lovelace", Speaker), notes removed" for an update of `entry`.
 */
export async function describeFieldPatch(
  ctx: ToolContext,
  site: Site,
  entry: Pick<ContentEntry, "collection" | "locale" | "fields">,
  patch: Values,
): Promise<string> {
  const defs = new Map(fieldDefinitions(site, entry.collection).map((d) => [d.key, d]));
  const locale = site.defaultLocale;
  const stored = entry.fields ?? {};
  const targets = await loadTargets(ctx, site, {
    collection: entry.collection,
    locale: entry.locale,
    values: [patch, stored],
  });
  return Object.entries(patch)
    .map(([key, value]) => {
      const def = defs.get(key);
      const name = def ? `"${quote(fieldLabel(def, locale, locale), 40)}" (${key})` : key;
      if (value === null) return `${name} removed`;
      if (def?.type === "repeater")
        return `${name}: ${describeRepeater(def, { before: stored[key], value }, { locale, targets })}`;
      return `${name} → ${describeFieldValue(def, value, locale, targets)}`;
    })
    .join(", ");
}
