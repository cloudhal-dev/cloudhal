import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { writeProjectConfig } from "../config.ts";

export interface InitOptions {
  readonly dir: string;
  readonly name?: string;
  readonly starter?: string;
  readonly log?: (line: string) => void;
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** Starters ship inside the monorepo; a published CLI resolves them from its own package later. */
const STARTERS_DIR = path.resolve(here, "../../../../starters");
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
  const starterDir = path.join(STARTERS_DIR, starter);
  if (!(await exists(starterDir)))
    throw new Error(`unknown starter "${starter}" (looked in ${STARTERS_DIR})`);
  if ((await exists(projectDir)) && (await readdir(projectDir)).length > 0) {
    throw new Error(`${projectDir} is not empty`);
  }
  await mkdir(projectDir, { recursive: true });

  await cp(starterDir, projectDir, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  log(`copied starter "${starter}"`);

  const name = options.name ?? path.basename(projectDir);
  const slug = slugify(name);
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = slug;
  pkg.private = true;
  const inWorkspace = (await findWorkspaceRoot(projectDir)) !== undefined;
  if (!inWorkspace) {
    const deps = pkg.dependencies as Record<string, string>;
    for (const [k, v] of Object.entries(deps)) if (v.startsWith("workspace:")) deps[k] = "^0.0.1";
  }
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

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
