/**
 * RFC-0042 §2 in `<head>`: an entry whose collection has a JSON-LD preset (`Event`, `JobPosting`,
 * `Product`, `Recipe`) describes itself with it instead of the generic `BlogPosting` that
 * `entryHead` emits. `entryHead` itself never changes, so a theme copy from before RFC-0042 keeps
 * today's output; a theme opts in with one `withStructuredData` call after `entryHead`.
 *
 * The document is built by core-ts's pure `structuredDataFor` from typed values (resolved, so a
 * translation reads its original's non-localized ones), capped at 32 KB, and rendered through
 * `jsonLdText` by `SeoHead.astro` like every other JSON-LD block. An entry missing a required value
 * keeps its `BlogPosting`; the `BreadcrumbList` always stays.
 */
import type { Asset, ContentEntry } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts";
import { resolveFields } from "@cloudhal/core-ts/fields";
import {
  absoluteHttpUrl,
  type StructuredDataResult,
  structuredDataFor,
} from "@cloudhal/core-ts/structured-data";
import { loadAssetIndex, type MediaContext, socialImageUrl } from "./media.ts";
import type { HeadMeta } from "./seo.ts";
import type { GraphSource } from "./source.ts";

export interface StructuredDataOptions {
  /** The site's public origin (`siteOrigin`); every URL in the document is absolute on it. */
  readonly origin: string;
  /** The page's media context: its asset index is reused when given. */
  readonly media?: MediaContext | undefined;
}

type StructuredDataSource = Pick<GraphSource, "site"> &
  Partial<Pick<GraphSource, "entryById" | "assets">>;

/** The asset index to resolve image fields, the cover image and the site logo with. */
async function assetsFor(
  source: StructuredDataSource,
  media: MediaContext | undefined,
): Promise<ReadonlyMap<string, Asset>> {
  return media?.assets ?? (await loadAssetIndex(source));
}

/**
 * The preset document of an entry and why it has none (`issues`): no preset, a required value
 * missing, or over the cap. What `withStructuredData` emits, and what previews and checks show.
 */
export async function entryStructuredData(
  source: StructuredDataSource,
  entry: ContentEntry,
  options: StructuredDataOptions,
): Promise<StructuredDataResult> {
  const site = await source.site();
  if (!site.collections?.[entry.collection]?.structuredData) return { issues: [] };
  const group = entry.translation?.group;
  const original =
    group && group !== entry.id && source.entryById ? await source.entryById(group) : undefined;
  const resolved = resolveFields(site, entry, original);
  const assets = await assetsFor(source, options.media);
  const { origin } = options;
  return structuredDataFor(site, resolved, entry, {
    origin,
    entryUrl: `${origin}${entryPath(site, entry)}`,
    imageUrl: (image) => {
      const asset = image.assetId ? assets.get(image.assetId) : undefined;
      if (asset) return asset.kind === "image" ? socialImageUrl(origin, asset) : undefined;
      return image.src ? absoluteHttpUrl(image.src, origin) : undefined;
    },
  });
}

const isBlogPosting = (doc: object) => (doc as { "@type"?: unknown })["@type"] === "BlogPosting";

/**
 * `head` with the entry's preset document in place of the `BlogPosting` (RFC-0042 §2), when its
 * collection has a preset and the entry has every required value; otherwise `head` unchanged.
 * The `BreadcrumbList` stays; the `BlogPosting`'s `commentCount` does not move to the preset.
 */
export async function withStructuredData(
  head: HeadMeta,
  source: StructuredDataSource,
  entry: ContentEntry,
  options: StructuredDataOptions,
): Promise<HeadMeta> {
  const at = head.jsonLd.findIndex(isBlogPosting);
  if (at < 0) return head;
  const { doc } = await entryStructuredData(source, entry, options);
  if (!doc) return head;
  return { ...head, jsonLd: head.jsonLd.map((d, i) => (i === at ? doc : d)) };
}
