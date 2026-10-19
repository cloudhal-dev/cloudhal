/**
 * Which files of a starter get copied (by `cloudhal init` and by the package build). Inside a git
 * checkout only what git knows — tracked files and new ones it does not ignore — so local build
 * output, test leftovers and other ignored files never reach a new project; elsewhere (a
 * published CLI, no git) everything but the build directories.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

/** Never copied, with or without git. */
export const STARTER_SKIP = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".cloudhal",
  ".wrangler",
  "wrangler.jsonc",
  "cloudhal.json",
]);

/** The starter's files as git sees them, relative to `dir`; undefined outside a git checkout. */
async function gitFiles(dir: string): Promise<Set<string> | undefined> {
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."],
      { cwd: dir, maxBuffer: 16 * 1024 * 1024 },
    );
    const files = stdout.split("\0").filter(Boolean);
    return files.length > 0 ? new Set(files) : undefined;
  } catch {
    return undefined;
  }
}

/** A `cp` filter for copying `dir`: keeps a path when it is, or leads to, a file worth copying. */
export async function starterFilter(dir: string): Promise<(src: string) => boolean> {
  const files = await gitFiles(dir);
  const keep = new Set<string>();
  for (const file of files ?? []) {
    const parts = file.split("/");
    for (let i = 1; i <= parts.length; i++) keep.add(parts.slice(0, i).join("/"));
  }
  return (src) => {
    if (STARTER_SKIP.has(path.basename(src))) return false;
    if (!files) return true;
    const rel = path.relative(dir, src).split(path.sep).join("/");
    return rel === "" || keep.has(rel);
  };
}
