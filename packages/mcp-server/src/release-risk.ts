/**
 * The items of a release as the `auto`-mode low-risk check sees them (RFC-0008 §10.3): what each
 * item does, the assets riding with articles, corrections (RFC-0019 §2.4) and derived gates added
 * or moved earlier on live articles (RFC-0042 §3.5, classed like `schedule_unpublish`).
 */
import type { ReleaseItemRisk } from "@cloudhal/agent-runtime";
import type { ContentEntry } from "@cloudhal/core-contracts";
import { addedCorrections, advancesDerivedGate, type SiteGraphStore } from "@cloudhal/core-ts";
import { hasExpiryRules } from "@cloudhal/core-ts/fields";
import type { StoredReleaseItem } from "@cloudhal/schedules";
import { nodeVersion } from "./schedules.ts";

type Items = readonly Pick<StoredReleaseItem, "item" | "deps">[];

/** The items as the low-risk check sees them (§10.3). */
export function releaseRisk(
  items: Items,
  corrects: ReadonlySet<string> = new Set(),
  expires: ReadonlySet<string> = new Set(),
) {
  return items.map(
    (p): ReleaseItemRisk => ({
      kind: p.item.kind,
      nodeId: p.item.nodeId,
      nodeKind: p.item.nodeKind,
      live: p.item.base !== undefined,
      deps: p.deps,
      ...(corrects.has(p.item.nodeId) ? { corrects: true } : {}),
      ...(expires.has(p.item.nodeId) ? { expires: true } : {}),
    }),
  );
}

/** A live article item's two versions: the one live now and the one the release publishes. */
async function versions(graph: SiteGraphStore, item: StoredReleaseItem["item"]) {
  if (item.kind !== "set" || item.nodeKind !== "contentEntry" || !item.base) return undefined;
  const ref = { id: item.nodeId, kind: item.nodeKind };
  const after = await nodeVersion<ContentEntry>(graph, { ...ref, ...item.target });
  const before = await nodeVersion<ContentEntry>(graph, { ...ref, ...item.base });
  return after && before ? { before, after } : undefined;
}

/** RFC-0019 §2.4: the release's articles whose target adds a correction to the live version. */
export async function releaseCorrections(
  graph: SiteGraphStore,
  items: readonly Pick<StoredReleaseItem, "item">[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const { item } of items) {
    if (item.kind !== "set" || item.nodeKind !== "contentEntry") continue;
    const ref = { id: item.nodeId, kind: item.nodeKind };
    const after = await nodeVersion<ContentEntry>(graph, { ...ref, ...item.target });
    if (!after?.corrections?.length) continue;
    const before = item.base
      ? await nodeVersion<ContentEntry>(graph, { ...ref, ...item.base })
      : undefined;
    if (addedCorrections(before, after).length > 0) out.add(item.nodeId);
  }
  return out;
}

/**
 * RFC-0042 §3.5: the release's live articles whose target adds a derived gate or moves it
 * earlier, under the site's current rules (a release that changes the rules changes the site,
 * which is never low risk anyway).
 */
export async function releaseExpiries(
  graph: SiteGraphStore,
  items: readonly Pick<StoredReleaseItem, "item">[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const { item } of items) {
    const v = await versions(graph, item);
    if (!v) continue;
    const site = await graph.getSite(v.after.siteId);
    if (!site || !hasExpiryRules(site)) continue;
    const group = v.after.translation?.group;
    const original = group && group !== v.after.id ? await graph.getContentEntry(group) : undefined;
    const side = (entry: ContentEntry) => ({ site, entry, original });
    if (advancesDerivedGate(side(v.before), side(v.after))) out.add(item.nodeId);
  }
  return out;
}

/** Every fact the low-risk check of a release needs, read from the graph. */
export async function releaseRiskFor(
  graph: SiteGraphStore,
  items: Items,
): Promise<ReleaseItemRisk[]> {
  return releaseRisk(
    items,
    await releaseCorrections(graph, items),
    await releaseExpiries(graph, items),
  );
}
