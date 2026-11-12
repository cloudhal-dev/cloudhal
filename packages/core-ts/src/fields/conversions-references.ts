/**
 * RFC-0045 §7: the rows of `change_field_type`'s closed table for references and repeaters.
 *
 * | from → to | conversion | unconvertible |
 * |---|---|---|
 * | reference single ↔ multiple | one id ↔ a list of one; an empty list is no value | more than one id to single |
 * | text → reference | the one group among the target collections with a member whose slug, or default-locale title, equals the text (case-folded); never the entry's own group | no match, or more than one |
 * | reference → text | the group's default-locale member's title (a list: comma separated) | a group with no such member |
 * | text → repeater | one item per non-empty line into the repeater's one `text` sub-field | a line over its `maxLength`, more lines than `maxItems` |
 * | repeater → text | the items' one value each, joined by line breaks | items with other shapes |
 * | reference ↔ repeater | one item per id into the repeater's one `reference` sub-field, and back | items with other shapes |
 *
 * The text ↔ reference rows read the prefetched maps (`ConvertContext.entries`), so the table stays
 * pure and synchronous. Readers know only the new definition and the marker, so the repeater rows
 * read an item's shape from the value: one own key per item. The operation refuses, before phase
 * A, a repeater source that has more than one sub-field (`checkOperation`), so a reader never sees
 * an item that phase B would treat differently. A rich-text sub-field's items join as their
 * Markdown, as stored: the marker does not say which type the sub-field had. Pure and Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { foldText } from "../references/conversion-maps.ts";
import type { Conversion, ConvertContext } from "./conversions.ts";
import { isRecord } from "./types.ts";

type Step = (value: unknown, to: FieldDefinition, ctx: ConvertContext) => Conversion;

const fail = (reason: string): Conversion => ({ ok: false, reason });
const ok = (value: unknown): Conversion => ({ ok: true, value });
const quote = (text: string) => `"${text.slice(0, 40)}"`;

/** A reference value as a list of ids (a single id is a list of one), or undefined. */
function idsOf(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value;
  return undefined;
}

/** A list of ids into `to`: a multiple reference takes them all, a single one at most one. */
function asReference(ids: readonly string[], to: FieldDefinition): Conversion {
  if (to.type !== "reference") return fail("not a reference");
  if (ids.length === 0) return ok(undefined);
  if (to.multiple) return ok([...ids]);
  if (ids.length === 1) return ok(ids[0]);
  return fail(`${ids.length} entries chosen; a single reference keeps one`);
}

/** The key of a repeater's only sub-field of `type`, when it has exactly one sub-field. */
function onlySub(to: FieldDefinition, type: "text" | "reference"): string | undefined {
  if (to.type !== "repeater" || to.fields.length !== 1) return undefined;
  const [sub] = to.fields;
  return sub?.type === type ? sub.key : undefined;
}

/** The items' one value each, or undefined when an item has any other shape. */
function soleValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const keys = Object.keys(item);
    const v = keys.length === 1 ? item[keys[0] as string] : undefined;
    if (typeof v !== "string") return undefined;
    out.push(v);
  }
  return out;
}

function textToReference(value: string, to: FieldDefinition, ctx: ConvertContext): Conversion {
  if (to.type !== "reference") return fail("not a reference");
  const text = foldText(value);
  if (text === "") return ok(undefined);
  if (!ctx.entries) return fail("the entries to match could not be read");
  const groups = (ctx.entries.byText.get(text) ?? []).filter((g) => g !== ctx.group);
  if (groups.length === 0)
    return fail(`no entry of ${to.collections.join(", ")} has the title or slug ${quote(value)}`);
  if (groups.length > 1) return fail(`${quote(value)} matches ${groups.length} entries`);
  return asReference(groups, to);
}

function textToRepeater(value: string, to: FieldDefinition): Conversion {
  const key = onlySub(to, "text");
  if (key === undefined) return fail("text converts to a repeater with one text sub-field only");
  const lines = value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return ok(lines.length > 0 ? lines.map((line) => ({ [key]: line })) : undefined);
}

/** The steps from `text` to the new types (`conversions.ts` routes them here). */
export function textToStage4(value: unknown, to: FieldDefinition, ctx: ConvertContext): Conversion {
  if (typeof value !== "string") return fail("not text");
  if (to.type === "reference") return textToReference(value, to, ctx);
  if (to.type === "repeater") return textToRepeater(value, to);
  return fail(`text does not convert to ${to.type}`);
}

/** One step per new source type; the target decides inside it. */
export const STAGE4_FROM: { readonly reference: Step; readonly repeater: Step } = {
  reference(value, to, ctx) {
    const ids = idsOf(value);
    if (!ids) return fail("not a reference value");
    if (to.type === "reference") return asReference(ids, to);
    if (to.type === "repeater") {
      const key = onlySub(to, "reference");
      if (key === undefined)
        return fail("references convert to a repeater with one reference sub-field only");
      return ok(ids.length > 0 ? ids.map((id) => ({ [key]: id })) : undefined);
    }
    if (to.type !== "text") return fail(`references do not convert to ${to.type}`);
    if (ids.length === 0) return ok(undefined);
    if (!ctx.entries) return fail("the entries' titles could not be read");
    const titles: string[] = [];
    for (const id of ids) {
      const title = ctx.entries.titles.get(id);
      if (title === undefined) return fail(`${id} has no entry in this site's default language`);
      titles.push(title);
    }
    return ok(titles.join(", "));
  },
  repeater(value, to) {
    const values = soleValues(value);
    if (!values) return fail("only a repeater whose items hold one value each converts");
    if (to.type === "reference") return asReference(values, to);
    if (to.type !== "text") return fail(`repeaters do not convert to ${to.type}`);
    return ok(values.length > 0 ? values.join("\n") : undefined);
  },
};
