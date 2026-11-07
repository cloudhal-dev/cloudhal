/**
 * The rules and words of `cloudhal import --replace` and `--revert` (RFC-0039 §2, rollout step 4),
 * with reads only:
 *
 * - **Snapshots** around a write that changes a site this project holds: `before import <file>`
 *   and `import <file>` (`before revert import <file>` and `revert import <file>`), reason
 *   `import`, with `cloudhal.import.*` metadata: the phase, the file's name (its base name only,
 *   cleaned and cut, since history travels in archives), the `before` one an `after` follows, and
 *   the snapshot a revert went back to. A `before` snapshot is what `--revert` accepts.
 * - **Refusals** of a replace that would change the local site's nodes: open releases, whose
 *   pinned versions it would replace (RFC-0008; `cloudhal push` refuses them the same way), and an
 *   unfinished field operation, whose marker on the site node it would drop (RFC-0041). There is
 *   no `--cancel-schedules` here: releases are cancelled in Studio or through MCP.
 * - **Hostnames** another site of the local store serves are refused, never released: releasing
 *   them would write the other site, which a replace leaves as it is.
 * - **The site id switch:** an archive of a site `cloudhal.json` does not list switches `siteId` to
 *   it (`config-site.ts`); the old site stays in the store, unlisted and untouched, so setting
 *   `siteId` back by hand undoes the switch.
 * - **Revs:** a replace writes the archive's revs, as `pull --replace` does, and the store's
 *   compare-and-swap checks only the rev, so the nodes it gives a rev no higher than they had are
 *   counted: an editor still holding that rev saves over them without a conflict. A revert's
 *   revs only move forward (`restoreBundle`), so it has none.
 * - **What is shown:** the published snapshot before and after, the snapshots, those nodes, the
 *   switch, the old site and the deployment (`state.json` only; never the deploy secrets).
 */
import path from "node:path";
import type { Snapshot } from "@cloudhal/core-contracts";
import { type ImportPlan, InvariantError } from "@cloudhal/core-ts";
import type { LocalStore } from "@cloudhal/core-ts/local";
import { ReleaseService } from "@cloudhal/core-ts/releases";
import { isSiteId, type ProjectConfig } from "../config.ts";
import { planSiteIdSwitch, type SiteIdSwitch } from "../config-site.ts";
import { unfinishedOperation } from "./archive-bundle.ts";
import { readDeployState } from "./deploy/state.ts";
import type { AppliedImport, ImportBracket } from "./import-apply.ts";
import { displayText } from "./import-checks.ts";

/** The metadata keys of the snapshots an import takes. */
export const IMPORT_META = {
  phase: "cloudhal.import.phase",
  file: "cloudhal.import.file",
  of: "cloudhal.import.of",
  revert: "cloudhal.import.revert",
} as const;

/**
 * The file as labels name it: its base name, cleaned, at most 160 code points (the longest label,
 * `before revert import <file>`, stays within the snapshot label's 200).
 */
export function importFileName(file: string): string {
  return displayText(path.basename(file), 160);
}

function bracket(prefix: string, file: string, extra: Record<string, string>): ImportBracket {
  const { phase, of } = IMPORT_META;
  const meta = { [IMPORT_META.file]: file, ...extra };
  return {
    before: { label: `before ${prefix}${file}`, metadata: { [phase]: "before", ...meta } },
    after: (id) => ({
      label: `${prefix}${file}`,
      metadata: { [phase]: "after", ...meta, [of]: id },
    }),
  };
}

/** `before import <file>` and `import <file>`. */
export function importBracket(file: string): ImportBracket {
  return bracket("import ", importFileName(file), {});
}

/** `before revert import <file>` and `revert import <file>`, for a revert to `target`. */
export function revertBracket(target: Snapshot): ImportBracket {
  const named = displayText(target.metadata?.[IMPORT_META.file] ?? "", 160) || target.id;
  return bracket("revert import ", named, { [IMPORT_META.revert]: target.id });
}

/**
 * Why a replace (or revert) of `plan` is refused, for a site this project holds whose nodes it
 * would change: open releases, an unfinished field operation. Empty otherwise.
 */
export async function replaceRefusals(
  local: LocalStore | undefined,
  plan: ImportPlan,
  flag: "--replace" | "--revert",
): Promise<string[]> {
  if (!local || plan.fresh || plan.unchanged) return [];
  const again = flag === "--replace" ? "import again" : "revert again";
  const out: string[] = [];
  const open = await new ReleaseService({ graph: local.store }).openReleases(plan.siteId);
  if (open.length > 0) {
    const shown = open
      .slice(0, 5)
      .map((r) => `${r.id} (${r.state}${r.title ? `, "${displayText(r.title, 60)}"` : ""})`);
    out.push(
      `site ${plan.siteId} has ${open.length} open release(s) (${shown.join(", ")}${open.length > 5 ? ", …" : ""}), and ${flag} replaces the graph their pinned versions point into; cancel them in Studio (\`cloudhal studio\`) or with the MCP tool cancel_schedule, then ${again}`,
    );
  }
  const op = unfinishedOperation(await local.store.getSite(plan.siteId));
  if (op) {
    const c = displayText(op.collection, 80);
    const id = displayText(op.id, 80);
    out.push(
      `field operation ${id} on ${c} has not finished, and ${flag} would drop its marker; finish or revert it first (\`cloudhal fields continue|revert ${c} ${id}\`), then ${again}`,
    );
  }
  return out;
}

