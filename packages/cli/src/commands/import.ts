/**
 * `cloudhal import <file> [--dry-run]` (RFC-0039 §2, rollout step 3): a `.cloudhal` file written by
 * `cloudhal export` into this project, in bootstrap mode, the site's id kept (invariant 1).
 *
 * - **Site:** the archive's must be `cloudhal.json`'s `siteId` or listed in `sites`, checked as soon
 *   as the manifest is read. Another id is refused, naming both: importing another site (and
 *   switching `siteId`) belongs to `--replace`, not available yet.
 * - **Bootstrap:** the project must not hold the site yet, or hold exactly the archive's nodes; the
 *   snapshots, node bodies and media it lacks are added. A site whose nodes differ is refused.
 * - **Two passes over the file** (invariants 3 and 6). The first reads and verifies the whole
 *   archive (every file's size and SHA-256, every row; media bodies are hashed, not kept) and plans
 *   the import against the local store (`planImport`), so every refusal comes before any write: a
 *   damaged or edited file, invalid rows or node bodies (precompiled validators, invariant 2), a
 *   conflict, media this project has taken down (invariant 5), media a `--no-media` archive lacks.
 *   The second runs only when media must be copied: it reads the file again, requires the same
 *   manifest (which pins every file's SHA-256, so the bundle is the one planned) and writes only
 *   the planned media into the blob store, which verifies them again. Then `importSite` applies the
 *   graph, keeping the archive's published snapshot as `cloudhal pull` does, and the search index
 *   is refreshed. A local media file of another size counts as damaged: a full archive replaces
 *   it, a `--no-media` one is refused. Local copies of content the archive's ledger took down are
 *   deleted, and the summary says so.
 * - **No store yet:** planning runs on an empty store in memory, so a refusal or a dry run creates
 *   no `.cloudhal/`; media are copied before `data.db` exists.
 * - **`--dry-run`:** prints the manifest and the plan and writes nothing: no blobs, rows, config or
 *   search index. Opening an existing store applies pending migrations, as every command does.
 * - **Ctrl-C, SIGTERM** stop the import before `importSite` runs (between the passes or between
 *   media files); from there it finishes, its node set being one atomic batch. Media already
 *   copied stay in the blob store, unreferenced: content-addressed, the next import reuses them
 *   (`cloudhal media gc` only sees media with a ledger row). A hard kill can leave a temporary
 *   file in `blobs/.tmp`.
 *
 * Known limitations: the graph rows are held in memory (one bundle at a time, as for export); a
 * disk error while `importSite` writes can leave node bodies, snapshots or the media ledger
 * without the rest, as for `pull`: the message then says the import stopped partway, and running
 * it again completes it (and refreshes a search index left behind the live snapshot).
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { addAbortSignal } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import {
  type CopySiteResult,
  type ImportPlan,
  importSite,
  planImport,
  type SiteBundle,
} from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { type ArchiveItem, readArchive, type SiteArchiveManifest } from "../archive/index.ts";
import { type ProjectConfig, readProjectConfig } from "../config.ts";
import { isRecord } from "./archive-bundle.ts";
import { type ArchiveMediaItem, bundleFromArchive } from "./archive-reassemble.ts";
import { formatBytes } from "./export.ts";
import {
  bootstrapRefusals,
  copiedNote,
  displayText,
  ImportRefusal,
  importFailure,
  mediaFolder,
  siteRefusal,
} from "./import-checks.ts";
import { writeMedia } from "./import-media.ts";

export interface ImportArchiveOptions {
  readonly projectDir: string;
  /** The `.cloudhal` file, relative to `projectDir`. */
  readonly file: string;
  /** Verify and plan only; write nothing. */
  readonly dryRun?: boolean | undefined;
  /** Stops the import before the graph is written (the command's Ctrl-C and SIGTERM). */
  readonly signal?: AbortSignal | undefined;
  /** Progress lines (the command writes them to stderr). */
  readonly log?: ((line: string) => void) | undefined;
}

export interface ImportArchiveResult {
  /** The file as the user named it. */
  readonly file: string;
  readonly manifest: SiteArchiveManifest;
  readonly dryRun: boolean;
  /** The archive's site, as its site node says (untrusted until planned: printed cleaned). */
  readonly site: {
    readonly id: string;
    readonly slug?: string | undefined;
    readonly locale?: string | undefined;
    readonly projectId?: string | undefined;
    /** It is `cloudhal.json`'s `siteId` or listed in `sites`. */
    readonly listed: boolean;
  };
  /** The project had no local store (`data.db`) before. */
  readonly newStore: boolean;
  /** The media the archive's graph needs, whether or not it holds them. */
  readonly mediaNeeded: { readonly files: number; readonly bytes: number };
  /** Absent when the site was refused before planning. */
  readonly plan?: ImportPlan | undefined;
  /** Why the import is refused (a dry run reports them; an import throws the first). */
  readonly refusals: readonly string[];
  readonly imported?:
    | {
        readonly nodes: CopySiteResult["nodes"];
        readonly snapshots: number;
        readonly blobs: number;
        readonly media: {
          readonly copied: number;
          readonly bytes: number;
          readonly present: number;
        };
        /** The archive's takedowns. */
        readonly takedowns: number;
        /** Local media files deleted because the archive's ledger took their content down. */
        readonly takedownsDeleted: number;
        readonly searchRefreshed: boolean;
      }
    | undefined;
}

