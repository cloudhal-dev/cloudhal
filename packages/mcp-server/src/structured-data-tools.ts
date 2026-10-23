/**
 * RFC-0042 §7: `preview_structured_data` shows the JSON-LD an entry's page would emit under its
 * collection's preset (the renderer's own `entryStructuredData`, so it is exactly what the site
 * emits) and why it emits none: no preset, a required value missing, over the cap. Read-only, so an
 * agent can check its mappings and values before a person publishes.
 */

import { entryStructuredData } from "@cloudhal/astro-renderer/structured-data";
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { primaryOrigin } from "@cloudhal/core-ts";
import { presetWarnings } from "./collection-listings.ts";
import {
  id,
  obj,
  requireSite,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";

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

async function assetsFor(
  ctx: ToolContext,
  site: Site,
  nodes: readonly unknown[],
): Promise<Asset[]> {
  const ids = new Set<string>();
  for (const n of nodes) assetIds(n, ids);
  const found = await Promise.all([...ids].map((i) => ctx.store.getAsset(i)));
  return found.filter((a): a is Asset => a !== undefined && a.siteId === site.id);
}

/** The site's public origin; without a domain, the preview server's, else a local placeholder. */
function originOf(site: Site, ctx: ToolContext): string {
  const primary = primaryOrigin(site);
  if (primary) return primary;
  return ctx.previewBaseUrl ? new URL(ctx.previewBaseUrl).origin : "http://localhost:4321";
}

export const previewStructuredDataTool: ToolDefinition = {
  name: "preview_structured_data",
  title: "Preview structured data",
  description:
    "The JSON-LD document an entry's page emits under its collection's structured-data preset (RFC-0042: Event, JobPosting, Product, Recipe), built exactly as the site builds it, with `issues`: why there is no document (no preset, a required value missing such as startDate, over 32 KB) and the preset's warnings (select options outside a vocabulary). Read-only; drafts work too. URLs use the site's primary domain (`origin`). Without a document the page keeps its BlogPosting.",
  inputSchema: obj({ siteId: id, entryId: id }, ["siteId", "entryId"]),
  outputSchema: obj(
    {
      preset: { type: ["string", "null"] },
      origin: { type: "string" },
      document: { type: ["object", "null"] },
      issues: { type: "array", items: { type: "object" } },
    },
    ["preset", "origin", "document", "issues"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== site.id)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    const origin = originOf(site, ctx);
    const preset = site.collections?.[entry.collection]?.structuredData;
    if (!preset)
      return {
        preset: null,
        origin,
        document: null,
        issues: [
          {
            path: `collections/${entry.collection}/structuredData`,
            code: "no_preset",
            message: `the collection ${entry.collection} has no structured-data preset, so its pages emit BlogPosting; a person can add one with update_collection (structuredData)`,
          },
        ],
      };
    const group = entry.translation?.group;
    const original =
      group && group !== entry.id ? await ctx.store.getContentEntry(group) : undefined;
    const sameSite = original?.siteId === site.id ? original : undefined;
    const assets = await assetsFor(ctx, site, [entry, sameSite, site.brand]);
    const source = {
      site: async () => site,
      entryById: async (key: string): Promise<ContentEntry | undefined> =>
        key === sameSite?.id ? sameSite : undefined,
      assets: async () => assets,
    };
    const result = await entryStructuredData(source, entry, { origin });
    return {
      preset: preset.type,
      origin,
      document: result.doc ?? null,
      issues: [...result.issues, ...presetWarnings(site, entry.collection)],
    };
  },
};
