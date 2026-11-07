/**
 * Where the CLI finds the things it ships: the built Studio, the starters and the official skills.
 *
 * - Published package: `dist/assets/{studio,starters,skills}` (copied by scripts/build-packages.ts).
 * - Monorepo: `apps/studio/dist`, `starters/`, `skills/official`.
 */
import { access, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** The CLI package root, from either `src/` (monorepo) or `dist/src/` (published). */
async function packageRoot(): Promise<string> {
  let dir = here;
  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (await exists(pkg)) {
      const name = (JSON.parse(await readFile(pkg, "utf8")) as { name?: string }).name;
      if (name === "@cloudhal/cli") return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("could not locate the @cloudhal/cli package root");
}

/** The `@cloudhal/cli` version (its package.json's), from either layout. */
export async function cliVersion(): Promise<string> {
  const pkg = path.join(await packageRoot(), "package.json");
  const version = (JSON.parse(await readFile(pkg, "utf8")) as { version?: unknown }).version;
  if (typeof version !== "string") throw new Error(`${pkg} has no version`);
  return version;
}

export type AssetKind = "studio" | "starters" | "skills";

const MONOREPO: Record<AssetKind, string> = {
  studio: "../../apps/studio/dist",
  starters: "../../starters",
  skills: "../../skills/official",
};

/**
 * The directory for an asset kind, or undefined when neither layout has it. Running from source
 * (the monorepo) prefers the live monorepo folders — a `dist/assets` left by an earlier
 * `build:packages` would be stale; running from `dist/` (published) prefers the shipped copy.
 */
export async function assetDir(kind: AssetKind): Promise<string | undefined> {
  const root = await packageRoot();
  const shipped = path.join(root, "dist/assets", kind);
  const monorepo = path.resolve(root, MONOREPO[kind]);
  const fromDist = here.split(path.sep).includes("dist");
  for (const candidate of fromDist ? [shipped, monorepo] : [monorepo, shipped])
    if (await exists(candidate)) return candidate;
  return undefined;
}

/** Monorepo root (has pnpm-workspace.yaml) above the CLI package, when running from source. */
export async function monorepoRoot(): Promise<string | undefined> {
  const root = path.resolve(await packageRoot(), "../..");
  return (await exists(path.join(root, "pnpm-workspace.yaml"))) ? root : undefined;
}

/** Reads the `catalog:` block of a pnpm-workspace.yaml (flat `name: version` lines). */
export function parseCatalog(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const block = yaml.split(/\r?\n/);
  let inCatalog = false;
  for (const line of block) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog && /^\S/.test(line)) break;
    const m = inCatalog ? line.match(/^\s+"?([^":]+)"?:\s*(\S+)\s*$/) : null;
    if (m) out[m[1] as string] = m[2] as string;
  }
  return out;
}

/**
 * Third-party peers of the `@cloudhal/*` packages that a project must install exactly once (one
 * Astro for the renderer, the CLI and the project): pinned to the version the monorepo tests with.
 */
export const SHARED_PEERS = ["astro"] as const;

export interface DependencyVersions {
  /** `@cloudhal/*` package versions (workspace:* → that exact version, as pnpm publishes it). */
  workspace: Record<string, string>;
  /** pnpm catalog (catalog: → version). */
  catalog: Record<string, string>;
  /** Installed versions of `SHARED_PEERS` (win over the catalog's range). */
  installed?: Record<string, string>;
  /** `@cloudhal/*` package folders, for linking a project to a checkout. */
  dirs?: Record<string, string>;
}

export interface MaterializeOptions {
  /**
   * Link every `@cloudhal/*` dependency to the monorepo checkout (`link:`, relative to this
   * project folder) instead of naming a version: from source, that version may not be on npm.
   */
  readonly linkFrom?: string;
}

/** Replaces `workspace:` and `catalog:` specifiers so a project installs outside the monorepo. */
export function materializeDependencies(
  pkg: Record<string, unknown>,
  versions: DependencyVersions,
  options: MaterializeOptions = {},
): Record<string, unknown> {
  const out = { ...pkg };
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = out[field] as Record<string, string> | undefined;
    if (!deps) continue;
    const next: Record<string, string> = {};
    for (const [name, spec] of Object.entries(deps)) {
      if (spec.startsWith("workspace:")) next[name] = workspaceSpec(name, versions, options);
      else if (spec.startsWith("catalog:")) {
        const v = versions.installed?.[name] ?? versions.catalog[name];
        if (!v) throw new Error(`${name} is not in the pnpm catalog`);
        next[name] = v;
      } else next[name] = spec;
    }
    out[field] = next;
  }
  return out;
}

function workspaceSpec(
  name: string,
  versions: DependencyVersions,
  options: MaterializeOptions,
): string {
  if (options.linkFrom !== undefined) {
    const dir = versions.dirs?.[name];
    if (!dir) throw new Error(`no package folder known for ${name}`);
    return `link:${path.relative(options.linkFrom, dir).split(path.sep).join("/")}`;
  }
  const v = versions.workspace[name];
  if (!v) throw new Error(`no published version known for ${name}`);
  // Exact, like `pnpm publish` writes `workspace:*`: the packages are released together.
  return v;
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Versions as the monorepo defines them right now (for running the CLI from source). */
export async function monorepoVersions(root: string): Promise<DependencyVersions> {
  const catalog = parseCatalog(await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8"));
  const workspace: Record<string, string> = {};
  const dirs: Record<string, string> = {};
  const installed: Record<string, string> = {};
  for (const group of ["packages", "apps"]) {
    let names: string[] = [];
    try {
      names = await readdir(path.join(root, group));
    } catch {
      continue;
    }
    for (const n of names) {
      const dir = path.join(root, group, n);
      const p = await readJson(path.join(dir, "package.json"));
      if (typeof p?.name !== "string" || typeof p.version !== "string") continue;
      workspace[p.name] = p.version;
      dirs[p.name] = await realpath(dir);
      // A peer as this package resolves it in the monorepo: the version the tests ran with.
      const peers = (p.peerDependencies ?? {}) as Record<string, string>;
      for (const peer of SHARED_PEERS) {
        if (installed[peer] || !peers[peer]) continue;
        const got = await readJson(path.join(dir, "node_modules", peer, "package.json"));
        if (typeof got?.version === "string") installed[peer] = got.version;
      }
    }
  }
  return { workspace, catalog, installed, dirs };
}
