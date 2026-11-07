/**
 * `cloudhal import <file> [--replace] [--dry-run]` (RFC-0039 §2, rollout steps 3 and 4): a file
 * written by `cloudhal export` into this project, the site's id kept (invariant 1).
 *
 * - **Bootstrap** (default): the archive's site must be `cloudhal.json`'s `siteId` or listed in
 *   `sites`, checked as soon as the manifest is read; another id is refused, naming both and
 *   `--replace`. The project must not hold the site yet, or hold exactly the archive's nodes; the
 *   snapshots, node bodies and media it lacks are added. A site whose nodes differ is refused.
 * - **`--replace`:** the local nodes become the archive's, its published snapshot included (the
 *   site node carries it; `published: "source"`, as `cloudhal pull --replace`). A deployment keeps
 *   its own: `cloudhal push` applies with `published: "target"`, so a local replace never moves
 *   production. Snapshots are only ever added. When the project holds the site and its nodes would
 *   change, the current graph is saved first as `before import <file>` (`cloudhal import --revert
 *   <id>` brings it back) and the result as `import <file>` (`import-apply.ts`). Refused, before
 *   anything is written, while the site has open releases or an unfinished field operation, or
 *   when another local site serves one of its hostnames (`import-replace.ts`).
 * - **Another site:** `--replace` of an archive whose site `cloudhal.json` does not list imports it
 *   and switches `siteId` (and the old id in `sites`) to it, editing only those values, once the
 *   import has landed (`config-site.ts`). The old site stays in the local store, unlisted and
 *   untouched: setting `siteId` back by hand undoes the switch (`--revert` restores nodes only).
 * - **Two passes over the file** (invariants 3 and 6). The first reads and verifies the whole
 *   archive (every file's size and SHA-256, every row; media bodies are hashed, not kept) and plans
 *   the import against the local store (`planImport`), so every refusal comes before any write: a
 *   damaged or edited file, invalid rows or node bodies (precompiled validators, invariant 2), a
 *   conflict, media this project has taken down (invariant 5), media a `--no-media` archive lacks.
 *   The second runs only when media must be copied: it reads the file again, requires the same
 *   manifest (which pins every file's SHA-256, so the bundle is the one planned) and writes only
 *   the planned media into the blob store, which verifies them again. Then the graph is written
 *   (`import-apply.ts`). A local media file of another size counts as damaged: a full archive
 *   replaces it, a `--no-media` one is refused. Local copies of content the archive's ledger took
 *   down are deleted, and the summary says so.
 * - **No store yet:** planning runs on an empty store in memory, so a refusal or a dry run creates
 *   no `.cloudhal/`; media are copied before `data.db` exists.
 * - **`--dry-run`:** prints the manifest and the plan (with `--replace`, the snapshots, the
 *   published snapshot and the switch too) and writes nothing: no blobs, rows, config or search
 *   index. Opening an existing store applies pending migrations, as every command does.
 * - **Ctrl-C, SIGTERM** stop the import before its writes start (between the passes or between
 *   media files); from there it finishes, its node set being one atomic batch. Media already
 *   copied stay in the blob store, unreferenced: content-addressed, the next import reuses them
 *   (`cloudhal media gc` only sees media with a ledger row). A hard kill can leave a temporary
 *   file in `blobs/.tmp`.
 *
 * Known limitations: the graph rows are held in memory (one bundle at a time, as for export); a
 * disk error while `importSite` writes can leave node bodies, snapshots or the media ledger
 * without the rest, as for `pull`: the message then says the import stopped partway, and running
 * it again completes it (and refreshes a search index left behind the live snapshot). As for
 * `pull --replace`, an edit another process makes between the `before` snapshot (or the recheck
 * of an unchanged site) and the node batch is replaced and not in that snapshot, and the archive's
 * nodes keep their revs: a Studio tab or agent still holding a node at the rev the archive gives
 * it saves over it without a conflict, so the summary counts those nodes and says to reload.
 */
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  type CopySiteResult,
  type ImportPlan,
  planImport,
  type SiteBundle,
} from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { FsBlobStore } from "@cloudhal/storage/fs";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import type { SiteArchiveManifest } from "../archive/index.ts";
import { type ProjectConfig, readProjectConfig } from "../config.ts";
import { readConfigText, type SiteIdSwitch, writeSiteIdSwitch } from "../config-site.ts";
import { formatBytes } from "./export.ts";
import { type AppliedImport, applyImport } from "./import-apply.ts";
import {
  displayText,
  ImportInterruptedError,
  ImportRefusal,
  importFailure,
  importRefusals,
  mediaFolder,
  siteRefusal,
} from "./import-checks.ts";
import { writeMedia } from "./import-media.ts";
import { archiveSize, readPass, siteSummary, statOrUndefined } from "./import-read.ts";
import {
  hostRefusal,
  importBracket,
  type ReplaceOutcome,
  replaceOutcome,
  replaceRefusals,
  settledOutcome,
  switchFor,
} from "./import-replace.ts";

