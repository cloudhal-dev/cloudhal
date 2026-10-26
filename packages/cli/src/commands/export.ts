/**
 * `cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]` (RFC-0039 §2,
 * rollout step 2): one site of the local project as a `.cloudhal` file, its content graph,
 * snapshots, the node bodies they reference, its media and its takedown ledger.
 *
 * - **Site:** the project's (`cloudhal.json` `siteId`), or with `--site` another one listed in
 *   `sites`; any other id is refused before the store is opened.
 * - **File:** `<site-slug>-<YYYYMMDD>.cloudhal` in the current folder unless `--out` names one;
 *   the date is that of the archive's `createdAt`. The default name says only the site and a day,
 *   and the same day can hold other content (a later edit that day, another flag, or a deletion,
 *   which moves no timestamp), so a file already there is replaced only by the same archive (its
 *   manifest, which pins every file's SHA-256, is the new one's); any other is refused, and
 *   `--out` naming it replaces it. A file is replaced only once the new one is complete
 *   (`writeArchiveFile` writes a temporary file beside it and renames it over): a failed or
 *   interrupted (Ctrl-C, SIGTERM) export leaves no file and an existing one unchanged.
 * - **createdAt** (invariant 7 as amended): the newest timestamp among the exported rows, never
 *   the clock, so an unchanged site exports to the same name and, with the same CLI and Node/zlib
 *   build, the same bytes. Deleting content stamps no remaining row, so it alone does not move the
 *   date; the next edit or snapshot does.
 * - **`--latest-only`:** only the published and the latest snapshot (`latestSnapshot`, what
 *   `cloudhal build` falls back to), only the blobs they reference, and only the media the current
 *   nodes and those snapshots need; the takedown ledger still travels. Refused while an RFC-0041
 *   field operation is unfinished: it needs its `before` snapshot.
 * - **`--no-media`:** the graph only; the manifest says `mediaOmitted`.
 * - **Never in an archive (§4):** user accounts, sessions, roles, agent keys, comments, readers,
 *   analytics, the audit log, scheduled releases, automations, schedule runs, pending approvals,
 *   open edit suggestions, deployment secrets and webhook credentials. None of their tables or
 *   files are read. The graph does name who made each change, as its contracts require:
 *   snapshots, uploads, block edits, reviews, term proposals and takedowns carry user and agent
 *   ids (most with display names), entries their authors and the project its owner's id.
 *
 * A media file whose local bytes are missing, or differ from its asset's size and SHA-256, stops
 * the export (`cloudhal media verify` finds them). Known limitation: the graph rows are held in
 * memory (`exportSite` returns a whole bundle); media bytes stream from the blob store.
 */
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Site } from "@cloudhal/core-contracts";
import { type BundleMedia, exportSite, mediaBlobKey, slugify } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import type { BlobStore } from "@cloudhal/storage";
import {
  type ArchiveContent,
  ArchiveError,
  archiveStream,
  readArchive,
  type SiteArchiveManifest,
  writeArchiveFile,
} from "../archive/index.ts";
import { cliVersion } from "../assets.ts";
import { type ProjectConfig, readProjectConfig } from "../config.ts";
import { bundleToArchive, latestOnly } from "./archive-bundle.ts";

export interface ExportArchiveOptions {
  readonly projectDir: string;
  /** The file to write, relative to `projectDir`; default `<site-slug>-<YYYYMMDD>.cloudhal`. */
  readonly out?: string | undefined;
  /** A site listed in `cloudhal.json` `sites`; default the project's `siteId`. */
  readonly siteId?: string | undefined;
  readonly noMedia?: boolean | undefined;
  readonly latestOnly?: boolean | undefined;
  /** Aborts the export (the command's Ctrl-C and SIGTERM): no file is written. */
  readonly signal?: AbortSignal | undefined;
}

export interface ExportArchiveResult {
  /** Absolute path of the archive. */
  readonly file: string;
  readonly bytes: number;
  /** A file was there before and has been replaced. */
  readonly replaced: boolean;
  readonly manifest: SiteArchiveManifest;
  readonly slug: string;
  /** Takedown ledger rows. */
  readonly purged: number;
  readonly latestOnly: boolean;
}

/** RFC-0039 §4: what an archive never contains. */
export const NEVER_IN_ARCHIVE: readonly string[] = [
  "user accounts",
  "sessions",
  "roles",
  "agent keys",
  "comments",
  "readers",
  "analytics",
  "the audit log",
  "scheduled releases",
  "automations",
  "schedule runs",
  "pending approvals",
  "open edit suggestions",
  "deployment secrets",
  "webhook credentials",
];

