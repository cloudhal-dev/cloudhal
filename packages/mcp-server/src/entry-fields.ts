/**
 * RFC-0041 §3, §8: typed custom field values over MCP. `create_entry` and `update_entry` check
 * them in `precheck` with the store's own checker (changed keys only, unknown keys, a translation's
 * copy of a non-localized value, `requiredToPublish` for review and published, image and `asset:`
 * references), so a call that the store would refuse never reaches a person. `update_entry` takes
 * `fields` as a merge patch (`null` removes a key), and its approval prompt names each typed change
 * readably: labels, option labels, dates in their zone, values quoted and truncated.
 */
import type { Asset, ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  ASSET_ID_PATTERN,
  checkFieldValues,
  checkRequiredToPublish,
  convertContext,
  type FieldIssue,
  fieldDefinitions,
  fieldLabel,
  normalizeThroughMarkers,
  optionLabel,
  refuseFieldIssues,
} from "@cloudhal/core-ts/fields";
import { markdownAssetIds } from "@cloudhal/core-ts/media";
import { type JsonSchema, quote, type ToolContext } from "./common.ts";

type Values = Record<string, unknown>;

/** `create_entry`'s `fields`: a static schema cannot vary by site, so it points to list_collections. */
export const FIELDS_INPUT: JsonSchema = {
  type: "object",
  description:
    "Typed custom fields of the collection: read its fieldsSchema from list_collections first (keys, types, allowed values, limits). A collection without field definitions takes any JSON here.",
};

/** `update_entry`'s `fields`: a merge patch. */
export const FIELDS_PATCH: JsonSchema = {
  type: "object",
  description:
    "Typed custom fields to change, as a merge patch: given keys are set, null removes a key, others stay. The collection's fieldsSchema (list_collections) lists the keys and allowed values.",
};

/** The stored `fields` with `patch` applied: `null` removes a key. */
export function mergeFields(current: Values | undefined, patch: Values): Values {
  const next: Values = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

const isTranslation = (e: Pick<ContentEntry, "id" | "translation">): boolean =>
  !!e.translation && e.translation.group !== e.id && e.translation.source?.siteId === undefined;

/** The same-site original of a translation (as the store reads it). */
async function originalOf(
  ctx: ToolContext,
  entry: Pick<ContentEntry, "id" | "siteId" | "translation">,
): Promise<ContentEntry | undefined> {
  if (!isTranslation(entry)) return undefined;
  const original = await ctx.store.getContentEntry(entry.translation?.group as string);
  return original?.siteId === entry.siteId ? original : undefined;
}

const ASSET_ID = new RegExp(ASSET_ID_PATTERN);

/** `fields.<key>` → asset ids an image or rich-text value refers to. */
function assetRefs(defs: readonly FieldDefinition[], values: Values | undefined): Set<string> {
  const out = new Set<string>();
  for (const def of defs) {
    const value = values?.[def.key];
    if (typeof value !== "string") continue;
    if (def.type === "image" && ASSET_ID.test(value)) out.add(`${def.key}\n${value}`);
    else if (def.type === "richText" && value.includes("asset:"))
      for (const id of markdownAssetIds(value)) out.add(`${def.key}\n${id}`);
  }
  return out;
}

function assetProblem(asset: Asset | undefined, def: FieldDefinition, siteId: string) {
  if (!asset || asset.siteId !== siteId) return "is not a file of this site";
  if (def.type === "image" && asset.kind !== "image")
    return `is a ${asset.kind} file, not an image`;
  if (asset.status === "retired") return "was retired and cannot be newly used";
  return undefined;
}

/** New references (not held by the stored entry under the same key) name usable files of the site. */
async function assetIssues(
  ctx: ToolContext,
  check: {
    siteId: string;
    defs: readonly FieldDefinition[];
    values: Values;
    stored?: Values | undefined;
  },
): Promise<FieldIssue[]> {
  const held = assetRefs(check.defs, check.stored);
  const byKey = new Map(check.defs.map((d) => [d.key, d]));
  const out: FieldIssue[] = [];
  for (const ref of assetRefs(check.defs, check.values)) {
    if (held.has(ref)) continue;
    const [key = "", assetId = ""] = ref.split("\n");
    const problem = assetProblem(
      await ctx.store.getAsset(assetId),
      byKey.get(key) as FieldDefinition,
      check.siteId,
    );
    if (problem)
      out.push({ path: `fields/${key}`, code: "invalid_value", message: `${assetId} ${problem}` });
  }
  return out;
}

/** What an entry write would store, for the check. */
export interface FieldsCheck {
  site: Site;
  /** The entry as it would be written (its `fields` after the patch). */
  next: Pick<ContentEntry, "id" | "siteId" | "collection" | "fields" | "status" | "translation">;
  /** The stored entry (absent for a new one). */
  stored?: Pick<ContentEntry, "collection" | "fields"> | undefined;
}

/**
 * The store's field checks, run before anyone is asked: throws `invalid_fields`, `unknown_field`,
 * `field_not_localized`, `required_field` or `too_large` with every issue at its path.
 */
export async function checkEntryFields(ctx: ToolContext, check: FieldsCheck): Promise<void> {
  const { site, stored } = check;
  let next = check.next;
  const defs = fieldDefinitions(site, next.collection);
  // While a field operation runs, a write goes through its marker (as the store normalizes it).
  if (defs.some((d) => d.migration)) {
    const fields = normalizeThroughMarkers(defs, next.fields, {
      convert: convertContext(site),
      translation: isTranslation(next),
    });
    if (fields) next = { ...next, fields };
  }
  const values = next.fields ?? {};
  const previous = stored?.collection === next.collection ? (stored.fields ?? {}) : undefined;
  if (defs.length === 0) {
    if (!previous || JSON.stringify(previous) !== JSON.stringify(values))
      refuseFieldIssues(checkFieldValues([], { values }));
    return;
  }
  const original = await originalOf(ctx, next);
  const issues = checkFieldValues(defs, {
    values,
    previous,
    original: original ? { id: original.id, values: original.fields ?? {} } : undefined,
    blocks: ctx.store.blocks,
  });
  const invalid = new Set(issues.map((i) => i.path.split("/").slice(0, 2).join("/")));
  const assets = await assetIssues(ctx, { siteId: site.id, defs, values, stored: previous });
  issues.push(...assets.filter((i) => !invalid.has(i.path)));
  issues.push(...checkRequiredToPublish(site, { ...next, fields: values }, original));
  refuseFieldIssues(issues);
}

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

/** A value as a person reads it in an approval prompt (agent text quoted and truncated). */
export function describeFieldValue(
  def: FieldDefinition | undefined,
  value: unknown,
  locale: string,
): string {
  if (!def) return `"${quote(JSON.stringify(value) ?? "")}"`;
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
      return list.map((v) => quote(optionLabel(def, String(v), locale, locale))).join(", ");
    }
    default:
      return `"${quote(typeof value === "string" ? value : JSON.stringify(value))}"`;
  }
}

/** "startsAt → 5 Nov 2026 19:30 Istanbul, format → Talk, Workshop, notes removed". */
export function describeFieldPatch(site: Site, collection: string, patch: Values): string {
  const defs = new Map(fieldDefinitions(site, collection).map((d) => [d.key, d]));
  const locale = site.defaultLocale;
  return Object.entries(patch)
    .map(([key, value]) => {
      const def = defs.get(key);
      const name = def ? `"${quote(fieldLabel(def, locale, locale), 40)}" (${key})` : key;
      return value === null
        ? `${name} removed`
        : `${name} → ${describeFieldValue(def, value, locale)}`;
    })
    .join(", ");
}
