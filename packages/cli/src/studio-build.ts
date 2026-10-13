/**
 * Keeps `cloudhal deploy` from shipping a stale Studio when it runs from the monorepo, where the
 * Studio is `apps/studio/dist` — a build nothing else keeps current. A published install ships
 * Studio prebuilt in `dist/assets/studio` and is never checked.
 */
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/** The monorepo's Studio build, relative to the repo root. */
export const MONOREPO_STUDIO_DIST = "apps/studio/dist";

/** What a Studio build is made from, relative to the repo root (files or directories). */
export const STUDIO_SOURCES = ["apps/studio/src", "apps/studio/index.html", "packages/ui/src"];

export const STUDIO_BUILD_COMMAND = "pnpm --filter @cloudhal/studio build";

async function mtimeOf(p: string): Promise<number | undefined> {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return undefined;
  }
}

/** The most recently modified file under `paths` (each a file or a directory), if any. */
export async function newestFile(
  paths: readonly string[],
): Promise<{ file: string; mtimeMs: number } | undefined> {
  let newest: { file: string; mtimeMs: number } | undefined;
  const visit = async (p: string): Promise<void> => {
    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(p);
    } catch {
      return;
    }
    if (s.isDirectory()) {
      for (const name of await readdir(p)) await visit(path.join(p, name));
    } else if (!newest || s.mtimeMs > newest.mtimeMs) newest = { file: p, mtimeMs: s.mtimeMs };
  };
  for (const p of paths) await visit(p);
  return newest;
}

export type StudioBuildState =
  | { state: "current" }
  | { state: "missing" }
  /** `newest` is the source file (relative to the repo root) edited after the build. */
  | { state: "stale"; newest: string };

/** Compares the monorepo's `apps/studio/dist/index.html` with the newest Studio source file. */
export async function studioBuildState(repoRoot: string): Promise<StudioBuildState> {
  const built = await mtimeOf(path.join(repoRoot, MONOREPO_STUDIO_DIST, "index.html"));
  if (built === undefined) return { state: "missing" };
  const newest = await newestFile(STUDIO_SOURCES.map((p) => path.join(repoRoot, p)));
  return newest && newest.mtimeMs > built
    ? { state: "stale", newest: path.relative(repoRoot, newest.file) }
    : { state: "current" };
}

export type StudioBuilder = (repoRoot: string, log: (line: string) => void) => Promise<void>;

/** Runs `pnpm --filter @cloudhal/studio build` in the repo root. */
export const pnpmStudioBuild: StudioBuilder = async (repoRoot, log) => {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["--filter", "@cloudhal/studio", "build"], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of chunk.toString().split("\n")) if (line.trim()) log(`  ${line}`);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (err) =>
      reject(new Error(`could not run \`${STUDIO_BUILD_COMMAND}\`: ${err.message}`)),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`\`${STUDIO_BUILD_COMMAND}\` failed (${code}):\n${output.slice(-4000)}`),
          ),
    );
  });
};

export interface EnsureStudioBuildOptions {
  /** The Studio directory the deploy is about to upload. */
  readonly studioDir: string;
  /** The monorepo root when the CLI runs from source; undefined for a published install. */
  readonly repoRoot: string | undefined;
  /** `false` (`--no-build-studio`): never build; a missing or stale build fails the deploy. */
  readonly build: boolean;
  readonly log: (line: string) => void;
  /** Injected in tests. */
  readonly builder?: StudioBuilder;
}

/**
 * When `studioDir` is the monorepo's `apps/studio/dist`, makes sure it is at least as new as the
 * Studio sources: builds it when it is missing or older, or fails naming the command when building
 * is switched off. Any other directory (a published install's shipped copy, an explicit one) is
 * left alone. Returns whether it built.
 */
export async function ensureStudioBuild(options: EnsureStudioBuildOptions): Promise<boolean> {
  const { repoRoot, log } = options;
  if (!repoRoot) return false;
  if (path.resolve(options.studioDir) !== path.resolve(repoRoot, MONOREPO_STUDIO_DIST))
    return false;
  const current = await studioBuildState(repoRoot);
  if (current.state === "current") return false;
  const why =
    current.state === "missing"
      ? `no Studio build at ${MONOREPO_STUDIO_DIST}`
      : `the Studio build in ${MONOREPO_STUDIO_DIST} is older than ${current.newest}`;
  if (!options.build)
    throw new Error(
      `${why}. Run \`${STUDIO_BUILD_COMMAND}\`, or deploy without --no-build-studio to build it.`,
    );
  log(`studio: ${why}; running \`${STUDIO_BUILD_COMMAND}\``);
  await (options.builder ?? pnpmStudioBuild)(repoRoot, log);
  const after = await studioBuildState(repoRoot);
  if (after.state === "missing")
    throw new Error(
      `\`${STUDIO_BUILD_COMMAND}\` finished without ${MONOREPO_STUDIO_DIST}/index.html`,
    );
  // A source dated in the future (clock skew) stays newer than any build; say so, deploy anyway.
  if (after.state === "stale")
    log(`studio: built, but ${after.newest} is dated after the new build (clock skew?)`);
  return true;
}
