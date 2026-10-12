/**
 * `cloudhal media …` (RFC-0004): local media maintenance.
 *
 * - `import-urls [--dry-run] [--include-markdown] [--allow-host <h>]… | --revert <id>` copies images
 *   that pages, entries and terms link by URL into the media library. https URLs go through the
 *   SSRF-safe fetcher (resolved, checked and pinned on Node); site paths (`/images/x.jpg`) are read
 *   from the project's `public/` directory and must stay inside it; `http:` and anything else is
 *   skipped and reported. Revertible; nothing goes live until someone publishes.
 * - `verify [assetId]` recomputes the SHA-256 of stored blobs; for an external file it streams the
 *   URL (no size cap, this host only) and records a computed checksum.
 * - `gc [--dry-run]` collects unreferenced content older than 24 hours.
 */
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  importMediaUrls,
  type LoadedSource,
  type MediaImportResult,
  type MediaRevertResult,
  revertMediaImport,
} from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { type FetchTransport, MEDIA_LIMITS, MEDIA_TYPES, safeFetch } from "@cloudhal/core-ts/media";
import { nodeTransport } from "@cloudhal/core-ts/media-node";
import { readProjectConfig } from "../config.ts";

const PERSON = { kind: "human" as const, id: "user_localcli001", name: "cloudhal media" };

export interface MediaImportCliOptions {
  readonly projectDir: string;
  readonly dryRun?: boolean;
  readonly includeMarkdown?: boolean;
  readonly revert?: string;
  /** Hosts https sources may come from (`--allow-host`, repeatable); the site's list applies too. */
  readonly allowHosts?: readonly string[];
  /** Tests inject a transport (a fake origin); default: the pinning Node transport. */
  readonly transport?: FetchTransport;
}

/**
 * A site path read from `public/`, confined to it: the resolved real path must stay inside the
 * directory (no `..`, no symlink out of it).
 */
async function readPublic(projectDir: string, sitePath: string): Promise<LoadedSource> {
  const clean = decodeURIComponent(sitePath.split(/[?#]/)[0] ?? "");
  if (!clean.startsWith("/") || clean.includes("\0") || clean.includes("\\"))
    return { skip: "not a site path" };
  const root = await realpath(path.join(projectDir, "public")).catch(() => undefined);
  if (!root) return { skip: "the project has no public/ directory" };
  const file = path.resolve(root, `.${clean}`);
  const real = await realpath(file).catch(() => undefined);
  if (!real?.startsWith(`${root}${path.sep}`))
    return { skip: "not found in public/ (or outside it)" };
  return { bytes: new Uint8Array(await readFile(real)) };
}

export async function mediaImportUrls(
  options: MediaImportCliOptions,
): Promise<MediaImportResult | MediaRevertResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    if (options.revert)
      return await revertMediaImport(local.store, cfg.siteId, options.revert, { actor: PERSON });
    const site = await local.store.getSite(cfg.siteId);
    const siteHosts = (site?.metadata?.["cloudhal.media.allowHosts"] ?? "")
      .split(/[\s,]+/)
      .filter(Boolean);
    const allowHosts = [...(options.allowHosts ?? []), ...siteHosts];
    const transport = options.transport ?? nodeTransport();
    return await importMediaUrls(local.store, cfg.siteId, {
      actor: PERSON,
      ...(options.dryRun ? { dryRun: true } : {}),
      ...(options.includeMarkdown ? { includeMarkdown: true } : {}),
      load: async (from) => {
        if (from.startsWith("/") && !from.startsWith("//"))
          return readPublic(options.projectDir, from);
        if (!from.startsWith("https://"))
          return { skip: "only https URLs and site paths are imported" };
        const res = await safeFetch(from, {
          transport,
          maxBytes: MEDIA_LIMITS.fetchAsset,
          accept: Object.keys(MEDIA_TYPES).filter((t) => t.startsWith("image/")),
          ...(allowHosts.length ? { allowHosts } : {}),
          blockedHosts: (site?.domains ?? []).map((d) => d.hostname),
        });
        return { bytes: res.bytes, contentType: res.contentType };
      },
    });
  } finally {
    await local.close();
  }
}

export interface VerifyResult {
  readonly checked: number;
  readonly ok: string[];
  readonly problems: { assetId: string; problem: string }[];
}

export async function mediaVerify(options: {
  projectDir: string;
  assetId?: string;
  transport?: FetchTransport;
}): Promise<VerifyResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const store = local.store;
    const assets = options.assetId
      ? [await store.getAsset(options.assetId)].filter((a) => a?.siteId === cfg.siteId)
      : (await store.listAssets(cfg.siteId, { limit: 200 })).assets;
    if (options.assetId && assets.length === 0)
      throw new Error(`asset ${options.assetId} not found`);
    const ok: string[] = [];
    const problems: VerifyResult["problems"] = [];
    for (const asset of assets) {
      if (!asset) continue;
      if (asset.storage.kind === "blob") {
        const r = await store.verifyMediaBlob(cfg.siteId, asset.sha256);
        if (r === "ok") ok.push(asset.id);
        else
          problems.push({
            assetId: asset.id,
            problem: r === "missing" ? "bytes missing" : "SHA-256 mismatch",
          });
        continue;
      }
      // External: only when asked for by id (it downloads the whole file).
      if (!options.assetId) continue;
      const hash = createHash("sha256");
      const res = await safeFetch(asset.storage.url, {
        transport: options.transport ?? nodeTransport(),
        maxBytes: Number.MAX_SAFE_INTEGER,
        accept: [],
        totalTimeoutMs: 6 * 60 * 60 * 1000,
        onChunk: (c) => hash.update(c),
      });
      const sha256 = hash.digest("hex");
      await store.verifyExternalAsset(asset, { sha256, bytes: res.size });
      if (sha256 === asset.sha256) ok.push(asset.id);
      else
        problems.push({
          assetId: asset.id,
          problem: `declared ${asset.sha256}, computed ${sha256} (recorded)`,
        });
    }
    return { checked: ok.length + problems.length, ok, problems };
  } finally {
    await local.close();
  }
}

export async function mediaGc(options: { projectDir: string; dryRun?: boolean }) {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    return await local.store.collectMediaGarbage(cfg.siteId, {
      ...(options.dryRun ? { dryRun: true } : {}),
    });
  } finally {
    await local.close();
  }
}

/** Human-readable lines for a run. */
export function describeMediaImport(r: MediaImportResult | MediaRevertResult): string[] {
  if ("restored" in r)
    return [
      `reverted ${r.migrationId}: ${r.restored} node(s) restored, ${r.assetsDeleted} asset(s) deleted`,
      ...(r.edited.length ? [`left alone (edited since): ${r.edited.join(", ")}`] : []),
    ];
  return [
    r.dryRun
      ? `dry run: ${r.sources.length} source(s) in ${r.nodes} node(s)`
      : `imported ${r.assets.length} file(s) into ${r.nodes} node(s); migration id ${r.migrationId}`,
    ...r.sources.map((s) => `  ${s}`),
    ...r.skipped.map((s) => `skipped ${s.from}: ${s.reason}`),
    ...(r.dryRun ? [] : ["nothing is live until you publish; undo with --revert <migration id>"]),
  ];
}
