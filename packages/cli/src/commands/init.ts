import { access, cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { assetDir, materializeDependencies, monorepoRoot, monorepoVersions } from "../assets.ts";
import { writeProjectConfig } from "../config.ts";

export interface InitOptions {
  readonly dir: string;
  readonly name?: string;
  readonly starter?: string;
  readonly log?: (line: string) => void;
}

const SKIP = new Set(["node_modules", "dist", ".astro", ".cloudhal", "cloudhal.json"]);

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Walks up from `dir` to find a pnpm workspace root (so copied starters keep `workspace:*` links). */
export async function findWorkspaceRoot(dir: string): Promise<string | undefined> {
  let cur = path.resolve(dir);
  for (;;) {
    if (await exists(path.join(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "site"
  );
}

export async function init(options: InitOptions): Promise<{ projectDir: string; siteId: string }> {
  const log = options.log ?? (() => {});
  const projectDir = path.resolve(options.dir);
  const starter = options.starter ?? "blog";
  const startersDir = await assetDir("starters");
  if (!startersDir) throw new Error("no starters found in this cloudhal installation");
  const starterDir = path.join(startersDir, starter);
  if (!(await exists(starterDir)))
    throw new Error(`unknown starter "${starter}" (looked in ${startersDir})`);
  if ((await exists(projectDir)) && (await readdir(projectDir)).length > 0) {
    throw new Error(`${projectDir} is not empty`);
  }
  await mkdir(projectDir, { recursive: true });

  await cp(starterDir, projectDir, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  // Published starters carry `_gitignore` (npm strips .gitignore from tarballs).
  if (await exists(path.join(projectDir, "_gitignore")))
    await rename(path.join(projectDir, "_gitignore"), path.join(projectDir, ".gitignore"));
  log(`copied starter "${starter}"`);

  const name = options.name ?? path.basename(projectDir);
  const slug = slugify(name);
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = slug;
  pkg.private = true;
  // Inside the monorepo workspace the starter keeps workspace:/catalog: links; anywhere else they
  // become real versions so `npm install` works (published starters already have them).
  const inWorkspace = (await findWorkspaceRoot(projectDir)) !== undefined;
  const repo = await monorepoRoot();
  const out =
    !inWorkspace && repo ? materializeDependencies(pkg, await monorepoVersions(repo)) : pkg;
  await writeFile(pkgPath, `${JSON.stringify(out, null, 2)}\n`);

  const dataDir = ".cloudhal";
  const local = await openLocalStore(path.join(projectDir, dataDir));
  try {
    const site = await seedStarterSite(local.store, { name, slug });
    await writeProjectConfig(projectDir, { siteId: site.id, dataDir });
    log(`seeded site ${site.id} (${name}) in ${dataDir}/`);
    return { projectDir, siteId: site.id };
  } finally {
    await local.close();
  }
}
