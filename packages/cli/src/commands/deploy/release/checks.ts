/**
 * What `deploy --release` checks before it downloads the tarball (RFC-0046 §11b): the project's
 * shape, its theme files against this CLI's starter, its `cloudhal.json` build keys, and the
 * wrangler that will upload the bytes.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { installedWranglerVersion, versionAtLeast } from "../../../cloudflare/wrangler.ts";
import { CONFIG_FILE, type ProjectConfig } from "../../../config.ts";
import { buildKeyProblems } from "../../../config-build-keys.ts";
import { inWorkersBuilds } from "../workers-builds.ts";
import { refuseDeploy, WITHOUT_RELEASE } from "./errors.ts";
import {
  cliStarter,
  listDifferences,
  type ThemeDifference,
  themeDifferences,
} from "./theme-check.ts";

/** Another installation, several sites, Workers Builds: refused before anything is fetched. */
export function checkProjectShape(cfg: ProjectConfig, workersBuilds: boolean | undefined): void {
  if (cfg.installation)
    refuseDeploy(
      "project-unsupported",
      `this project's site Worker joins the installation in ${cfg.installation} (cloudhal.json \`installation\`); --release installs a whole deployment. ${WITHOUT_RELEASE}`,
    );
  if (cfg.sites)
    refuseDeploy(
      "project-unsupported",
      `this project serves several sites (cloudhal.json \`sites\`), which --release does not install. ${WITHOUT_RELEASE}`,
    );
  if (inWorkersBuilds(workersBuilds))
    refuseDeploy(
      "project-unsupported",
      "--release does not run in Cloudflare Workers Builds: a build there deploys the checkout.",
    );
}

/** The project's files that differ from the starter: refused, or listed with the flag. */
export async function checkTheme(
  projectDir: string,
  discard: boolean | undefined,
  log: (line: string) => void,
): Promise<ThemeDifference[]> {
  const diffs = await themeDifferences(projectDir, await cliStarter());
  if (diffs.length === 0) return [];
  if (!discard)
    refuseDeploy(
      "theme-differs",
      `--release installs this CLI's official theme, and these build inputs differ from it:\n${listDifferences(diffs)}\nRun \`cloudhal deploy\` without --release to build the project as it is, or add --discard-local-theme to deploy the official theme anyway (your files stay on disk; they are not deployed).`,
    );
  log(
    `--discard-local-theme: the official theme is deployed; these ${diffs.length} files of the project are not:\n${listDifferences(diffs, true)}`,
  );
  return diffs;
}

/** `cloudhal.json` keys the bundle cannot honour (`config-build-keys.ts`). */
export async function checkBuildKeys(
  projectDir: string,
  features: Readonly<Record<string, boolean>>,
): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(projectDir, CONFIG_FILE), "utf8")) as Record<
    string,
    unknown
  >;
  const problems = buildKeyProblems(raw, features);
  if (problems.length === 0) return;
  const lines = problems.map((p) =>
    p.problem === "unknown"
      ? `  ${p.key}: this CLI does not know the key`
      : `  ${p.key}: ${JSON.stringify(p.value)} differs from the starter's (the bundle was built without it)`,
  );
  refuseDeploy(
    "config-build-key",
    `cloudhal.json sets keys the signed bundle cannot honour (--discard-local-theme does not cover these):\n${lines.join("\n")}\nChange them, or ${WITHOUT_RELEASE.charAt(0).toLowerCase()}${WITHOUT_RELEASE.slice(1)}`,
  );
}

/** The wrangler that will run is at least the bundle's (`manifest.toolchain.wrangler`). */
export async function checkWrangler(
  projectDir: string,
  required: string | undefined,
  known?: string,
): Promise<void> {
  if (!required) return;
  const installed = known ?? (await installedWranglerVersion(projectDir));
  if (!installed || !versionAtLeast(installed, required))
    refuseDeploy(
      "wrangler-too-old",
      `--release needs wrangler ${required} or newer, the version the bundle was built with (found ${installed ?? "none"}). Run \`pnpm add -D wrangler@^${required}\`.`,
    );
}
