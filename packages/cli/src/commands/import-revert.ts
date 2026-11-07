/**
 * `cloudhal import --revert <snapshot-id> [--dry-run]` (RFC-0039 §2 and invariant 6, as amended
 * for rollout step 4): a site back to a `before import` snapshot that `--replace` took. Studio's
 * rollback moves only the published pointer, and only to an ancestor of the published snapshot,
 * so it cannot undo a replace. This restores the snapshot's nodes, the site node and so its
 * published snapshot included, through `importSite`'s replace (`restoreBundle`): validated, one
 * atomic batch, hostnames checked. Revs only move forward: a node edited since comes back at the
 * rev after its current one, never at a rev it had, so a Studio tab or agent still holding one
 * gets a conflict instead of saving over it (the store's compare-and-swap checks only the rev).
 * The current graph is saved first as `before revert import <file>`, itself a snapshot `--revert`
 * accepts, so edits made after the import are never lost, and the result as `revert import <file>`.
 * It restores nodes only: a `cloudhal.json` switch is undone by hand.
 *
 * Refused before anything is written, as a replace is: a snapshot that is not a `before` one of a
 * site `cloudhal.json` lists, open releases, an unfinished field operation, a hostname another
 * local site serves, media this project no longer holds. Taken-down content stays down
 * (invariant 5): its asset comes back, its bytes do not.
 */
import path from "node:path";
import type { Snapshot } from "@cloudhal/core-contracts";
import {
  type CopySiteResult,
  type ImportPlan,
  InvariantError,
  planImport,
  restoreBundle,
  type SiteBundle,
} from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { type ProjectConfig, readProjectConfig } from "../config.ts";
import { applyImport } from "./import-apply.ts";
import { displayText, ImportRefusal } from "./import-checks.ts";
import { statOrUndefined } from "./import-read.ts";
import {
  hostRefusal,
  IMPORT_META,
  type ReplaceOutcome,
  replaceOutcome,
  replaceRefusals,
  revertBracket,
  settledOutcome,
} from "./import-replace.ts";

export interface RevertImportOptions {
  readonly projectDir: string;
  readonly snapshotId: string;
  /** Plan only; write nothing. */
  readonly dryRun?: boolean | undefined;
}

export interface RevertImportResult {
  /** The snapshot gone back to. */
  readonly snapshot: Snapshot;
  readonly dryRun: boolean;
  /** Absent when refused before planning (a hostname). */
  readonly plan?: ImportPlan | undefined;
  /** Why the revert is refused (a dry run reports them; a revert throws the first). */
  readonly refusals: readonly string[];
  readonly outcome?: ReplaceOutcome | undefined;
  readonly reverted?:
    | { readonly nodes: CopySiteResult["nodes"]; readonly searchRefreshed: boolean }
    | undefined;
}

/** What one revert has done so far, for its failure message. */
interface State {
  applying: boolean;
  snapshotId?: string | undefined;
}

/** The snapshot to go back to: a `before` one of a site `cloudhal.json` lists. */
async function target(local: LocalStore, cfg: ProjectConfig, id: string): Promise<Snapshot> {
  const snapshot = await local.store.getSnapshot(id);
  if (snapshot?.metadata?.[IMPORT_META.phase] !== "before")
    throw new ImportRefusal(
      'it is not a "before import" snapshot of this project (`cloudhal import --replace` names the one it takes)',
    );
  if (!(cfg.sites ?? [cfg.siteId]).includes(snapshot.siteId))
    throw new ImportRefusal(
      `it is a snapshot of site ${snapshot.siteId}, which cloudhal.json does not list (siteId and sites)`,
    );
  return snapshot;
}

/** Media the snapshot's assets need that this project lacks or holds at another size. */
function mediaRefusals(plan: ImportPlan): string[] {
  const lacking = [...plan.media.missing, ...plan.media.wrongSize];
  const [first] = lacking;
  if (!first) return [];
  return [
    `this project lacks or has a damaged copy of ${lacking.length} media file(s) the snapshot needs (first ${first.sha256})`,
  ];
}

