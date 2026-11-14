/**
 * `cloudhal deploy --release` (RFC-0046 §11b) end to end with the synthetic signed bundle: no
 * network (every URL comes from a recording fake), a throwaway root and yank key, a recording
 * wrangler. Covers the refusals in their order, both trust sources, the attestation outcomes,
 * extraction, the generated configs and the yank memory.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DeployOptions } from "../src/commands/deploy/options.ts";
import { deploy } from "../src/index.ts";
import {
  bundle,
  cleanup,
  offlineDir,
  project,
  recordingWrangler,
  serve,
  tmp,
  trustWorld,
  VERSION,
} from "./fixtures/release-deploy.ts";

afterEach(cleanup);

const jsonc = async (file: string) =>
  JSON.parse((await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, "")) as Record<
    string,
    unknown
  >;

/** Every file under `dir`, relative, sorted. */
async function tree(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await tree(dir, r)));
    else out.push(r);
  }
  return out.sort();
}

async function setup(over: { bundle?: Awaited<ReturnType<typeof bundle>> } = {}) {
  const t = await trustWorld();
  const b = over.bundle ?? (await bundle());
  const world = {
    trust: { keys: t.keys, yanked: t.yanked },
    release: "published",
    bundle: b,
  } as Parameters<typeof serve>[0];
  const net = serve(world);
  const projectDir = await project();
  const stateFile = path.join(tmp("release-deploy-state-"), "release-trust.json");
  const w = recordingWrangler();
  const options: DeployOptions = {
    projectDir,
    release: true,
    dryRun: true,
    cliVersion: VERSION,
    pinnedKeys: b.keys,
    trustRoots: t.roots,
    trustStateFile: stateFile,
    attest: async () => ({ status: "verified" }),
    fetch: net.fetch,
    wrangler: w.run,
    wranglerVersion: "4.158.0",
  };
  return { t, b, world, net, projectDir, stateFile, w, options };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (!code) throw e;
    return code;
  }
};

describe("deploy --release: trust", () => {
  it("refuses before the root ceremony, naming it, and fetches nothing", async () => {
    const s = await setup();
    const { trustRoots: _roots, ...options } = s.options;
    await expect(deploy(options)).rejects.toMatchObject({
      code: "trust-unavailable",
      message: expect.stringMatching(/root ceremony.*First-time setup/),
    });
    expect(s.net.urls).toEqual([]);
  });

  it("fetches both lists on every run and refuses, with no fallback, when they are unreachable", async () => {
    const s = await setup();
    s.world.trust = "down";
    await expect(deploy(s.options)).rejects.toMatchObject({
      code: "trust-unavailable",
      message: expect.stringContaining("never falls back"),
    });
    expect(s.net.urls.some((u) => u.includes("api.github.com"))).toBe(false);
  });

  it("stores the yank memory and refuses a rolled-back yank list on the next run", async () => {
    const s = await setup();
    const next = await s.t.resign({ published: s.t.yanked });
    s.world.trust = { keys: s.t.keys, yanked: next };
    await deploy(s.options);
    const memory = JSON.parse(await readFile(s.stateFile, "utf8")) as {
      yankMemory: { serial: number };
    };
    expect(memory.yankMemory.serial).toBe(2);
    // The older, validly signed list (serial 1) replayed: refused, no override.
    s.world.trust = { keys: s.t.keys, yanked: s.t.yanked };
    expect(await codeOf(deploy(s.options))).toBe("trust-unavailable");
  });

  it("refuses a release signed by a key the yank list revokes, and a yanked version", async () => {
    const s = await setup();
    const revoked = await s.t.resign({
      revokedKeys: [
        { keyId: "test-release-key", revokedAt: "2026-11-14T00:00:00Z", reason: "Exposed." },
      ],
    });
    s.world.trust = { keys: s.t.keys, yanked: revoked };
    expect(await codeOf(deploy({ ...s.options, trustStateFile: path.join(tmp(), "a.json") }))).toBe(
      "key-revoked",
    );
    const yanked = await s.t.resign({
      versions: [{ version: VERSION, yankedAt: "2026-11-14T00:00:00Z", reason: "Broken." }],
    });
    s.world.trust = { keys: s.t.keys, yanked };
    expect(await codeOf(deploy({ ...s.options, trustStateFile: path.join(tmp(), "b.json") }))).toBe(
      "yanked",
    );
  });
});

