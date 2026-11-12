import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValid } from "@cloudhal/core-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildReleaseBundle, scanForSecrets } from "../../../scripts/release-bundle/build.ts";
import {
  assetHash,
  bundleEntries,
  canonicalJson,
  checkLimits,
  LIMITS,
} from "../../../scripts/release-bundle/manifest.ts";
import {
  ignoreMatcher,
  migrationNames,
  readBuildOutput,
  readDeploySecrets,
} from "../../../scripts/release-bundle/read-build.ts";
import * as standard from "../../../scripts/release-bundle/standard.ts";
import { gzipBytes, tarArchive } from "../../../scripts/release-bundle/tar.ts";
import { committedAt, toolchainOf } from "../../../scripts/release-bundle.ts";
import * as cfg from "../src/cloudflare/config.ts";
import { SECRET_KEYS, SITE_SECRET_KEYS } from "../src/commands/deploy/state.ts";
import {
  COMMIT,
  type FixtureProject,
  facts,
  fixtureProject,
} from "./fixtures/release-bundle/fixture.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const enc = new TextEncoder();
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let fx: FixtureProject | undefined;
afterEach(() => {
  if (fx) rmSync(fx.root, { recursive: true, force: true });
  fx = undefined;
});

async function build(extra?: Record<string, string>, over?: Parameters<typeof facts>[0]) {
  fx = fixtureProject(extra);
  const out = readBuildOutput({ project: fx.project, studio: fx.studio });
  return buildReleaseBundle(
    out,
    facts(over),
    readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json")),
  );
}

describe("golden vectors (equal to the dev-bundle.ts of the remote deployer that first consumed bundles)", () => {
  it("assetHash = sha256(base64(bytes) + extension)[0:32]", () => {
    expect(assetHash("/favicon.svg", enc.encode("<svg/>"))).toBe(
      "631b5e37230fd031efdc7d00e06edf26",
    );
    expect(assetHash("/LICENSE", enc.encode("MIT\n"))).toBe("7626dd24f1b1407333cb4d7381c3bd8a");
    expect(assetHash("/img/Photo.JPG", new Uint8Array([0, 1, 2, 255]))).toBe(
      "ea5d106a73084f9d717f0e41b71f7dec",
    );
  });

  it("the tar bytes (ustar, PAX path for a long name, fixed mtime/uid/gid/mode)", () => {
    const tar = tarArchive(
      [
        { path: "admin/modules/worker.js", bytes: enc.encode("export default {};\n") },
        { path: `site/assets/${"d/".repeat(50)}long-name.txt`, bytes: enc.encode("long\n") },
        { path: "site/assets/empty.txt", bytes: new Uint8Array(0) },
        { path: "site/modules/entry.mjs", bytes: enc.encode("x".repeat(700)) },
      ],
      1762857600,
    );
    expect(tar.length).toBe(6144);
    expect(sha256(tar)).toBe("566424a5bebaf5173867eb5b95ffa4b8dcf329b90efecb250293ce1e9989937e");
  });

  it("gzip carries the fixed header: no flags, mtime 0, OS 255", async () => {
    const gz = await gzipBytes(enc.encode("hello"));
    expect([...gz.subarray(0, 10)]).toEqual([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255]);
  });
});

