/**
 * What a CI release publishes (ADR-0013; the fixed changesets group): the one version all
 * publishable packages share, which of them npm does not have yet, and the release notes for the
 * single `v<version>` tag and GitHub Release. Pure functions over package files, used by
 * `scripts/publish-ci.ts` and its tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PACKAGES } from "./build-packages.ts";

export interface Pkg {
  /** Folder under `packages/`. */
  readonly dir: string;
  readonly name: string;
  readonly version: string;
}

export function readPackages(root: string): Pkg[] {
  return PACKAGES.map((dir) => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "packages", dir, "package.json"), "utf8"),
    ) as { name: string; version: string };
    return { dir, name: pkg.name, version: pkg.version };
  });
}

/** The fixed group's version; throws if the packages disagree (a half-applied release). */
export function sharedVersion(pkgs: readonly Pkg[]): string {
  const versions = new Set(pkgs.map((p) => p.version));
  if (versions.size !== 1) {
    const list = pkgs.map((p) => `${p.name}@${p.version}`).join(", ");
    throw new Error(`publishable packages must share one version (fixed group): ${list}`);
  }
  return [...versions][0] as string;
}

/** The packages whose current version npm does not have, in dependency (publish) order. */
export async function unpublished(
  pkgs: readonly Pkg[],
  onNpm: (name: string, version: string) => Promise<boolean>,
): Promise<Pkg[]> {
  const out: Pkg[] = [];
  for (const p of pkgs) if (!(await onNpm(p.name, p.version))) out.push(p);
  return out;
}

/** Lines the fixed group writes into every changelog: dependency bumps, not changes. */
const DEPENDENCY_ONLY = /^- (?:Updated dependencies|(?:@cloudhal\/[a-z-]+|create-cloudhal)@\d)/;

/**
 * Release notes for `version`: every entry under `## <version>` in the packages' changelogs,
 * once each, without the "Updated dependencies" lines the fixed group adds to every package.
 */
export function releaseNotes(changelogs: readonly string[], version: string): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const text of changelogs) {
    const start = text.indexOf(`\n## ${version}\n`);
    if (start === -1) continue;
    const rest = text.slice(start + version.length + 5);
    const section = rest.slice(0, rest.search(/\n## /) === -1 ? undefined : rest.search(/\n## /));
    for (const block of section.split(/\n(?=- )/)) {
      const entry = block.trim();
      if (!entry.startsWith("- ") || DEPENDENCY_ONLY.test(entry)) continue;
      const text = entry.replace(/^- [0-9a-f]{7,40}: /, "- ");
      if (!seen.has(text)) {
        seen.add(text);
        entries.push(text);
      }
    }
  }
  return [
    `All \`@cloudhal/*\` packages and \`create-cloudhal\` at **${version}**.`,
    "",
    "## Changes",
    "",
    ...(entries.length ? entries : ["- Dependency updates only."]),
    "",
    "## Upgrade",
    "",
    "```sh",
    `npm install @cloudhal/cli@${version} @cloudhal/core-ts@${version} @cloudhal/astro-renderer@${version} @cloudhal/cloudflare@${version}`,
    "npx cloudhal deploy",
    "```",
    "",
    "Docs: https://cloudhal.dev/docs/start/installation#upgrading",
    "",
  ].join("\n");
}
