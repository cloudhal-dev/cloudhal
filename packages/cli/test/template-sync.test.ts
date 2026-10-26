import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lockPins, lockProblems } from "../../../scripts/template-lock.ts";
import {
  applySync,
  assertKnownFields,
  assertPublishedStarter,
  compareVersions,
  currentVersion,
  dependencyChanges,
  KNOWN_STARTER_FIELDS,
  mergeGitignore,
  mergeScripts,
  planSync,
  SYNCED_DIRS,
  SYNCED_FILES,
  type SyncOp,
  templatePackageJson,
  unknownEntries,
} from "../../../scripts/template-plan.ts";
import { prBody } from "../../../scripts/template-pr.ts";
import { starterFilter } from "../src/starter-files.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** cloudhal-template's package.json as of 0.6.0 (cloudhal-template a42d4a5). */
const TEMPLATE_PKG = {
  name: "cloudhal-blog",
  version: "0.0.1",
  private: true,
  description: "Cloudhal, the agent-native site platform: a blog on Cloudflare.",
  type: "module",
  scripts: {
    dev: "cloudhal dev",
    studio: "cloudhal studio",
    snapshot: "cloudhal snapshot",
    mcp: "cloudhal mcp",
    "build:static": "cloudhal build",
    deploy: "cloudhal deploy",
    astro: "astro",
  },
  dependencies: {
    "@astrojs/cloudflare": "14.3.4",
    "@cloudhal/astro-renderer": "^0.6.0",
    "@cloudhal/cli": "^0.6.0",
    "@cloudhal/core-ts": "^0.6.0",
    "@tailwindcss/vite": "^4.3.3",
    astro: "7.3.6",
    "better-sqlite3": "13.0.3",
    tailwindcss: "^4.3.3",
  },
  devDependencies: { "@cloudhal/cloudflare": "^0.6.0", wrangler: "^4.148.0" },
  trustedDependencies: ["better-sqlite3", "esbuild", "workerd"],
  license: "Apache-2.0",
  engines: { node: ">=24" },
  cloudflare: { label: "Cloudhal blog", products: ["Workers", "D1", "R2"] },
};

/** The starter's package.json as @cloudhal/cli@0.6.1 ships it (materialized, exact pins). */
function starterPkg(version = "0.6.1") {
  return {
    name: "@cloudhal/starter-blog",
    version: "0.0.1",
    private: true,
    description: "Cloudhal blog starter (Astro). Copied by `cloudhal init`.",
    type: "module",
    scripts: {
      dev: "cloudhal dev",
      build: "cloudhal build",
      studio: "cloudhal studio",
      snapshot: "cloudhal snapshot",
      mcp: "cloudhal mcp",
      deploy: "cloudhal deploy",
      astro: "astro",
    },
    dependencies: {
      "@cloudhal/astro-renderer": version,
      "@cloudhal/core-ts": version,
      "@tailwindcss/vite": "^4.3.3",
      astro: "7.3.6",
      "better-sqlite3": "13.0.3",
      tailwindcss: "^4.3.3",
      "@astrojs/cloudflare": "14.3.4",
      "@cloudhal/cli": version,
    },
    devDependencies: { wrangler: "^4.148.0", "@cloudhal/cloudflare": version },
    trustedDependencies: ["better-sqlite3", "esbuild", "workerd"],
  };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
/** Not UTF-8: the sync must copy bytes, not text. */
const FONT = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe, 0x00, 0x80, 0xc3]);

let tmp: string;
let starter: string;
let template: string;

async function put(root: string, rel: string, data: string | Buffer): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), data);
}

/** Every file under `dir` (recursive), relative, with its bytes. */
async function tree(dir: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const rel of (await readdir(dir, { recursive: true })).sort()) {
    const abs = path.join(dir, rel);
    if ((await lstat(abs)).isFile()) out.set(rel.split(path.sep).join("/"), await readFile(abs));
  }
  return out;
}

