/**
 * RFC-0041 §2: one value against one definition. `validateProps` (ADR-0030) does the type, length,
 * bound, enum and pattern checks from the compiled prop schema; the per-type table adds what the
 * subset cannot say. Eval-free and Temporal-free (the site Worker reads values too).
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { type BlockRegistry, validateProps } from "../blocks.ts";
import { bodyDirectives } from "../body-blocks.ts";
import { checkDirective } from "../directives.ts";
import { checkBodySurfaces, createCatalog } from "../surfaces.ts";
import { fieldPropSchema } from "./props.ts";
import { FIELD_LIMITS, type FieldIssue } from "./types.ts";

export interface ValueCheckOptions {
  /** Directives and surface fences in rich text are checked against it (absent: shape only). */
  blocks?: BlockRegistry | undefined;
}

type Extra = (
  def: FieldDefinition,
  value: unknown,
  path: string,
  options: ValueCheckOptions,
) => FieldIssue[];

const issue = (path: string, message: string): FieldIssue => ({
  path,
  code: "invalid_value",
  message,
});

/** True when `YYYY-MM-DD` names a day of the proleptic Gregorian calendar. */
export function isCalendarDay(value: string): boolean {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const zones = new Map<string, boolean>();
let supported: Set<string> | undefined;

/**
 * True when the runtime's `Intl` knows the zone: in `Intl.supportedValuesOf("timeZone")`, or an
 * alias it accepts (`UTC`, `Europe/Kiev`), as `isTimeZone` does for site zones (RFC-0008).
 */
export function isKnownTimeZone(name: string): boolean {
  const hit = zones.get(name);
  if (hit !== undefined) return hit;
  supported ??= new Set(Intl.supportedValuesOf("timeZone"));
  let ok = supported.has(name);
  if (!ok)
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
      ok = true;
    } catch {
      ok = false;
    }
  zones.set(name, ok);
  return ok;
}

function markdownIssues(markdown: string, path: string, blocks: BlockRegistry): FieldIssue[] {
  const out: FieldIssue[] = [];
  if (markdown.includes("surface"))
    for (const i of checkBodySurfaces(markdown, createCatalog({ blocks })))
      out.push(issue(path, `surface ${i.path}: ${i.message}`));
  if (markdown.includes("::"))
    for (const d of bodyDirectives(markdown)) {
      const found = checkDirective(blocks, d) ?? [];
      if (found.length)
        out.push(
          issue(
            path,
            `${d.name}: ${found.map((i) => `${i.path || "props"} ${i.message}`).join("; ")}`,
          ),
        );
    }
  return out;
}

/** What each type adds to the compiled schema's checks (run only when those passed). */
const EXTRA: Partial<Record<FieldDefinition["type"], Extra>> = {
  text(def, value, path) {
    const multiline = def.type === "text" && def.multiline === true;
    const s = value as string;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x20 && !(c === 0x0a && multiline))
        return [
          issue(
            path,
            multiline ? "no control characters but line breaks" : "one line, no control characters",
          ),
        ];
    }
    return [];
  },
  richText(_def, value, path, options) {
    const s = value as string;
    if (s.length > FIELD_LIMITS.richTextLength)
      return [issue(path, `at most ${FIELD_LIMITS.richTextLength} characters`)];
    return options.blocks ? markdownIssues(s, path, options.blocks) : [];
  },
  date(_def, value, path) {
    return isCalendarDay(value as string) ? [] : [issue(path, "a real calendar day (YYYY-MM-DD)")];
  },
  datetime(_def, value, path) {
    const v = value as { at: string; timeZone: string };
    const out: FieldIssue[] = [];
    if (!isCalendarDay(v.at.slice(0, 10)) || !Number.isFinite(Date.parse(v.at)))
      out.push(issue(`${path}/at`, "a real instant (RFC 3339 in UTC)"));
    if (!isKnownTimeZone(v.timeZone)) out.push(issue(`${path}/timeZone`, "an IANA time zone"));
    return out;
  },
  url(_def, value, path) {
    return /^\s*asset:/i.test(value as string)
      ? [issue(path, "a link (https, http, mailto, tel, /path or #fragment), not an asset")]
      : [];
  },
  select(def, value, path) {
    if (def.type !== "select" || !def.multiple) return [];
    const list = value as string[];
    return new Set(list).size === list.length ? [] : [issue(path, "each option at most once")];
  },
};

/** Problems with one value (`path` is where it sits, e.g. `fields/startsAt`). */
export function valueIssues(
  def: FieldDefinition,
  value: unknown,
  path: string,
  options: ValueCheckOptions = {},
): FieldIssue[] {
  if (value === null)
    return [issue(path, "null is never stored: leave the key out to remove the value")];
  // The subset caps strings at 10 000 characters; rich text's own limit is checked below.
  const typed = def.type === "richText" && typeof value === "string" ? "" : value;
  const found = validateProps(
    { type: "object", properties: { v: fieldPropSchema(def) }, additionalProperties: false },
    { v: typed },
  );
  if (found.length) return found.map((i) => issue(`${path}${i.path.slice(1)}`, i.message));
  return EXTRA[def.type]?.(def, value, path, options) ?? [];
}