describe("release bundle build", () => {
  it("is byte-identical across two builds of the same input", async () => {
    const a = await build();
    const first = { ...a.files };
    rmSync(fx?.root ?? "", { recursive: true, force: true });
    const b = await build();
    for (const name of Object.keys(first))
      expect(sha256(b.files[name] as Uint8Array)).toBe(sha256(first[name] as Uint8Array));
    expect(Object.keys(b.files).sort()).toEqual(
      ["cloudhal-release-0.8.0.tar.gz", "manifest.json", "release-statement.json"].sort(),
    );
  });

  it("writes canonical documents that validate as both core-contracts roots", async () => {
    const b = await build();
    const manifest = JSON.parse(new TextDecoder().decode(b.manifestBytes));
    const statement = JSON.parse(new TextDecoder().decode(b.statementBytes));
    expect(isValid("release-manifest", manifest)).toBe(true);
    expect(isValid("release-statement", statement)).toBe(true);
    expect(new TextDecoder().decode(b.statementBytes)).toBe(canonicalJson(statement));
    expect(b.statementBytes.length).toBeLessThanOrEqual(LIMITS.statementBytes);
    expect(statement.manifest).toEqual({
      name: "manifest.json",
      sha256: sha256(b.manifestBytes),
      bytes: b.manifestBytes.length,
    });
    expect(statement.tarball).toEqual({
      name: "cloudhal-release-0.8.0.tar.gz",
      sha256: sha256(b.tarball),
      bytes: b.tarball.length,
    });
    expect(statement.signing).toEqual({
      keyId: "cloudhal-release-2026a",
      algorithm: "Ed25519",
      signature: "release-statement.sig",
    });
    expect(manifest.signing).toEqual(statement.signing);
    for (const k of ["version", "channel", "securityRelease", "commit", "createdAt"])
      expect(statement[k]).toEqual(manifest[k]);
    expect(manifest.toolchain).toMatchObject({
      producer: "cloudhal-release-bundle",
      starter: "blog",
      cli: "0.8.0",
    });
    expect(manifest.migrations).toMatchObject({ first: "0001_init", last: "0002_auth", count: 2 });
    expect(manifest.runtime).toEqual({
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
    });
  });

  it("derives the channel from the version and keeps the tar sorted with mtime = createdAt", async () => {
    const b = await build(undefined, { version: "0.8.0-rc.1" });
    expect(b.statement.channel).toBe("next");
    expect(b.parts).toEqual([...b.parts].sort());
    expect(b.parts).toContain("admin/assets/index.html");
    expect(b.parts).toContain("site/modules/chunks/page.mjs");
    // source maps, READMEs, _headers, .assetsignore and ignored assets are never parts
    expect(
      b.parts.filter((p) => /\.map$|README|_headers|assetsignore|notes\.txt|private\//.test(p)),
    ).toEqual([]);
    const manifest = JSON.parse(new TextDecoder().decode(b.manifestBytes));
    expect(manifest.workers.site.assets.headers).toBe("/*\n  X-Frame-Options: DENY\n");
  });

  it("refuses a dev- key id, a short commit and a createdAt with milliseconds", async () => {
    await expect(build(undefined, { keyId: "dev-staging-2026a" })).rejects.toThrow(/key-id/);
    await expect(build(undefined, { commit: "abc" })).rejects.toThrow(/commit/);
    await expect(build(undefined, { createdAt: "2026-11-12T08:00:00.000Z" })).rejects.toThrow(
      /whole-second/,
    );
  });

  it("refuses _redirects in the site's assets", async () => {
    await expect(build({ "project/dist/client/_redirects": "/a /b 301\n" })).rejects.toThrow(
      /_redirects/,
    );
  });

  it("refuses a part that contains a deploy secret, naming the part and never the value", async () => {
    fx = fixtureProject();
    const value = fx.secrets.CLOUDHAL_PREVIEW_SECRET as string;
    writeFileSync(
      path.join(fx.project, ".cloudhal/deploy/out/site/chunks/leak.mjs"),
      `const k = "${value}";\n`,
    );
    const out = readBuildOutput({ project: fx.project, studio: fx.studio });
    const secrets = readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json"));
    const err = await buildReleaseBundle(out, facts(), secrets).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(
      /^site\/modules\/chunks\/leak\.mjs contains generated deploy secret #2/,
    );
    expect((err as Error).message).not.toContain(value);
  });

  it("scans the manifest too, which carries the _headers text inline", () => {
    const secret = "s".repeat(40);
    expect(() => scanForSecrets([], enc.encode(`{"headers":"${secret}"}`), [secret])).toThrow(
      /^manifest\.json contains/,
    );
  });

  it("enforces the normative limits by part name", () => {
    fx = fixtureProject();
    const out = readBuildOutput({ project: fx.project, studio: fx.studio });
    const big = { path: "/big.bin", bytes: new Uint8Array(LIMITS.assetBytes + 1) };
    const withBig = { ...out, site: { ...out.site, assets: [...out.site.assets, big] } };
    expect(() => checkLimits(withBig, bundleEntries(withBig))).toThrow(
      /^site\/assets\/big\.bin is above 26214400/,
    );
    const many = Array.from({ length: LIMITS.assetsPerWorker + 1 }, (_, i) => ({
      path: `/a${i}`,
      bytes: new Uint8Array(0),
    }));
    const tooMany = { ...out, admin: { ...out.admin, assets: many } };
    expect(() => checkLimits(tooMany, bundleEntries(tooMany))).toThrow(/admin: 20001 assets/);
    const dup = {
      ...out,
      site: { ...out.site, modules: [...out.site.modules, out.site.modules[0] as never] },
    };
    expect(() => checkLimits(dup, bundleEntries(dup))).toThrow(/appears twice/);
  });
});

describe("build inputs", () => {
  it("reads migration names from .ts, .js and .sql files only", () => {
    fx = fixtureProject({ "migrations/0003_more.js": "", "migrations/notes.md": "" });
    expect(migrationNames(fx.migrations)).toEqual(["0001_init", "0002_auth", "0003_more"]);
  });

  it(".assetsignore: basename rules, ** across segments, comments", () => {
    const m = ignoreMatcher("# c\nnotes.txt\n/private/**\n*.map\n");
    expect(m("a/b/notes.txt")).toBe(true);
    expect(m("private/x/y.html")).toBe(true);
    expect(m("x.js.map")).toBe(true);
    expect(m("public/private/x.html")).toBe(false);
    expect(m("notes.txt.bak")).toBe(false);
  });

  it("createdAt is the commit's committer time in whole seconds, UTC", () => {
    expect(committedAt("HEAD")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(() => committedAt(COMMIT)).toThrow();
  });

  it("toolchain records node and the CLI version, and 'unknown' for a missing package", () => {
    const t = toolchainOf("/nonexistent");
    expect(t.node).toBe(process.versions.node);
    expect(t.cli).toBe(
      JSON.parse(readFileSync(path.join(ROOT, "packages/cli/package.json"), "utf8")).version,
    );
    expect(t.astro).toBe("unknown");
  });
});

describe("standard manifest facts follow the CLI", () => {
  it("compatibility date, Durable Objects, admin routes and cron", () => {
    expect(standard.DEFAULT_RUNTIME.compatibilityDate).toBe(cfg.COMPATIBILITY_DATE);
    expect(standard.DURABLE_OBJECTS.map((d) => [d.className, d.migration])).toEqual([
      [cfg.SCHEDULER_CLOCK_CLASS, cfg.SCHEDULER_CLOCK_MIGRATION],
      [cfg.BUILD_ROOMS_CLASS, cfg.BUILD_ROOMS_MIGRATION],
    ]);
    expect(standard.ADMIN_CRON).toBe(cfg.MINUTE_CRON);
    const config = readFileSync(path.join(ROOT, "packages/cli/src/cloudflare/config.ts"), "utf8");
    expect(config).toContain(
      `run_worker_first: ${JSON.stringify(standard.ADMIN_CONFIG.run_worker_first).replaceAll(",", ", ")}`,
    );
  });

  it("the admin and site secrets", () => {
    expect([...standard.ADMIN_SECRETS]).toEqual([...SECRET_KEYS]);
    expect([...standard.SITE_SECRETS].sort()).toEqual([...SITE_SECRET_KEYS].sort());
  });
});
