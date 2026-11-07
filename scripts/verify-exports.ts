/**
 * Every target a published package names must be in its tarball (ADR-0013: the tarballs ship
 * `files`, i.e. `dist`, and point `publishConfig.exports`/`bin` at it). A target outside `files`
 * or missing from the build fails only in a consumer's install (`ERR_MODULE_NOT_FOUND`), so
 * scripts/build-packages.ts runs this after every build (CI's publishable-packages build,
 * smoke-pack, publish) and on its own with `--verify`.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Json = Record<string, unknown>;

/** `[key, target]` for every string leaf of an exports or bin map, conditions included. */
export function publishTargets(value: unknown, key: string): [string, string][] {
  if (typeof value === "string") return [[key, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Json).flatMap(([k, v]) =>
    publishTargets(v, k.startsWith(".") ? k : `${key} (${k})`),
  );
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** A plain target must be a file; a wildcard one needs an entry starting with its prefix. */
async function exists(dir: string, rel: string): Promise<boolean> {
  const star = rel.indexOf("*");
  if (star < 0) return isFile(path.join(dir, rel));
  const prefix = rel.slice(0, star);
  const slash = prefix.lastIndexOf("/") + 1;
  try {
    const entries = await readdir(path.join(dir, prefix.slice(0, slash)));
    return entries.some((e) => e.startsWith(prefix.slice(slash)));
  } catch {
    return false;
  }
}

/** Problems with a package's published exports and bin, one line each (`name: key → target: why`). */
export async function verifyPublishTargets(dir: string, pkg: Json): Promise<string[]> {
  const publish = (pkg.publishConfig ?? {}) as Json;
  const files = Array.isArray(pkg.files)
    ? (pkg.files as string[]).map((f) => f.replace(/^\.\//, "").replace(/\/$/, ""))
    : undefined;
  const problems: string[] = [];
  for (const [key, target] of [
    ...publishTargets(publish.exports, "."),
    ...publishTargets(publish.bin, "bin"),
  ]) {
    const rel = target.replace(/^\.\//, "");
    let why: string | undefined;
    if (files && !files.some((f) => rel === f || rel.startsWith(`${f}/`))) why = "outside files";
    else if (!(await exists(dir, rel))) why = "missing";
    if (why) problems.push(`${String(pkg.name)}: ${key} → ${target}: ${why}`);
  }
  return problems;
}

/** `verifyPublishTargets` over `packages/<name>` for each name. */
export async function verifyPackages(root: string, names: readonly string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const name of names) {
    const dir = path.join(root, "packages", name);
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as Json;
    problems.push(...(await verifyPublishTargets(dir, pkg)));
  }
  return problems;
}
