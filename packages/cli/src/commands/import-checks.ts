/**
 * `cloudhal import`'s rules and words (RFC-0039 §2, rollout step 3), with no I/O: which site an
 * archive may bring into this project, why a bootstrap import is refused, and every failure as
 * one line. Text that comes from the archive or the project (titles, names, file names, the row
 * ids core-ts messages quote) goes through `displayText`, so it cannot carry terminal escapes,
 * bidi overrides or megabytes into the terminal.
 */
import { type ImportPlan, InvariantError, SyncConflictError } from "@cloudhal/core-ts";
import { ArchiveError, type ArchiveErrorCode, type SiteArchiveManifest } from "../archive/index.ts";
import type { ProjectConfig } from "../config.ts";

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

/**
 * The archive's site must be this project's: `cloudhal.json`'s `siteId`, or listed in `sites`.
 * Any other id is refused (switching `siteId` is `--replace`'s, RFC-0039 §2); without a local store
 * the user may switch it by hand, knowing that push and deploy follow it.
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
  const hint = storeExists
    ? ""
    : `; this project has no local store yet, so setting cloudhal.json siteId to ${a} also works (push and deploy then use ${a})`;
  return `it holds site ${a}, and this project's ${ours}; importing another site into a project comes with \`cloudhal import --replace\`, not available yet${hint}`;
}

/** A bootstrap conflict, from the plan or from `SyncConflictError.differing` (never its message). */
export function conflictText(siteId: string, differing: readonly string[]): string {
  const shown = differing.slice(0, 5).map((id) => displayText(id, 80));
  return `this project's site ${displayText(siteId, 80)} differs from the archive in ${differing.length} node(s) (${shown.join(", ")}${differing.length > 5 ? ", …" : ""}); bootstrap imports only into a project without the site or holding exactly its nodes, and --replace is not available yet`;
}

/**
 * Why a bootstrap import of this plan is refused, in order: nodes that differ, media this project
 * has taken down (invariant 5: an import never writes them back), and media a `--no-media` archive
 * cannot bring that the project lacks or holds at another size. Empty: the import may proceed.
 */
export function bootstrapRefusals(
  plan: ImportPlan,
  manifest: SiteArchiveManifest,
  dataDir: string,
): string[] {
  const out: string[] = [];
  if (plan.conflict) out.push(conflictText(plan.siteId, plan.conflict));
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

/** A refusal of this module's own (`siteRefusal`, `bootstrapRefusals`): its parts are cleaned. */
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
 * Any failure as one line: `cannot import <file>: <reason>; nothing was imported`, and what
 * happened to the media already copied. A failure while the graph was being written (a storage
 * error, or a store another process changed since the plan) may have left part of it, so it says
 * so and to run the import again, which completes it. Every reason is cleaned and cut
 * (`displayText`; 400 code points, or 1000 for this module's own refusals), since row ids, kinds
 * and validator paths in core-ts messages come from the archive.
 */
export function importFailure(error: unknown, at: ImportFailureContext): Error {
  const max = error instanceof ImportRefusal ? 1000 : 400;
  const head = `cannot import ${displayText(at.file)}: ${displayText(reason(error, at.siteId), max)}`;
  if (at.applying && !refusedBeforeWriting(error)) {
    const reused =
      at.mediaCopied > 0 ? ` (the ${at.mediaCopied} media file(s) copied are reused)` : "";
    return new Error(
      `${head}; the import stopped after it began writing, so this project may hold part of it; run it again to finish${reused}`,
      { cause: error },
    );
  }
  const copied = at.mediaCopied > 0 ? `; ${copiedNote(at.mediaCopied, at.mediaDir)}` : "";
  return new Error(`${head}; nothing was imported${copied}`, { cause: error });
}