async function fixtureStarter(version = "0.6.1"): Promise<void> {
  await put(starter, "src/pages/[...path].astro", "---\n---\n<p>page</p>\n");
  await put(starter, "src/styles/features/tokens.css", ".ch-richtext a:not(.ch-button) {}\n");
  await put(starter, "public/fonts/v1/a.woff2", FONT);
  await put(starter, "public/_headers", "/fonts/*\n  Cache-Control: immutable\n");
  await put(starter, "astro.config.mjs", "export default {};\n");
  await put(starter, "tsconfig.json", '{ "extends": "astro/tsconfigs/strict" }\n');
  await put(starter, "package.json", json(starterPkg(version)));
  await put(starter, "_gitignore", "dist/\n.astro/\n.cloudhal/\nnode_modules/\n.wrangler/\n");
  await put(starter, "README.md", "# Starter readme\n");
  await put(starter, ".yarnrc.yml", "nodeLinker: node-modules\n");
  await put(starter, "node_modules/junk.js", "junk\n");
}

const TEMPLATE_OWN = {
  "README.md": "# Cloudhal blog template\n",
  "wrangler.jsonc": '{ "name": "cloudhal-blog-site" }\n',
  "cloudhal.json": '{ "siteId": "site_NSA1J36SDRCY24Q2QSEM" }\n',
  ".node-version": "24\n",
  ".github/workflows/check.yml": "name: Check\n",
};

async function fixtureTemplate(pkg: unknown = TEMPLATE_PKG): Promise<void> {
  await put(template, "src/pages/[...path].astro", "---\n---\n<p>page</p>\n");
  await put(template, "src/styles/features/tokens.css", ".ch-richtext a {}\n");
  await put(template, "src/old.astro", "<p>gone in the new starter</p>\n");
  await put(template, "public/fonts/old.woff2", FONT.subarray(2));
  await put(template, "public/fonts/v1/a.woff2", FONT);
  await put(template, "public/_headers", "/fonts/*\n  Cache-Control: immutable\n");
  await put(template, "astro.config.mjs", "export default {};\n");
  await put(template, "tsconfig.json", '{ "extends": "astro/tsconfigs/strict" }\n');
  await put(template, "package.json", json(pkg));
  // Lacks .wrangler/, which the merge appends.
  await put(template, ".gitignore", "dist/\n.astro/\n.cloudhal/\nnode_modules/\n.dev.vars\n.env\n");
  for (const [rel, data] of Object.entries(TEMPLATE_OWN)) await put(template, rel, data);
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "template-sync-"));
  starter = path.join(tmp, "starter");
  template = path.join(tmp, "template");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("template package.json", () => {
  it("moves only the @cloudhal/* ranges for the 0.6.1 starter", () => {
    const out = templatePackageJson(TEMPLATE_PKG, starterPkg(), "0.6.1");
    const expected = {
      ...TEMPLATE_PKG,
      dependencies: {
        ...TEMPLATE_PKG.dependencies,
        "@cloudhal/astro-renderer": "^0.6.1",
        "@cloudhal/cli": "^0.6.1",
        "@cloudhal/core-ts": "^0.6.1",
      },
      devDependencies: { ...TEMPLATE_PKG.devDependencies, "@cloudhal/cloudflare": "^0.6.1" },
    };
    expect(json(out)).toBe(json(expected));
    expect(Object.keys(out)).toEqual(Object.keys(TEMPLATE_PKG));
  });

  it("follows the starter's third-party specs and keeps the template's own fields", () => {
    const next = starterPkg("0.7.0");
    next.dependencies.astro = "7.4.0";
    next.trustedDependencies = ["better-sqlite3", "workerd"];
    const out = templatePackageJson(TEMPLATE_PKG, next, "0.7.0") as typeof TEMPLATE_PKG;
    expect(out.dependencies.astro).toBe("7.4.0");
    expect(out.dependencies["@cloudhal/cli"]).toBe("^0.7.0");
    expect(out.devDependencies["@cloudhal/cloudflare"]).toBe("^0.7.0");
    expect(Object.keys(out.dependencies)).toEqual(Object.keys(out.dependencies).sort());
    expect(out.trustedDependencies).toEqual(["better-sqlite3", "workerd"]);
    for (const key of [
      "name",
      "version",
      "private",
      "description",
      "type",
      "license",
      "engines",
      "cloudflare",
    ] as const)
      expect(out[key]).toEqual(TEMPLATE_PKG[key]);
  });

  it("renames build, keeps the template's order, appends new scripts and drops removed ones", () => {
    const { snapshot: _snapshot, ...withoutSnapshot } = starterPkg().scripts;
    const merged = mergeScripts(TEMPLATE_PKG.scripts, {
      ...withoutSnapshot,
      preview: "cloudhal preview",
    });
    expect(Object.keys(merged)).toEqual([
      "dev",
      "studio",
      "mcp",
      "build:static",
      "deploy",
      "astro",
      "preview",
    ]);
    expect(merged["build:static"]).toBe("cloudhal build");
    expect(merged).not.toHaveProperty("build");
    expect(mergeScripts(TEMPLATE_PKG.scripts, starterPkg().scripts)).toEqual(TEMPLATE_PKG.scripts);
    expect(() => mergeScripts({}, { build: "a", "build:static": "b", deploy: "c" })).toThrow(
      /both build/,
    );
    expect(() => mergeScripts({}, { dev: "cloudhal dev" })).toThrow(/no deploy script/);
  });

  it("lists the dependencies a sync moves or removes", () => {
    const { "better-sqlite3": _gone, ...dependencies } = starterPkg().dependencies;
    const next = { ...starterPkg(), dependencies };
    const changes = dependencyChanges(
      TEMPLATE_PKG,
      templatePackageJson(TEMPLATE_PKG, next, "0.6.1"),
    );
    expect(changes).toContainEqual({
      field: "dependencies",
      name: "@cloudhal/cli",
      from: "^0.6.0",
      to: "^0.6.1",
    });
    expect(changes).toContainEqual({
      field: "dependencies",
      name: "better-sqlite3",
      from: "13.0.3",
      to: undefined,
    });
    expect(changes).toHaveLength(5);
  });
});

