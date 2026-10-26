/**
 * The text of the cloudhal-template PR that scripts/template-sync.ts writes for
 * .github/workflows/template-sync.yml (issue #111): what moved, what to read, what must pass.
 * A pure function over scripts/template-plan.ts's operations; Node built-ins only.
 */
import type { DepChange, SyncOp } from "./template-plan.ts";

export interface PrBodyOptions {
  readonly ops: readonly SyncOp[];
  /** The version the template was on (`currentVersion` before the sync). */
  readonly from: string | undefined;
  readonly to: string;
  readonly deps?: readonly DepChange[] | undefined;
  /** The workflow run that opened the PR. */
  readonly runUrl?: string | undefined;
}

/** Paths listed per section; the rest is counted. */
const LIST_CAP = 50;

function pathList(title: string, paths: readonly string[]): string[] {
  if (!paths.length) return [];
  const shown = paths.slice(0, LIST_CAP).map((p) => `- \`${p}\``);
  if (paths.length > LIST_CAP) shown.push(`- … and ${paths.length - LIST_CAP} more`);
  return [`${title} (${paths.length}):`, "", ...shown, ""];
}

function depLine(d: DepChange): string {
  const where = d.field === "dependencies" ? "" : ` (${d.field})`;
  const from = d.from === undefined ? "added" : `\`${d.from}\``;
  const to = d.to === undefined ? "removed" : `\`${d.to}\``;
  return `- \`${d.name}\`${where}: ${from} → ${to}`;
}

const minor = (v: string) => v.split(".", 2).join(".");

/** The PR body (Markdown). */
export function prBody(o: PrBodyOptions): string {
  const paths = (pick: (op: SyncOp) => boolean) => o.ops.filter(pick).map((op) => op.path);
  const files = [
    ...pathList(
      "Changed",
      paths((op) => op.kind === "write" && !op.added),
    ),
    ...pathList(
      "Added",
      paths((op) => op.kind === "write" && op.added),
    ),
    ...pathList(
      "Removed",
      paths((op) => op.kind === "delete"),
    ),
  ];
  const deps = (o.deps ?? []).map(depLine);
  const minorStep = o.from !== undefined && minor(o.from) !== minor(o.to);
  return [
    `Moves this template from Cloudhal ${o.from ?? "(unknown)"} to **${o.to}**: \`@cloudhal/*\` at \`^${o.to}\`, and \`src/\`, \`public/\`, \`astro.config.mjs\` and \`tsconfig.json\` from the blog starter \`@cloudhal/cli@${o.to}\` ships (what \`npm create cloudhal\` copies), with a refreshed \`package-lock.json\`. README, \`wrangler.jsonc\`, \`cloudhal.json\` and \`.github/\` are the template's own and stay as they are.`,
    "",
    `Release notes: https://github.com/cloudhal-dev/cloudhal/releases/tag/v${o.to}`,
    "",
    `${minorStep ? "**This is a minor step.** " : ""}In 0.x a minor version may break: read the release notes before merging a minor step.`,
    "",
    "### Files",
    "",
    ...(files.length ? files : ["None: dependencies and the lockfile only.", ""]),
    "### Dependencies",
    "",
    ...(deps.length ? deps : ["None changed in package.json."]),
    "",
    "### Before merging",
    "",
    "The `cloudhal/template-check` status must be green: the Template sync run installed a copy of this branch with `npm ci` and ran `cloudhal deploy --dry-run` with `WORKERS_CI=1`. Merging changes what the Deploy to Cloudflare button deploys from now on; sites created earlier keep their theme.",
    "",
    `Opened by the Cloudhal release workflow${o.runUrl ? ` ([run](${o.runUrl}))` : ""}. Do not push to this branch: a re-run of Template sync rebuilds it from \`main\` and replaces it.`,
    "",
  ].join("\n");
}
