/**
 * Data migration `media import-urls` (RFC-0004, Compatibility & migration): copies images that
 * pages, entries and terms link by URL into the media library and points the references at the new
 * assets. Optional, never automatic, resumable (only ImageRefs without `assetId` are touched) and
 * revertible. Snapshots record the run: `before media-import` (its id is the migration id) and
 * `media-import`, both with `metadata["cloudhal.migration"] = "0004-media"`. Nothing goes live
 * until a person publishes; imported assets are "structure" even in `auto` mode.
 *
 * Fetching is the caller's (`load`): the CLI reads https URLs through the SSRF-safe fetcher and
 * site paths from the project's `public/` directory, confined to it.
 */
import type {
  Actor,
  Asset,
  ContentEntry,
  ImageRef,
  Page,
  Snapshot,
  Term,
} from "@cloudhal/core-contracts";
import { InvariantError, NotFoundError } from "./errors.ts";
import { imageSlots, markdownSlots } from "./media/refs.ts";
import type { SiteGraphStore } from "./store.ts";

export const MEDIA_MIGRATION = "0004-media";
const KEY = "cloudhal.migration";
const KEY_ID = "cloudhal.migration.id";
const KEY_PHASE = "cloudhal.migration.phase";
const IMPORTER = "import-urls";
const SYSTEM: Actor = { kind: "system", id: "sys_mediaimport" };

/** What a source reference turned into: bytes to import, or why it was skipped. */
export type LoadedSource =
  | { readonly bytes: Uint8Array; readonly contentType?: string | undefined }
  | { readonly skip: string };

export interface MediaImportOptions {
  readonly dryRun?: boolean;
  /** Also `![alt](https://…)` images in markdown bodies. */
  readonly includeMarkdown?: boolean;
  /** Reads a source: an absolute URL or a site path (`/images/x.jpg`). */
  readonly load: (from: string) => Promise<LoadedSource>;
  readonly actor?: Actor;
}

export interface MediaImportResult {
  /** Id of the `before media-import` snapshot; pass it to `revertMediaImport`. Empty on a dry run. */
  readonly migrationId: string;
  readonly dryRun: boolean;
  /** Distinct sources found, in order. */
  readonly sources: string[];
  /** Assets created (or reused, when the site already had the bytes). */
  readonly assets: { from: string; assetId: string; existing: boolean }[];
  /** Nodes rewritten (or that would be). */
  readonly nodes: number;
  readonly skipped: { from: string; reason: string }[];
  readonly afterSnapshotId?: string;
}

export interface MediaRevertResult {
  readonly migrationId: string;
  readonly restored: number;
  /** Nodes edited since the migration, left alone. */
  readonly edited: string[];
  readonly assetsDeleted: number;
  readonly snapshotId: string;
}

type Kind = "page" | "contentEntry" | "term";
type AnyNode = Page | ContentEntry | Term;

/** Markdown images with absolute https/http URLs: `![alt](url "title")`. */
const MD_IMAGE = /!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)(\s+"[^"\n]*")?\)/g;

async function nodesOf(store: SiteGraphStore, siteId: string): Promise<[Kind, AnyNode][]> {
  return [
    ...(await store.listPages(siteId)).map((n) => ["page", n] as [Kind, AnyNode]),
    ...(await store.listContentEntries(siteId)).map((n) => ["contentEntry", n] as [Kind, AnyNode]),
    ...(await store.listTerms(siteId)).map((n) => ["term", n] as [Kind, AnyNode]),
  ];
}

function legacyRefs(kind: Kind, node: AnyNode): ImageRef[] {
  return imageSlots(kind, node)
    .map((s) => s.ref)
    .filter((r) => !r.assetId && r.src && !r.src.startsWith("data:"));
}

function markdownUrls(kind: Kind, node: AnyNode): { url: string; alt: string }[] {
  return markdownSlots(kind, node).flatMap((slot) =>
    [...slot.text.matchAll(MD_IMAGE)].map((m) => ({ url: m[2] as string, alt: m[1] as string })),
  );
}

