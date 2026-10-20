import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { assetDir, materializeDependencies, monorepoRoot, monorepoVersions } from "../assets.ts";
import { writeProjectConfig } from "../config.ts";
import { pnpmWorkspaceYaml } from "../project-setup.ts";
import { seedProjectSite } from "../seed-site.ts";
import { starterFilter } from "../starter-files.ts";

export interface InitOptions {
  readonly dir: string;
  readonly name?: string;
  readonly starter?: string;
  readonly log?: (line: string) => void;
}

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

export interface InitResult {
  readonly projectDir: string;
  readonly siteId: string;
  /**
   * The `@cloudhal/*` dependencies are `link:`s to the monorepo checkout this CLI runs from (its
   * versions may not be on npm yet); such a project installs with pnpm.
   */
  readonly linked: boolean;
}

export async function init(options: InitOptions): Promise<InitResult> {
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

  await cp(starterDir, projectDir, { recursive: true, filter: await starterFilter(starterDir) });
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
  // Inside the monorepo workspace the starter keeps workspace:/catalog: links. Published starters
  // already carry real versions. From a source checkout, anywhere else, the packages are linked to
  // that checkout: their version need not exist on npm yet.
  const inWorkspace = (await findWorkspaceRoot(projectDir)) !== undefined;
  const repo = inWorkspace ? undefined : await monorepoRoot();
  const out = repo
    ? materializeDependencies(pkg, await monorepoVersions(repo), {
        // real paths, so the relative link survives symlinked folders (macOS /var → /private/var)
        linkFrom: await realpath(projectDir),
      })
    : pkg;
  await writeFile(pkgPath, `${JSON.stringify(out, null, 2)}\n`);
  if (repo) log(`linked @cloudhal/* to ${repo} (install with pnpm)`);
  // pnpm 12 fails the install unless the native builds are allowed (settings-only workspace file;
  // inside the monorepo its own file already allows them).
  if (!inWorkspace)
    await writeFile(path.join(projectDir, "pnpm-workspace.yaml"), pnpmWorkspaceYaml());

  const dataDir = ".cloudhal";
  const site = await seedProjectSite(projectDir, { dataDir, name, slug });
  // RFC-0006 owner decision 4: new projects record cookie-less analytics by default.
  // RFC-0007 §15.4: reader comments are available to the deployment, but stay off for the site
  // until someone turns them on in Studio (D4).
  await writeProjectConfig(projectDir, {
    siteId: site.id,
    dataDir,
    analytics: { enabled: true },
    comments: { available: true },
  });
  log(`seeded site ${site.id} (${name}) in ${dataDir}/`);
  return { projectDir, siteId: site.id, linked: repo !== undefined };
}
