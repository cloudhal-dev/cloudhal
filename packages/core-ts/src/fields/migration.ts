/**
 * RFC-0041 §6: reading and rewriting values through a field operation's `migration` marker. While
 * an operation runs, the site carries the new definition with `migration: { id, fromKey |
 * fromType | fromLocalized }` (no `from*` at all: the field is being removed). One function says
 * what an entry's values become under the marker; the operation's dry run and rewrite, the store's
 * normalization of a person's write during the run, and `resolveFields` all use it, so every
 * reader agrees however many entries remain. Pure and Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { type Conversion, type ConvertContext, convertFieldValue } from "./conversions.ts";
import { rewriteItems } from "./migration-sub.ts";
import { type FieldRows, textReferenceOutcome } from "./text-reference.ts";
import { isRecord, renamedFrom, type SiteFields, sameJson } from "./types.ts";
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

/**
 * True while an operation removes the field: readers treat it as gone. A sub-field removal
 * (RFC-0045 `sub`) removes only that sub-value from items; the field stays.
 */
export const isBeingRemoved = (def: FieldDefinition): boolean =>
  migrationKind(def) === "remove" && def.migration?.sub === undefined;

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
  /**
   * RFC-0045 §7: a person's write only: the field's stored value, so a value the write changed
   * counts as written under the new type (`text-reference.ts`).
   */
  readonly baseline?: { readonly value: unknown } | undefined;
  /**
   * RFC-0045 §7: the node's `entry_refs` rows for the converting field path, which decide text ↔
   * reference values for the writers (`text-reference.ts`); absent for readers.
   */
  readonly rows?: FieldRows | undefined;
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
  // RFC-0045 §7: for text ↔ reference, "fits" says nothing; one rule decides (`text-reference.ts`).
  const written = input.baseline !== undefined && !sameJson(before, input.baseline.value);
  const decided = textReferenceOutcome({
    from,
    def,
    value: before,
    convert,
    rows: input.rows,
    written,
  });
  if (decided?.kind === "keep") return NOTHING;
  if (decided?.kind === "check") {
    // Kept, but written again (a list for a multiple reference) so the guard and rows run.
    const value = "multiple" in def && def.multiple && !Array.isArray(before) ? [before] : before;
    return {
      values: { ...values, [def.key]: value },
      change: { kind: "converted", before, after: value },
    };
  }
  const fits = decided === undefined && valueIssues(def, before, "v").length === 0;
  if (fits && (!pristine || from === def.type)) return NOTHING;
  const out: Conversion =
    decided?.kind === "fail"
      ? { ok: false, reason: decided.reason }
      : convertFieldValue(from, def, before, convert);
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

/** RFC-0045 §7 `sub`: the repeater's items rewritten, each through the sub-field's own rule. */
function rewriteSub(input: RewriteInput, values: Readonly<Record<string, unknown>>): RewriteResult {
  const { def } = input;
  if (def.type !== "repeater" || !Object.hasOwn(values, def.key)) return NOTHING;
  const before = values[def.key];
  const r = rewriteItems(def, before, {
    convert: input.convert,
    pristine: input.pristine,
    onInvalid: input.onInvalid,
    baseline: input.baseline,
    rows: input.rows,
    rewrite: rewriteFields,
  });
  if (r.unconvertible !== undefined)
    return {
      values: undefined,
      change: { kind: "unconvertible", before, after: undefined, reason: r.unconvertible },
    };
  if (r.next === "unchanged") return NOTHING;
  const next = r.next === undefined ? without(values, def.key) : { ...values, [def.key]: r.next };
  const kind = r.cleared !== undefined ? "cleared" : SUB_KIND[migrationKind(def) ?? "remove"];
  const reason = r.cleared === undefined ? {} : { reason: r.cleared };
  return { values: next, change: { kind, before, after: r.next, ...reason } };
}

const SUB_KIND = {
  rename: "moved",
  retype: "converted",
  localize: "converted",
  remove: "removed",
} as const satisfies Record<FieldMigrationKind, ValueChange["kind"]>;

/** What an entry's `fields` become under `input.def`'s marker. */
export function rewriteFields(input: RewriteInput): RewriteResult {
  const { def } = input;
  const values = isRecord(input.values) ? input.values : {};
  if (def.migration?.sub !== undefined) return rewriteSub(input, values);
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

/** The value `def` reads from stored `fields`: its key, else a running rename's old one. */
function storedValue(def: FieldDefinition, fields: Readonly<Record<string, unknown>>): unknown {
  if (Object.hasOwn(fields, def.key)) return fields[def.key];
  const from = renamedFrom(def);
  return from !== undefined && Object.hasOwn(fields, from) ? fields[from] : undefined;
}

/**
 * An entry's `fields` normalized through every marker of its collection (the store runs it on a
 * person's write during an operation, so concurrent edits converge). Unconvertible values stay.
 */
export function normalizeThroughMarkers(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
  context: {
    convert: ConvertContext;
    translation: boolean;
    /** The stored entry's `fields`, for a person's write (RFC-0045 §7: what the write changed). */
    stored?: Readonly<Record<string, unknown>> | undefined;
    /** RFC-0045 §7: the node's rows for a running text ↔ reference conversion's path. */
    rows?: FieldRows | undefined;
    /** Called for a definition whose value does not convert (kept as stored). */
    onUnconvertible?: ((def: FieldDefinition) => void) | undefined;
  },
): Record<string, unknown> | undefined {
  let current = values;
  let changed = false;
  const { stored, onUnconvertible, ...rest } = context;
  for (const def of defs) {
    if (!def.migration) continue;
    const baseline = stored === undefined ? undefined : { value: storedValue(def, stored) };
    const r = rewriteFields({ def, values: current, ...rest, pristine: false, baseline });
    if (r.change?.kind === "unconvertible") onUnconvertible?.(def);
    if (r.values) {
      current = r.values;
      changed = true;
    }
  }
  return changed ? { ...current } : undefined;
}
