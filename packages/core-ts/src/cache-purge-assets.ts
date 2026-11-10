/**
 * The purge planner's asset rule (RFC-0004 §7.4): an asset that left the live snapshot or changed
 * purges its media URLs (`cloudhal-asset-<id>`) and, when it changed, the responses that show it,
 * since they resolve its URL, alt, caption and size when they render: the node tag of every entry
 * and page that refers to it, and the term tag (with ancestors) of every term that does. An
 * entry's typed fields count too (RFC-0045 §2.5): an `image` field's value and a `richText`
 * field's `asset:` links, read through the target snapshot's own field definitions. A newly added
 * asset purges nothing (404s are never cached, and whatever starts showing it changed itself).
 * Part of `planCachePurge` (`cache-purge.ts`); reads through its counted, hash-keyed `read`.
 */
import type { Asset, ContentEntry, NodeRef, Site, Snapshot } from "@cloudhal/core-contracts";
import { assetCacheTag, nodeCacheTag, termCacheTag } from "./cache-tags.ts";
import { fieldAssetRefs, siteFieldDefinitions } from "./media/field-refs.ts";
import { type AssetRefUse, assetRefsOf } from "./media/refs.ts";

export interface AssetPurgeInput {
  /** Every node that differs between the two snapshots. */
  readonly changed: readonly { before?: NodeRef; after?: NodeRef }[];
  /** The snapshot going live. */
  readonly to: Snapshot;
  /** The planner's node reader (counted against `maxReads`, cached by hash). */
  readonly read: <T>(ref: NodeRef) => Promise<T>;
  /** A term and its ancestors in either snapshot. */
  readonly withAncestors: (id: string) => string[];
  /** Collected tags and log lines, added to in place. */
  readonly tags: Set<string>;
  readonly why: string[];
}

/** Adds the asset rule's tags and log lines to `input.tags` and `input.why`. */
export async function planAssetPurge(input: AssetPurgeInput): Promise<void> {
  const { tags, why, read } = input;
  const shown = new Set<string>();
  for (const c of input.changed) {
    if (!c.before || c.before.kind !== "asset") continue;
    const id = c.before.id;
    tags.add(assetCacheTag(id));
    if (!c.after) {
      why.push(`asset ${id} was removed`);
      continue;
    }
    const [a, b] = await Promise.all([read<Asset>(c.before), read<Asset>(c.after)]);
    if (a.slug !== b.slug || a.status !== b.status) why.push(`asset ${id}: slug or status changed`);
    else why.push(`asset ${id} changed`);
    shown.add(id);
  }
  if (shown.size === 0) return;
  const refsOf = await referencesIn(input.to, read);
  for (const ref of input.to.nodes) {
    if (ref.kind !== "contentEntry" && ref.kind !== "page" && ref.kind !== "term") continue;
    const uses = refsOf(ref.kind, await read<unknown>(ref));
    if (!uses.some((r) => shown.has(r.assetId))) continue;
    if (ref.kind === "term")
      for (const id of input.withAncestors(ref.id)) tags.add(termCacheTag(id));
    else tags.add(nodeCacheTag(ref.id));
  }
}

/** A node's asset references in `snapshot`: its own, and an entry's typed fields' by its defs. */
async function referencesIn(
  snapshot: Snapshot,
  read: AssetPurgeInput["read"],
): Promise<(kind: string, body: unknown) => AssetRefUse[]> {
  const siteRef = snapshot.nodes.find((n) => n.kind === "site" && n.id === snapshot.siteId);
  const defs = siteRef ? siteFieldDefinitions(await read<Site>(siteRef)) : {};
  return (kind, body) => {
    const refs = assetRefsOf(kind, body);
    if (kind !== "contentEntry") return refs;
    const entry = body as ContentEntry;
    return [...refs, ...fieldAssetRefs(defs[entry.collection] ?? [], entry.fields)];
  };
}