async function write(store: SiteGraphStore, kind: Kind, node: AnyNode): Promise<void> {
  if (kind === "page") await store.updatePage(node as Page);
  else if (kind === "contentEntry") await store.updateContentEntry(node as ContentEntry);
  else await store.updateTerm(node as Term);
}

export async function importMediaUrls(
  store: SiteGraphStore,
  siteId: string,
  options: MediaImportOptions,
): Promise<MediaImportResult> {
  const site = await store.getSite(siteId);
  if (!site) throw new NotFoundError("site", siteId);
  const actor = options.actor ?? SYSTEM;
  const dryRun = options.dryRun === true;
  const nodes = await nodesOf(store, siteId);
  // 1–2. Collect references and their first non-empty alt text.
  const firstAlt = new Map<string, string>();
  const touched = new Set<string>();
  for (const [kind, node] of nodes) {
    for (const ref of legacyRefs(kind, node)) {
      if (!firstAlt.has(ref.src) || (!firstAlt.get(ref.src) && ref.alt))
        firstAlt.set(ref.src, ref.alt ?? "");
      touched.add(node.id);
    }
    if (options.includeMarkdown)
      for (const m of markdownUrls(kind, node)) {
        if (!firstAlt.has(m.url) || (!firstAlt.get(m.url) && m.alt)) firstAlt.set(m.url, m.alt);
        touched.add(node.id);
      }
  }
  const sources = [...firstAlt.keys()];
  if (dryRun)
    return { migrationId: "", dryRun, sources, assets: [], nodes: touched.size, skipped: [] };

  const before = await store.createSnapshot(siteId, {
    actor,
    reason: "manual",
    label: "before media-import",
    metadata: { [KEY]: MEDIA_MIGRATION, [KEY_PHASE]: "before" },
  });
  const migrationId = before.id;
  // 3–4. Resolve sources into assets, deduplicated by content.
  const assets: MediaImportResult["assets"] = [];
  const skipped: MediaImportResult["skipped"] = [];
  const byFrom = new Map<string, Asset>();
  for (const from of sources) {
    let loaded: LoadedSource;
    try {
      loaded = await options.load(from);
    } catch (e) {
      skipped.push({
        from,
        reason: e instanceof InvariantError ? `${e.code}: ${e.message}` : String(e),
      });
      continue;
    }
    if ("skip" in loaded) {
      skipped.push({ from, reason: loaded.skip });
      continue;
    }
    const alt = firstAlt.get(from);
    try {
      const r = await store.ingestAsset({
        siteId,
        bytes: loaded.bytes,
        declaredType: loaded.contentType,
        filename: decodeURIComponent(from.split(/[?#]/)[0]?.split("/").pop() ?? "") || undefined,
        uploadedBy: actor,
        source: { kind: "import", from: from.slice(0, 2048), importer: IMPORTER },
        fields: {
          ...(alt ? { alt: { [site.defaultLocale]: alt } } : {}),
          metadata: { [KEY]: MEDIA_MIGRATION, [KEY_ID]: migrationId },
        },
      });
      byFrom.set(from, r.asset);
      assets.push({ from, assetId: r.asset.id, existing: r.existing });
    } catch (e) {
      skipped.push({
        from,
        reason: e instanceof InvariantError ? `${e.code}: ${e.message}` : String(e),
      });
    }
  }
  // 5. Point references at the assets (idempotent: only refs without assetId are touched).
  let rewritten = 0;
  for (const [kind, stale] of nodes) {
    if (!touched.has(stale.id)) continue;
    const current = (
      kind === "page"
        ? await store.getPage(stale.id)
        : kind === "contentEntry"
          ? await store.getContentEntry(stale.id)
          : await store.getTerm(stale.id)
    ) as AnyNode | undefined;
    if (!current) continue;
    const next = structuredClone(current);
    let changed = false;
    for (const slot of imageSlots(kind, next)) {
      const asset = slot.ref.assetId ? undefined : byFrom.get(slot.ref.src);
      if (!asset) continue;
      slot.set({ ...slot.ref, assetId: asset.id });
      changed = true;
    }
    if (options.includeMarkdown) {
      const replace = (text: string) =>
        text.replace(MD_IMAGE, (whole, alt: string, url: string, title?: string) => {
          const asset = byFrom.get(url);
          if (!asset) return whole;
          changed = true;
          return `![${alt}](asset:${asset.id}${title ?? ""})`;
        });
      if (kind === "contentEntry") {
        const e = next as ContentEntry;
        if (e.body.format === "markdown") e.body = { ...e.body, value: replace(e.body.value) };
      } else if (kind === "page") {
        for (const s of (next as Page).sections)
          if (s.kind === "richText" && s.format === "markdown") s.body = replace(s.body);
      } else {
        for (const label of Object.values((next as Term).labels))
          if (label?.description) label.description = replace(label.description);
      }
    }
    if (!changed) continue;
    try {
      await write(store, kind, next);
      rewritten++;
    } catch (e) {
      skipped.push({ from: stale.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  // 6. The after snapshot. Nothing is live until a person publishes.
  const after = await store.createSnapshot(siteId, {
    actor,
    reason: "manual",
    label: "media-import",
    metadata: { [KEY]: MEDIA_MIGRATION, [KEY_ID]: migrationId, [KEY_PHASE]: "after" },
  });
  return {
    migrationId,
    dryRun,
    sources,
    assets,
    nodes: rewritten,
    skipped,
    afterSnapshotId: after.id,
  };
}

/**
 * Restores ImageRefs and bodies from the before-snapshot for nodes still exactly as the migration
 * left them, reports nodes edited since, then deletes the migration's assets nothing uses any more
 * (garbage collection reclaims their bytes after the grace period).
 */
export async function revertMediaImport(
  store: SiteGraphStore,
  siteId: string,
  migrationId: string,
  options: { actor?: Actor } = {},
): Promise<MediaRevertResult> {
  const before = await store.getSnapshot(migrationId);
  if (
    !before ||
    before.siteId !== siteId ||
    before.metadata?.[KEY] !== MEDIA_MIGRATION ||
    before.metadata?.[KEY_PHASE] !== "before"
  )
    throw new NotFoundError("media-import migration", migrationId);
  const after = (await store.listSnapshots(siteId, 1000)).find(
    (s: Snapshot) => s.metadata?.[KEY_ID] === migrationId && s.metadata?.[KEY_PHASE] === "after",
  );
  if (!after) throw new Error(`migration ${migrationId} did not finish; nothing to revert`);
  const current = new Map((await store.currentNodeRefs(siteId)).map((r) => [r.id, r]));
  const beforeRefs = new Map(before.nodes.map((r) => [r.id, r]));
  const edited: string[] = [];
  let restored = 0;
  for (const ref of after.nodes) {
    if (ref.kind !== "page" && ref.kind !== "contentEntry" && ref.kind !== "term") continue;
    const old = beforeRefs.get(ref.id);
    if (!old || old.hash === ref.hash) continue;
    const now = current.get(ref.id);
    if (!now) continue;
    if (now.hash !== ref.hash) {
      edited.push(ref.id);
      continue;
    }
    const prev = await store.readSnapshotNode<AnyNode>(old);
    try {
      await write(store, ref.kind, { ...prev, rev: now.rev } as AnyNode);
      restored++;
    } catch {
      edited.push(ref.id);
    }
  }
  let assetsDeleted = 0;
  for (const asset of (await store.listAssets(siteId, { unused: true, limit: 200 })).assets) {
    if (asset.metadata?.[KEY_ID] !== migrationId) continue;
    try {
      await store.deleteAsset(asset);
      assetsDeleted++;
    } catch {
      // used again since, or changed: keep it
    }
  }
  const snapshot = await store.createSnapshot(siteId, {
    actor: options.actor ?? SYSTEM,
    reason: "manual",
    label: "revert media-import",
    metadata: { [KEY]: MEDIA_MIGRATION, [KEY_ID]: migrationId, [KEY_PHASE]: "revert" },
  });
  return { migrationId, restored, edited, assetsDeleted, snapshotId: snapshot.id };
}
