/** A new project's first five minutes: install settings, dependencies and next steps (ADR-0013). */
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BUILD_DEPENDENCIES,
  detectPackageManager,
  init,
  nextSteps,
  pnpmWorkspaceYaml,
} from "../src/index.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const STARTER = path.join(ROOT, "starters/blog");

describe("next steps", () => {
  it("names the package manager that ran the command", () => {
    expect(detectPackageManager("pnpm/12.10.1 npm/? node/v24.9.0 darwin arm64")).toBe("pnpm");
    expect(detectPackageManager("yarn/4.9.1 npm/? node/v24.9.0 linux x64")).toBe("yarn");
    expect(detectPackageManager("bun/1.3.0 npm/? node/v24.3.0 darwin arm64")).toBe("bun");
    expect(detectPackageManager("npm/11.6.0 node/v24.9.0 darwin arm64 workspaces/false")).toBe(
      "npm",
    );
    expect(detectPackageManager("")).toBe("npm");
  });

  it("runs every step through the project's scripts (cloudhal is not on PATH)", () => {
    for (const pm of ["npm", "pnpm", "yarn", "bun"] as const) {
      const steps = nextSteps("my site", pm);
      expect(steps[0]).toBe('cd "my site"');
      expect(steps[1]).toBe(`${pm} install`);
      expect(steps[2]).toMatch(new RegExp(`^${pm} run dev\\s+live preview`));
      for (const step of steps) expect(step).not.toMatch(/^cloudhal /);
    }
  });
});

describe("install settings", () => {
  it("allows the same native builds as the monorepo, for pnpm 12 and bun", async () => {
    const workspace = await readFile(path.join(ROOT, "pnpm-workspace.yaml"), "utf8");
    for (const name of BUILD_DEPENDENCIES) expect(workspace).toContain(`\n  ${name}: true`);
    expect(pnpmWorkspaceYaml()).toBe(
      "# pnpm 12 runs install scripts only for packages allowed here.\nallowBuilds:\n  better-sqlite3: true\n  esbuild: true\n  workerd: true\n# Cloudhal releases install on the day they ship.\nminimumReleaseAgeExclude:\n  - '@cloudhal/*'\n  - 'create-cloudhal'\n",
    );
    const pkg = JSON.parse(await readFile(path.join(STARTER, "package.json"), "utf8"));
    expect(pkg.trustedDependencies).toEqual([...BUILD_DEPENDENCIES]);
    // yarn 2+ installs into node_modules
    expect(await readFile(path.join(STARTER, ".yarnrc.yml"), "utf8")).toMatch(
      /^nodeLinker: node-modules$/m,
    );
  });

  it("the starter commits cloudhal.json: settings travel with the project", async () => {
    const ignored = (await readFile(path.join(STARTER, ".gitignore"), "utf8")).split("\n");
    expect(ignored).not.toContain("cloudhal.json");
    expect(ignored).toContain(".cloudhal/");
  });
});

describe("init outside the monorepo, from a source checkout", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-setup-"));
    projectDir = path.join(tmp, "first-site");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("links @cloudhal/* to the checkout, pins Astro to its copy and allows the builds", async () => {
    const r = await init({ dir: projectDir, name: "First Site" });
    expect(r.linked).toBe(true);
    const pkg = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const real = await realpath(projectDir);
    for (const [name, spec] of Object.entries(deps)) {
      expect(spec, name).not.toMatch(/^(workspace|catalog):/);
      if (!name.startsWith("@cloudhal/")) continue;
      expect(spec, name).toMatch(/^link:/);
      const target = path.resolve(real, spec.slice("link:".length));
      const linked = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"));
      expect(linked.name).toBe(name);
    }
    const astro = JSON.parse(
      await readFile(
        path.join(ROOT, "packages/astro-renderer/node_modules/astro/package.json"),
        "utf8",
      ),
    );
    expect(deps.astro).toBe(astro.version);
    expect(await readFile(path.join(projectDir, "pnpm-workspace.yaml"), "utf8")).toBe(
      pnpmWorkspaceYaml(),
    );
    expect((await stat(path.join(projectDir, ".yarnrc.yml"))).isFile()).toBe(true);
  });
});
