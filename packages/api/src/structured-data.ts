/**
 * RFC-0042 §7: `GET /api/sites/:siteId/entries/:entryId/structured-data`, Studio's read-only twin of
 * MCP's `preview_structured_data`. It answers the JSON-LD document an entry's page emits under its
 * collection's preset (the renderer's own `entryStructuredData`, so exactly what the site emits),
 * why it emits none (no preset, a required value missing, over the cap) and the preset's warnings.
 * Drafts work too; nothing is written.
 */
import { entryStructuredData } from "@cloudhal/astro-renderer/structured-data";
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { primaryOrigin, type SiteGraphStore } from "@cloudhal/core-ts";
import { checkStructuredData, type StructuredDataIssue } from "@cloudhal/core-ts/structured-data";

export interface StructuredDataPreview {
  /** The collection's preset type; null without one. */
  preset: string | null;
  /** The origin every URL in the document uses (the primary domain, else a local placeholder). */
  origin: string;
  document: object | null;
  issues: StructuredDataIssue[];
}

/** Without a domain, URLs are shown on the local preview server's origin. */
const LOCAL_ORIGIN = "http://localhost:4321";

/** Every `assetId` a JSON value names (image fields, cover images, the site's logos). */
function assetIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) assetIds(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (k === "assetId" && typeof v === "string") out.add(v);
      else assetIds(v, out);
    }
  return out;
}

async function assetsFor(store: SiteGraphStore, site: Site, nodes: readonly unknown[]) {
  const ids = new Set<string>();
  for (const n of nodes) assetIds(n, ids);
  const found = await Promise.all([...ids].map((i) => store.getAsset(i)));
  return found.filter((a): a is Asset => a !== undefined && a.siteId === site.id);
}

/** The preset's save-time warnings for one collection (select options outside a vocabulary). */
function presetWarnings(site: Site, key: string): StructuredDataIssue[] {
  const only = site.collections?.[key];
  if (!only?.structuredData) return [];
  return checkStructuredData({ ...site, collections: { [key]: only } }).filter((i) => i.warning);
}

/** The preview of `entry` (already checked to belong to `site`). */
export async function previewStructuredData(
  store: SiteGraphStore,
  site: Site,
  entry: ContentEntry,
): Promise<StructuredDataPreview> {
  const origin = primaryOrigin(site) ?? LOCAL_ORIGIN;
  const preset = site.collections?.[entry.collection]?.structuredData;
  if (!preset)
    return {
      preset: null,
      origin,
      document: null,
      issues: [
        {
          path: `collections/${entry.collection}/structuredData`,
          // The MCP tool's code; not a save-time issue code.
          code: "no_preset" as StructuredDataIssue["code"],
          message: `the collection ${entry.collection} has no structured-data preset, so its pages emit BlogPosting`,
        },
      ],
    };
  const group = entry.translation?.group;
  const original = group && group !== entry.id ? await store.getContentEntry(group) : undefined;
  const sameSite = original?.siteId === site.id ? original : undefined;
  const assets = await assetsFor(store, site, [entry, sameSite, site.brand]);
  const result = await entryStructuredData(
    {
      site: async () => site,
      entryById: async (key: string) => (key === sameSite?.id ? sameSite : undefined),
      assets: async () => assets,
    },
    entry,
    { origin },
  );
  return {
    preset: preset.type,
    origin,
    document: result.doc ?? null,
    issues: [...result.issues, ...presetWarnings(site, entry.collection)],
  };
}
