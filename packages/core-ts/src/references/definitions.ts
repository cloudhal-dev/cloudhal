/**
 * RFC-0045 §1: the gate that refuses `reference` and `repeater` definitions (`fields_unsupported`)
 * on every write path until rollout step 7, and the definition rules for both types that JSON
 * Schema cannot express. Pure and Worker-safe; `checkFieldDefinitions` runs both.
 */
import type { FieldDefinition, Site, SubFieldDefinition } from "@cloudhal/core-contracts";
import { BUILT_IN_COLLECTION } from "../collections.ts";
import { checkFieldQuery } from "../fields/query.ts";
import {
  FIELD_LIMITS,
  type FieldIssue,
  isReferenceFieldType,
  RESERVED_FIELD_KEYS,
  type SiteFields,
} from "../fields/types.ts";

type Collections = NonNullable<Site["collections"]>;

/**
 * The capability a writer asks before it accepts reference or repeater definitions, from a store
 * option, `CopySiteOptions`, the site Worker's `fields: 2` or the in-process `FIELDS_SUPPORTED`
 * (rollout steps 2 and 7). Unlike `GateSupport`, an absent capability refuses.
 */
export interface FieldTypeSupport {
  /** True when the renderer serving `siteId` reads reference and repeater fields. */
  supported(siteId: string): boolean | Promise<boolean>;
}

/** True only when a capability is given and says yes for the site. */
export async function referenceTypesSupported(
  siteId: string,
  support: FieldTypeSupport | undefined,
): Promise<boolean> {
  return support !== undefined && (await support.supported(siteId));
}

export interface ReferenceDefinitionOptions {
  /** The writer's `FieldTypeSupport` said yes for this site. Absent or false: both types are refused. */
  referenceTypes?: boolean | undefined;
  /** Collections inferred from entries (RFC-0040): valid reference targets though not declared. */
  inUse?: Iterable<string> | undefined;
}

const unsupported = (path: string, what: string): FieldIssue => ({
  path,
  code: "fields_unsupported",
  message: `${what}: reference and repeater fields are not enabled on this server yet (RFC-0045)`,
});

/**
 * The gate: one issue per definition of a stage-4 type, and per migration marker that names one
 * (`fromType`, `sub`), so no write path stores a definition a renderer of this version cannot read.
 */
export function unsupportedFieldTypeIssues(site: SiteFields): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const [key, settings] of Object.entries(site.collections ?? {}))
    (settings?.fields ?? []).forEach((def, i) => {
      const at = `collections/${key}/fields/${i}`;
      if (isReferenceFieldType(def.type))
        out.push(unsupported(`${at}/type`, `${def.key} is a ${def.type} field`));
      else if (
        (def.migration?.fromType && isReferenceFieldType(def.migration.fromType)) ||
        def.migration?.sub !== undefined
      )
        out.push(
          unsupported(
            `${at}/migration`,
            `${def.key} converts from a ${def.migration.fromType ?? "repeater"} field`,
          ),
        );
    });
  return out;
}

/** Sub-fields of a collection's repeaters. */
export function subFieldCount(fields: readonly FieldDefinition[] | undefined): number {
  let n = 0;
  for (const def of fields ?? []) if (def.type === "repeater") n += def.fields.length;
  return n;
}

const LABELLING = new Set<SubFieldDefinition["type"]>(["text", "select", "reference"]);

function knownCollections(collections: Collections, inUse: Iterable<string> | undefined) {
  return new Set([...Object.keys(collections), BUILT_IN_COLLECTION, ...(inUse ?? [])]);
}

function targetIssues(
  names: readonly string[],
  known: ReadonlySet<string>,
  at: string,
): FieldIssue[] {
  return names.flatMap((name, i) =>
    known.has(name)
      ? []
      : [
          {
            path: `${at}/collections/${i}`,
            code: "reference_target_unknown",
            message: `${name} is not a collection of this site`,
          },
        ],
  );
}

