/**
 * RFC-0045 §7 `sub`: a field operation on one sub-field of a repeater. The marker sits on the
 * repeater (`migration: { id, sub, fromKey | fromType }`; `sub` alone: the sub-field is being
 * removed), and every item goes through the same per-value rule a top-level field does: the
 * sub-field is read as a field (`subAsField`) carrying the marker without `sub`, and RFC-0041 §6's
 * `rewriteFields` runs on the item. An item left empty is dropped, and a list left empty is no
 * value. Pure and Worker-safe.
 */
import type { FieldDefinition, FieldMigration } from "@cloudhal/core-contracts";
import type { ConvertContext } from "./conversions.ts";
import { isRecord, type RepeaterFieldDefinition } from "./types.ts";

/** One item's rewrite: what `rewriteFields` answers for the sub-field read as a field. */
export interface ItemRewrite {
  readonly values: Record<string, unknown> | undefined;
  readonly change: { readonly kind: string; readonly reason?: string | undefined } | undefined;
}

export type RewriteItem = (input: {
  def: FieldDefinition;
  values: Readonly<Record<string, unknown>>;
  convert: ConvertContext;
  translation: boolean;
  pristine: boolean;
  onInvalid?: "clear" | undefined;
}) => ItemRewrite;

/** A sub-field as a field definition: the repeater's `localized`, and `migration` when given. */
export function subAsField(
  repeater: RepeaterFieldDefinition,
  key: string,
  migration?: FieldMigration,
): FieldDefinition | undefined {
  const sub = repeater.fields.find((s) => s.key === key);
  if (!sub) return undefined;
  return {
    ...sub,
    localized: repeater.localized,
    ...(migration ? { migration } : {}),
  } as unknown as FieldDefinition;
}

/** The sub-field marker as a top-level one (`sub` dropped), or undefined without `sub`. */
export function subMarker(def: FieldDefinition): FieldMigration | undefined {
  const m = def.migration;
  if (m?.sub === undefined) return undefined;
  const { sub: _sub, ...rest } = m;
  return rest;
}

export interface ItemsResult {
  /** The new list (`undefined`: no value), or `unchanged`. */
  readonly next: unknown[] | undefined | "unchanged";
  /** The first unconvertible item's reason (with `onInvalid` not `clear`). */
  readonly unconvertible?: string | undefined;
  /** Some sub-value was dropped by `onInvalid: "clear"`. */
  readonly cleared?: string | undefined;
}

/**
 * The repeater's items under its `sub` marker. `rewrite` is RFC-0041's `rewriteFields`, passed
 * in so this module and `migration.ts` do not import each other.
 */
export function rewriteItems(
  def: RepeaterFieldDefinition,
  value: unknown,
  input: {
    convert: ConvertContext;
    pristine: boolean;
    onInvalid?: "clear" | undefined;
    rewrite: RewriteItem;
  },
): ItemsResult {
  const m = def.migration;
  const marker = subMarker(def);
  if (m?.sub === undefined || !marker || !Array.isArray(value)) return { next: "unchanged" };
  // A removal's sub-field is still defined (phase C drops it); a rename's carries the new key.
  const sub = subAsField(def, m.sub, marker);
  if (!sub) return { next: "unchanged" };
  let changed = false;
  let cleared: string | undefined;
  const out: unknown[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      out.push(item);
      continue;
    }
    const r = input.rewrite({
      def: sub,
      values: item,
      convert: input.convert,
      translation: false,
      pristine: input.pristine,
      onInvalid: input.onInvalid,
    });
    if (r.change?.kind === "unconvertible")
      return { next: "unchanged", unconvertible: r.change.reason ?? "unconvertible" };
    if (r.change?.kind === "cleared") cleared ??= r.change.reason;
    if (!r.values) {
      out.push(item);
      continue;
    }
    changed = true;
    if (Object.keys(r.values).length > 0) out.push(r.values);
  }
  if (!changed) return { next: "unchanged" };
  return { next: out.length > 0 ? out : undefined, cleared };
}
