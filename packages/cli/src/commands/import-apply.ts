/**
 * `cloudhal import`'s writes, once the archive (or, for `--revert`, the snapshot) was verified and
 * planned (RFC-0039 §2). For a `--replace` or `--revert` of a site this project holds:
 *
 * 1. a `before` snapshot of the current graph (invariant 6: what `cloudhal import --revert` brings
 *    back). A run that stopped after taking it left it as the latest snapshot: it is reused when it
 *    still holds the current graph, so a second run takes no duplicate. A site the plan found
 *    unchanged gets none, so its nodes are checked again here: the plan can be minutes old (pass 2
 *    copies media), and nodes another process wrote since are refused, never replaced unsaved;
 * 2. `importSite`, keeping the bundle's published snapshot (`published: "source"`, as `cloudhal
 *    pull` does), its node set one atomic batch;
 * 3. an `after` snapshot of the result, so the latest snapshot (what `cloudhal build` renders for a
 *    site never published and `export --latest-only` keeps) is the imported graph, not the one it
 *    replaced. A run that stopped after the node batch took it next time: the nodes are then
 *    unchanged, and the latest snapshot is a `before` of the same import that no longer holds them.
 *
 * Then the search index is brought to the live snapshot. No signal is honoured from here.
 */
import type { Actor, NodeRef, Snapshot } from "@cloudhal/core-contracts";
import { type CopySiteResult, importSite, type SiteBundle } from "@cloudhal/core-ts";
import type { LocalStore } from "@cloudhal/core-ts/local";
import { ImportRefusal } from "./import-checks.ts";

/** Who the CLI's snapshots name, as `cloudhal snapshot`'s do. */
export const CLI_ACTOR: Actor = { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" };

/** A snapshot's label and metadata (`cloudhal.import.*` keys). */
export interface SnapshotNote {
  readonly label: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/** The snapshots taken around one import's write. */
export interface ImportBracket {
  readonly before: SnapshotNote;
  after(beforeId: string): SnapshotNote;
}

export interface ApplyImportOptions {
  readonly mode: "bootstrap" | "replace";
  /** A replace of a site this project holds: the snapshots around the write. */
  readonly bracket?: ImportBracket | undefined;
  /** The plan found the site's nodes as the bundle has them (checked again before the write). */
  readonly unchanged?: boolean | undefined;
  /** The `before` snapshot exists (taken or reused): failure messages name it from here. */
  readonly onBefore?: ((snapshot: Snapshot) => void) | undefined;
}

export interface AppliedImport {
  readonly result: CopySiteResult;
  readonly before?: Snapshot | undefined;
  readonly after?: Snapshot | undefined;
  readonly searchRefreshed: boolean;
}

const sig = (refs: readonly Pick<NodeRef, "id" | "rev" | "hash">[]) =>
  refs
    .map((r) => `${r.id}@${r.rev}:${r.hash}`)
    .sort()
    .join("\n");

/** `snapshot` is a `before` snapshot of this very import (its label and every metadata value). */
function isBefore(snapshot: Snapshot, note: SnapshotNote): boolean {
  const meta = snapshot.metadata ?? {};
  return (
    snapshot.label === note.label &&
    Object.entries(note.metadata).every(([k, v]) => Object.hasOwn(meta, k) && meta[k] === v)
  );
}

function take(local: LocalStore, siteId: string, note: SnapshotNote): Promise<Snapshot> {
  return local.store.createSnapshot(siteId, {
    actor: CLI_ACTOR,
    reason: "import",
    label: note.label,
    metadata: { ...note.metadata },
  });
}

/**
 * The `before` snapshot this write needs: a new one, the one a stopped run took (it still holds
 * the current graph), or, when the nodes are still the bundle's, the stopped run's (its `after`
 * is missing), else none. Nodes the plan found unchanged that differ now are refused.
 */
async function beforeOf(
  local: LocalStore,
  bundle: SiteBundle,
  options: ApplyImportOptions,
): Promise<{ snapshot?: Snapshot; take: boolean }> {
  const { bracket } = options;
  if (!bracket) return { take: false };
  const { siteId } = bundle;
  const latest = await local.store.latestSnapshot(siteId);
  const stopped = latest && isBefore(latest, bracket.before) ? latest : undefined;
  const current =
    stopped || options.unchanged ? sig(await local.store.currentNodeRefs(siteId)) : undefined;
  const holdsCurrent = stopped !== undefined && sig(stopped.nodes) === current;
  if (!options.unchanged) return holdsCurrent ? { snapshot: stopped, take: false } : { take: true };
  if (current !== sig(bundle.nodes))
    throw new ImportRefusal(
      `site ${siteId} changed after it was planned (another process wrote it); run it again`,
    );
  return stopped && !holdsCurrent ? { snapshot: stopped, take: false } : { take: false };
}

/**
 * The search index is behind the site's live snapshot (an import that stopped after the node set
 * landed never refreshed it).
 */
async function searchBehind(local: LocalStore, siteId: string): Promise<boolean> {
  try {
    const live = (await local.store.getSite(siteId))?.publishedSnapshotId;
    return live !== undefined && (await local.store.searchStatus(siteId))?.snapshotId !== live;
  } catch {
    return true;
  }
}

/** The snapshots, `importSite` and the search index, in that order (see the module doc). */
export async function applyImport(
  local: LocalStore,
  bundle: SiteBundle,
  options: ApplyImportOptions,
): Promise<AppliedImport> {
  const { siteId } = bundle;
  const found = await beforeOf(local, bundle, options);
  const before =
    found.take && options.bracket
      ? await take(local, siteId, options.bracket.before)
      : found.snapshot;
  if (before) options.onBefore?.(before);
  const result = await importSite(local, bundle, { mode: options.mode });
  const after =
    before && options.bracket
      ? await take(local, siteId, options.bracket.after(before.id))
      : undefined;
  let searchRefreshed = true;
  if (!result.nodes.unchanged || result.snapshots > 0 || (await searchBehind(local, siteId)))
    // RFC-0019 §3: an import leaves the index as it was; bring it to the live snapshot.
    searchRefreshed = await local.store.refreshSearch(siteId, { full: true }).then(
      () => true,
      () => false,
    );
  return { result, before, after, searchRefreshed };
}
