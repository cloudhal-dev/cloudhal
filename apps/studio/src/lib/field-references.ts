/**
 * RFC-0045 in Studio: pure helpers for reference and repeater fields in the entry editor — the
 * group ids an entry's values name, the member a target shows, the API's issues by path, and the
 * words of a referrer's field ("Used by").
 *
 * Loads with the fields UI only (`bundle-budget.ts` `LAZY_ONLY`).
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { fieldLabel, renamedFrom } from "@cloudhal/core-ts/fields";
import type { ReferenceCard } from "./api/references.ts";
import type { FieldIssue } from "./fields.ts";

const ids = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

const isItem = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Every group id the values name, read as the form shows them: through a running rename's old key
 * (top level, or a sub-field's in each item), in references and repeater items' reference
 * sub-fields. Strings that are no group id are returned too; the groups read leaves them out.
 */
export function referenceIdsIn(
  definitions: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>> | undefined,
): string[] {
  const out = new Set<string>();
  for (const def of definitions) {
    const from = renamedFrom(def);
    const v = values?.[def.key] ?? (from ? values?.[from] : undefined);
    if (def.type === "reference") for (const id of ids(v)) out.add(id);
    if (def.type !== "repeater" || !Array.isArray(v)) continue;
    const m = def.migration;
    const subFrom = m?.sub !== undefined && m.fromKey ? { sub: m.sub, from: m.fromKey } : undefined;
    for (const sub of def.fields) {
      if (sub.type !== "reference") continue;
      for (const item of v.filter(isItem)) {
        const value = item[sub.key] ?? (subFrom?.sub === sub.key ? item[subFrom.from] : undefined);
        for (const id of ids(value)) out.add(id);
      }
    }
  }
  return [...out];
}

/**
 * The member a target stands for in the editor: in an allowed collection, the one in the entry's
 * language, else the site's default language's, else the first. Any status: the list says when it
 * will not show.
 */
export function chooseMember(
  members: readonly ReferenceCard[],
  options: { locale: string; defaultLocale: string; collections: readonly string[] },
): ReferenceCard | undefined {
  const allowed = members.filter((m) => options.collections.includes(m.collection));
  return (
    allowed.find((m) => m.locale === options.locale) ??
    allowed.find((m) => m.locale === options.defaultLocale) ??
    allowed[0]
  );
}

/**
 * The first issue at each path under `fields`, relative to it: `fields/startsAt/at` →
 * `startsAt/at`, `fields/speakers/2/person` → `speakers/2/person`.
 */
export function issuesByPath(issues: readonly FieldIssue[]): Record<string, FieldIssue> {
  const out: Record<string, FieldIssue> = {};
  for (const issue of issues) {
    if (!issue.path.startsWith("fields/")) continue;
    const path = issue.path.slice("fields/".length);
    if (path && !out[path]) out[path] = issue;
  }
  return out;
}

/**
 * The words of a referrer's field path (`venue`, `speakers.person`) in its collection, in the
 * Studio language: the field's label, and the sub-field's in a repeater. Keys when undefined.
 */
export function referrerFieldWords(
  site: Site | undefined,
  collection: string,
  path: string,
  locale: string,
): { field: string; sub?: string } {
  const [key = path, subKey] = path.split(".");
  const defaultLocale = site?.defaultLocale ?? locale;
  const def = site?.collections?.[collection]?.fields?.find((d) => d.key === key);
  const field = def ? fieldLabel(def, locale, defaultLocale) : key;
  if (subKey === undefined) return { field };
  const sub = def?.type === "repeater" ? def.fields.find((s) => s.key === subKey) : undefined;
  return { field, sub: sub ? fieldLabel(sub, locale, defaultLocale) : subKey };
}