/** Ctrl-C or SIGTERM before the graph was written. */
export class ImportInterruptedError extends Error {
  override readonly name = "ImportInterruptedError";
  readonly mediaCopied: number;
  readonly mediaDir: string;
  constructor(mediaCopied: number, mediaDir: string) {
    super(
      `import interrupted; nothing was imported${mediaCopied > 0 ? `; ${copiedNote(mediaCopied, mediaDir)}` : ""}`,
    );
    this.mediaCopied = mediaCopied;
    this.mediaDir = mediaDir;
  }
}

/** What one import has done so far, for its messages and its cleanup. */
interface State {
  siteId?: string | undefined;
  mediaDir: string;
  copied: number;
  copiedBytes: number;
  /** `importSite` has started: the signal is no longer honoured. */
  applying: boolean;
  local?: LocalStore | undefined;
}

/** One import: the project, its paths and the options. */
interface Run {
  readonly options: ImportArchiveOptions;
  readonly file: string;
  readonly cfg: ProjectConfig;
  readonly dataDir: string;
  readonly storeExists: boolean;
  readonly state: State;
}

/** Pass 1's result; its bundle is dropped before pass 2 reads its own. */
interface FirstPass {
  readonly manifest: SiteArchiveManifest;
  bundle: SiteBundle | undefined;
}

async function statOrUndefined(file: string) {
  return stat(file).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
    throw e;
  });
}

/** The archive's size; a missing file or a folder is refused before anything is read. */
async function archiveSize(file: string): Promise<number> {
  const s = await statOrUndefined(file);
  if (!s) throw new Error("no such file");
  if (s.isDirectory()) throw new Error("it is a directory; name a .cloudhal file");
  return s.size;
}

/** The first item (the manifest) checked by `check` before the rest is read. */
async function* checkManifest(
  items: AsyncIterable<ArchiveItem>,
  check: (manifest: SiteArchiveManifest) => void,
): AsyncGenerator<ArchiveItem, void, undefined> {
  let first = true;
  for await (const item of items) {
    if (first && item.type === "manifest") check(item.manifest);
    first = false;
    yield item;
  }
}

/** One read of the whole file: verified, reassembled, its media handed to `onMedia`. */
async function readPass(
  run: Run,
  check: (manifest: SiteArchiveManifest) => void,
  onMedia?: (item: ArchiveMediaItem) => Promise<void>,
): Promise<{ manifest: SiteArchiveManifest; bundle: SiteBundle }> {
  const stream = createReadStream(run.file);
  if (run.options.signal) addAbortSignal(run.options.signal, stream);
  try {
    const read = await bundleFromArchive(
      checkManifest(readArchive(stream), check),
      onMedia ? { onMedia } : {},
    );
    return { manifest: read.manifest, bundle: read.bundle };
  } finally {
    stream.destroy();
  }
}

/** What the result says about the archive's site and media, read from pass 1's bundle. */
function siteSummary(run: Run, manifest: SiteArchiveManifest, bundle: SiteBundle) {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === manifest.siteId);
  let site: unknown;
  try {
    site = row ? JSON.parse(row.body) : undefined;
  } catch {
    site = undefined;
  }
  const field = (key: string) =>
    isRecord(site) && typeof site[key] === "string" ? (site[key] as string) : undefined;
  const media = bundle.media ?? [];
  return {
    site: {
      id: manifest.siteId,
      slug: field("slug"),
      locale: field("defaultLocale"),
      projectId: field("projectId"),
      listed: (run.cfg.sites ?? [run.cfg.siteId]).includes(manifest.siteId),
    },
    mediaNeeded: { files: media.length, bytes: media.reduce((n, m) => n + m.bytes, 0) },
  };
}

/**
 * The plan against the local store, or, when the project has none yet, against an empty store in
 * memory (with the project's blob folder, which may already hold the media), so nothing is created.
 */
async function planLocally(run: Run, bundle: SiteBundle): Promise<ImportPlan> {
  const options = { mode: "bootstrap", report: true } as const;
  if (run.storeExists) {
    run.state.local = await openLocalStore(run.dataDir);
    return planImport(run.state.local, bundle, options);
  }
  const sql = await BetterSqlite3Driver.open(":memory:");
  try {
    await migrate(sql, migrations);
    const blobs = new FsBlobStore(path.join(run.dataDir, "blobs"));
    return await planImport({ sql, blobs }, bundle, options);
  } finally {
    await sql.close();
  }
}

/**
 * Pass 2, only when media must be copied: the file again, with the same manifest, its planned
 * media written. Returns the bundle to import (pass 2's, or pass 1's when nothing was copied).
 */
