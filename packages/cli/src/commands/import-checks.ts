/**
 * `cloudhal import`'s rules and words (RFC-0039 §2, rollout steps 3 and 4), with no I/O: which
 * site a bootstrap import may bring into this project, why an import is refused, and every failure
 * as one line (`import-replace.ts` has `--replace`'s own). Text that comes from the archive or the project (titles, names, file names, the row
 * ids core-ts messages quote) goes through `displayText`, so it cannot carry terminal escapes,
 * bidi overrides or megabytes into the terminal.
 */
import { type ImportPlan, InvariantError, SyncConflictError } from "@cloudhal/core-ts";
import { ArchiveError, type ArchiveErrorCode, type SiteArchiveManifest } from "../archive/index.ts";
import type { ProjectConfig } from "../config.ts";
import { SiteSwitchError } from "../config-site.ts";

/**
 * Controls (C0, C1, DEL), format characters (bidi overrides, zero-width), lone surrogates and the
 * line and paragraph separators. Property escapes, so the pattern holds no control character.
 */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu;

/**
 * Untrusted text as one printable line: unsafe characters become spaces, runs of white space one
 * space, and it is cut at `max` code points with `…`.
 */
export function displayText(raw: string, max = 200): string {
  const clean = raw.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
  const chars = [...clean];
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : clean;
}

/** Where a site's media files are, as the messages name it. */
export function mediaFolder(dataDir: string, siteId: string): string {
  return `${displayText(dataDir.replace(/\/+$/, ""))}/blobs/media/${siteId}/`;
}