describe("deploy --release: which release", () => {
  it("refuses v0.8.0 and older before anything is fetched", async () => {
    const s = await setup();
    expect(await codeOf(deploy({ ...s.options, cliVersion: "0.8.0" }))).toBe("release-unavailable");
    expect(s.net.urls).toEqual([]);
  });

  it("refuses a missing release, a draft and a release without bundle assets", async () => {
    for (const release of ["missing", "draft", "no-bundle"] as const) {
      const s = await setup();
      s.world.release = release;
      await expect(deploy(s.options)).rejects.toMatchObject({
        code: "release-unavailable",
        message: expect.stringContaining("without --release"),
      });
      expect(s.net.urls.some((u) => u.includes("/releases/download/"))).toBe(false);
    }
  });

  it("refuses a tarball that does not match the signed statement, extracting nothing", async () => {
    const good = await bundle();
    const s = await setup({
      bundle: { ...good, tarball: new Uint8Array([...good.tarball].reverse()) },
    });
    expect(await codeOf(deploy(s.options))).toBe("tarball-mismatch");
    expect(existsSync(path.join(s.projectDir, ".cloudhal/deploy/release", VERSION))).toBe(false);
  });
});

describe("deploy --release: the second factor", () => {
  it("refuses a failed attestation, and an unavailable one without --allow-single-factor", async () => {
    const s = await setup();
    const failed = {
      ...s.options,
      attest: async () => ({ status: "failed" as const, file: "manifest.json", reason: "exit 1" }),
    };
    expect(await codeOf(deploy(failed))).toBe("attestation-failed");
    const unavailable = {
      ...s.options,
      attest: async () => ({ status: "unavailable" as const, reason: "gh is not installed" }),
    };
    await expect(deploy(unavailable)).rejects.toMatchObject({
      code: "attestation-unavailable",
      message: expect.stringMatching(/gh auth login.*--allow-single-factor/),
    });
    expect(existsSync(path.join(s.projectDir, ".cloudhal/deploy/release", VERSION))).toBe(false);
    const lines: string[] = [];
    const r = await deploy({ ...unavailable, allowSingleFactor: true, log: (l) => lines.push(l) });
    expect(r.release?.attestation).toBe("single-factor");
    expect(lines.join("\n")).toContain("relies on the release key alone");
  });
});

describe("deploy --release: extraction and configs", () => {
  it("--dry-run verifies, extracts exactly the listed files and writes configs for those bytes", async () => {
    const s = await setup();
    const r = await deploy(s.options);
    expect(r.dryRun).toBe(true);
    expect(r.release).toMatchObject({ version: VERSION, attestation: "verified", files: 6 });
    const dir = path.join(s.projectDir, ".cloudhal/deploy/release", VERSION);
    expect(await tree(dir)).toEqual([
      "admin/assets/_headers",
      "admin/assets/app.js",
      "admin/modules/worker.js",
      "site/assets/_headers",
      "site/assets/fonts/v1/a.woff2",
      "site/assets/index.html",
      "site/modules/chunks/page.mjs",
      "site/modules/entry.mjs",
    ]);
    const site = await jsonc(r.siteConfig);
    expect(site).toMatchObject({
      name: "release-me-site",
      main: "../../release/0.9.0/site/modules/entry.mjs",
      base_dir: "../../release/0.9.0/site/modules",
      no_bundle: true,
      find_additional_modules: true,
      preserve_file_names: true,
      rules: [{ type: "ESModule", globs: ["chunks/page.mjs", "entry.mjs"], fallthrough: false }],
      compatibility_date: "2026-10-01",
      assets: {
        binding: "ASSETS",
        directory: "../../release/0.9.0/site/assets",
        not_found_handling: "none",
      },
    });
    expect(site.$schema).toBeUndefined();
    const admin = await jsonc(r.adminConfig);
    expect(admin).toMatchObject({
      name: "release-me-admin",
      main: "../../release/0.9.0/admin/modules/worker.js",
      no_bundle: true,
      rules: [{ type: "ESModule", globs: ["worker.js"], fallthrough: false }],
      assets: {
        binding: "ASSETS",
        directory: "../../release/0.9.0/admin/assets",
        run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
      },
    });
    // A dry run runs no wrangler at all.
    expect(s.w.calls).toEqual([]);
  });

  it("deploys both Workers with the release configs (and wrangler never bundles)", async () => {
    const s = await setup();
    const r = await deploy({ ...s.options, dryRun: false, healthTimeoutMs: 1 });
    expect(r.dryRun).toBe(false);
    const deploys = s.w.calls.filter((c) => c.args[0] === "deploy");
    expect(deploys.map((c) => c.args.slice(0, 3))).toEqual([
      ["deploy", "-c", r.siteConfig],
      ["deploy", "-c", r.adminConfig],
    ]);
    expect(deploys[0]?.cwd).toBe(path.dirname(r.siteConfig));
  });

  it("installs offline with --from, fetching nothing", async () => {
    const s = await setup();
    const from = offlineDir(s.b, s.t);
    const r = await deploy({ ...s.options, from });
    expect(r.release?.version).toBe(VERSION);
    expect(s.net.urls).toEqual([]);
    await writeFile(path.join(from, "yanked.json"), "");
    expect(
      await codeOf(deploy({ ...s.options, from, trustStateFile: path.join(tmp(), "c.json") })),
    ).toBe("trust-unavailable");
  });
});