/** What the graph does carry about people (the summary says so beside §4's list). */
export const NAMED_IN_ARCHIVE =
  "who made each change: snapshots, uploads, block edits, reviews and takedowns name their user or agent (by id, most also by display name)";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `<site-slug>-<YYYYMMDD>.cloudhal`, dated by `createdAt` in UTC. The slug is the site's (always
 * valid in the store); then the slug of its name; then its id.
 */
export function archiveFileName(
  site: Pick<Site, "id" | "slug" | "name">,
  createdAt: string,
): string {
  const base =
    [site.slug, slugify(site.name)].find((s) => SLUG.test(s) && s.length <= 128) ??
    (SAFE_ID.test(site.id) ? site.id : "site");
  const date = new Date(createdAt).toISOString().slice(0, 10).replaceAll("-", "");
  return `${base}-${date}.cloudhal`;
}

function missingMedia(sha256: string): Error {
  return new Error(
    `local media ${sha256} is missing; run \`cloudhal media verify\` (or export with --no-media)`,
  );
}

/** One media file's bytes: streamed when the store can, read whole otherwise. */
async function* mediaBytes(
  blobs: BlobStore,
  siteId: string,
  sha256: string,
): AsyncGenerator<Uint8Array, void, undefined> {
  const key = mediaBlobKey(siteId, sha256);
  if (!blobs.getStream) {
    const bytes = await blobs.get(key);
    if (!bytes) throw missingMedia(sha256);
    yield bytes;
    return;
  }
  const stream = await blobs.getStream(key);
  if (!stream) throw missingMedia(sha256);
  const reader = stream.body.getReader();
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) yield read.value;
  } finally {
    // Stopped early (the writer refused the file): closes the file it reads.
    await reader.cancel().catch(() => {});
  }
}

/** The media sources' bytes, from the site's local blob store. */
export function localMediaReader(
  blobs: BlobStore,
  siteId: string,
): (m: BundleMedia) => AsyncIterable<Uint8Array> {
  return (m) => mediaBytes(blobs, siteId, m.sha256);
}

/** The site to export: the project's, or one listed in `sites`. Checked before any I/O. */
function chooseSite(cfg: ProjectConfig, requested: string | undefined): string {
  const siteId = requested ?? cfg.siteId;
  const allowed = cfg.sites ?? [cfg.siteId];
  if (!allowed.includes(siteId))
    throw new Error(
      `site ${siteId} is not listed in cloudhal.json \`sites\` (this project's sites: ${allowed.join(", ")})`,
    );
  return siteId;
}

/** Every media file the archive will hold must be in the local blob store; one message for all. */
async function assertLocalMedia(
  blobs: BlobStore,
  siteId: string,
  media: readonly BundleMedia[],
): Promise<void> {
  const missing: string[] = [];
  for (const m of media)
    if (!(await blobs.head(mediaBlobKey(siteId, m.sha256)))) missing.push(m.sha256);
  const [first] = missing;
  if (first === undefined) return;
  if (missing.length === 1) throw missingMedia(first);
  throw new Error(
    `local media ${first} and ${missing.length - 1} more are missing; run \`cloudhal media verify\` (or export with --no-media)`,
  );
}

/** The archive's path (its folder created), and whether a file is there already. */
async function outputFile(
  projectDir: string,
  out: string | undefined,
  name: string,
): Promise<{ file: string; replaced: boolean }> {
  const shown = out ?? name;
  if (shown === "") throw new Error("--out needs a file name");
  if (shown.endsWith("/") || shown.endsWith(path.sep))
    throw new Error(`--out ${shown} is a directory; name a file`);
  const file = path.resolve(projectDir, shown);
  const existing = await stat(file).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return undefined;
    throw e;
  });
  if (existing?.isDirectory()) throw new Error(`--out ${shown} is a directory; name a file`);
  await mkdir(path.dirname(file), { recursive: true });
  return { file, replaced: existing !== undefined };
}

/** The manifest of the archive at `file`; undefined when it is not one (or does not read as one). */
async function manifestAt(file: string): Promise<SiteArchiveManifest | undefined> {
  const stream = createReadStream(file);
  const items = readArchive(stream);
  try {
    const first = await items.next();
    return !first.done && first.value.type === "manifest" ? first.value.manifest : undefined;
  } catch {
    return undefined;
  } finally {
    await items.return(undefined).catch(() => {});
    stream.destroy();
  }
}