describe("starter checks", () => {
  it("accepts the published starter and refuses anything else", () => {
    expect(() => assertPublishedStarter(starterPkg(), "0.6.1")).not.toThrow();
    for (const spec of ["workspace:*", "catalog:", "link:../x"]) {
      const pkg = starterPkg();
      pkg.dependencies.astro = spec;
      expect(() => assertPublishedStarter(pkg, "0.6.1")).toThrow(/not a published starter/);
    }
    expect(() => assertPublishedStarter(starterPkg("0.6.0"), "0.6.1")).toThrow(
      /@cloudhal\/astro-renderer@0\.6\.0/,
    );
    const noCli = { ...starterPkg(), dependencies: { astro: "7.3.6" } };
    expect(() => assertPublishedStarter(noCli, "0.6.1")).toThrow(/does not name @cloudhal\/cli/);
  });

  it("flags new top-level entries, not known or never-copied ones", () => {
    expect(unknownEntries(["src", "public", "env.d.ts", "content.config.ts", "README.md"])).toEqual(
      ["content.config.ts", "env.d.ts"],
    );
    expect(
      unknownEntries(["node_modules", ".astro", "wrangler.jsonc", "_gitignore", ".yarnrc.yml"]),
    ).toEqual([]);
  });

  it("refuses a package.json field no rule covers, or another type", () => {
    expect(() => assertKnownFields(TEMPLATE_PKG, starterPkg())).not.toThrow();
    const extras: Record<string, unknown>[] = [
      { overrides: { hono: "4.13.14" } },
      { imports: { "#theme/*": "./src/theme/*" } },
      { engines: { node: ">=26" } },
      { packageManager: "pnpm@12.0.0" },
    ];
    for (const extra of extras)
      expect(() => assertKnownFields(TEMPLATE_PKG, { ...starterPkg(), ...extra })).toThrow(
        `new fields (${Object.keys(extra).join(", ")})`,
      );
    expect(() => assertKnownFields(TEMPLATE_PKG, { ...starterPkg(), type: "commonjs" })).toThrow(
      /type is commonjs, the template's module/,
    );
  });

  it("compares versions and reads the template's", () => {
    expect(compareVersions("0.6.1", "0.6.0")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.6.1", "0.6.1")).toBe(0);
    expect(currentVersion(TEMPLATE_PKG)).toBe("0.6.0");
    expect(currentVersion({ dependencies: { "@cloudhal/cli": "~1.2.3" } })).toBe("1.2.3");
    expect(currentVersion({})).toBeUndefined();
    expect(() => currentVersion({ dependencies: { "@cloudhal/cli": ">=0.6" } })).toThrow(
      /\^x\.y\.z/,
    );
  });

  it("the repo's starter has a rule for every top-level entry (a new one fails here, not at release)", async () => {
    const dir = path.join(ROOT, "starters/blog");
    const keep = await starterFilter(dir);
    const names = (await readdir(dir)).filter((n) => keep(path.join(dir, n)));
    expect(unknownEntries(names)).toEqual([]);
    for (const name of [...SYNCED_DIRS, ...SYNCED_FILES]) expect(names).toContain(name);
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as object;
    expect(Object.keys(pkg).filter((key) => !KNOWN_STARTER_FIELDS.has(key))).toEqual([]);
  });
});

describe("merge .gitignore", () => {
  it("appends the starter's missing lines and is idempotent", () => {
    const tpl = "dist/\nnode_modules/\n.dev.vars\n.env\n";
    const merged = mergeGitignore(tpl, "dist/\n.astro/\nnode_modules/\n.wrangler/\n");
    expect(merged).toBe("dist/\nnode_modules/\n.dev.vars\n.env\n.astro/\n.wrangler/\n");
    expect(mergeGitignore(merged, "dist/\n.astro/\nnode_modules/\n.wrangler/\n")).toBe(merged);
    expect(mergeGitignore("dist/", ".astro/\n")).toBe("dist/\n.astro/\n");
    expect(mergeGitignore(tpl, "dist/\n")).toBe(tpl);
  });
});

describe("plan and apply", () => {
  it("mirrors src/ and public/, merges package.json and leaves the template's own files", async () => {
    await fixtureStarter();
    await fixtureTemplate();
    const ownBefore = await tree(template);
    const ops = await planSync({ starterDir: starter, templateDir: template, version: "0.6.1" });
    expect(ops.map((op) => `${op.kind} ${op.path}`)).toEqual([
      "write .gitignore",
      "write package.json",
      "delete public/fonts/old.woff2",
      "delete src/old.astro",
      "write src/styles/features/tokens.css",
    ]);
    await applySync(template, ops);
    for (const dir of SYNCED_DIRS) {
      const want = [...(await tree(path.join(starter, dir)))];
      expect([...(await tree(path.join(template, dir)))]).toEqual(want);
    }
    await expect(stat(path.join(template, "public/fonts/v1"))).resolves.toBeTruthy();
    await expect(readdir(path.join(template, "public/fonts"))).resolves.toEqual(["v1"]);
    const after = await tree(template);
    for (const rel of Object.keys(TEMPLATE_OWN)) expect(after.get(rel)).toEqual(ownBefore.get(rel));
    expect(after.has("node_modules/junk.js")).toBe(false);
    expect(after.has(".yarnrc.yml")).toBe(false);
    expect(after.has("_gitignore")).toBe(false);
    expect(after.get(".gitignore")?.toString()).toBe(
      "dist/\n.astro/\n.cloudhal/\nnode_modules/\n.dev.vars\n.env\n.wrangler/\n",
    );
    expect(after.get("package.json")?.toString()).toBe(
      json(templatePackageJson(TEMPLATE_PKG, starterPkg(), "0.6.1")),
    );
  });

  it("adds new starter files and removes a directory it emptied", async () => {
    await fixtureStarter();
    await fixtureTemplate();
    await put(starter, "src/components/New.astro", "<p>new</p>\n");
    await rm(path.join(starter, "public/fonts"), { recursive: true });
    const ops = await planSync({ starterDir: starter, templateDir: template, version: "0.6.1" });
    const write = ops.find((op) => op.path === "src/components/New.astro");
    expect(write).toMatchObject({ kind: "write", added: true });
    await applySync(template, ops);
    await expect(readdir(path.join(template, "public"))).resolves.toEqual(["_headers"]);
  });

  it("is idempotent: a second plan is empty and applying it writes nothing", async () => {
    await fixtureStarter();
    await fixtureTemplate();
    await applySync(
      template,
      await planSync({ starterDir: starter, templateDir: template, version: "0.6.1" }),
    );
    const again = await planSync({ starterDir: starter, templateDir: template, version: "0.6.1" });
    expect(again).toEqual([]);
    const mtimes = async () => {
      const out: Record<string, number> = {};
      for (const rel of (await tree(template)).keys())
        out[rel] = (await stat(path.join(template, rel))).mtimeMs;
      return out;
    };
    const before = await mtimes();
    await applySync(template, again);
    expect(await mtimes()).toEqual(before);
  });

  it("fails before writing anything", async () => {
    await fixtureStarter();
    await fixtureTemplate();
    const before = await tree(template);
    const plan = (version: string) =>
      planSync({ starterDir: starter, templateDir: template, version });

    await put(starter, "content.config.ts", "export {};\n");
    await expect(plan("0.6.1")).rejects.toThrow(/new top-level entries \(content\.config\.ts\)/);
    await rm(path.join(starter, "content.config.ts"));

    await symlink(path.join(starter, "astro.config.mjs"), path.join(starter, "src/link.mjs"));
    await expect(plan("0.6.1")).rejects.toThrow(/not a regular file or directory/);
    await rm(path.join(starter, "src/link.mjs"));

    await put(
      starter,
      "package.json",
      json({ ...starterPkg(), dependencies: { "@cloudhal/cli": "workspace:*" } }),
    );
    await expect(plan("0.6.1")).rejects.toThrow(/not a published starter/);
    await put(starter, "package.json", json({ ...starterPkg(), overrides: { hono: "4.13.14" } }));
    await expect(plan("0.6.1")).rejects.toThrow(/new fields \(overrides\)/);
    await put(starter, "package.json", json(starterPkg()));

    await expect(plan("0.6")).rejects.toThrow(/x\.y\.z/);
    expect(await tree(template)).toEqual(before);
  });

  it("refuses a downgrade unless asked, and re-syncs the same version", async () => {
    await fixtureStarter("0.6.0");
    await fixtureTemplate(templatePackageJson(TEMPLATE_PKG, starterPkg(), "0.6.1"));
    const plan = (allowDowngrade: boolean) =>
      planSync({ starterDir: starter, templateDir: template, version: "0.6.0", allowDowngrade });
    await expect(plan(false)).rejects.toThrow(/on 0\.6\.1; 0\.6\.0 would downgrade/);
    await expect(plan(true)).resolves.toContainEqual(
      expect.objectContaining({ path: "package.json" }),
    );
    await fixtureStarter("0.6.1");
    await expect(
      planSync({ starterDir: starter, templateDir: template, version: "0.6.1" }),
    ).resolves.toBeInstanceOf(Array);
  });
});

describe("lockfile", () => {
  /** A lockfileVersion 3 excerpt: two direct @cloudhal/* packages and one they depend on. */
  const lock = (versions: Record<string, string>) => ({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "@cloudhal/cli": "^0.6.1" } },
      "node_modules/astro": { version: "7.3.6" },
      ...Object.fromEntries(Object.entries(versions).map(([key, v]) => [key, { version: v }])),
    },
  });
  const synced = templatePackageJson(TEMPLATE_PKG, starterPkg(), "0.6.1");

  it("pins every @cloudhal/* package.json names, dependencies and devDependencies alike", () => {
    expect(lockPins(synced, "0.6.1")).toEqual([
      "@cloudhal/astro-renderer@0.6.1",
      "@cloudhal/cli@0.6.1",
      "@cloudhal/cloudflare@0.6.1",
      "@cloudhal/core-ts@0.6.1",
    ]);
    expect(() => lockPins({ dependencies: { astro: "7.3.6" } }, "0.6.1")).toThrow(/names no/);
  });

  it("accepts a lock at exactly the synced version and names everything else", () => {
    const exact = lock({
      "node_modules/@cloudhal/cli": "0.6.1",
      "node_modules/@cloudhal/core-contracts": "0.6.1",
    });
    expect(lockProblems(synced, exact, "0.6.1")).toEqual([]);
    // What a plain refresh leaves after a sync to 0.6.0 with 0.6.1 out: in range, not 0.6.0.
    const downgraded = templatePackageJson(TEMPLATE_PKG, starterPkg("0.6.0"), "0.6.0");
    expect(lockProblems(downgraded, exact, "0.6.0")).toEqual([
      "node_modules/@cloudhal/cli is locked at 0.6.1",
      "node_modules/@cloudhal/core-contracts is locked at 0.6.1",
    ]);
    const nested = lock({
      "node_modules/@cloudhal/cli": "0.6.1",
      "node_modules/@cloudhal/cli/node_modules/@cloudhal/storage": "0.6.2",
    });
    expect(lockProblems(synced, nested, "0.6.1")).toEqual([
      "node_modules/@cloudhal/cli/node_modules/@cloudhal/storage is locked at 0.6.2",
    ]);
    const exactSpecs = { ...synced, devDependencies: { "@cloudhal/cloudflare": "0.6.1" } };
    expect(lockProblems(exactSpecs, exact, "0.6.1")).toEqual([
      "package.json devDependencies has @cloudhal/cloudflare@0.6.1",
    ]);
    expect(lockProblems(synced, lock({}), "0.6.1")).toEqual([
      "package-lock.json locks no @cloudhal/* package",
    ]);
  });
});

