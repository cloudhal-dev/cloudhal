/**
 * RFC-0041 §1, §4 and §6: the definition rules JSON Schema cannot express, run after the site
 * passed its precompiled validator. Pure: rules that need stored values (dropping a key that still
 * has values, removing an option in use) are listed by `fieldDefinitionChanges` for the store to
 * count; this module never reads entries.
 */
import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  FIELD_LIMITS,
  type FieldIssue,
  jsonBytes,
  RESERVED_FIELD_KEYS,
  type SelectFieldDefinition,
  type SiteFields,
  sameJson,
} from "./types.ts";

type Collections = NonNullable<Site["collections"]>;

/** Per-type rules beyond the shared ones (dispatch table, one entry per type that has any). */
const TYPE_RULES: Partial<
  Record<FieldDefinition["type"], (def: FieldDefinition, at: string) => FieldIssue[]>
> = {
  number(def, at) {
    if (def.type !== "number") return [];
    const { minimum, maximum } = def;
    if (minimum !== undefined && maximum !== undefined && minimum > maximum)
      return [{ path: `${at}/minimum`, code: "field_bounds", message: "minimum is above maximum" }];
    return [];
  },
  select(def, at) {
    if (def.type !== "select") return [];
    const out: FieldIssue[] = [];
    if (def.options.length > FIELD_LIMITS.selectOptions)
      out.push({
        path: `${at}/options`,
        code: "too_many_fields",
        message: `at most ${FIELD_LIMITS.selectOptions} options`,
      });
    const seen = new Set<string>();
    def.options.forEach((o, i) => {
      if (seen.has(o.value))
        out.push({
          path: `${at}/options/${i}/value`,
          code: "field_option_duplicate",
          message: `option ${o.value} is listed twice`,
        });
      seen.add(o.value);
    });
    return out;
  },
};

function checkCollection(key: string, settings: CollectionSettings): FieldIssue[] {
  const fields = settings.fields ?? [];
  const base = `collections/${key}/fields`;
  const out: FieldIssue[] = [];
  if (fields.length > FIELD_LIMITS.fieldsPerCollection)
    out.push({
      path: base,
      code: "too_many_fields",
      message: `at most ${FIELD_LIMITS.fieldsPerCollection} fields per collection`,
    });
  const seen = new Set<string>();
  fields.forEach((def, i) => {
    const at = `${base}/${i}`;
    if (RESERVED_FIELD_KEYS.has(def.key))
      out.push({
        path: `${at}/key`,
        code: "field_key_reserved",
        message: `${def.key} is reserved (a built-in entry property or JavaScript name)`,
      });
    if (seen.has(def.key))
      out.push({
        path: `${at}/key`,
        code: "field_key_duplicate",
        message: `${def.key} is used by another field of ${key}`,
      });
    seen.add(def.key);
    out.push(...(TYPE_RULES[def.type]?.(def, at) ?? []));
  });
  return out;
}

/** One change between two definition lists that a plain edit may not make, or may make only when no value is affected. */
export type FieldDefinitionChange =
  /** Needs `rename_field`/`remove_field` when entries still hold values under the key. */
  | { collection: string; key: string; change: "removed" }
  /** Needs `change_field_type`. */
  | { collection: string; key: string; change: "type"; from: string; to: string }
  /** Needs `set_field_localized`. */
  | { collection: string; key: string; change: "localized"; from: boolean; to: boolean }
  /** Needs `change_field_type` (single ↔ multiple). */
  | { collection: string; key: string; change: "multiple"; from: boolean; to: boolean }
  /** Allowed only while no entry uses one of `options`. */
  | { collection: string; key: string; change: "optionsRemoved"; options: string[] }
  /** The operation marker; only field operations write it. */
  | { collection: string; key: string; change: "migration" };

/** Changes that need a value-free check: always refused by a plain edit. */
const ALWAYS_REFUSED = new Set<FieldDefinitionChange["change"]>([
  "type",
  "localized",
  "multiple",
  "migration",
]);