async function copyMedia(run: Run, first: FirstPass, plan: ImportPlan): Promise<SiteBundle> {
  const copy = new Map([...plan.media.missing, ...plan.media.wrongSize].map((m) => [m.sha256, m]));
  if (copy.size === 0 && first.bundle) return first.bundle;
  const total = [...copy.values()].reduce((n, m) => n + m.bytes, 0);
  run.options.log?.(`copying ${copy.size} media file(s) (${formatBytes(total)})`);
  first.bundle = undefined;
  const { state } = run;
  // Without a store yet, a bare blob store: an interrupted copy creates no data.db.
  const blobs = state.local?.blobs ?? new FsBlobStore(path.join(run.dataDir, "blobs"));
  const plain = (m: SiteArchiveManifest) => JSON.parse(JSON.stringify(m)) as unknown;
  const same = (m: SiteArchiveManifest) => {
    if (!isDeepStrictEqual(plain(m), plain(first.manifest)))
      throw new Error("the file changed while it was being imported");
  };
  const again = await readPass(run, same, async (item) => {
    const m = copy.get(item.sha256);
    if (!m) return;
    run.options.signal?.throwIfAborted();
    if (!(await writeMedia(blobs, plan.siteId, item, m))) return;
    state.copied++;
    state.copiedBytes += m.bytes;
  });
  return again.bundle;
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

/** `importSite` and the search index; the signal is not honoured from here. */
async function apply(run: Run, bundle: SiteBundle, plan: ImportPlan) {
  const { state } = run;
  state.applying = true;
  state.local ??= await openLocalStore(run.dataDir);
  const local = state.local;
  const result = await importSite(local, bundle, { mode: "bootstrap" });
  let searchRefreshed = true;
  if (!result.nodes.unchanged || result.snapshots > 0 || (await searchBehind(local, plan.siteId)))
    // RFC-0019 §3: an import leaves the index as it was; bring it to the live snapshot.
    searchRefreshed = await local.store.refreshSearch(plan.siteId, { full: true }).then(
      () => true,
      () => false,
    );
  return {
    nodes: result.nodes,
    snapshots: result.snapshots,
    blobs: result.blobs,
    media: { copied: state.copied, bytes: state.copiedBytes, present: plan.media.present.length },
    takedowns: plan.takedowns.listed,
    takedownsDeleted: plan.takedowns.bytesHere.length,
    searchRefreshed,
  };
}

/** The project, the file and pass 1, then the plan; on to the writes unless refused or a dry run. */
async function runImport(options: ImportArchiveOptions, state: State) {
  const file = path.resolve(options.projectDir, options.file);
  const size = await archiveSize(file);
  const cfg = await readProjectConfig(options.projectDir);
  options.signal?.throwIfAborted();
  const dataDir = path.resolve(options.projectDir, cfg.dataDir);
  const storeExists = (await statOrUndefined(path.join(dataDir, "data.db")))?.isFile() === true;
  const run: Run = { options, file, cfg, dataDir, storeExists, state };
  const rule: { refusal?: string | undefined } = {};
  const first: FirstPass = await readPass(run, (manifest) => {
    state.siteId = manifest.siteId;
    state.mediaDir = mediaFolder(cfg.dataDir, manifest.siteId);
    rule.refusal = siteRefusal(cfg, manifest, storeExists);
    if (rule.refusal && !options.dryRun) throw new ImportRefusal(rule.refusal);
  });
  const { manifest } = first;
  options.log?.(
    `verified ${displayText(options.file)}: ${manifest.files.length + 1} file(s), ${formatBytes(size)}`,
  );
  const base = {
    file: options.file,
    manifest,
    dryRun: options.dryRun === true,
    newStore: !storeExists,
    ...siteSummary(run, manifest, first.bundle as SiteBundle),
  };
  if (rule.refusal) return { ...base, refusals: [rule.refusal] };
  const plan = await planLocally(run, first.bundle as SiteBundle);
  const refusals = bootstrapRefusals(plan, manifest, cfg.dataDir);
  if (options.dryRun) return { ...base, plan, refusals };
  if (refusals[0] !== undefined) throw new ImportRefusal(refusals[0]);
  options.signal?.throwIfAborted();
  const bundle = await copyMedia(run, first, plan);
  options.signal?.throwIfAborted();
  return { ...base, plan, refusals: [], imported: await apply(run, bundle, plan) };
}

/** Imports (or, with `dryRun`, plans) the archive; see the module doc for every rule. */
export async function importArchive(options: ImportArchiveOptions): Promise<ImportArchiveResult> {
  const state: State = { mediaDir: "", copied: 0, copiedBytes: 0, applying: false };
  try {
    return await runImport(options, state);
  } catch (e) {
    if (options.signal?.aborted && !state.applying)
      throw new ImportInterruptedError(state.copied, state.mediaDir);
    throw importFailure(e, {
      file: options.file,
      mediaCopied: state.copied,
      mediaDir: state.mediaDir,
      siteId: state.siteId,
      applying: state.applying,
    });
  } finally {
    await state.local?.close();
  }
}