/** `planImport`'s `host_taken` as a refusal; undefined for any other error. */
export function hostRefusal(error: unknown, whose: string): string | undefined {
  if (!(error instanceof InvariantError) || error.code !== "host_taken") return undefined;
  const host = displayText(String(error.details.host ?? ""), 120);
  const site = displayText(String(error.details.siteId ?? ""), 80);
  return `${whose} site serves ${host}, which site ${site} of this project's store already serves; remove it from that site's domains in Studio, or delete that site when it is a leftover (\`cloudhal site delete ${site} --confirm <its slug>\`)`;
}

/**
 * Whether `--replace` of an archive of `siteId` switches `cloudhal.json`: when it names neither as
 * `siteId` nor in `sites`. Refused for an id `sites` would not accept, or an edit that cannot be
 * made in place.
 */
export function switchFor(
  cfg: ProjectConfig,
  raw: string,
  siteId: string,
): { readonly change?: SiteIdSwitch; readonly refusal?: string } {
  if ((cfg.sites ?? [cfg.siteId]).includes(siteId)) return {};
  if (!isSiteId(siteId))
    return {
      refusal: `it holds site ${displayText(siteId, 80)}, which cloudhal.json cannot name (site_ and 6 to 32 letters or digits)`,
    };
  const planned = planSiteIdSwitch(raw, siteId);
  return "refusal" in planned ? { refusal: planned.refusal } : { change: planned };
}

/** What a replace (or revert) did or would do, for the dry run and the summary. */
export interface ReplaceOutcome {
  /** The snapshots around the write: planned (labels, nodes saved), then taken (ids). */
  readonly snapshot?:
    | {
        readonly label: string;
        readonly afterLabel: string;
        readonly nodes: number;
        readonly beforeId?: string | undefined;
        readonly afterId?: string | undefined;
      }
    | undefined;
  /** The site's published snapshot here and in the bundle, when the write moves it. */
  readonly published?: { readonly here?: string; readonly incoming?: string } | undefined;
  /** Nodes the write gives a rev no higher than they have here (see the module doc). */
  readonly revsReused?: number | undefined;
  readonly switch?: (SiteIdSwitch & { readonly written?: boolean }) | undefined;
  /** After a switch, the old site in the local store. */
  readonly oldSite?: { readonly slug: string; readonly openReleases: number } | undefined;
  /** The deployment's name when this project is deployed. */
  readonly deployed?: string | undefined;
}

export interface OutcomeInput {
  readonly projectDir: string;
  readonly cfg: ProjectConfig;
  readonly plan: ImportPlan;
  readonly local?: LocalStore | undefined;
  readonly change?: SiteIdSwitch | undefined;
  readonly bracket: ImportBracket;
  /** The bundle's site node's `publishedSnapshotId`. */
  readonly incoming?: string | undefined;
}

/** The old site after a switch: its slug (for `cloudhal site delete`) and open releases. */
async function oldSiteOf(local: LocalStore | undefined, change: SiteIdSwitch | undefined) {
  const old = change && local ? await local.store.getSite(change.from) : undefined;
  if (!old || !local) return undefined;
  const open = await new ReleaseService({ graph: local.store }).openReleases(old.id);
  return { slug: old.slug, openReleases: open.length };
}

/** The outcome as planned, before anything is written. */
export async function replaceOutcome(input: OutcomeInput): Promise<ReplaceOutcome> {
  const { plan, local, change, incoming } = input;
  const holds = local !== undefined && !plan.fresh;
  const here = holds ? (await local.store.getSite(plan.siteId))?.publishedSnapshotId : undefined;
  const snapshot =
    holds && !plan.unchanged
      ? {
          label: input.bracket.before.label,
          afterLabel: input.bracket.after("").label,
          nodes: (await local.store.currentNodeRefs(plan.siteId)).length,
        }
      : undefined;
  const oldSite = await oldSiteOf(local, change);
  const deploy = await readDeployState(input.projectDir, input.cfg.dataDir);
  const reused = plan.nodes.changed.filter((c) => c.to.rev <= c.from.rev).length;
  return {
    ...(snapshot ? { snapshot } : {}),
    ...(holds && here !== incoming
      ? { published: { ...(here ? { here } : {}), ...(incoming ? { incoming } : {}) } }
      : {}),
    ...(reused > 0 ? { revsReused: reused } : {}),
    ...(change ? { switch: change } : {}),
    ...(oldSite ? { oldSite } : {}),
    ...(deploy ? { deployed: displayText(String(deploy.name), 80) } : {}),
  };
}

/** The outcome once written: the snapshots taken, and whether `cloudhal.json` was switched. */
export function settledOutcome(
  outcome: ReplaceOutcome,
  applied: AppliedImport,
  switched: boolean,
): ReplaceOutcome {
  const { before, after } = applied;
  return {
    ...outcome,
    snapshot: before
      ? {
          label: before.label ?? "",
          afterLabel: after?.label ?? "",
          nodes: before.nodes.length,
          beforeId: before.id,
          ...(after ? { afterId: after.id } : {}),
        }
      : undefined,
    ...(outcome.switch ? { switch: { ...outcome.switch, written: switched } } : {}),
  };
}
