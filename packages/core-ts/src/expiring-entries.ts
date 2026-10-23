/**
 * RFC-0042 §3.5: publishing a change that adds a derived gate to a live entry, or moves its gate
 * earlier, removes content at a set time. It is classed like RFC-0008's `schedule_unpublish`
 * (§7.6, "expiry removes content, so it waits for a person"): an agent's publish or release that
 * carries one is never low risk. This module finds those entries; the auto-mode checks
 * (`checkAutoPublish`, `checkAutoRelease`) decide with them.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { derivedGate, hasExpiryRules } from "./fields/entry-gates.ts";
import type { FieldsOriginal } from "./fields/resolve.ts";
import type { SiteFields } from "./fields/types.ts";
import type { SiteGraphStore, SnapshotDiff } from "./store.ts";

/** One version of an entry with the site rules and the original it is read with. */
export interface GateSide {
  readonly site: SiteFields;
  readonly entry: ContentEntry;
  readonly original?: FieldsOriginal | undefined;
}

/**
 * True when `after` has a derived gate that `before` (the live version) lacked, or an earlier
 * one. A gate removed or moved later only keeps content up longer.
 */
export function advancesDerivedGate(before: GateSide, after: GateSide): boolean {
  const next = derivedGate(after.site, after.entry, after.original);
  if (!next) return false;
  const live = derivedGate(before.site, before.entry, before.original);
  return live === undefined || next.at < live.at;
}

const groupOf = (e: ContentEntry) => {
  const g = e.translation?.group;
  return g && g !== e.id && e.translation?.source?.siteId === undefined ? g : undefined;
};

/**
 * The live entries whose pending version (`diff`, from `pendingChanges`) adds or advances a
 * derived gate. Empty, without a read, when neither the working site nor the live one has a rule.
 */
export async function expiringEntries(
  store: SiteGraphStore,
  siteId: string,
  diff: SnapshotDiff,
): Promise<Set<string>> {
  const out = new Set<string>();
  const site = await store.getSite(siteId);
  const liveSnap = site?.publishedSnapshotId
    ? await store.getSnapshot(site.publishedSnapshotId)
    : undefined;
  if (!site || !liveSnap) return out;
  const liveRef = (id: string, kind: string) =>
    liveSnap.nodes.find((n) => n.id === id && n.kind === kind);
  const siteRef = liveSnap.nodes.find((n) => n.kind === "site");
  const liveSite = siteRef ? await store.readSnapshotNode<Site>(siteRef) : undefined;
  if (!hasExpiryRules(site) && !(liveSite && hasExpiryRules(liveSite))) return out;
  const liveEntry = async (id: string) => {
    const ref = liveRef(id, "contentEntry");
    return ref ? store.readSnapshotNode<ContentEntry>(ref) : undefined;
  };
  for (const change of diff.changed) {
    if (change.after.kind !== "contentEntry") continue;
    const [working, live] = await Promise.all([
      store.getContentEntry(change.after.id),
      liveEntry(change.after.id),
    ]);
    if (!working || !live) continue;
    const wg = groupOf(working);
    const lg = groupOf(live);
    const after = {
      site,
      entry: working,
      original: wg ? await store.getContentEntry(wg) : undefined,
    };
    const before = {
      site: liveSite ?? site,
      entry: live,
      original: lg ? await liveEntry(lg) : undefined,
    };
    if (advancesDerivedGate(before, after)) out.add(working.id);
  }
  return out;
}