describe("deploy --release: the project", () => {
  it("refuses another installation, several sites and Workers Builds", async () => {
    const s = await setup();
    const file = path.join(s.projectDir, "cloudhal.json");
    const cfg = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...cfg, installation: "../main" }));
    expect(await codeOf(deploy(s.options))).toBe("project-unsupported");
    await writeFile(file, JSON.stringify({ ...cfg, sites: [cfg.siteId, "site_other2"] }));
    expect(await codeOf(deploy(s.options))).toBe("project-unsupported");
    await writeFile(file, JSON.stringify(cfg));
    expect(await codeOf(deploy({ ...s.options, workersBuilds: true }))).toBe("project-unsupported");
    expect(s.net.urls).toEqual([]);
  });

  it("refuses a changed theme before downloading the tarball; --discard-local-theme lists what is not deployed", async () => {
    const s = await setup();
    await writeFile(path.join(s.projectDir, "src/DESIGN.md"), "# Mine\n");
    await writeFile(path.join(s.projectDir, "public/extra.txt"), "x\n");
    await expect(deploy(s.options)).rejects.toMatchObject({
      code: "theme-differs",
      message: expect.stringMatching(
        /added: public\/extra\.txt\n {2}changed: src\/DESIGN\.md[\s\S]*--discard-local-theme/,
      ),
    });
    expect(s.net.urls.some((u) => u.endsWith(".tar.gz"))).toBe(false);
    const lines: string[] = [];
    const r = await deploy({ ...s.options, discardLocalTheme: true, log: (l) => lines.push(l) });
    expect(r.release?.notDeployed).toEqual(["public/extra.txt", "src/DESIGN.md"]);
    expect(lines.join("\n")).toContain("these files of the project are not");
    // Nothing on disk was discarded.
    expect(await readFile(path.join(s.projectDir, "src/DESIGN.md"), "utf8")).toBe("# Mine\n");
  });

  it("refuses a build key the bundle cannot honour, with or without --discard-local-theme", async () => {
    const s = await setup();
    const file = path.join(s.projectDir, "cloudhal.json");
    const cfg = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...cfg, comments: { available: false } }));
    expect(await codeOf(deploy(s.options))).toBe("config-build-key");
    expect(await codeOf(deploy({ ...s.options, discardLocalTheme: true }))).toBe(
      "config-build-key",
    );
    await writeFile(file, JSON.stringify({ ...cfg, media: { transform: "cdn-cgi" } }));
    expect(await codeOf(deploy(s.options))).toBe("config-build-key");
    await writeFile(file, JSON.stringify({ ...cfg, extra: 1 }));
    await expect(deploy(s.options)).rejects.toThrow(/extra: this CLI does not know the key/);
  });

  it("refuses a wrangler older than the bundle's", async () => {
    const s = await setup();
    await expect(deploy({ ...s.options, wranglerVersion: "4.150.0" })).rejects.toMatchObject({
      code: "wrangler-too-old",
      message: expect.stringContaining("4.158.0"),
    });
  });
});