/**
 * A file at the default name is replaced only by the same archive: its manifest lists the same
 * files with the same SHA-256s, so its tar is byte for byte the new one's (only another zlib
 * build's gzip bytes can differ). Anything else stays; `--out` naming it replaces it.
 */
async function keepOtherArchive(
  file: string,
  name: string,
  content: ArchiveContent,
): Promise<void> {
  const existing = await manifestAt(file);
  const plain = (m: SiteArchiveManifest) => JSON.parse(JSON.stringify(m)) as unknown;
  if (existing && isDeepStrictEqual(plain(existing), plain(archiveStream(content).manifest)))
    return;
  throw new Error(
    `${name} already exists and is not this archive (other content or flags, or another CLI version); pass --out ${name} to replace it, or --out <file> to keep both`,
  );
}

/** `writeArchiveFile`, with a damaged local media file named as such. */
async function writeArchive(
  file: string,
  content: ArchiveContent,
  signal: AbortSignal | undefined,
): Promise<SiteArchiveManifest> {
  try {
    return await writeArchiveFile(file, content, { signal });
  } catch (e) {
    if (e instanceof ArchiveError && e.code === "damaged" && e.path?.startsWith("media/"))
      throw new ArchiveError(
        "damaged",
        `${e.message}; the local copy is damaged: run \`cloudhal media verify\` (or export with --no-media)`,
        { path: e.path, cause: e },
      );
    throw e;
  }
}

/** Writes the archive; see the module doc for every rule. */
export async function exportArchive(options: ExportArchiveOptions): Promise<ExportArchiveResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const siteId = chooseSite(cfg, options.siteId);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  // Open until the archive is written: the media are opened as the writer reaches them.
  try {
    const site = await local.store.getSite(siteId);
    if (!site)
      throw new Error(
        `site ${siteId} is listed in cloudhal.json but the local store (${cfg.dataDir}) has no such site`,
      );
    const full = await exportSite(local, siteId);
    const bundle = options.latestOnly
      ? latestOnly(full, (await local.store.latestSnapshot(siteId))?.id)
      : full;
    if (!options.noMedia) await assertLocalMedia(local.blobs, siteId, bundle.media ?? []);
    const content = bundleToArchive(bundle, {
      createdBy: await cliVersion(),
      mediaOmitted: options.noMedia === true,
      openMedia: localMediaReader(local.blobs, siteId),
    });
    const name = archiveFileName(site, content.createdAt);
    const { file, replaced } = await outputFile(options.projectDir, options.out, name);
    if (replaced && options.out === undefined) await keepOtherArchive(file, name, content);
    const manifest = await writeArchive(file, content, options.signal);
    return {
      file,
      bytes: (await stat(file)).size,
      replaced,
      manifest,
      slug: site.slug,
      purged: bundle.purged?.length ?? 0,
      latestOnly: options.latestOnly === true,
    };
  } finally {
    await local.close();
  }
}

/** 1536 → `1.5 KiB` (also `cloudhal import`'s sizes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * The summary `cloudhal export` prints: paths, sizes, counts, the site id and slug, and what an
 * archive never holds. Never the site name or any row content.
 */
export function describeExport(result: ExportArchiveResult, projectDir: string): string[] {
  const { manifest } = result;
  const { counts } = manifest;
  const relative = path.relative(projectDir, result.file);
  const shown =
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative
      : result.file;
  const media = manifest.mediaOmitted
    ? ""
    : `, ${counts.media} media file(s) (${formatBytes(counts.mediaBytes)})`;
  const lines = [
    `wrote ${shown} (${formatBytes(result.bytes)}${result.replaced ? "; replaced the existing file" : ""})`,
    `site ${manifest.siteId} (${result.slug}): ${counts.nodes} node(s), ${counts.snapshots} snapshot(s), ${counts.blobs} blob(s)${media}${result.purged > 0 ? `, ${result.purged} taken down` : ""}`,
  ];
  if (manifest.mediaOmitted)
    lines.push("media left out (--no-media): an import needs the media from elsewhere");
  if (result.latestOnly)
    lines.push("history: the published and the latest snapshot only (--latest-only)");
  lines.push(`not in the archive (RFC-0039 §4): ${NEVER_IN_ARCHIVE.join(", ")}`);
  lines.push(`in the archive: ${NAMED_IN_ARCHIVE}`);
  return lines;
}
