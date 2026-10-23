/**
 * RFC-0041 §6: the closed conversion table of `change_field_type`, shared by the operation's dry
 * run and rewrite and by `resolveFields` (which converts values still in `fromType` while an
 * operation runs). Pure, Worker-safe and Temporal-free: zones go through `Intl` only.
 *
 * | from → to | conversion |
 * |---|---|
 * | text → richText | Markdown punctuation escaped, so the words read the same |
 * | richText → text | plain text (markup, links' targets and directives dropped) |
 * | text → number | a decimal number, nothing else |
 * | number → text | its decimal form |
 * | text → select | an option's value, or its label in the site's default language |
 * | select → text | the option value(s), comma separated |
 * | text ↔ url | the same string, when it is a link the url type accepts |
 * | date → datetime | 00:00 of the day in the site's zone |
 * | datetime → date | the day in the value's own zone |
 * | select ↔ select | single ↔ multiple (one value ↔ a list of one; an empty list is no value) |
 *
 * Every result must also fit the new definition (`valueIssues`); anything else is unconvertible.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { FieldType } from "./types.ts";
import { valueIssues } from "./value-checks.ts";

/** What a conversion needs from the site. */
export interface ConvertContext {
  /** The site's zone (`date → datetime`); `UTC` when the site has none. */
  readonly timeZone: string;
  /** The site's default language (`text → select` labels). */
  readonly defaultLocale: string;
}

/** `value: undefined` means "no value" (the key is removed). */
export type Conversion = { ok: true; value: unknown } | { ok: false; reason: string };

/** The table, from → the types it converts to (besides itself). */
export const FIELD_CONVERSIONS: Readonly<Partial<Record<FieldType, readonly FieldType[]>>> = {
  text: ["richText", "number", "select", "url"],
  richText: ["text"],
  number: ["text"],
  select: ["text", "select"],
  url: ["text"],
  date: ["datetime"],
  datetime: ["date"],
};

/** True when the table converts `from` values to `to` (a type always converts to itself). */
export function canConvert(from: FieldType, to: FieldType): boolean {
  return from === to || FIELD_CONVERSIONS[from]?.includes(to) === true;
}

type Step = (value: unknown, to: FieldDefinition, ctx: ConvertContext) => Conversion;

const fail = (reason: string): Conversion => ({ ok: false, reason });
const ok = (value: unknown): Conversion => ({ ok: true, value });

