/**
 * RFC-0042 §7 (Studio): the collection settings' stage 3 model — the settings with one of
 * `listFields`, `expiry` or `structuredData` replaced, the fields each may use, the preset table as
 * rows with only the sources that fit each path, and the listing page "Create listing page" makes.
 * Lazy with the collection screens (`LAZY_ONLY`).
 */
import type {
  CollectionSettings,
  ContentListSection,
  EntryValueProperty,
  FieldDefinition,
  FieldOrder,
  Site,
  SiteValueProperty,
  StructuredDataPreset,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import { canOrderBy, isBeingRemoved } from "@cloudhal/core-ts/fields";
import {
  KIND_SOURCES,
  type PathSpec,
  PRESETS,
  type PresetType,
  VOCABULARIES,
} from "@cloudhal/core-ts/structured-data";
import { ApiRequestError } from "./api.ts";

type StageKey = "listFields" | "expiry" | "structuredData";

/** `settings` with one stage 3 setting replaced; `undefined` (or an empty list) removes it. */
export function withSetting<K extends StageKey>(
  settings: CollectionSettings,
  key: K,
  value: CollectionSettings[K] | undefined,
): CollectionSettings {
  const { [key]: _old, ...rest } = settings;
  const empty = value === undefined || (Array.isArray(value) && (value as unknown[]).length === 0);
  return empty ? rest : { ...rest, [key]: value };
}

/** The collection's fields that are not being removed by an operation. */
export const liveFields = (settings: CollectionSettings): FieldDefinition[] =>
  (settings.fields ?? []).filter((d) => !isBeingRemoved(d));

/** Fields an expiry can read: dates and dates with times. */
export const dateFields = (defs: readonly FieldDefinition[]) =>
  defs.filter((d) => d.type === "date" || d.type === "datetime");

/** The list fields' definitions, in column order (unknown keys left out). */
export function listFieldDefs(settings: CollectionSettings | undefined): FieldDefinition[] {
  const defs = new Map(liveFields(settings ?? {}).map((d) => [d.key, d]));
  return (settings?.listFields ?? []).flatMap((k) => defs.get(k) ?? []);
}

/** The `kind` argument of the condition words: dates read "before / after", the rest "less / more". */
export const timeKind = (def: Pick<FieldDefinition, "type"> | undefined): "time" | "number" =>
  def?.type === "date" || def?.type === "datetime" ? "time" : "number";

/** Pages a 409 `list_field_in_use` names (`details.pages`). */
export function pagesInUse(error: unknown): { id: string; path: string }[] {
  if (!(error instanceof ApiRequestError) || error.body.error !== "list_field_in_use") return [];
  const pages = (error.body.details as { pages?: unknown } | undefined)?.pages;
  return Array.isArray(pages)
    ? pages.filter((p): p is { id: string; path: string } => typeof p?.id === "string")
    : [];
}

/** The `details.issues` of a failed request (`path`, `code`, `message`). */
export function issuesOf(error: unknown): { path: string; code: string; message: string }[] {
  if (!(error instanceof ApiRequestError)) return [];
  const issues = (error.body.details as { issues?: unknown } | undefined)?.issues;
  return Array.isArray(issues)
    ? issues.filter((i): i is { path: string; code: string; message: string } => {
        return typeof i?.path === "string" && typeof i?.code === "string";
      })
    : [];
}

// ---- Structured data ----

/** One way to fill a path, as a `Select` value: `default`, `none`, `field:k`, `entry:p`, `site:p`, `constant`. */
export type SourceChoice = string;

export interface SourceOption {
  value: SourceChoice;
  kind: "default" | "none" | "field" | "entry" | "site" | "constant";
  /** Field key or entry/site property. */
  key?: string;
}

/** The preset's rows: required paths first, then "one of" groups, then the rest (table order). */
export function presetRows(type: PresetType): { path: string; spec: PathSpec }[] {
  const rows = Object.entries(PRESETS[type].paths).map(([path, spec]) => ({ path, spec }));
  const rank = (s: PathSpec) => (s.required ? 0 : s.group ? 1 : 2);
  return rows.sort((a, b) => rank(a.spec) - rank(b.spec));
}

/** Whether a field fits a path (the save-time check's rules, so Studio offers only these). */
export function fieldFits(spec: PathSpec, def: FieldDefinition): boolean {
  const fits = [...KIND_SOURCES[spec.kind].fields, ...(spec.alsoFields ?? [])];
  if (!fits.includes(def.type)) return false;
  if ((spec.kind === "lines" || spec.kind === "steps") && def.type === "text")
    return def.multiline === true;
  if (def.type === "select" && def.multiple && !spec.many) return false;
  return true;
}

/** Whether a fixed value may fill a path (never a required one: those come from each entry). */
export const constantFits = (spec: PathSpec) =>
  KIND_SOURCES[spec.kind].constant && spec.required !== true;

/** Every source that fits `spec`: its default (or "not used"), fitting fields, entry and site properties, a constant. */
export function sourceOptions(spec: PathSpec, defs: readonly FieldDefinition[]): SourceOption[] {
  const sources = KIND_SOURCES[spec.kind];
  return [
    spec.default ? { value: "default", kind: "default" } : { value: "none", kind: "none" },
    ...defs
      .filter((d) => fieldFits(spec, d))
      .map((d) => ({ value: `field:${d.key}`, kind: "field" as const, key: d.key })),
    ...sources.entry.map((p) => ({ value: `entry:${p}`, kind: "entry" as const, key: p })),
    ...sources.site.map((p) => ({ value: `site:${p}`, kind: "site" as const, key: p })),
    ...(constantFits(spec) ? [{ value: "constant", kind: "constant" as const }] : []),
  ] as SourceOption[];
}

/** The `Select` value of a mapped source (or of an unmapped path). */
export function choiceOf(source: StructuredDataSource | undefined, spec: PathSpec): SourceChoice {
  if (!source) return spec.default ? "default" : "none";
  switch (source.kind) {
    case "field":
      return `field:${source.field}`;
    case "entry":
    case "site":
      return `${source.kind}:${source.property}`;
    case "constant":
      return "constant";
  }
}

/** The source a choice stands for; `undefined` leaves the path unmapped (its default applies). */
export function sourceOf(choice: SourceChoice, constant: string): StructuredDataSource | undefined {
  const [kind, key = ""] = choice.split(":");
  if (kind === "field") return { kind: "field", field: key };
  if (kind === "entry") return { kind: "entry", property: key as EntryValueProperty };
  if (kind === "site") return { kind: "site", property: key as SiteValueProperty };
  if (kind === "constant" && constant.trim()) return { kind: "constant", value: constant.trim() };
  return undefined;
}

/** A path's choice and its constant, as the card edits them. */
export type MappingDraft = Record<string, { choice: SourceChoice; constant: string }>;

export function mappingDraft(preset: StructuredDataPreset | undefined): MappingDraft {
  if (!preset) return {};
  const table = PRESETS[preset.type].paths;
  return Object.fromEntries(
    Object.entries(preset.properties).flatMap(([path, source]) => {
      const spec = table[path];
      if (!spec || !source) return [];
      const constant = source.kind === "constant" ? source.value : "";
      return [[path, { choice: choiceOf(source, spec), constant }]];
    }),
  );
}

/** The preset the draft describes; `undefined` when nothing is mapped and no type is chosen. */
export function presetOf(
  type: PresetType | undefined,
  draft: MappingDraft,
): StructuredDataPreset | undefined {
  if (!type) return undefined;
  const table = PRESETS[type].paths;
  const properties: Record<string, StructuredDataSource> = {};
  for (const [path, { choice, constant }] of Object.entries(draft)) {
    if (!table[path]) continue;
    const source = sourceOf(choice, constant);
    if (source) properties[path] = source;
  }
  return { type, properties } as StructuredDataPreset;
}

/** The vocabulary's option keys of an enum path (a constant is chosen from these). */
export const vocabularyKeys = (spec: PathSpec): string[] =>
  spec.vocabulary ? VOCABULARIES[spec.vocabulary].map((e) => e.key) : [];

/** The fields mapped to required paths that are not yet "Needed to publish" (open question 6). */
export function suggestRequired(
  preset: StructuredDataPreset | undefined,
  defs: readonly FieldDefinition[],
): string[] {
  if (!preset) return [];
  const table = PRESETS[preset.type].paths;
  const keys = Object.entries(preset.properties)
    .filter(([path, s]) => table[path]?.required && s?.kind === "field")
    .map(([, s]) => (s as { field: string }).field);
  return defs
    .filter((d) => keys.includes(d.key) && !("requiredToPublish" in d && d.requiredToPublish))
    .map((d) => d.key);
}

// ---- Listing page ----

/**
 * RFC-0042 §5: the `contentList` section of a new listing page. With a date list field and an
 * expiry, it lists what is still to come, soonest first (the expiry's field when it is listed).
 */
export function listingSection(
  id: string,
  collection: string,
  settings: CollectionSettings,
): ContentListSection {
  const section: ContentListSection = {
    id,
    kind: "contentList",
    collection,
    limit: 10,
    sort: settings.sort ?? "newest",
  };
  if (!settings.expiry) return section;
  const dates = dateFields(listFieldDefs(settings));
  const def = dates.find((d) => d.key === settings.expiry?.field) ?? dates[0];
  if (!def) return section;
  const orderBy: FieldOrder = { field: def.key, direction: "asc" };
  return { ...section, where: [{ field: def.key, op: "gte", value: "now" }], orderBy };
}

/** The title of a listing page: the plural label in the site's language, else the key. */
export const listingTitle = (site: Site, collection: string) =>
  site.collections?.[collection]?.labels?.[site.defaultLocale]?.plural ?? collection;

/** Whether a list may be ordered by this field. */
export const sortable = (def: FieldDefinition) => canOrderBy(def.type);
