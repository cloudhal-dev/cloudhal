/**
 * RFC-0042 §2 "Checks when the preset is saved": `checkStructuredData(site)` for `updateSite`, the
 * API and MCP's precheck (refused as `structured_data_invalid` with these issues). Errors refuse
 * the save; warnings (select options outside a vocabulary) are reported and allowed.
 */
import type {
  FieldDefinition,
  StructuredDataPreset,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import { isBeingRemoved } from "../fields/migration.ts";
import type { SiteFields } from "../fields/types.ts";
import {
  KIND_SOURCES,
  type PathSpec,
  PRESETS,
  REMOTE_JOB_PATHS,
  requiredPaths,
  vocabularyEntry,
} from "./table.ts";

export type StructuredDataIssueCode =
  /** A path the type's table does not offer. */
  | "unknown_path"
  /** A field source names no field of this collection. */
  | "unknown_field"
  /** A source that does not fit the path (field type, entry or site property, constant). */
  | "source_mismatch"
  /** A constant or select option outside the path's vocabulary. */
  | "vocabulary"
  /** A currency constant that is not an ISO 4217 code. */
  | "currency"
  /** A required path is neither mapped nor defaulted. */
  | "required_missing"
  /** A required path mapped to a constant: required values come from the entry. */
  | "constant_required"
  /** Per entry: a required value is missing, so no preset document is emitted. */
  | "required_value_missing"
  /** Per entry: the document is over 32 KB even without its optional properties. */
  | "too_large";

/** One problem, at a slash path (`collections/events/structuredData/properties/startDate`). */
export interface StructuredDataIssue {
  path: string;
  code: StructuredDataIssueCode;
  message: string;
  /** Reported, not refused. */
  warning?: true;
}

const CURRENCY = /^[A-Z]{3}$/;

interface PathContext {
  readonly at: string;
  readonly path: string;
  readonly spec: PathSpec;
  readonly defs: ReadonlyMap<string, FieldDefinition>;
}

const err = (
  path: string,
  code: StructuredDataIssueCode,
  message: string,
): StructuredDataIssue => ({
  path,
  code,
  message,
});

function checkField(ctx: PathContext, key: string): StructuredDataIssue[] {
  const { at, path, spec } = ctx;
  const def = ctx.defs.get(key);
  if (!def)
    return [err(`${at}/field`, "unknown_field", `"${key}" is not a field of this collection`)];
  const fits = [...KIND_SOURCES[spec.kind].fields, ...(spec.alsoFields ?? [])];
  if (!fits.includes(def.type))
    return [
      err(
        `${at}/field`,
        "source_mismatch",
        `${path} takes ${fits.join(" or ")} fields, not ${def.type}`,
      ),
    ];
  const multiline = def.type === "text" && def.multiline === true;
  if ((spec.kind === "lines" || spec.kind === "steps") && def.type === "text" && !multiline)
    return [err(`${at}/field`, "source_mismatch", `${path} takes a multiline text field`)];
  if (def.type !== "select") return [];
  if (def.multiple && !spec.many)
    return [err(`${at}/field`, "source_mismatch", `${path} takes a single select`)];
  const vocabulary = spec.vocabulary;
  if (!vocabulary) return [];
  return def.options
    .filter((o) => !vocabularyEntry(vocabulary, o.value))
    .map((o) => ({
      ...err(`${at}/field`, "vocabulary", `option "${o.value}" emits nothing for ${path}`),
      warning: true as const,
    }));
}

function checkConstant(ctx: PathContext, value: string): StructuredDataIssue[] {
  const { at, path, spec } = ctx;
  const sources = KIND_SOURCES[spec.kind];
  if (!sources.constant)
    return [err(`${at}/value`, "source_mismatch", `${path} does not take a constant`)];
  if (spec.required)
    return [
      err(
        `${at}/value`,
        "constant_required",
        `${path} is required: its value comes from the entry`,
      ),
    ];
  if (spec.kind === "currency" && !CURRENCY.test(value))
    return [err(`${at}/value`, "currency", `${path} takes an ISO 4217 code such as EUR`)];
  if (spec.vocabulary && !vocabularyEntry(spec.vocabulary, value))
    return [err(`${at}/value`, "vocabulary", `"${value}" is not a value of ${path}`)];
  return [];
}

function checkSource(ctx: PathContext, source: StructuredDataSource): StructuredDataIssue[] {
  const { at, path, spec } = ctx;
  const sources = KIND_SOURCES[spec.kind];
  switch (source.kind) {
    case "field":
      return checkField(ctx, source.field);
    case "entry":
      return sources.entry.includes(source.property)
        ? []
        : [
            err(
              `${at}/property`,
              "source_mismatch",
              `${path} does not take the entry's ${source.property}`,
            ),
          ];
    case "site":
      return sources.site.includes(source.property)
        ? []
        : [
            err(
              `${at}/property`,
              "source_mismatch",
              `${path} does not take the site's ${source.property}`,
            ),
          ];
    case "text":
      return checkConstant(ctx, source.value);
    default:
      return [err(at, "source_mismatch", "an unknown source")];
  }
}

/** True when the path is mapped or has a default source. */
const provided = (preset: StructuredDataPreset, path: string, spec: PathSpec | undefined) =>
  preset.properties[path] !== undefined || spec?.default !== undefined;

function checkRequired(preset: StructuredDataPreset, at: string): StructuredDataIssue[] {
  const table = PRESETS[preset.type];
  const { paths, groups } = requiredPaths(preset.type);
  const out: StructuredDataIssue[] = [];
  for (const path of paths)
    if (!provided(preset, path, table.paths[path]))
      out.push(err(`${at}/${path}`, "required_missing", `${preset.type} needs ${path}`));
  const remote =
    preset.type === "JobPosting" &&
    REMOTE_JOB_PATHS.every((p) => preset.properties[p] !== undefined);
  for (const group of groups) {
    if (remote) continue;
    const fromEntry = group.some((p) => {
      const s = preset.properties[p];
      return s !== undefined && s.kind !== "text";
    });
    if (!fromEntry) {
      const prefix = group[0]?.replace(/\.[^.]+$/, "") ?? "";
      out.push(
        err(
          `${at}/${prefix}`,
          "required_missing",
          `${preset.type} needs one of ${group.join(", ")} from a field`,
        ),
      );
    }
  }
  return out;
}

/** Every issue of one collection's preset (`at` is the preset's slash path). */
export function checkPreset(
  preset: StructuredDataPreset,
  defs: readonly FieldDefinition[],
  at: string,
): StructuredDataIssue[] {
  const table = PRESETS[preset.type];
  if (!table) return [err(`${at}/type`, "unknown_path", `"${String(preset.type)}" is not offered`)];
  const byKey = new Map(defs.filter((d) => !isBeingRemoved(d)).map((d) => [d.key, d]));
  const out: StructuredDataIssue[] = [];
  for (const [path, source] of Object.entries(preset.properties)) {
    if (source === undefined) continue;
    const propAt = `${at}/properties/${path}`;
    const spec = Object.hasOwn(table.paths, path) ? table.paths[path] : undefined;
    if (!spec) {
      out.push(err(propAt, "unknown_path", `${preset.type} has no property ${path}`));
      continue;
    }
    out.push(...checkSource({ at: propAt, path, spec, defs: byKey }, source));
  }
  out.push(...checkRequired(preset, `${at}/properties`));
  return out;
}

/**
 * Every structured-data issue of a site's collections: paths in the type's table, field sources
 * naming a field of the collection whose type fits, select options and constants in the path's
 * vocabulary (unmatched options are warnings), ISO 4217 currency constants, no constant on a
 * required path, and every required path mapped or defaulted.
 */
export function checkStructuredData(site: SiteFields): StructuredDataIssue[] {
  const out: StructuredDataIssue[] = [];
  for (const [key, settings] of Object.entries(site.collections ?? {})) {
    const preset = settings?.structuredData;
    if (!preset) continue;
    out.push(...checkPreset(preset, settings.fields ?? [], `collections/${key}/structuredData`));
  }
  return out;
}

/** The issues that refuse a save (warnings dropped). */
export const structuredDataErrors = (issues: readonly StructuredDataIssue[]) =>
  issues.filter((i) => !i.warning);
