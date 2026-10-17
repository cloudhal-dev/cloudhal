/** `previewDoc`: a page or article rendered as the site would show it (preview_page, render tools). */

import {
  previewCollections,
  renderEntryPreview,
  renderPagePreview,
} from "@cloudhal/astro-renderer/preview";
import { mintPreviewToken, previewUrl, primaryOrigin } from "@cloudhal/core-ts";
import { requireSite, type ToolContext, ToolError } from "./common.ts";
import { assetsOf } from "./content-shared.ts";

/** A page or article rendered as the site would show it, with its preview link (when there is one). */
export async function previewDoc(
  a: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ title: string; path: string; html: string; url: string | null }> {
  const site = await requireSite(ctx, a.siteId as string);
  let doc: { title: string; path: string; html: string };
  if (a.entryId) {
    const entry = await ctx.store.getContentEntry(a.entryId as string);
    if (!entry || entry.siteId !== site.id)
      throw new ToolError("not_found", `entry ${a.entryId} not found`);
    doc = renderEntryPreview(site, entry, {
      assets: await assetsOf(ctx, "contentEntry", entry),
      blocks: ctx.store.blocks,
    });
  } else if (a.pageId) {
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== site.id)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    const collections = previewCollections(page.sections);
    const entries = Object.fromEntries(
      await Promise.all(
        collections.map(async (c) => [c, await ctx.store.listContentEntries(site.id, c)]),
      ),
    );
    doc = renderPagePreview(site, page, entries, {
      assets: await assetsOf(ctx, "page", page),
      blocks: ctx.store.blocks,
    });
  } else {
    throw new ToolError("invalid", "pass pageId or entryId");
  }
  // Prefer a signed link to the deployed site (drafts visible); fall back to `cloudhal dev`.
  if (ctx.previewSecret && primaryOrigin(site)) {
    const token = await mintPreviewToken(ctx.previewSecret, {
      site: site.id,
      target: "live",
    });
    return { ...doc, url: previewUrl(site, doc.path, token) ?? null };
  }
  return {
    ...doc,
    url: ctx.previewBaseUrl ? new URL(doc.path, ctx.previewBaseUrl).toString() : null,
  };
}
