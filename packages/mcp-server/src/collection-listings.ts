/**
 * RFC-0042 §7 for the collection tools: `update_collection` takes a collection's `listFields`,
 * `expiry` and `structuredData` (null removes one), the store's dry run checks them in precheck
 * (`unknown_field`, `invalid_expiry`, `structured_data_invalid`, `list_field_in_use`,
 * `gates_unsupported`), and the approval prompt says in words what changes, e.g. "Events leave
 * listings, feeds and search 1 hour after "Ends at" (endsAt); 2 published entries are already past
 * it". `list_collections` shows each list field's operators and the preset's paths.
 */
import type {
  CollectionExpiry,
  CollectionSettings,
  FieldDefinition,
  Site,
  StructuredDataPreset,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import { SiteSchema } from "@cloudhal/core-contracts";
import {
  canOrderBy,
  derivedGate,
  FIELD_QUERY_OPS,
  type FieldQueryOp,
  fieldLabel,
  originalsOf,
} from "@cloudhal/core-ts/fields";
import {
  checkStructuredData,
  KIND_SOURCES,
  PRESET_TYPES,
  PRESETS,
  type PresetType,
  type StructuredDataIssue,
  VOCABULARIES,
} from "@cloudhal/core-ts/structured-data";
import { canonical } from "./collection-fields.ts";
import { type JsonSchema, quote, type ToolContext } from "./common.ts";

const DEFS = SiteSchema.$defs as Record<string, JsonSchema>;
const SETTINGS_PROPS = (DEFS.CollectionSettings as { properties: Record<string, JsonSchema> })
  .properties;
const nullable = (ref: string, description: string, $defs: Record<string, unknown>) => ({
  anyOf: [{ $ref: `#/$defs/${ref}` }, { type: "null" }],
  description,
  $defs,
});

/** One line per preset type: its paths, required ones marked with `*`. */
function presetSummary(): string {
  return PRESET_TYPES.map((type) => {
    const paths = Object.entries(PRESETS[type].paths).map(
      ([path, spec]) => `${path}${spec.required ? "*" : ""}`,
    );
    return `${type}: ${paths.join(", ")}`;
  }).join(". ");
}

/** `update_collection`'s stage 3 settings (RFC-0042), each removable with null. */
export const LISTINGS_INPUT: Record<string, JsonSchema> = {
  listFields: {
    anyOf: [SETTINGS_PROPS.listFields, { type: "null" }],
    description:
      "Up to 4 field keys that listings (contentList where/orderBy, list_entries) may filter and sort by, in column order; null removes them. A field contentList sections still use cannot be dropped (list_field_in_use)",
    $defs: { FieldKey: DEFS.FieldKey },
  },
  expiry: nullable(
    "CollectionExpiry",
    'A time gate every entry derives from a date or datetime field: {"field":"endsAt","action":"unlist"} (the page stays, the entry leaves listings, feeds, the sitemap and search) or "hide" (404 everywhere), afterMinutes of grace. Needs a site Worker that enforces derived gates (gates_unsupported otherwise). null removes it: expired entries come back at the next publish',
    { CollectionExpiry: DEFS.CollectionExpiry, FieldKey: DEFS.FieldKey },
  ),
  structuredData: nullable(
    "StructuredDataPreset",
    `A JSON-LD preset the entry pages emit instead of BlogPosting: a type and its properties, each mapped to a source ({"kind":"field","field":"startsAt"}, {"kind":"entry","property":"title"}, {"kind":"site","property":"name"} or {"kind":"constant","value":"EUR"}). Unmapped paths with a default read it; required values (*) come from the entry, never a constant. Paths: ${presetSummary()}. Check an entry's output with preview_structured_data. null removes it`,
    {
      StructuredDataPreset: DEFS.StructuredDataPreset,
      StructuredDataSource: DEFS.StructuredDataSource,
      EntryValueProperty: DEFS.EntryValueProperty,
      SiteValueProperty: DEFS.SiteValueProperty,
      FieldKey: DEFS.FieldKey,
    },
  ),
};

const KEYS = ["listFields", "expiry", "structuredData"] as const;

/** `next` with the agent's stage 3 settings applied: a value sets it, null removes it. */
export function withListings(
  next: CollectionSettings,
  a: Record<string, unknown>,
): CollectionSettings {
  const out: Record<string, unknown> = { ...next };
  for (const k of KEYS) {
    if (a[k] === undefined) continue;
    if (a[k] === null) delete out[k];
    else out[k] = a[k];
  }
  return out as CollectionSettings;
}

/** "30 minutes", "1 hour", "2 days". */
function duration(minutes: number): string {
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (minutes % 1440 === 0) return unit(minutes / 1440, "day");
  if (minutes % 60 === 0) return unit(minutes / 60, "hour");
  return unit(minutes, "minute");
}

/** Published entries of the collection whose derived gate under `site` has already passed. */
async function pastCount(ctx: ToolContext, site: Site, key: string): Promise<number> {
  const entries = await ctx.store.listContentEntries(site.id, {
    collection: key,
    status: ["published"],
  });
  const original = originalsOf(entries);
  const now = (ctx.now?.() ?? new Date()).getTime();
  return entries.filter((e) => {
    const gate = derivedGate(site, e, original(e));
    return gate !== undefined && gate.at <= now;
  }).length;
}

function fieldName(defs: readonly FieldDefinition[] | undefined, key: string, locale: string) {
  const def = defs?.find((d) => d.key === key);
  return def ? `"${quote(fieldLabel(def, locale, locale), 40)}" (${key})` : key;
}

async function expiryLine(
  ctx: ToolContext,
  site: Site,
  key: string,
  rule: CollectionExpiry,
): Promise<string> {
  const settings = site.collections?.[key];
  const plural = settings?.labels?.[site.defaultLocale]?.plural;
  const who = plural ? quote(plural, 40) : `Entries of ${key}`;
  const when = rule.afterMinutes ? `${duration(rule.afterMinutes)} after` : "at";
  const field = fieldName(settings?.fields, rule.field, site.defaultLocale);
  const what =
    rule.action === "hide"
      ? `disappear from the site (404 on every route)`
      : "leave listings, feeds, the sitemap and search (their pages stay)";
  const past = await pastCount(ctx, site, key);
  const already =
    past === 0
      ? ""
      : `; ${past} published ${past === 1 ? "entry is" : "entries are"} already past it`;
  return `  expiry: ${who} ${what} ${when} ${field}${already}`;
}

function sourceText(source: StructuredDataSource): string {
  switch (source.kind) {
    case "field":
      return `field ${source.field}`;
    case "entry":
      return `entry ${source.property}`;
    case "site":
      return `site ${source.property}`;
    case "constant":
      return `"${quote(source.value, 30)}"`;
    default:
      return "?";
  }
}

function presetLine(preset: StructuredDataPreset): string {
  const maps = Object.entries(preset.properties)
    .filter((e): e is [string, StructuredDataSource] => e[1] !== undefined)
    .map(([path, source]) => `${path} ← ${sourceText(source)}`);
  const shown = maps.slice(0, 8).join(", ");
  const more = maps.length > 8 ? ` and ${maps.length - 8} more` : "";
  return `  structured data: ${preset.type}, maps ${shown}${more}; entries without a required value keep BlogPosting`;
}

/** The warnings (not refusals) of the collection's preset: select options outside a vocabulary. */
export function presetWarnings(site: Site, key: string): StructuredDataIssue[] {
  const only = site.collections?.[key];
  if (!only?.structuredData) return [];
  return checkStructuredData({ ...site, collections: { [key]: only } }).filter((i) => i.warning);
}

/** Approval lines for the stage 3 settings that change between `before` and `next`. */
export async function describeListings(
  ctx: ToolContext,
  next: Site,
  key: string,
  before: CollectionSettings | undefined,
): Promise<string[]> {
  const after = next.collections?.[key] ?? {};
  const changed = (k: (typeof KEYS)[number]) => canonical(before?.[k]) !== canonical(after[k]);
  const lines: string[] = [];
  if (changed("listFields"))
    lines.push(
      after.listFields
        ? `  list fields: ${after.listFields.map((f) => fieldName(after.fields, f, next.defaultLocale)).join(", ")}`
        : "  list fields: removed",
    );
  if (changed("expiry"))
    lines.push(
      after.expiry
        ? await expiryLine(ctx, next, key, after.expiry)
        : "  expiry: removed; entries past it come back at the next publish",
    );
  if (changed("structuredData")) {
    lines.push(
      after.structuredData
        ? presetLine(after.structuredData)
        : "  structured data: removed; entry pages go back to BlogPosting",
    );
    for (const w of presetWarnings(next, key).slice(0, 3))
      lines.push(`  structured data warning: ${w.message}`);
  }
  return lines;
}

interface ListFieldView {
  key: string;
  type: FieldDefinition["type"];
  ops: readonly FieldQueryOp[];
  sortable: boolean;
}

interface PathView {
  path: string;
  required?: true;
  /** "At least one of" this group is required. */
  group?: string;
  default?: StructuredDataSource;
  fields: readonly string[];
  entry: readonly string[];
  site: readonly string[];
  constant: boolean;
  vocabulary?: string[];
}

function pathsOf(type: PresetType): PathView[] {
  return Object.entries(PRESETS[type].paths).map(([path, spec]) => {
    const sources = KIND_SOURCES[spec.kind];
    return {
      path,
      ...(spec.required ? { required: true as const } : {}),
      ...(spec.group ? { group: spec.group } : {}),
      ...(spec.default ? { default: spec.default } : {}),
      fields: [...sources.fields, ...(spec.alsoFields ?? [])],
      entry: sources.entry,
      site: sources.site,
      constant: sources.constant && !spec.required,
      ...(spec.vocabulary ? { vocabulary: VOCABULARIES[spec.vocabulary].map((v) => v.key) } : {}),
    };
  });
}

/** What `list_collections` adds per collection for listings and structured data. */
export function listingsView(
  site: Site,
  key: string,
): {
  listFields?: ListFieldView[];
  structuredData?: { type: PresetType; paths: PathView[]; warnings: StructuredDataIssue[] };
} {
  const settings = site.collections?.[key];
  const defs = new Map((settings?.fields ?? []).map((d) => [d.key, d]));
  const listFields = (settings?.listFields ?? []).flatMap((k) => {
    const def = defs.get(k);
    return def
      ? [{ key: k, type: def.type, ops: FIELD_QUERY_OPS[def.type], sortable: canOrderBy(def.type) }]
      : [];
  });
  const preset = settings?.structuredData;
  return {
    ...(listFields.length ? { listFields } : {}),
    ...(preset && PRESETS[preset.type]
      ? {
          structuredData: {
            type: preset.type,
            paths: pathsOf(preset.type),
            warnings: presetWarnings(site, key),
          },
        }
      : {}),
  };
}
