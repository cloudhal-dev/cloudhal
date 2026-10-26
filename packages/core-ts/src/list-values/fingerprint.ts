/**
 * RFC-0042 §4, #110: what a collection's `entry_list_values` rows were built from. Rows are valid
 * only under the fingerprint they were built with; every site write that changes it resets the
 * collection's readiness in the same batch (`statements.ts`), and the backfill rebuilds it.
 *
 * The fingerprint is a SHA-256 over the collection sort, the listed keys (sorted: reordering
 * Studio's columns rebuilds nothing) and each listed definition minus the properties that never
 * change a resolved value (`EXCLUDED`). While a listed definition carries a migration marker, the
 * whole definition and the site's conversion context count (a `text → select` conversion reads
 * option labels), and the collection is never answered from the table anyway.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { convertContext } from "../fields/migration.ts";
import type { SiteFields } from "../fields/types.ts";
import { canonicalJson, sha256Hex } from "../hash.ts";

/** The fingerprint of a collection without list fields. */
export const NO_LIST = "none";

/**
 * Definition properties left out of the fingerprint: they never change a resolved value (labels,
 * help, publish rules, site search). Every other property counts, including future ones (a unit
 * test walks the schema and fails on a property that is neither here nor fingerprinted).
 */
export const EXCLUDED: readonly string[] = ["labels", "requiredToPublish", "searchable"];

/** One listed definition as fingerprinted: options keep their values, not their labels. */
function shape(def: FieldDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = { ...def };
  for (const k of EXCLUDED) delete out[k];
  if (def.type === "select") out.options = def.options.map((o) => o.value);
  return out;
}

/** True while a listed field of the collection is being changed by a field operation. */
export function hasListedMarker(site: SiteFields, collection: string): boolean {
  const settings = site.collections?.[collection];
  const keys: readonly string[] = settings?.listFields ?? [];
  return (settings?.fields ?? []).some((d) => d.migration !== undefined && keys.includes(d.key));
}

/** The collection's list fingerprint under `site` (`NO_LIST` when it lists no fields). */
export async function listFingerprint(site: SiteFields, collection: string): Promise<string> {
  const settings = site.collections?.[collection];
  const keys = settings?.listFields;
  if (!keys?.length) return NO_LIST;
  const listFields = [...keys].sort();
  const marked = hasListedMarker(site, collection);
  const defs = listFields.map((k) => {
    const def = settings?.fields?.find((d) => d.key === k);
    return def === undefined ? null : marked ? def : shape(def);
  });
  return sha256Hex(
    canonicalJson({
      format: 1,
      sort: settings?.sort ?? "newest",
      listFields,
      defs,
      ...(marked ? { convert: convertContext(site) } : {}),
    }),
  );
}

/** The collections of a site that list fields. */
export const listedCollections = (site: SiteFields): string[] =>
  Object.entries(site.collections ?? {})
    .filter(([, s]) => (s?.listFields?.length ?? 0) > 0)
    .map(([c]) => c);

/**
 * Collections whose fingerprint differs between `stored` (absent: a new site) and `next`, with
 * the new fingerprint. Empty without hashing when the settings and zone are unchanged.
 */
export async function changedFingerprints(
  stored: SiteFields | undefined,
  next: SiteFields,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const same =
    stored !== undefined &&
    stored.timeZone === next.timeZone &&
    stored.defaultLocale === next.defaultLocale &&
    canonicalJson(stored.collections ?? {}) === canonicalJson(next.collections ?? {});
  if (same) return out;
  const keys = new Set([
    ...Object.keys(stored?.collections ?? {}),
    ...Object.keys(next.collections ?? {}),
  ]);
  for (const c of keys) {
    const after = await listFingerprint(next, c);
    const before = stored ? await listFingerprint(stored, c) : NO_LIST;
    if (before !== after) out.set(c, after);
  }
  return out;
}