/** What an interrupted or refused import says about the media it had already copied. */
export function copiedNote(copied: number, mediaDir: string): string {
  return `${copied} media file(s) already copied stay in ${mediaDir}, unreferenced, and the next import reuses them`;
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

/**
 * Bootstrap: the archive's site must be this project's, `cloudhal.json`'s `siteId` or listed in
 * `sites`. Any other id is refused, pointing to `--replace`, which imports it and switches
 * `siteId` (RFC-0039 §2).
 */
export function siteRefusal(
  cfg: ProjectConfig,
  manifest: SiteArchiveManifest,
  storeExists: boolean,
): string | undefined {
  const allowed = cfg.sites ?? [cfg.siteId];
  if (allowed.includes(manifest.siteId)) return undefined;
  const ours = cfg.sites
    ? `sites are ${allowed.map((id) => displayText(id, 80)).join(", ")} (cloudhal.json siteId and sites)`
    : `site is ${displayText(cfg.siteId, 80)} (cloudhal.json siteId)`;
  const a = manifest.siteId;
  const old = storeExists
    ? ` (${displayText(cfg.siteId, 80)} stays in the local store, unlisted)`
    : "";
  return `it holds site ${a}, and this project's ${ours}; \`cloudhal import --replace\` imports it and switches cloudhal.json siteId to ${a}${old}`;
}

/** A bootstrap conflict, from the plan or from `SyncConflictError.differing` (never its message). */
export function conflictText(siteId: string, differing: readonly string[]): string {
  const shown = differing.slice(0, 5).map((id) => displayText(id, 80));
  return `this project's site ${displayText(siteId, 80)} differs from the archive in ${differing.length} node(s) (${shown.join(", ")}${differing.length > 5 ? ", …" : ""}); bootstrap imports only into a project without the site or holding exactly its nodes; --replace makes them the archive's, saving the local ones as a snapshot first`;
}

/**
 * Why an import of this plan is refused, in order: nodes that differ (bootstrap only), media this
 * project has taken down (invariant 5: an import never writes them back), and media a
 * `--no-media` archive cannot bring that the project lacks or holds at another size. Empty: the
 * import may proceed.
 */
export function importRefusals(
  plan: ImportPlan,
  manifest: SiteArchiveManifest,
  dataDir: string,
): string[] {
  const out: string[] = [];
  if (plan.mode === "bootstrap" && plan.conflict)
    out.push(conflictText(plan.siteId, plan.conflict));
  const down = plan.media.takenDownHere;
  if (down[0])
    out.push(
      `the archive carries ${down.length} media file(s) this project has taken down (first ${down[0].sha256}); an import never brings taken-down content back`,
    );
  const lacking = [...plan.media.missing, ...plan.media.wrongSize];
  if (manifest.mediaOmitted && lacking[0]) {
    const total = plan.media.present.length + lacking.length;
    const damaged = plan.media.wrongSize.length > 0 ? " or has a damaged copy of" : "";
    out.push(
      `the archive has no media (written with --no-media) and this project lacks${damaged} ${lacking.length} of the ${total} media file(s) it needs (first ${lacking[0].sha256}); copy them into ${mediaFolder(dataDir, plan.siteId)} or import an archive with media`,
    );
  }
  return out;
}

/** A refusal of the import's own (`siteRefusal`, `importRefusals`, `import-replace.ts`): its parts are cleaned. */
export class ImportRefusal extends Error {
  override readonly name = "ImportRefusal";
}

const DAMAGED = "; the file is damaged or incomplete, export it again";

/** What an archive error adds to its own (safe) message. */
const ARCHIVE_TAILS: Partial<Record<ArchiveErrorCode, string>> = {
  damaged: DAMAGED,
  mismatch: DAMAGED,
  truncated: DAMAGED,
  unsafe_entry: "; this file was not written by cloudhal export",
  too_large: "; it is over this CLI's archive limits",
};

function reason(error: unknown, siteId: string | undefined): string {
  if (error instanceof ArchiveError) return `${error.message}${ARCHIVE_TAILS[error.code] ?? ""}`;
  if (error instanceof SyncConflictError) return conflictText(siteId ?? "", error.differing);
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Where a failure happened, for its message. */
export interface ImportFailureContext {
  /** The file as the user named it. */
  readonly file: string;
  /** Media files written before the failure (pass 2). */
  readonly mediaCopied: number;
  readonly mediaDir: string;
  /** The archive's site, once its manifest was read. */
  readonly siteId?: string | undefined;
  /** The graph was being written (`importSite`, and opening the store for it). */
  readonly applying?: boolean | undefined;
  /** `--replace`: the snapshot of the local graph taken before `importSite`. */
  readonly snapshotId?: string | undefined;
}

/**
 * Refusals that come before anything of the graph is written even once `importSite` runs: its
 * plan's conflict and invariants (`prepareImport`), and this module's own.
 */
function refusedBeforeWriting(error: unknown): boolean {
  return (
    error instanceof SyncConflictError ||
    error instanceof InvariantError ||
    error instanceof ImportRefusal
  );
}

/**
 * Any failure as one line: `cannot import <file>: <reason>; nothing was imported`, what happened
 * to the media already copied, and the snapshot `--replace` took first. A failure while the graph was being written (a storage
 * error, or a store another process changed since the plan) may have left part of it, so it says
 * so and to run the import again, which completes it. Every reason is cleaned and cut
 * (`displayText`; 400 code points, or 1000 for this module's own refusals), since row ids, kinds
 * and validator paths in core-ts messages come from the archive. A `cloudhal.json` that could not
 * be switched after the import landed says so (`SiteSwitchError`).
 */
export function importFailure(error: unknown, at: ImportFailureContext): Error {
  if (error instanceof SiteSwitchError)
    return new Error(`imported ${displayText(at.file)}, but ${displayText(error.message, 600)}`, {
      cause: error,
    });
  const max = error instanceof ImportRefusal ? 1000 : 400;
  const head = `cannot import ${displayText(at.file)}: ${displayText(reason(error, at.siteId), max)}`;
  const snap = at.snapshotId;
  if (at.applying && !refusedBeforeWriting(error)) {
    const reused =
      at.mediaCopied > 0 ? ` (the ${at.mediaCopied} media file(s) copied are reused)` : "";
    const saved = snap
      ? `; snapshot ${snap} taken first holds the site as it was (undo: cloudhal import --revert ${snap})`
      : "";
    return new Error(
      `${head}; the import stopped after it began writing, so this project may hold part of it; run it again to finish${reused}${saved}`,
      { cause: error },
    );
  }
  const copied = at.mediaCopied > 0 ? `; ${copiedNote(at.mediaCopied, at.mediaDir)}` : "";
  const saved = snap ? `; snapshot ${snap} taken first holds the current graph` : "";
  return new Error(`${head}; nothing was imported${copied}${saved}`, { cause: error });
}
