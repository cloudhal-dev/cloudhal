/** Schemas and helpers shared by the site, page, surface, entry and publish tool families. */

import type { Actor, Asset, ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import {
  ContentEntrySchema,
  PageSchema,
  SectionSchema,
  SiteSchema,
  SnapshotSchema,
} from "@cloudhal/core-contracts";
import type { BlockWriter } from "@cloudhal/core-ts";
import { unknownBlockTypes } from "@cloudhal/core-ts";
import type { BlockRegistry } from "@cloudhal/core-ts/blocks";
import { assetRefsOf } from "@cloudhal/core-ts/media";
import { type Catalog, createCatalog } from "@cloudhal/core-ts/surfaces";
import { id, type JsonSchema, str, strip, type ToolContext, ToolError } from "./common.ts";

/** The catalog surfaces on this site are written against: the theme's name and its block types. */
export function siteCatalog(site: Site, ctx: { store: { blocks: BlockRegistry } }): Catalog {
  return createCatalog({ name: site.theme.name, blocks: ctx.store.blocks });
}

/** Body blocks an agent changes carry it and the MCP channel (RFC-0014 §3). */
export function mcpWriter(ctx: { principal: { actor: Actor } }): BlockWriter {
  return { actor: ctx.principal.actor, via: "mcp" };
}

export const SITE = strip(SiteSchema);
export const PAGE = strip(PageSchema);
export const ENTRY = strip(ContentEntrySchema);
export const SNAPSHOT = strip(SnapshotSchema);
export const SECTION = strip(SectionSchema);
export type Seo = NonNullable<Page["seo"]>;

/** An article's cover image by asset (RFC-0004): `{ assetId, alt? }`; the store fills in the rest. */
export const COVER_INPUT: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assetId"],
  description:
    "Cover image from the media library (list_assets, upload_asset). alt overrides the file's own alt text for this article.",
  properties: { assetId: id, alt: str("Alt text for this use", { maxLength: 500 }) },
};

/** The tool input for a page's sections. */
export const sectionInput = {
  type: "array",
  items: SECTION,
  description:
    'Ordered sections; keep existing ids when editing. Typed blocks (a callout, a button, an FAQ, the theme\'s own) are sections with kind "component", a type and its props: list_block_types.',
};

/** The media-library assets a page or article refers to, by id, so previews render them (RFC-0004). */
export async function assetsOf(
  ctx: ToolContext,
  kind: "page" | "contentEntry",
  node: Page | ContentEntry,
): Promise<Map<string, Asset>> {
  const ids = [...new Set(assetRefsOf(kind, node).map((r) => r.assetId))];
  const found = await Promise.all(ids.map((id) => ctx.store.getAsset(id)));
  return new Map(
    found
      .filter((a): a is Asset => a !== undefined && a.siteId === node.siteId)
      .map((a) => [a.id, a]),
  );
}

export function coverImage(input: unknown): NonNullable<ContentEntry["coverImage"]> {
  const c = input as { assetId: string; alt?: string };
  // `src` is written by the store from the asset (invariant 8).
  return { assetId: c.assetId, alt: c.alt ?? "", src: `asset:${c.assetId}` };
}

/** Reported when a write keeps blocks of types this deployment does not know (RFC-0015 §7). */
export const unknownBlocks = {
  type: "array",
  items: { type: "string" },
  description:
    "Block types used here that this site does not know (another theme's?): kept as written, not shown on the site. list_block_types shows the known ones.",
};

export function unknownBlocksOf(
  ctx: ToolContext,
  content: Parameters<typeof unknownBlockTypes>[1],
): { unknownBlocks?: string[] } {
  const names = unknownBlockTypes(ctx.store.blocks, content);
  return names.length ? { unknownBlocks: names } : {};
}

export const entryMarkdown = (entry: ContentEntry) =>
  entry.body.format === "markdown" ? entry.body.value : undefined;

/** Agents write markdown only; raw HTML sections are for people in Studio (security review H3). */
export function assertNoHtmlSections(sections: unknown): void {
  if (!Array.isArray(sections)) return;
  for (const s of sections as { kind?: string; format?: string; id?: string }[])
    if (s?.kind === "richText" && s.format !== "markdown")
      throw new ToolError(
        "invalid",
        `section ${s.id ?? ""} uses format "${s.format}"; agents may only write markdown sections`,
      );
}
