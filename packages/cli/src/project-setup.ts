/**
 * What a new project needs besides the starter's files so the first install and the first run
 * work with npm, pnpm, yarn and bun (ADR-0013): which install scripts to allow, and the next
 * steps to print in the package manager the person used.
 */

/**
 * Dependencies whose install scripts must run (native builds and binaries): pnpm 12 refuses the
 * install without `allowBuilds` for them, bun skips them without `trustedDependencies`. The
 * monorepo's own pnpm-workspace.yaml allows the same ones.
 */
export const BUILD_DEPENDENCIES = ["better-sqlite3", "esbuild", "workerd"] as const;

/** pnpm settings for a project outside a workspace: settings only, no `packages`. */
export function pnpmWorkspaceYaml(): string {
  return [
    "# pnpm 12 runs install scripts only for packages allowed here.",
    "allowBuilds:",
    ...BUILD_DEPENDENCIES.map((name) => `  ${name}: true`),
    "",
  ].join("\n");
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The package manager that started this process (`npm create`, `pnpm dlx`, `bunx` …); npm otherwise. */
export function detectPackageManager(
  userAgent: string | undefined = process.env.npm_config_user_agent,
): PackageManager {
  const name = userAgent?.split("/")[0];
  return name === "pnpm" || name === "yarn" || name === "bun" ? name : "npm";
}

/**
 * The commands to run after `init`. `cloudhal` itself is a project dependency, not on PATH, so
 * every step goes through the project's npm scripts.
 */
export function nextSteps(dir: string, pm: PackageManager): string[] {
  const scripts: Array<[string, string]> = [
    ["dev", "live preview with drafts, fully offline"],
    ["studio", "Studio + API + MCP for this project"],
    ["deploy", "put it on Cloudflare (uses your wrangler login)"],
  ];
  const width = Math.max(...scripts.map(([s]) => `${pm} run ${s}`.length)) + 3;
  return [
    `cd ${/\s/.test(dir) ? JSON.stringify(dir) : dir}`,
    `${pm} install`,
    ...scripts.map(([s, what]) => `${`${pm} run ${s}`.padEnd(width)}${what}`),
  ];
}
