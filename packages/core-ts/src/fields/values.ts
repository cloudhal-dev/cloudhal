/**
 * RFC-0041 §3: the value checker the store, the API and MCP's precheck share, and the
 * `requiredToPublish` check for review and publish.
 *
 * Only values that changed are checked: an old value that a later, narrower definition rejects
 * does not block unrelated edits (Contentful re-checks on re-publish, not retroactively).
 */
import type { FieldDefinition, PublishStatus } from "@cloudhal/core-contracts";
import { type BlockRegistry, createBlockRegistry } from "../blocks.ts";
import { type FieldsEntry, type FieldsOriginal, hasFieldValue, resolveFields } from "./resolve.ts";
import { FIELD_LIMITS, type FieldIssue, jsonBytes, type SiteFields, sameJson } from "./types.ts";
import { valueIssues } from "./value-checks.ts";

export interface CheckInput {
  /** The entry's `fields` as they would be stored after the write. */
  values: Readonly<Record<string, unknown>>;
  /** The stored `fields` before the write; absent for a new entry (every key counts as changed). */
  previous?: Readonly<Record<string, unknown>> | undefined;
  /**
   * When the entry is a translation (same site): its original's id and `fields`. A
   * non-localized value of its own is refused unless equal to the original's.
   */
  original?: { id: string; values: Readonly<Record<string, unknown>> } | undefined;
  /** Rich text directives and surfaces are checked against it (absent: the built-in blocks). */
  blocks?: BlockRegistry | undefined;
}

let builtIns: BlockRegistry | undefined;

/** Keys whose value differs from `previous` (all keys without it). */
function changedKeys(input: CheckInput): string[] {
  const { values, previous } = input;
  return Object.keys(values).filter(
    (k) => !(previous && Object.hasOwn(previous, k) && sameJson(previous[k], values[k])),
  );
}

/**
 * Problems with an entry's field values (empty when the write may go ahead).
 *
 * - The 256 KB cap on `JSON.stringify(values)` applies in every collection.
 * - With no definitions, `fields` stays "any JSON".
 * - With definitions, a changed key without one is refused (`unknown_field`); stored unknown keys
 *   that do not change are kept, and removing a key is always allowed.
 */
export function checkFieldValues(
  defs: readonly FieldDefinition[],
  input: CheckInput,
): FieldIssue[] {
  const out: FieldIssue[] = [];
  const bytes = jsonBytes(input.values);
  if (bytes > FIELD_LIMITS.valuesBytes)
    out.push({
      path: "fields",
      code: "too_large",
      message: `field values are ${Math.ceil(bytes / 1024)} KB; at most ${FIELD_LIMITS.valuesBytes / 1024} KB`,
    });
  if (defs.length === 0) return out;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  builtIns ??= createBlockRegistry();
  const blocks = input.blocks ?? builtIns;
  for (const key of changedKeys(input)) {
    const def = byKey.get(key);
    const path = `fields/${key}`;
    const value = input.values[key];
    if (!def) {
      out.push({
        path,
        code: "unknown_field",
        message: `${key} is not a field of this collection; its fields are ${[...byKey.keys()].join(", ")}`,
      });
      continue;
    }
    const { original } = input;
    if (original && !def.localized && !sameJson(value, original.values[key])) {
      out.push({
        path,
        code: "field_not_localized",
        message: `${key} is not localized: set it on ${original.id}`,
      });
      continue;
    }
    out.push(...valueIssues(def, value, path, { blocks }));
  }
  return out;
}

export type PublishCheckEntry = FieldsEntry & { status: PublishStatus };

const NEEDS_VALUES = new Set<PublishStatus>(["review", "published"]);

/**
 * RFC-0041 §3: an entry in review or published needs a resolved value for every
 * `requiredToPublish` field (a translation reads non-localized ones from its original). Drafts and
 * archived entries pass. A stored value that no longer fits its definition counts as missing.
 */
export function checkRequiredToPublish(
  site: SiteFields,
  entry: PublishCheckEntry,
  original?: FieldsOriginal,
): FieldIssue[] {
  if (!NEEDS_VALUES.has(entry.status)) return [];
  const out: FieldIssue[] = [];
  for (const [key, field] of Object.entries(resolveFields(site, entry, original))) {
    const def = field.def;
    if (def.type === "boolean" || def.requiredToPublish !== true) continue;
    if (!hasFieldValue(field.value))
      out.push({
        path: `fields/${key}`,
        code: "required_field",
        message: `${key} needs a value before the entry goes to review or is published`,
      });
  }
  return out;
}