/** The restored site node's `publishedSnapshotId`. */
function publishedOf(bundle: SiteBundle): string | undefined {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === bundle.siteId);
  const body = row ? (JSON.parse(row.body) as { publishedSnapshotId?: unknown }) : undefined;
  return typeof body?.publishedSnapshotId === "string" ? body.publishedSnapshotId : undefined;
}

/** The plan, or a hostname another local site serves as a refusal. */
async function planRevert(
  local: LocalStore,
  bundle: SiteBundle,
): Promise<{ plan: ImportPlan } | { refusal: string }> {
  try {
    return { plan: await planImport(local, bundle, { mode: "replace", report: true }) };
  } catch (e) {
    const refusal = hostRefusal(e, "the snapshot's");
    if (refusal === undefined) throw e;
    return { refusal };
  }
}

async function runRevert(
  local: LocalStore,
  options: RevertImportOptions & { cfg: ProjectConfig },
  state: State,
): Promise<RevertImportResult> {
  const snapshot = await target(local, options.cfg, options.snapshotId);
  const bundle = await restoreBundle(local, snapshot);
  const dryRun = options.dryRun === true;
  const planned = await planRevert(local, bundle);
  if ("refusal" in planned) {
    if (!dryRun) throw new ImportRefusal(planned.refusal);
    return { snapshot, dryRun, refusals: [planned.refusal] };
  }
  const { plan } = planned;
  const refusals = [...mediaRefusals(plan), ...(await replaceRefusals(local, plan, "--revert"))];
  const bracket = revertBracket(snapshot);
  const outcome = await replaceOutcome({
    projectDir: options.projectDir,
    cfg: options.cfg,
    plan,
    local,
    bracket,
    incoming: publishedOf(bundle),
  });
  if (dryRun) return { snapshot, dryRun, plan, refusals, outcome };
  if (refusals[0] !== undefined) throw new ImportRefusal(refusals[0]);
  state.applying = true;
  const applied = await applyImport(local, bundle, {
    mode: "replace",
    bracket,
    unchanged: plan.unchanged,
    onBefore: (s) => {
      state.snapshotId = s.id;
    },
  });
  const { nodes } = applied.result;
  return {
    snapshot,
    dryRun,
    plan,
    refusals: [],
    outcome: settledOutcome(outcome, applied, false),
    reverted: { nodes, searchRefreshed: applied.searchRefreshed },
  };
}

/**
 * Any failure as one line: `cannot revert to <id>: <reason>; nothing was reverted`, or, once the
 * graph was being written, that it may hold part of it and the snapshot taken first.
 */
function revertFailure(error: unknown, id: string, state: State): Error {
  const refused = error instanceof ImportRefusal || error instanceof InvariantError;
  const reason = error instanceof Error ? error.message : String(error);
  const head = `cannot revert to ${displayText(id, 80)}: ${displayText(reason, refused ? 1000 : 400)}`;
  const snap = state.snapshotId;
  if (state.applying && !refused)
    return new Error(
      `${head}; the revert stopped after it began writing, so the site may hold part of it; run it again to finish${snap ? `; snapshot ${snap} taken first holds the site as it was (undo: cloudhal import --revert ${snap})` : ""}`,
      { cause: error },
    );
  const saved = snap ? `; snapshot ${snap} taken first holds the current graph` : "";
  return new Error(`${head}; nothing was reverted${saved}`, { cause: error });
}

/** Reverts (or, with `dryRun`, plans) the site to the snapshot; see the module doc. */
export async function revertImport(options: RevertImportOptions): Promise<RevertImportResult> {
  const state: State = { applying: false };
  let local: LocalStore | undefined;
  try {
    const cfg = await readProjectConfig(options.projectDir);
    const dataDir = path.resolve(options.projectDir, cfg.dataDir);
    if ((await statOrUndefined(path.join(dataDir, "data.db")))?.isFile() !== true)
      throw new ImportRefusal("this project has no local store");
    local = await openLocalStore(dataDir);
    return await runRevert(local, { ...options, cfg }, state);
  } catch (e) {
    throw revertFailure(e, options.snapshotId, state);
  } finally {
    await local?.close();
  }
}
