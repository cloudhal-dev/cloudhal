/**
 * Typed custom fields in Studio (RFC-0041 §7): pure helpers for the entry editor's Fields card and
 * the collection's fields builder — the API's issues by field, keys derived from labels, the free
 * edits a definition list allows, and the operation a running marker belongs to.
 *
 * Loads with the fields UI only (`bundle-budget.ts` `LAZY_ONLY`).
 */
import type { CollectionSettings, FieldDefinition } from "@cloudhal/core-contracts";
import { RESERVED_FIELD_KEYS } from "@cloudhal/core-ts/fields";
import { ApiRequestError } from "./api/http.ts";

export type FieldType = FieldDefinition["type"];

/** One problem the API names (`details.issues`, RFC-0041 §3). */
export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

/** The issues of a refused entry or collection write, or none. */
export function fieldIssues(error: unknown): FieldIssue[] {
  if (!(error instanceof ApiRequestError)) return [];
  const details = error.body?.details as { issues?: unknown } | undefined;
  if (!Array.isArray(details?.issues)) return [];
  return details.issues.filter(
    (i): i is FieldIssue =>
      typeof i === "object" && i !== null && typeof (i as FieldIssue).path === "string",
  );
}

/** The first issue of each field, by key: `fields/startsAt/at` belongs to `startsAt`. */
export function issuesByField(issues: readonly FieldIssue[]): Record<string, FieldIssue> {
  const out: Record<string, FieldIssue> = {};
  for (const issue of issues) {
    const [root, key] = issue.path.split("/");
    if (root !== "fields" || !key || out[key]) continue;
    out[key] = issue;
  }
  return out;
}

/** The contract's key pattern (`FieldKey`): lower camelCase, at most 40 characters. */
export const FIELD_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/;

/** A key from a label: "Starts at" → `startsAt`, "Çağrı No" → `cagriNo`; empty when nothing fits. */
export function fieldKeyFrom(label: string): string {
  const words = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  // A key starts with a letter: leading digits go ("2 Speakers" → `speakers`).
  while (words.length > 0 && /^[0-9]/.test(words[0] ?? "")) {
    const rest = (words[0] ?? "").replace(/^[0-9]+/, "");
    if (rest) words[0] = rest;
    else words.shift();
  }
  const key = words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`,
    )
    .join("");
  return key.slice(0, 40);
}

export type KeyProblem = "pattern" | "reserved" | "taken";

/** Why a new key cannot be used, if it cannot. */
export function keyProblem(key: string, taken: readonly string[]): KeyProblem | undefined {
  if (!FIELD_KEY_PATTERN.test(key)) return "pattern";
  if (RESERVED_FIELD_KEYS.has(key)) return "reserved";
  if (taken.includes(key)) return "taken";
  return undefined;
}

/** RFC-0041 §7: text, rich text and links are per language by default; the rest are shared. */
export const localizedByDefault = (type: FieldType) =>
  type === "text" || type === "richText" || type === "url";

/** The list with item `i` moved one place up (`-1`) or down (`1`). */
export function moveField<T>(list: readonly T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
}

/** The collection's settings with these definitions (none: the property goes, as the schema wants). */
export function withFields(
  settings: CollectionSettings,
  fields: readonly FieldDefinition[],
): CollectionSettings {
  const { fields: _old, ...rest } = settings;
  const [first, ...more] = fields;
  return first ? { ...rest, fields: [first, ...more] } : rest;
}

/** The operation whose marker a definition carries (RFC-0041 §6 phase A), if one runs. */
export function runningOperationId(defs: readonly FieldDefinition[]): string | undefined {
  return defs.find((d) => d.migration)?.migration?.id;
}

/** The definition without the operation marker, as the builder edits it. */
export function withoutMarker(def: FieldDefinition): FieldDefinition {
  const { migration: _m, ...rest } = def;
  return rest as FieldDefinition;
}
