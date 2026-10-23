/**
 * RFC-0041 §6: reading and rewriting values through a field operation's `migration` marker. While
 * an operation runs, the site carries the new definition with `migration: { id, fromKey |
 * fromType | fromLocalized }` (no `from*` at all: the field is being removed). One function says
 * what an entry's values become under the marker; the operation's dry run and rewrite, the store's
 * normalization of a person's write during the run, and `resolveFields` all use it, so every
 * reader agrees however many entries remain. Pure and Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { type ConvertContext, convertFieldValue } from "./conversions.ts";
import { isRecord, type SiteFields, sameJson } from "./types.ts";
import { valueIssues } from "./value-checks.ts";

export type FieldMigrationKind = "rename" | "retype" | "localize" | "remove";

/** What a marker says the operation does (undefined: no marker). */
export function migrationKind(def: FieldDefinition): FieldMigrationKind | undefined {
  const m = def.migration;
  if (!m) return undefined;
  if (m.fromKey !== undefined) return "rename";
  if (m.fromType !== undefined) return "retype";
  if (m.fromLocalized !== undefined) return "localize";
  return "remove";
}

/** True while an operation removes the field: readers treat it as gone. */
export const isBeingRemoved = (def: FieldDefinition): boolean => migrationKind(def) === "remove";

/** The conversion context of a site (`UTC` and `en` when it names none). */
export function convertContext(site: SiteFields) {
  return {
    timeZone: site.timeZone ?? "UTC",
    defaultLocale: site.defaultLocale ?? "en",
  } satisfies ConvertContext;
}

export interface RewriteInput {
  /** The new definition, carrying the marker. */
  readonly def: FieldDefinition;
  readonly values: Readonly<Record<string, unknown>> | undefined;
  readonly convert: ConvertContext;
  /** The entry is a translation whose original is in the same site. */
  readonly translation: boolean;
  /**
   * The entry is exactly as it was when the operation started: a type change converts its value
   * even when the old value also fits the new type (text → rich text escapes). Otherwise only
   * values that do not fit are converted (a person's write already used the new type).
   */
  readonly pristine: boolean;
  /** `"clear"` drops values that cannot be converted; otherwise they stay as stored. */
  readonly onInvalid?: "clear" | undefined;
}

/** How one entry's value changes under a marker. */
export interface ValueChange {
  readonly kind: "moved" | "converted" | "cleared" | "removed" | "unconvertible";
  readonly before: unknown;
  readonly after: unknown;
  readonly reason?: string;
}

export interface RewriteResult {
  /** The new `fields`, or undefined when nothing changes. */
  readonly values: Record<string, unknown> | undefined;
  readonly change: ValueChange | undefined;
}

const NOTHING: RewriteResult = { values: undefined, change: undefined };

function without(values: Readonly<Record<string, unknown>>, key: string) {
  const { [key]: _gone, ...rest } = values;
  return rest;
}

/** A value under a type change: converted, kept, or (with `onInvalid: "clear"`) dropped. */
function retype(input: RewriteInput, values: Readonly<Record<string, unknown>>): RewriteResult {
  const { def, convert, pristine } = input;
  const from = def.migration?.fromType;
  if (!from || !Object.hasOwn(values, def.key)) return NOTHING;
  const before = values[def.key];
  const fits = valueIssues(def, before, "v").length === 0;
  if (fits && (!pristine || from === def.type)) return NOTHING;
  const out = convertFieldValue(from, def, before, convert);
  if (out.ok) {
    if (sameJson(out.value, before)) return NOTHING;
    const next =
      out.value === undefined ? without(values, def.key) : { ...values, [def.key]: out.value };
    return { values: next, change: { kind: "converted", before, after: out.value } };
  }
  if (input.onInvalid === "clear")
    return {
      values: without(values, def.key),
      change: { kind: "cleared", before, after: undefined, reason: out.reason },
    };
  return {
    values: undefined,
    change: { kind: "unconvertible", before, after: undefined, reason: out.reason },
  };
}

/** What an entry's `fields` become under `input.def`'s marker. */
export function rewriteFields(input: RewriteInput): RewriteResult {
  const { def } = input;
  const values = isRecord(input.values) ? input.values : {};
  switch (migrationKind(def)) {
    case "rename": {
      const from = def.migration?.fromKey as string;
      if (!Object.hasOwn(values, from)) return NOTHING;
      const before = values[from];
      const rest = without(values, from);
      const kept = Object.hasOwn(values, def.key);
      const next = kept ? rest : { ...rest, [def.key]: before };
      return { values: next, change: { kind: "moved", before, after: next[def.key] } };
    }
    case "remove":
      if (!Object.hasOwn(values, def.key)) return NOTHING;
      return {
        values: without(values, def.key),
        change: { kind: "removed", before: values[def.key], after: undefined },
      };
    case "localize":
      // true → false: a translation's own copy goes; the original's value is the one read.
      if (def.localized || !input.translation || !Object.hasOwn(values, def.key)) return NOTHING;
      return {
        values: without(values, def.key),
        change: { kind: "cleared", before: values[def.key], after: undefined },
      };
    case "retype":
      return retype(input, values);
    default:
      return NOTHING;
  }
}

/**
 * An entry's `fields` normalized through every marker of its collection (the store runs it on a
 * person's write during an operation, so concurrent edits converge). Unconvertible values stay.
 */
export function normalizeThroughMarkers(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
  context: { convert: ConvertContext; translation: boolean },
): Record<string, unknown> | undefined {
  let current = values;
  let changed = false;
  for (const def of defs) {
    if (!def.migration) continue;
    const r = rewriteFields({ def, values: current, ...context, pristine: false });
    if (r.values) {
      current = r.values;
      changed = true;
    }
  }
  return changed ? { ...current } : undefined;
}
