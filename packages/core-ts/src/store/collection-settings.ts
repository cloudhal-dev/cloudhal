/**
 * RFC-0042 §8 step 2: the stage 3 collection settings checked on every site write that changes
 * them (`updateSite`, its dry run, and the field operations' end state). Pure.
 *
 * - `listFields` keys are fields of the collection (`unknown_field`); every field type can be
 *   listed (§4's table gives each at least `set`/`unset`);
 * - `expiry.field` is a date or datetime field of the collection (`unknown_field`,
 *   `invalid_expiry`);
 * - a structured-data preset passes `checkStructuredData` (`structured_data_invalid`); its
 *   warnings are reported by the checker, never refused.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { type InvariantCode, InvariantError } from "../errors.ts";
import { isBeingRemoved } from "../fields/migration.ts";
import type { SiteFields } from "../fields/types.ts";
import { checkPreset, structuredDataErrors } from "../structured-data/check.ts";

/** One refused setting, at a slash path (`collections/events/expiry/field`). */
export interface SettingsIssue {
  path: string;
  code: string;
  message: string;
}

interface Refusal {
  readonly code: InvariantCode;
  readonly issues: SettingsIssue[];
}

const live = (defs: readonly FieldDefinition[] | undefined) =>
  new Map((defs ?? []).filter((d) => !isBeingRemoved(d)).map((d) => [d.key, d]));

function listFieldIssues(key: string, settings: CollectionSettingsLike): SettingsIssue[] {
  const defs = live(settings.fields);
  return (settings.listFields ?? []).flatMap((field, i) =>
    defs.has(field)
      ? []
      : [
          {
            path: `collections/${key}/listFields/${i}`,
            code: "unknown_field",
            message: `"${field}" is not a field of ${key}`,
          },
        ],
  );
}

function expiryIssues(key: string, settings: CollectionSettingsLike): SettingsIssue[] {
  const rule = settings.expiry;
  if (!rule) return [];
  const def = live(settings.fields).get(rule.field);
  const path = `collections/${key}/expiry/field`;
  if (!def)
    return [{ path, code: "unknown_field", message: `"${rule.field}" is not a field of ${key}` }];
  if (def.type === "date" || def.type === "datetime") return [];
  return [
    {
      path,
      code: "invalid_expiry",
      message: `expiry reads a date or datetime field; ${rule.field} is a ${def.type} field`,
    },
  ];
}

type CollectionSettingsLike = NonNullable<NonNullable<SiteFields["collections"]>[string]>;

/**
 * The refusals of a site's stage 3 settings, in the order they are reported: list fields, expiry,
 * structured data. `only` limits the check to one collection.
 */
export function collectionSettingsRefusals(site: SiteFields, only?: string): Refusal[] {
  const unknown: SettingsIssue[] = [];
  const expiry: SettingsIssue[] = [];
  const preset: SettingsIssue[] = [];
  for (const [key, settings] of Object.entries(site.collections ?? {})) {
    if (!settings || (only !== undefined && key !== only)) continue;
    unknown.push(...listFieldIssues(key, settings));
    for (const i of expiryIssues(key, settings))
      (i.code === "unknown_field" ? unknown : expiry).push(i);
    if (settings.structuredData)
      preset.push(
        ...structuredDataErrors(
          checkPreset(
            settings.structuredData,
            settings.fields ?? [],
            `collections/${key}/structuredData`,
          ),
        ).map(({ path, code, message }) => ({ path, code, message })),
      );
  }
  const out: Refusal[] = [];
  if (unknown.length) out.push({ code: "unknown_field", issues: unknown });
  if (expiry.length) out.push({ code: "invalid_expiry", issues: expiry });
  if (preset.length) out.push({ code: "structured_data_invalid", issues: preset });
  return out;
}

/** Throws the first refusal of `collectionSettingsRefusals` (every issue of it in `details.issues`). */
export function checkCollectionSettings(site: SiteFields, only?: string): void {
  const first = collectionSettingsRefusals(site, only)[0];
  if (!first) return;
  const shown = first.issues
    .slice(0, 5)
    .map((i) => `${i.path}: ${i.message}`)
    .join("; ");
  const more = first.issues.length > 5 ? ` (and ${first.issues.length - 5} more)` : "";
  throw new InvariantError(first.code, `${shown}${more}`, { issues: first.issues });
}

/**
 * RFC-0042 §4 with RFC-0041 §6: the collection's stage 3 settings with field `from` renamed to
 * `to` (list fields, the expiry field, structured-data field sources). A rename's phase A writes
 * this with the new definition; its revert writes the inverse.
 */
export function renameSettingsReferences<S extends SiteFields>(
  site: S,
  collection: string,
  from: string,
  to: string,
): S {
  const settings = site.collections?.[collection];
  if (!settings) return site;
  const rename = (key: string) => (key === from ? to : key);
  const next = { ...settings };
  if (settings.listFields)
    next.listFields = settings.listFields.map(rename) as typeof settings.listFields;
  if (settings.expiry) next.expiry = { ...settings.expiry, field: rename(settings.expiry.field) };
  if (settings.structuredData) {
    const properties = Object.fromEntries(
      Object.entries(settings.structuredData.properties).map(([path, source]) => [
        path,
        source?.kind === "field" ? { ...source, field: rename(source.field) } : source,
      ]),
    );
    next.structuredData = { ...settings.structuredData, properties };
  }
  return { ...site, collections: { ...site.collections, [collection]: next } };
}

/** Slash paths of the collection's stage 3 settings that name `key`. */
export function settingsUses(site: SiteFields, collection: string, key: string): string[] {
  const settings = site.collections?.[collection];
  if (!settings) return [];
  const at = `collections/${collection}`;
  const out: string[] = [];
  settings.listFields?.forEach((k, i) => {
    if (k === key) out.push(`${at}/listFields/${i}`);
  });
  if (settings.expiry?.field === key) out.push(`${at}/expiry/field`);
  for (const [path, source] of Object.entries(settings.structuredData?.properties ?? {}))
    if (source?.kind === "field" && source.field === key)
      out.push(`${at}/structuredData/properties/${path}/field`);
  return out;
}
