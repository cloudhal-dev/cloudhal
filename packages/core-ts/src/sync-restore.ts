/**
 * A site bundle that makes a site's working copy one of its snapshots again (`cloudhal import
 * --revert`, RFC-0039 §2 as amended): the snapshot's nodes rebuilt from their stored bodies, for
 * `importSite(…, { mode: "replace" })`, which checks them like any bundle's (precompiled
 * validators, keys, hosts) and writes them in one atomic batch, the site node and so its publish
 * pointer included. Revs only move forward, as every other revert's do: a node the site holds at
 * the snapshot's rev or a later one, with other content, comes back at the rev after its current
 * one (its hash recomputed), so an editor holding a rev the node had (a Studio tab, an agent)
 * fails its compare-and-swap instead of saving over it; a node whose content already is the
 * snapshot's stays as it is. No snapshot or node body travels: the store holds them. The media the
 * blob assets need are listed; the store's takedowns among them travel as takedowns, so taken-down
 * content stays down (invariant 5). Worker-safe.
 */
import type { Asset, NodeRef, Snapshot } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { canonicalJson, nodeHash } from "./hash.ts";
import { type NodeKind, type NodeTypes, siteIdOf, uniquenessKey } from "./nodes.ts";
import {
  type BundleMedia,
  type BundlePurge,
  type NodeRow,
  SITE_BUNDLE_FORMAT,
  type SiteBundle,
  type StoragePair,
} from "./sync-bundle.ts";
import { assertNodeBody } from "./sync-checks.ts";
import { stableJson } from "./sync-published.ts";

/** The site's takedowns in the media ledger, by content (what a bundle's `purged` holds). */
export async function siteTakedowns(sql: SqlDriver, siteId: string): Promise<BundlePurge[]> {
  const rows = await sql.all<{
    sha256: string;
    purge_reason: string | null;
    purge_legal: number | null;
    purged_by: string | null;
    purged_at: string | null;
  }>(
    "SELECT sha256, purge_reason, purge_legal, purged_by, purged_at FROM media_blobs WHERE site_id = ? AND state = 'purged' ORDER BY sha256",
    [siteId],
  );
  return rows.map((r) => ({
    sha256: r.sha256,
    reason: r.purge_reason ?? "",
    legal: r.purge_legal === 1,
    by: r.purged_by ?? "",
    at: r.purged_at ?? "",
  }));
}

/** A blob asset's media entry (`exportSite` and `restoreBundle`); none for other storage. */
export function blobMedia(asset: Asset): BundleMedia | undefined {
  return asset.storage?.kind === "blob"
    ? { sha256: asset.sha256, bytes: asset.bytes, mediaType: asset.mediaType }
    : undefined;
}

/** A node as the store writes its row. */
async function rowOf(kind: NodeKind, node: NodeTypes[NodeKind], hash?: string): Promise<NodeRow> {
  return {
    id: node.id,
    site_id: siteIdOf(kind, node),
    kind,
    key: uniquenessKey(kind, node),
    rev: node.rev,
    hash: hash ?? (await nodeHash(node)),
    body: canonicalJson(node),
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  };
}

/**
 * The row that brings `ref` back (see the module doc): the current row when its content is the
 * snapshot's already, else the snapshot's body, at the rev after the current one when the site
 * holds the node at the snapshot's rev or a later one.
 */
async function restoredRow(
  snapshot: Snapshot,
  ref: NodeRef,
  text: string,
  now: NodeRow | undefined,
): Promise<NodeRow> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Never the parser's message: it can quote the body.
    throw new Error(`blob ${ref.hash} is not JSON`);
  }
  assertNodeBody(snapshot.siteId, ref.hash, body, [ref]);
  const node = body as NodeTypes[NodeKind];
  if (now && (now.hash === ref.hash || stableJson(JSON.parse(now.body)) === stableJson(node)))
    return now;
  if (!now || now.rev < ref.rev) return rowOf(ref.kind, node, ref.hash);
  return rowOf(ref.kind, { ...node, rev: now.rev + 1 });
}

/**
 * The bundle that brings `snapshot`'s site back to the snapshot's nodes, revs moved forward (see
 * the module doc). A node body missing from the blob store, or one that is not the node its ref
 * names, is refused before anything is written; every other check is `importSite`'s.
 */
export async function restoreBundle(from: StoragePair, snapshot: Snapshot): Promise<SiteBundle> {
  const { siteId } = snapshot;
  const current = new Map(
    (await from.sql.all<NodeRow>("SELECT * FROM nodes WHERE site_id = ?", [siteId])).map(
      (r) => [r.id, r] as const,
    ),
  );
  const decoder = new TextDecoder();
  const refs = [...snapshot.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const nodes: NodeRow[] = [];
  for (const ref of refs) {
    const data = await from.blobs.get(`nodes/${ref.hash}.json`);
    if (!data) throw new Error(`snapshot ${snapshot.id} references a missing blob ${ref.hash}`);
    nodes.push(await restoredRow(snapshot, ref, decoder.decode(data), current.get(ref.id)));
  }
  const down = new Map((await siteTakedowns(from.sql, siteId)).map((p) => [p.sha256, p] as const));
  const media = new Map<string, BundleMedia>();
  const purged = new Map<string, BundlePurge>();
  for (const n of nodes) {
    const m = n.kind === "asset" ? blobMedia(JSON.parse(n.body) as Asset) : undefined;
    if (!m) continue;
    const takedown = down.get(m.sha256);
    if (takedown) purged.set(m.sha256, takedown);
    else media.set(m.sha256, m);
  }
  const bySha = (a: { sha256: string }, b: { sha256: string }) => a.sha256.localeCompare(b.sha256);
  return {
    format: SITE_BUNDLE_FORMAT,
    siteId,
    nodes,
    snapshots: [],
    blobs: {},
    ...(media.size > 0 ? { media: [...media.values()].sort(bySha) } : {}),
    ...(purged.size > 0 ? { purged: [...purged.values()].sort(bySha) } : {}),
  };
}
