/**
 * RFC-0042 §2 "Per entry": `structuredDataFor` builds the preset document of one entry from its
 * resolved values (`resolveFields`, so a translation reads the original's non-localized values),
 * the entry and the site. Pure: the caller resolves asset URLs and the entry's URL.
 *
 * - When a required value is missing, no document is emitted (Google treats an incomplete item as
 *   invalid); the issues say which (`Structured data: startDate missing`).
 * - A document is capped at 32 KB serialized: optional properties are dropped first, in reverse
 *   table order, `description` last; a required `description` is shortened instead.
 * - The result is a plain object; the renderer serializes it with `jsonLdText`.
 */
import type { StructuredDataPreset, StructuredDataSource } from "@cloudhal/core-contracts";
import type { ResolvedFields } from "../fields/resolve.ts";
import type { StructuredDataIssue } from "./check.ts";
import {
  KIND_SOURCES,
  type PathSpec,
  PRESETS,
  type PresetSpec,
  requiredPaths,
  STRUCTURED_DATA_MAX_BYTES,
} from "./table.ts";
import {
  type ConvertInput,
  type JsonLdValue,
  type StructuredDataContext,
  type StructuredDataEntry,
  type StructuredDataSite,
  sourceValue,
} from "./values.ts";

export type JsonLdDocument = { [k: string]: JsonLdValue };

export interface StructuredDataResult {
  /** The preset document, absent without a preset or when a required value is missing. */
  doc?: JsonLdDocument;
  issues: StructuredDataIssue[];
}

/** The source a path reads: the mapping's, else the table's default. */
const sourceOf = (preset: StructuredDataPreset, path: string, spec: PathSpec) =>
  preset.properties[path] ?? spec.default;

/** A field source whose field no longer fits the path (its type changed) gives nothing. */
function fits(source: StructuredDataSource, resolved: ResolvedFields, spec: PathSpec): boolean {
  if (source.kind !== "field") return true;
  const def = resolved[source.field]?.def;
  if (!def) return false;
  return [...KIND_SOURCES[spec.kind].fields, ...(spec.alsoFields ?? [])].includes(def.type);
}

/** Every path's value, in table order. */
function collect(
  preset: StructuredDataPreset,
  table: PresetSpec,
  resolved: ResolvedFields,
  base: Omit<ConvertInput, "spec">,
): Map<string, JsonLdValue> {
  const values = new Map<string, JsonLdValue>();
  for (const [path, spec] of Object.entries(table.paths)) {
    const source = sourceOf(preset, path, spec);
    if (!source || !fits(source, resolved, spec)) continue;
    const field = source.kind === "field" ? resolved[source.field] : undefined;
    const value = sourceValue(source, field, { ...base, spec });
    if (value !== undefined) values.set(path, value);
  }
  return values;
}

const TELECOMMUTE = "TELECOMMUTE";

/** The required paths without a value (a remote job needs no address). */
function missing(type: StructuredDataPreset["type"], values: Map<string, JsonLdValue>): string[] {
  const { paths, groups } = requiredPaths(type);
  const out = paths.filter((p) => !values.has(p));
  const remote =
    type === "JobPosting" &&
    values.get("jobLocationType") === TELECOMMUTE &&
    values.has("applicantLocationRequirements.name");
  for (const group of groups)
    if (!remote && !group.some((p) => values.has(p)))
      out.push(group[0]?.replace(/\.[^.]+$/, "") ?? "");
  return out;
}

/** The document: nested objects get their `@type` from the table when created. */
function assemble(
  type: string,
  table: PresetSpec,
  values: Map<string, JsonLdValue>,
): JsonLdDocument {
  const doc: JsonLdDocument = { "@context": "https://schema.org", "@type": type };
  for (const [path, value] of values) {
    const target = (table.paths[path]?.target ?? path).split(".");
    let node = doc;
    let prefix = "";
    for (const part of target.slice(0, -1)) {
      prefix = prefix ? `${prefix}.${part}` : part;
      const existing = node[part];
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        const objectType = table.types[prefix];
        node[part] = objectType ? { "@type": objectType } : {};
      }
      node = node[part] as JsonLdDocument;
    }
    node[target[target.length - 1] as string] = value;
  }
  return doc;
}

const encoder = new TextEncoder();
const bytes = (doc: JsonLdDocument) => encoder.encode(JSON.stringify(doc)).length;

/** Drops optional values (description last) or shortens a required description to fit the cap. */
function fitCap(
  type: StructuredDataPreset["type"],
  table: PresetSpec,
  values: Map<string, JsonLdValue>,
): JsonLdDocument | undefined {
  let doc = assemble(type, table, values);
  if (bytes(doc) <= STRUCTURED_DATA_MAX_BYTES) return doc;
  const optional = [...values.keys()]
    .filter((p) => !table.paths[p]?.required && p !== "description")
    .reverse();
  if (values.has("description") && !table.paths.description?.required) optional.push("description");
  for (const path of optional) {
    values.delete(path);
    doc = assemble(type, table, values);
    if (bytes(doc) <= STRUCTURED_DATA_MAX_BYTES) return doc;
  }
  const description = values.get("description");
  if (typeof description !== "string") return undefined;
  const over = bytes(doc) - STRUCTURED_DATA_MAX_BYTES;
  // Each character costs at least one byte; trimming by the overshoot (plus an ellipsis) is enough
  // after at most a few rounds, since multi-byte characters only shorten it faster.
  let text = description;
  for (let cut = over + 3; text.length > 0; cut *= 2) {
    text = `${description.slice(0, Math.max(0, description.length - cut)).trimEnd()}…`;
    values.set("description", text);
    doc = assemble(type, table, values);
    if (bytes(doc) <= STRUCTURED_DATA_MAX_BYTES) return doc;
    if (text === "…") break;
  }
  return undefined;
}

/**
 * The JSON-LD document of an entry under its collection's preset, or none: without a preset, when
 * a required value is missing, or when even the required properties exceed 32 KB.
 */
export function structuredDataFor(
  site: StructuredDataSite,
  resolved: ResolvedFields,
  entry: StructuredDataEntry,
  ctx: StructuredDataContext,
): StructuredDataResult {
  const preset = site.collections?.[entry.collection]?.structuredData;
  const table = preset ? PRESETS[preset.type] : undefined;
  if (!preset || !table) return { issues: [] };
  const values = collect(preset, table, resolved, { site, entry, ctx });
  const absent = missing(preset.type, values);
  if (absent.length > 0)
    return {
      issues: absent.map((path) => ({
        path,
        code: "required_value_missing",
        message: `Structured data: ${path} missing`,
      })),
    };
  const doc = fitCap(preset.type, table, values);
  if (!doc)
    return {
      issues: [
        {
          path: "",
          code: "too_large",
          message: `Structured data: over ${STRUCTURED_DATA_MAX_BYTES} bytes without optional properties`,
        },
      ],
    };
  return { doc, issues: [] };
}