function compareField(
  collection: string,
  was: FieldDefinition,
  now: FieldDefinition,
): FieldDefinitionChange[] {
  const key = now.key;
  const out: FieldDefinitionChange[] = [];
  if (was.type !== now.type)
    out.push({ collection, key, change: "type", from: was.type, to: now.type });
  if (was.localized !== now.localized)
    out.push({ collection, key, change: "localized", from: was.localized, to: now.localized });
  if (!sameJson(was.migration, now.migration)) out.push({ collection, key, change: "migration" });
  if (was.type === "select" && now.type === "select") {
    const [a, b] = [was.multiple === true, now.multiple === true];
    if (a !== b) out.push({ collection, key, change: "multiple", from: a, to: b });
    const kept = new Set((now as SelectFieldDefinition).options.map((o) => o.value));
    const removed = was.options.map((o) => o.value).filter((v) => !kept.has(v));
    if (removed.length) out.push({ collection, key, change: "optionsRemoved", options: removed });
  }
  return out;
}

/**
 * Everything between `before` and `after` that a plain edit could lose or reinterpret values with
 * (§6). A diff is never read as a rename: a key that disappears is `removed`, and the new key is
 * simply added.
 */
export function fieldDefinitionChanges(
  before: SiteFields,
  after: SiteFields,
): FieldDefinitionChange[] {
  const out: FieldDefinitionChange[] = [];
  const was: Collections = before.collections ?? {};
  const now: Collections = after.collections ?? {};
  for (const [collection, settings] of Object.entries(was)) {
    const next = new Map((now[collection]?.fields ?? []).map((d) => [d.key, d]));
    for (const def of settings?.fields ?? []) {
      const match = next.get(def.key);
      if (match) out.push(...compareField(collection, def, match));
      else out.push({ collection, key: def.key, change: "removed" });
    }
  }
  // A marker on a field that did not exist before is an operation's too.
  for (const [collection, settings] of Object.entries(now)) {
    const old = new Set((was[collection]?.fields ?? []).map((d) => d.key));
    for (const def of settings?.fields ?? [])
      if (!old.has(def.key) && def.migration)
        out.push({ collection, key: def.key, change: "migration" });
  }
  return out;
}

const OPERATION: Record<string, string> = {
  type: "change_field_type",
  multiple: "change_field_type",
  localized: "set_field_localized",
  migration: "a field operation",
};

/**
 * Problems with a site's field definitions (§1 code rules, §4 caps). With `before`, also the §6
 * guard for changes no plain edit may make (type, localization, `multiple`, the migration marker);
 * removals and removed options are listed by `fieldDefinitionChanges`, since refusing them depends
 * on stored values.
 */
export function checkFieldDefinitions(site: SiteFields, before?: SiteFields): FieldIssue[] {
  const collections: Collections = site.collections ?? {};
  const out: FieldIssue[] = [];
  let total = 0;
  for (const [key, settings] of Object.entries(collections)) {
    if (!settings) continue;
    total += settings.fields?.length ?? 0;
    out.push(...checkCollection(key, settings));
  }
  if (total > FIELD_LIMITS.fieldsPerSite)
    out.push({
      path: "collections",
      code: "too_many_fields",
      message: `at most ${FIELD_LIMITS.fieldsPerSite} fields per site (${total})`,
    });
  if (site.collections && jsonBytes(site.collections) > FIELD_LIMITS.collectionsBytes)
    out.push({
      path: "collections",
      code: "too_large",
      message: `collection settings are over ${FIELD_LIMITS.collectionsBytes / 1024} KB`,
    });
  if (before)
    for (const c of fieldDefinitionChanges(before, site))
      if (ALWAYS_REFUSED.has(c.change))
        out.push({
          path: `collections/${c.collection}/fields/${c.key}`,
          code: "field_change_needs_operation",
          message: `changing ${c.change === "migration" ? "the migration marker" : c.change} of ${c.key} needs ${OPERATION[c.change]}`,
        });
  return out;
}