export { ImportInterruptedError } from "./import-checks.ts";

export interface ImportArchiveOptions {
  readonly projectDir: string;
  /** The `.cloudhal` file, relative to `projectDir`. */
  readonly file: string;
  /** Verify and plan only; write nothing. */
  readonly dryRun?: boolean | undefined;
  /** `--replace`: the local nodes become the archive's (see the module doc). */
  readonly replace?: boolean | undefined;
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
  readonly mode: ImportPlan["mode"];
  /** The archive's site, as its site node says (untrusted until planned: printed cleaned). */
  readonly site: {
    readonly id: string;
    readonly slug?: string | undefined;
    readonly locale?: string | undefined;
    readonly projectId?: string | undefined;
    /** Its `publishedSnapshotId`. */
    readonly published?: string | undefined;
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
  /** `--replace`: the snapshots, the published snapshot, the switch (planned, then done). */
  readonly replace?: ReplaceOutcome | undefined;
}

/** What one import has done so far, for its messages and its cleanup. */
interface State {
  siteId?: string | undefined;
  mediaDir: string;
  copied: number;
  copiedBytes: number;
  /** The writes have started: the signal is no longer honoured. */
  applying: boolean;
  local?: LocalStore | undefined;
  /** `--replace`: the snapshot of the local graph taken before `importSite`. */
  snapshotId?: string | undefined;
}

/** One import: the project, its paths and the options. */
interface Run {
  readonly options: ImportArchiveOptions;
  readonly file: string;
  readonly cfg: ProjectConfig;
  readonly dataDir: string;
  readonly storeExists: boolean;
  readonly mode: ImportPlan["mode"];
  /** `--replace`: `cloudhal.json` as text, read before the archive, for the site id switch. */
  readonly raw?: string | undefined;
  readonly state: State;
}

/** How pass 1 judged the archive's site: refused, or (`--replace`) a `siteId` switch. */
type SiteRule = { refusal?: string | undefined; change?: SiteIdSwitch | undefined };

/** Pass 1's result; its bundle is dropped before pass 2 reads its own. */
interface FirstPass {
  readonly manifest: SiteArchiveManifest;
  bundle: SiteBundle | undefined;
}

/**
 * The plan against the local store, or, when the project has none yet, against an empty store in
 * memory (with the project's blob folder, which may already hold the media), so nothing is created.
 * A hostname another local site serves is a refusal, so a dry run reports it.
 */
async function planLocally(
  run: Run,
  bundle: SiteBundle,
): Promise<{ plan: ImportPlan } | { refusal: string }> {
  const options = { mode: run.mode, report: true } as const;
  try {
    if (run.storeExists) {
      run.state.local = await openLocalStore(run.dataDir);
      return { plan: await planImport(run.state.local, bundle, options) };
    }
    const sql = await BetterSqlite3Driver.open(":memory:");
    try {
      await migrate(sql, migrations);
      const blobs = new FsBlobStore(path.join(run.dataDir, "blobs"));
      return { plan: await planImport({ sql, blobs }, bundle, options) };
    } finally {
      await sql.close();
    }
  } catch (e) {
    const refusal = hostRefusal(e, "the archive's");
    if (refusal === undefined) throw e;
    return { refusal };
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
  const { signal } = run.options;
  const again = await readPass({
    file: run.file,
    signal,
    check: same,
    onMedia: async (item) => {
      const m = copy.get(item.sha256);
      if (!m) return;
      signal?.throwIfAborted();
      if (!(await writeMedia(blobs, plan.siteId, item, m))) return;
      state.copied++;
      state.copiedBytes += m.bytes;
    },
  });
  return again.bundle;
}

/** The writes (`import-apply.ts`): the signal is not honoured from here. */
async function apply(run: Run, bundle: SiteBundle, plan: ImportPlan): Promise<AppliedImport> {
  const { state } = run;
  state.applying = true;
  state.local ??= await openLocalStore(run.dataDir);
  const holds = run.mode === "replace" && !plan.fresh;
  return applyImport(state.local, bundle, {
    mode: run.mode,
    ...(holds ? { bracket: importBracket(run.options.file), unchanged: plan.unchanged } : {}),
    onBefore: (snapshot) => {
      state.snapshotId = snapshot.id;
    },
  });
}

/** The summary of a written import. */
function importedOf(run: Run, plan: ImportPlan, applied: AppliedImport) {
  const { result } = applied;
  const { state } = run;
  return {
    nodes: result.nodes,
    snapshots: result.snapshots,
    blobs: result.blobs,
    media: { copied: state.copied, bytes: state.copiedBytes, present: plan.media.present.length },
    takedowns: plan.takedowns.listed,
    takedownsDeleted: plan.takedowns.bytesHere.length,
    searchRefreshed: applied.searchRefreshed,
  };
}

/** The project and its paths; `cloudhal.json`'s text too for `--replace`. */
async function startRun(options: ImportArchiveOptions, state: State) {
  const file = path.resolve(options.projectDir, options.file);
  const size = await archiveSize(file);
  const cfg = await readProjectConfig(options.projectDir);
  const raw = options.replace ? await readConfigText(options.projectDir) : undefined;
  options.signal?.throwIfAborted();
  const dataDir = path.resolve(options.projectDir, cfg.dataDir);
  const storeExists = (await statOrUndefined(path.join(dataDir, "data.db")))?.isFile() === true;
  const mode: ImportPlan["mode"] = options.replace ? "replace" : "bootstrap";
  const run: Run = { options, file, cfg, dataDir, storeExists, mode, raw, state };
  return { run, size };
}

/** Pass 1's judgement of the archive's site (`siteRefusal`, or `switchFor` with `--replace`). */
function siteRule(run: Run, manifest: SiteArchiveManifest): SiteRule {
  if (run.mode === "replace") return switchFor(run.cfg, run.raw ?? "", manifest.siteId);
  return { refusal: siteRefusal(run.cfg, manifest, run.storeExists) };
}

/** The project, the file and pass 1, then the plan; on to the writes unless refused or a dry run. */
async function runImport(options: ImportArchiveOptions, state: State) {
  const { run, size } = await startRun(options, state);
  const { cfg } = run;
  const rule: SiteRule = {};
  const first: FirstPass = await readPass({
    file: run.file,
    signal: options.signal,
    check: (manifest) => {
      state.siteId = manifest.siteId;
      state.mediaDir = mediaFolder(cfg.dataDir, manifest.siteId);
      Object.assign(rule, siteRule(run, manifest));
      if (rule.refusal && !options.dryRun) throw new ImportRefusal(rule.refusal);
    },
  });
  const { manifest } = first;
  options.log?.(
    `verified ${displayText(options.file)}: ${manifest.files.length + 1} file(s), ${formatBytes(size)}`,
  );
  const base = {
    file: options.file,
    manifest,
    dryRun: options.dryRun === true,
    mode: run.mode,
    newStore: !run.storeExists,
    ...siteSummary(cfg, manifest, first.bundle as SiteBundle),
  };
  const planned = rule.refusal
    ? { refusal: rule.refusal }
    : await planLocally(run, first.bundle as SiteBundle);
  if ("refusal" in planned) {
    if (!options.dryRun) throw new ImportRefusal(planned.refusal);
    return { ...base, refusals: [planned.refusal] };
  }
  const { plan } = planned;
  const replacing = run.mode === "replace";
  const refusals = [
    ...importRefusals(plan, manifest, cfg.dataDir),
    ...(replacing ? await replaceRefusals(state.local, plan, "--replace") : []),
  ];
  const outcome = replacing
    ? await replaceOutcome({
        projectDir: options.projectDir,
        cfg,
        plan,
        local: state.local,
        change: rule.change,
        bracket: importBracket(options.file),
        incoming: base.site.published,
      })
    : undefined;
  if (options.dryRun) return { ...base, plan, refusals, replace: outcome };
  if (refusals[0] !== undefined) throw new ImportRefusal(refusals[0]);
  options.signal?.throwIfAborted();
  const bundle = await copyMedia(run, first, plan);
  options.signal?.throwIfAborted();
  const applied = await apply(run, bundle, plan);
  // Last: a failure before this leaves cloudhal.json naming the old site, which is intact.
  if (rule.change) await writeSiteIdSwitch(options.projectDir, rule.change);
  return {
    ...base,
    plan,
    refusals: [],
    imported: importedOf(run, plan, applied),
    replace: outcome && settledOutcome(outcome, applied, rule.change !== undefined),
  };
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
      snapshotId: state.snapshotId,
    });
  } finally {
    await state.local?.close();
  }
}
