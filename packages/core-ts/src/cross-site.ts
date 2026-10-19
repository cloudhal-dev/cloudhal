/**
 * RFC-0034 §6: what a translation needs to live on another site of the project (a language
 * edition). Media and terms belong to a site, so a translation made from another site's page or
 * article brings its images along (copied by content into the edition, the references rewritten)
 * and takes the edition's terms with the same taxonomy and slug.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { mediaBlobKey } from "./assets.ts";
import { InvariantError } from "./errors.ts";
import type { SiteGraphStore } from "./store.ts";

type Localized = Page | ContentEntry;

const ASSET_ID = /asset_[A-Za-z0-9]{6,32}/g;

/** Asset ids a node refers to (cover image, image props, `asset:` links in markdown). */
export function assetIdsOf(node: unknown): string[] {
  return [...new Set(JSON.stringify(node).match(ASSET_ID) ?? [])];
}

/**
 * Copies `ids` (assets of `fromSiteId`) into `toSiteId` by content, with their texts and credits,
 * and returns old id → new id. An asset the edition already holds (same content) is reused.
 */
export async function copyAssetsToSite(
  store: SiteGraphStore,
  input: {
    fromSiteId: string;
    toSiteId: string;
    ids: readonly string[];
    actor: Parameters<SiteGraphStore["ingestAsset"]>[0]["uploadedBy"];
  },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of input.ids) {
    const asset = await store.getAsset(id);
    if (!asset || asset.siteId !== input.fromSiteId || asset.storage.kind !== "blob") continue;
    const bytes = await store.blobs.get(mediaBlobKey(input.fromSiteId, asset.sha256));
    if (!bytes) continue;
    const { asset: copy } = await store.ingestAsset({
      siteId: input.toSiteId,
      bytes,
      declaredType: asset.mediaType,
      filename: asset.slug,
      uploadedBy: input.actor,
      source: { kind: "import", from: `asset:${asset.id}`, importer: "edition" },
      maxBytes: Math.max(asset.bytes, 1) + 1,
      fields: {
        ...(asset.title ? { title: asset.title } : {}),
        ...(asset.alt ? { alt: asset.alt } : {}),
        ...(asset.caption ? { caption: asset.caption } : {}),
        ...(asset.credit ? { credit: asset.credit } : {}),
        ...(asset.license ? { license: asset.license } : {}),
        ...(asset.decorative ? { decorative: true } : {}),
        ...(asset.image?.lqip || asset.image?.color
          ? {
              image: {
                ...(asset.image.lqip ? { lqip: asset.image.lqip } : {}),
                ...(asset.image.color ? { color: asset.image.color } : {}),
              },
            }
          : {}),
      },
    });
    out.set(id, copy.id);
  }
  return out;
}

/** `node` with every asset id in `ids` replaced by its copy. */
export function withAssets<T>(node: T, ids: ReadonlyMap<string, string>): T {
  if (ids.size === 0) return node;
  return JSON.parse(JSON.stringify(node).replace(ASSET_ID, (m) => ids.get(m) ?? m)) as T;
}

/**
 * An entry's term assignments on another site: each term is the edition's term with the same
 * taxonomy key and slug. Refused (`required_term`) naming what the edition lacks, so it can be
 * created first.
 */
export async function termsOnSite(
  store: SiteGraphStore,
  entry: ContentEntry,
  toSiteId: string,
): Promise<ContentEntry["terms"]> {
  const out: Record<string, { ids: string[]; primary?: string }> = {};
  const missing: string[] = [];
  for (const [key, assignment] of Object.entries(entry.terms ?? {})) {
    if (!assignment) continue;
    const ids: string[] = [];
    let primary: string | undefined;
    for (const id of assignment.ids) {
      const term = await store.getTerm(id);
      if (!term) continue;
      const there = await store.getTermBySlug(toSiteId, key, term.slug);
      if (!there) {
        missing.push(`${key}/${term.slug}`);
        continue;
      }
      ids.push(there.id);
      if (assignment.primary === id) primary = there.id;
    }
    if (ids.length > 0) out[key] = { ids, ...(primary ? { primary } : {}) };
  }
  if (missing.length > 0)
    throw new InvariantError(
      "required_term",
      `the edition has no ${missing.join(", ")}; create these terms there first (same taxonomy and slug)`,
      { missing },
    );
  return out as ContentEntry["terms"];
}

/** The node as written on the edition: its media copied, its terms the edition's. */
export async function forEdition<T extends Localized>(
  store: SiteGraphStore,
  node: T,
  input: {
    fromSiteId: string;
    toSiteId: string;
    actor: Parameters<typeof copyAssetsToSite>[1]["actor"];
  },
): Promise<T> {
  const ids = await copyAssetsToSite(store, { ...input, ids: assetIdsOf(node) });
  const moved = withAssets({ ...node, siteId: input.toSiteId }, ids);
  if ("sections" in moved) return moved;
  return { ...moved, terms: await termsOnSite(store, node as ContentEntry, input.toSiteId) } as T;
}