describe("PR body", () => {
  const write = (p: string, added = false): SyncOp => ({
    kind: "write",
    path: p,
    data: Buffer.from(""),
    added,
  });

  it("names both versions, the paths, the dependencies and what must pass", () => {
    const body = prBody({
      ops: [
        write("src/styles/features/tokens.css"),
        write("src/new.astro", true),
        { kind: "delete", path: "src/old.astro" },
      ],
      from: "0.6.0",
      to: "0.7.0",
      deps: [{ field: "dependencies", name: "@cloudhal/cli", from: "^0.6.0", to: "^0.7.0" }],
      runUrl: "https://github.com/cloudhal-dev/cloudhal/actions/runs/1",
    });
    expect(body).toContain("from Cloudhal 0.6.0 to **0.7.0**");
    expect(body).toContain("Changed (1):\n\n- `src/styles/features/tokens.css`");
    expect(body).toContain("Added (1):\n\n- `src/new.astro`");
    expect(body).toContain("Removed (1):\n\n- `src/old.astro`");
    expect(body).toContain("- `@cloudhal/cli`: `^0.6.0` → `^0.7.0`");
    expect(body).toContain("https://github.com/cloudhal-dev/cloudhal/releases/tag/v0.7.0");
    expect(body).toContain("**This is a minor step.** In 0.x a minor version may break");
    expect(body).toContain("cloudhal/template-check");
    expect(body).toContain("([run](https://github.com/cloudhal-dev/cloudhal/actions/runs/1))");
    expect(body).toContain("Do not push to this branch");
  });

  it("caps each path list at 50", () => {
    const ops = Array.from({ length: 60 }, (_, i) =>
      write(`src/f${String(i).padStart(2, "0")}.css`),
    );
    const body = prBody({ ops, from: "0.6.0", to: "0.6.1" });
    expect(body).toContain("- `src/f49.css`\n- … and 10 more");
    expect(body).not.toContain("src/f50.css");
    expect(body).not.toContain("This is a minor step");
  });
});