function whereIssues(
  def: Extract<FieldDefinition, { type: "reference" }>,
  collections: Collections,
  at: string,
): FieldIssue[] {
  const where = def.where;
  if (!where) return [];
  const issue = (path: string, message: string): FieldIssue => ({
    path,
    code: "invalid_query",
    message,
  });
  const [target, ...more] = def.collections;
  if (more.length > 0 || target === undefined)
    return [issue(`${at}/where`, "where needs exactly one target collection")];
  const settings = collections[target];
  const types = new Map((settings?.fields ?? []).map((d) => [d.key, d.type]));
  const out: FieldIssue[] = [];
  where.forEach((c, i) => {
    // `now` is the clock only on date and datetime fields; elsewhere it is a literal value.
    const type = types.get(c.field);
    const clock = type === "date" || type === "datetime";
    if (clock && (c.value === "now" || c.values?.includes("now")))
      out.push(
        issue(`${at}/where/${i}`, "where cannot use now: it is checked when a target is chosen"),
      );
  });
  for (const q of checkFieldQuery(settings?.fields ?? [], settings?.listFields, { where }))
    out.push(issue(`${at}/${q.path}`, q.message));
  return out;
}

function subFieldIssues(
  def: Extract<FieldDefinition, { type: "repeater" }>,
  known: ReadonlySet<string>,
  at: string,
): FieldIssue[] {
  const out: FieldIssue[] = [];
  const seen = new Set<string>();
  def.fields.forEach((sub, i) => {
    const here = `${at}/fields/${i}`;
    if (RESERVED_FIELD_KEYS.has(sub.key))
      out.push({
        path: `${here}/key`,
        code: "field_key_reserved",
        message: `${sub.key} is reserved`,
      });
    if (seen.has(sub.key))
      out.push({
        path: `${here}/key`,
        code: "field_key_duplicate",
        message: `${sub.key} is used by another sub-field of ${def.key}`,
      });
    seen.add(sub.key);
    if (
      sub.type === "number" &&
      sub.minimum !== undefined &&
      sub.maximum !== undefined &&
      sub.minimum > sub.maximum
    )
      out.push({
        path: `${here}/minimum`,
        code: "field_bounds",
        message: "minimum is above maximum",
      });
    if (sub.type === "select") {
      const values = new Set<string>();
      sub.options.forEach((o, j) => {
        if (values.has(o.value))
          out.push({
            path: `${here}/options/${j}/value`,
            code: "field_option_duplicate",
            message: `option ${o.value} is listed twice`,
          });
        values.add(o.value);
      });
    }
    if (sub.type === "reference") out.push(...targetIssues(sub.collections, known, here));
  });
  const label = def.itemLabel;
  if (label !== undefined && !def.fields.some((s) => s.key === label && LABELLING.has(s.type)))
    out.push({
      path: `${at}/itemLabel`,
      code: "unknown_field",
      message: `${label} is not a text, select or reference sub-field of ${def.key}`,
    });
  return out;
}

/** The rules of one reference or repeater definition (none for the other types). */
function definitionIssues(
  def: FieldDefinition,
  collections: Collections,
  known: ReadonlySet<string>,
  at: string,
): FieldIssue[] {
  if (def.type === "reference") {
    const out = targetIssues(def.collections, known, at);
    if (def.maxItems !== undefined && def.multiple !== true)
      out.push({
        path: `${at}/maxItems`,
        code: "field_bounds",
        message: "maxItems needs multiple",
      });
    return [...out, ...whereIssues(def, collections, at)];
  }
  if (def.type === "repeater") return subFieldIssues(def, known, at);
  return [];
}

/**
 * RFC-0045 §1's code rules: targets are collections of the site, `where` only with one target
 * collection and on its list fields without `now`, `maxItems` only with `multiple`, sub-field keys
 * unique and not reserved, `itemLabel` a text, select or reference sub-field, and at most 100
 * leaves (fields plus sub-fields) per collection. Without `referenceTypes`, the gate's issues only.
 */
export function referenceDefinitionIssues(
  site: SiteFields,
  options: ReferenceDefinitionOptions = {},
): FieldIssue[] {
  if (!options.referenceTypes) return unsupportedFieldTypeIssues(site);
  const collections: Collections = site.collections ?? {};
  const known = knownCollections(collections, options.inUse);
  const out: FieldIssue[] = [];
  for (const [key, settings] of Object.entries(collections)) {
    const fields = settings?.fields ?? [];
    const leaves = fields.length + subFieldCount(fields);
    if (leaves > FIELD_LIMITS.leavesPerCollection)
      out.push({
        path: `collections/${key}/fields`,
        code: "too_many_fields",
        message: `at most ${FIELD_LIMITS.leavesPerCollection} fields and sub-fields per collection (${leaves})`,
      });
    fields.forEach((def, i) => {
      out.push(...definitionIssues(def, collections, known, `collections/${key}/fields/${i}`));
    });
  }
  return out;
}
