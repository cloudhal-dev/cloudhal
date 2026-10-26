/**
 * What `cloudhal import --replace` and `--revert` add to the dry run and the summary (RFC-0039 §2):
 * the published snapshot when the write moves it, the snapshot saved first and how to undo with
 * it, the nodes whose rev a stale editor could still save over, the `cloudhal.json` switch with
 * how to undo it and the old site left in the store, and warnings for a deployed project and the
 * old site's open releases. Pure.
 */
import type { ImportPlan } from "@cloudhal/core-ts";
import { displayText } from "./import-checks.ts";
import type { ReplaceOutcome } from "./import-replace.ts";

export interface ReplaceLinesOptions {
  readonly dryRun: boolean;
  readonly plan?: ImportPlan | undefined;
  /** Where the incoming nodes come from: `the archive`, `the snapshot`. */
  readonly from: string;
}

const quoted = (label: string) => `"${displayText(label, 200)}"`;

function publishedLines(outcome: ReplaceOutcome, options: ReplaceLinesOptions): string[] {
  const p = outcome.published;
  if (!p) return [];
  const incoming = p.incoming ? `snapshot ${p.incoming}` : "none";
  return [
    `published: ${incoming}, as ${options.from} has it (${options.dryRun ? "here" : "was"}: ${p.here ?? "none"})`,
  ];
}

function savedLines(outcome: ReplaceOutcome, options: ReplaceLinesOptions): string[] {
  const s = outcome.snapshot;
  if (s?.beforeId)
    return [
      `saved first: snapshot ${s.beforeId} ${quoted(s.label)} holds the site as it was (undo: cloudhal import --revert ${s.beforeId})${s.afterId ? `; ${s.afterId} ${quoted(s.afterLabel)} holds the result` : ""}`,
    ];
  if (!options.dryRun) return [];
  if (s)
    return [
      `saved first: this project's site (${s.nodes} nodes) as snapshot ${quoted(s.label)}, the result as ${quoted(s.afterLabel)} (undo: cloudhal import --revert <the first one>)`,
    ];
  const plan = options.plan;
  if (!plan) return [];
  return [
    `saved first: nothing (${plan.fresh ? "the site is new to this project" : "its nodes are unchanged"})`,
  ];
}

function revLines(outcome: ReplaceOutcome, options: ReplaceLinesOptions): string[] {
  const n = outcome.revsReused;
  if (!n) return [];
  const [verb, still] = options.dryRun ? ["would take", "holds"] : ["took", "still holds"];
  return [
    `note: ${n} node(s) ${verb} ${options.from}'s rev, no higher than theirs here; reload Studio tabs open on this site: an edit a tab or agent ${still} at that rev saves over them without a conflict`,
  ];
}

function switchLines(outcome: ReplaceOutcome, dryRun: boolean): string[] {
  const c = outcome.switch;
  if (!c || (!dryRun && !c.written)) return [];
  const sites = c.sites ? `, sites ${c.sites.before.join(", ")} → ${c.sites.after.join(", ")}` : "";
  // The switch only put `to` in place of `from`: undone by hand (--revert restores nodes only).
  const undo = `undo: write ${c.from} back in place of ${c.to} by hand; --revert does not`;
  const old = outcome.oldSite;
  const stays = !old
    ? ""
    : dryRun
      ? `; site ${c.from} would stay in the local store, unlisted`
      : `; site ${c.from} stays in the local store, unlisted and untouched (\`cloudhal site delete ${c.from} --confirm ${displayText(old.slug, 80)}\` deletes it for good)`;
  const lines = [`cloudhal.json: siteId ${c.from} → ${c.to}${sites} (${undo})${stays}`];
  if (old && old.openReleases > 0)
    lines.push(
      `warning: site ${c.from} has ${old.openReleases} open release(s); the scheduler of cloudhal dev, studio and mcp still runs them until they are cancelled in Studio`,
    );
  return lines;
}

function deployedLines(outcome: ReplaceOutcome, dryRun: boolean): string[] {
  const name = outcome.deployed;
  if (name === undefined) return [];
  const c = outcome.switch;
  // Never `--admin-url`: a push sends this project's deploy token, which no other deployment takes.
  if (c)
    return [
      `warning: this project is deployed (${name}) and its deployment serves site ${c.from}: \`cloudhal push\` ${dryRun ? "would send" : "now sends"} site ${c.to} there as another site, and the next \`cloudhal deploy\` serves it instead; a deployment of site ${c.to} itself is updated from the project that deployed it, not from here`,
    ];
  if (!outcome.snapshot) return [];
  return [
    `note: this project is deployed (${name}); \`cloudhal push --replace\` sends this graph there, and the deployment keeps its own published snapshot`,
  ];
}

/** The lines a replace (or revert) adds; none without an outcome. */
export function replaceLines(
  outcome: ReplaceOutcome | undefined,
  options: ReplaceLinesOptions,
): string[] {
  if (!outcome) return [];
  return [
    ...publishedLines(outcome, options),
    ...savedLines(outcome, options),
    ...revLines(outcome, options),
    ...switchLines(outcome, options.dryRun),
    ...deployedLines(outcome, options.dryRun),
  ];
}
