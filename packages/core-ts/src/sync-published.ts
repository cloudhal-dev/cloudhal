/**
 * The publish pointer across a push (`importSite` with `published: "target"`). A site's
 * `publishedSnapshotId` is production: Studio moves it through an approved publish or rollback.
 * A push copies content, so once the deployment has published, the written site node keeps the
 * deployment's pointer instead of the local copy's (which may predate a later publish).
 */
import type { Site } from "@cloudhal/core-contracts";
import { canonicalJson, nodeHash } from "./hash.ts";
import type { NodeRow } from "./sync.ts";

const VOLATILE = new Set(["rev", "updatedAt"]);

/** The body without the fields a write always changes, for "same content" comparisons. */
function stable(site: Site): string {
  return canonicalJson(
    Object.fromEntries(Object.entries(site).filter(([key]) => !VOLATILE.has(key))),
  );
}

/**
 * `rows` with the site node rewritten to carry the target's `publishedSnapshotId`. When that makes
 * it equal to the target's row in everything but rev and timestamps, the target's row is used
 * as is (no spurious change); otherwise the rev moves past both, so a Studio edit holding the
 * target's rev fails its compare-and-swap instead of overwriting.
 */
export async function keepTargetPublished(
  rows: readonly NodeRow[],
  target: readonly NodeRow[],
  siteId: string,
): Promise<NodeRow[]> {
  const isSite = (n: NodeRow) => n.kind === "site" && n.id === siteId;
  const dst = target.find(isSite);
  const src = rows.find(isSite);
  if (!dst || !src) return [...rows];
  const dstSite = JSON.parse(dst.body) as Site;
  const srcSite = JSON.parse(src.body) as Site;
  if (!dstSite.publishedSnapshotId || dstSite.publishedSnapshotId === srcSite.publishedSnapshotId)
    return [...rows];
  const merged: Site = { ...srcSite, publishedSnapshotId: dstSite.publishedSnapshotId };
  let row: NodeRow = dst;
  if (stable(merged) !== stable(dstSite)) {
    const next: Site = { ...merged, rev: Math.max(src.rev, dst.rev) + 1 };
    row = { ...src, rev: next.rev, hash: await nodeHash(next), body: canonicalJson(next) };
  }
  return rows.map((n) => (isSite(n) ? row : n));
}