/** CommonMark escapes for the characters that would turn plain words into markup. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_[\]<>|~&]/g, "\\$&")
    .replace(/^(\s*)([#>+=-])/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])/gm, "$1\\$2")
    .replace(/:(?=:)/g, "\\:");
}

/** The words of a markdown string: no markup, link text without targets, no directives. */
export function markdownToPlain(markdown: string, multiline: boolean): string {
  const lines: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```") || line.startsWith("~~~") || line.startsWith("::")) continue;
    const words = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|~~|\*|_|`)/g, "")
      .replace(/\\([!-/:-@[-`{-~])/g, "$1")
      .trim();
    if (words) lines.push(words);
  }
  return lines.join(multiline ? "\n" : " ");
}

const formats = new Map<string, Intl.DateTimeFormat>();
function partsIn(zone: string, epochMs: number): Record<string, number> {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(zone, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(epochMs)))
    if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** The zone's offset from UTC at an instant, in milliseconds (throws on an unknown zone). */
export function offsetMs(zone: string, epochMs: number): number {
  const p = partsIn(zone, epochMs);
  const local = Date.UTC(
    p.year as number,
    (p.month as number) - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return local - Math.floor(epochMs / 1000) * 1000;
}

/** 00:00 of `day` (`YYYY-MM-DD`) in `zone`, as an RFC 3339 UTC instant. */
export function midnightIn(day: string, zone: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  const first = wall - offsetMs(zone, wall);
  const at = wall - offsetMs(zone, first);
  return new Date(at).toISOString().replace(".000Z", "Z");
}

/** The calendar day of an instant in `zone` (`YYYY-MM-DD`). */
export function dayIn(at: string, zone: string): string {
  const p = partsIn(zone, Date.parse(at));
  const pad = (n: number | undefined, w = 2) => String(n).padStart(w, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

const isString = (v: unknown): v is string => typeof v === "string";

function toSelect(value: unknown, to: FieldDefinition, ctx: ConvertContext): Conversion {
  if (to.type !== "select") return fail("not a select");
  const wrap = (v: string | undefined): Conversion =>
    v === undefined ? ok(undefined) : ok(to.multiple ? [v] : v);
  if (isString(value)) {
    const t = value.trim();
    if (!t) return ok(undefined);
    const lower = t.toLocaleLowerCase(ctx.defaultLocale);
    const match =
      to.options.find((o) => o.value === t) ??
      to.options.find((o) => o.labels[ctx.defaultLocale]?.trim().toLocaleLowerCase() === lower);
    return match ? wrap(match.value) : fail(`"${t.slice(0, 40)}" is not one of the options`);
  }
  if (Array.isArray(value)) {
    if (to.multiple) return ok(value.length ? value : undefined);
    if (value.length === 0) return ok(undefined);
    if (value.length === 1) return wrap(String(value[0]));
    return fail(`${value.length} options chosen; a single select keeps one`);
  }
  return fail("not an option value");
}

/** One step per source type; the target decides inside it. */
const FROM: Partial<Record<FieldType, Step>> = {
  text(value, to, ctx) {
    if (!isString(value)) return fail("not text");
    if (to.type === "richText") return ok(escapeMarkdown(value));
    if (to.type === "url") return ok(value.trim());
    if (to.type === "select") return toSelect(value, to, ctx);
    if (to.type === "number") {
      if (!/^\s*-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value))
        return fail(`"${value.slice(0, 40)}" is not a number`);
      return ok(Number(value));
    }
    return fail(`text does not convert to ${to.type}`);
  },
  richText(value, to) {
    if (!isString(value) || to.type !== "text") return fail(`rich text converts to text only`);
    return ok(markdownToPlain(value, to.multiline === true) || undefined);
  },
  number(value, to) {
    if (typeof value !== "number" || to.type !== "text") return fail("numbers convert to text");
    return ok(String(value));
  },
  url(value, to) {
    if (!isString(value) || to.type !== "text") return fail("links convert to text");
    return ok(value);
  },
  select(value, to, ctx) {
    if (to.type === "select") return toSelect(value, to, ctx);
    if (to.type !== "text") return fail("options convert to text or another select");
    if (isString(value)) return ok(value);
    if (Array.isArray(value)) return ok(value.length ? value.join(", ") : undefined);
    return fail("not an option value");
  },
  date(value, to, ctx) {
    if (!isString(value) || to.type !== "datetime") return fail("dates convert to date and time");
    return ok({ at: midnightIn(value, ctx.timeZone), timeZone: ctx.timeZone });
  },
  datetime(value, to) {
    const v = value as { at?: unknown; timeZone?: unknown } | null;
    if (to.type !== "date" || !v || !isString(v.at) || !isString(v.timeZone))
      return fail("a date and time converts to a date");
    return ok(dayIn(v.at, v.timeZone));
  },
};

/**
 * Converts a value stored under a `from` field to the definition `to`, by the closed table. The
 * result fits `to` (or is `undefined`: no value), or the conversion fails with a reason.
 */
export function convertFieldValue(
  from: FieldType,
  to: FieldDefinition,
  value: unknown,
  ctx: ConvertContext,
): Conversion {
  let out: Conversion;
  if (from === to.type && to.type !== "select") out = ok(value);
  else if (!canConvert(from, to.type)) return fail(`${from} values do not convert to ${to.type}`);
  else {
    const step = FROM[from];
    try {
      out = step ? step(value, to, ctx) : fail(`${from} values do not convert`);
    } catch {
      out = fail("the value could not be read");
    }
  }
  if (!out.ok || out.value === undefined) return out;
  const issue = valueIssues(to, out.value, "v")[0];
  return issue ? fail(issue.message) : out;
}
