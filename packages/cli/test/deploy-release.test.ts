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
import { releaseFlags } from "../src/cli/commands-remote.ts";
import type { DeployOptions } from "../src/commands/deploy/options.ts";
import { attestationFailure } from "../src/commands/deploy/release/index.ts";
import { mergeMemory } from "../src/commands/deploy/release/trust.ts";
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
  it("refuses with no root pinned (a CLI built before the ceremony), naming it, and fetches nothing", async () => {
    const s = await setup();
    await expect(deploy({ ...s.options, trustRoots: {} })).rejects.toMatchObject({
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
    expect(s.net.urls.some((u) => new URL(u).hostname === "api.github.com")).toBe(false);
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
      expect(
        s.net.urls.some((u) => {
          const url = new URL(u);
          return url.hostname === "github.com" && url.pathname.includes("/releases/download/");
        }),
      ).toBe(false);
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
    expect(s.net.urls.some((u) => new URL(u).pathname.endsWith(".tar.gz"))).toBe(false);
    const lines: string[] = [];
    const r = await deploy({ ...s.options, discardLocalTheme: true, log: (l) => lines.push(l) });
    expect(r.release?.notDeployed).toEqual(["public/extra.txt", "src/DESIGN.md"]);
    expect(lines.join("\n")).toMatch(/these 2 files of the project are not/);
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

describe("deploy --release: review round 1", () => {
  it("refuses a version argument: --release installs this CLI's own version", () => {
    expect(() => releaseFlags({ release: true }, ["0.9.0"])).toThrow(
      /takes no argument[\s\S]*npx @cloudhal\/cli@<version> deploy --release/,
    );
    expect(releaseFlags({ release: true }, [])).toEqual({ release: true });
    expect(() => releaseFlags({ "discard-local-theme": true }, [])).toThrow(/go with --release/);
  });

  it("asks nothing and writes nothing outside .cloudhal/deploy before the release verifies", async () => {
    const s = await setup();
    const file = path.join(s.projectDir, "cloudhal.json");
    const cfg = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    const { analytics: _a, ...withoutAnalytics } = cfg;
    const before = JSON.stringify(withoutAnalytics);
    await writeFile(file, before);
    s.world.trust = "down";
    let asked = 0;
    const prompt = async () => {
      asked++;
      return true;
    };
    expect(await codeOf(deploy({ ...s.options, prompt }))).toBe("trust-unavailable");
    expect(asked).toBe(0);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(existsSync(path.join(s.projectDir, "wrangler.jsonc"))).toBe(false);
  });

  it("lists every file not deployed under --discard-local-theme, not just 20", async () => {
    const s = await setup();
    for (let i = 0; i < 25; i++)
      await writeFile(
        path.join(s.projectDir, `public/extra-${String(i).padStart(2, "0")}.txt`),
        "x\n",
      );
    const lines: string[] = [];
    const r = await deploy({ ...s.options, discardLocalTheme: true, log: (l) => lines.push(l) });
    expect(r.release?.notDeployed).toHaveLength(25);
    const text = lines.join("\n");
    expect(text).toContain("these 25 files of the project are not");
    expect(text).toContain("public/extra-24.txt");
    expect(text).not.toContain("more");
  });

  it("keeps the yank memory monotonic when two runs save it", () => {
    const base = {
      keyId: "k1",
      serial: 5,
      versions: ["0.9.3"],
      revokedKeys: [],
      keysIssuedAt: "2026-11-20T00:00:00Z",
      retiredYankKeys: ["k0"],
    };
    expect(mergeMemory({ ...base, serial: 7, versions: ["0.9.4"] }, base)).toEqual({
      ...base,
      serial: 7,
      versions: ["0.9.3", "0.9.4"],
    });
    // Across a rotation the newer key list's memory wins, keeping every retired key.
    const rotated = {
      ...base,
      keyId: "k2",
      serial: 1,
      versions: [],
      keysIssuedAt: "2026-12-01T00:00:00Z",
      retiredYankKeys: ["k1"],
    };
    expect(mergeMemory(rotated, base)).toEqual({ ...rotated, retiredYankKeys: ["k0", "k1"] });
    expect(mergeMemory(undefined, base)).toEqual(base);
  });

  it("reports a yank memory that cannot be saved as such, not as lists that do not verify", async () => {
    const s = await setup();
    const blocker = path.join(tmp(), "a-file");
    await writeFile(blocker, "x");
    await expect(
      deploy({ ...s.options, trustStateFile: path.join(blocker, "release-trust.json") }),
    ).rejects.toMatchObject({
      code: "trust-state",
      message: expect.stringContaining("could not be saved"),
    });
  });

  it("words an attestation that could not finish as such; it is still a refusal", async () => {
    expect(attestationFailure("manifest.json", "no answer within 60 s")).toMatch(
      /could not be checked[\s\S]*still a refusal/,
    );
    expect(attestationFailure("manifest.json", "HTTP 429: API rate limit exceeded")).toMatch(
      /could not be checked/,
    );
    expect(
      attestationFailure("manifest.json", "verification failed: no matching attestations"),
    ).toMatch(/were not built by this repository's bundle-build\.yml/);
    const s = await setup();
    const timedOut = {
      ...s.options,
      attest: async () => ({
        status: "failed" as const,
        file: "manifest.json",
        reason: "no answer within 60 s",
      }),
    };
    await expect(deploy(timedOut)).rejects.toMatchObject({
      code: "attestation-failed",
      message: expect.stringContaining("could not be checked"),
    });
  });

  it("sends GH_TOKEN to api.github.com only, and reports a rate limit as such", async () => {
    const s = await setup();
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "test-token-not-a-secret";
    try {
      await deploy(s.options);
    } finally {
      if (saved === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = saved;
    }
    const sent = s.net.headers.filter((h) => h.authorization !== null);
    expect(sent.map((h) => new URL(h.url).hostname)).toEqual(["api.github.com"]);
    expect(sent[0]?.authorization).toBe("Bearer test-token-not-a-secret");
    s.world.release = "rate-limited";
    await expect(
      deploy({ ...s.options, trustStateFile: path.join(tmp(), "d.json") }),
    ).rejects.toMatchObject({
      code: "github-rate-limited",
      message: expect.stringContaining("GH_TOKEN"),
    });
  });
});

describe("deploy --release: a stale GitHub token", () => {
  const withToken = async (run: () => Promise<unknown>) => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "expired-token-not-a-secret";
    try {
      return await run();
    } finally {
      if (saved === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = saved;
    }
  };
  const lookups = (urls: string[]) =>
    urls.filter((u) => new URL(u).hostname === "api.github.com").length;

  it("retries once without a token GitHub rejects (401), warns, and goes on", async () => {
    const s = await setup();
    s.world.rejectToken = true;
    const lines: string[] = [];
    const r = (await withToken(() => deploy({ ...s.options, log: (l) => lines.push(l) }))) as {
      release?: { version: string };
    };
    expect(r.release?.version).toBe(VERSION);
    expect(lookups(s.net.urls)).toBe(2);
    expect(
      s.net.headers
        .filter((h) => new URL(h.url).hostname === "api.github.com")
        .map((h) => h.authorization),
    ).toEqual(["Bearer expired-token-not-a-secret", null]);
    expect(lines.filter((l) => l.includes("rejected GH_TOKEN"))).toHaveLength(1);
  });

  it("reports the retry's own status when it fails too", async () => {
    const s = await setup();
    s.world.rejectToken = true;
    s.world.anonymousStatus = 404;
    await expect(withToken(() => deploy(s.options))).rejects.toMatchObject({
      code: "release-unavailable",
      message: expect.stringContaining("no published release"),
    });
    expect(lookups(s.net.urls)).toBe(2);
    const t = await setup();
    t.world.rejectToken = true;
    t.world.anonymousStatus = 429;
    expect(await codeOf(withToken(() => deploy(t.options)))).toBe("github-rate-limited");
  });
});
