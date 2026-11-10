/**
 * How `cloudhal studio` runs a rebuild (#150): `CLOUDHAL_SITE_BUILD`, finding the image's
 * `site-build`, reading what `cloudhal build --published` rendered from its output, a failed
 * child's reason, and the `site.build` audit row.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findOnPath,
  localSiteBuild,
  outputTail,
  parseBuildOutput,
  runSiteBuildCommand,
  siteBuildAuditEntry,
  siteBuildEnabled,
} from "../src/commands/site-build-run.ts";

describe("CLOUDHAL_SITE_BUILD", () => {
  it("is on only when set to on", () => {
    for (const v of ["on", "ON", " on ", "1", "true", "yes"])
      expect(siteBuildEnabled({ CLOUDHAL_SITE_BUILD: v }), v).toBe(true);
    for (const v of [undefined, "", "off", "0", "false", "no", "maybe"])
      expect(siteBuildEnabled({ CLOUDHAL_SITE_BUILD: v }), String(v)).toBe(false);
  });

  it("stays off without a site-build command on PATH, and says why", async () => {
    const logs: string[] = [];
    const off = await localSiteBuild({
      env: { CLOUDHAL_SITE_BUILD: "on", PATH: "/nonexistent" },
      projectDir: ".",
      siteId: "site_aaaaaaaa",
      sql: {} as never,
      log: (l) => logs.push(l),
    });
    expect(off).toBeUndefined();
    expect(logs[0]).toContain("no site-build command on PATH");
    expect(
      await localSiteBuild({
        env: {},
        projectDir: ".",
        siteId: "site_aaaaaaaa",
        sql: {} as never,
        log: () => {},
      }),
    ).toBeUndefined();
  });
});

describe("findOnPath", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-path-"));
    await writeFile(path.join(dir, "site-build"), "#!/bin/sh\n");
    await chmod(path.join(dir, "site-build"), 0o755);
    await writeFile(path.join(dir, "not-executable"), "");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds an executable and skips what is not one", async () => {
    const PATH = ["/nonexistent", dir].join(path.delimiter);
    expect(await findOnPath("site-build", PATH)).toBe(path.join(dir, "site-build"));
    expect(await findOnPath("not-executable", PATH)).toBeUndefined();
    expect(await findOnPath("site-build", undefined)).toBeUndefined();
  });
});

describe("parseBuildOutput", () => {
  it("reads the published snapshot or the status page", () => {
    expect(
      parseBuildOutput(
        "site-build: public origin https://www.example.org\n[build] 12 pages\nbuilt /data/.site-build/dist from snap_P7R3H1N13DGF (published)\nsite-build: /data/dist -> site/current -> 20261110T120000Z.42\n",
      ),
    ).toEqual({ state: "published", snapshotId: "snap_P7R3H1N13DGF" });
    expect(
      parseBuildOutput(
        "not-published: nothing is published yet; wrote the status page to /data/.site-build/dist (…)\n",
      ),
    ).toEqual({ state: "not-published" });
    // an older CLI's line (no `--published`), or nothing recognisable
    expect(parseBuildOutput("built /data/.site-build/dist from snap_x\n")).toEqual({});
    expect(parseBuildOutput("")).toEqual({});
  });

  it("stays linear on long output without a match", () => {
    const long = `${" from ".repeat(20_000)}\n${"x".repeat(100_000)} (published`;
    const t = performance.now();
    expect(parseBuildOutput(long)).toEqual({});
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("outputTail", () => {
  it("keeps the last whole lines within 600 characters", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(30)}`);
    const tail = outputTail(`${lines.join("\n")}\n`);
    expect(tail.length).toBeLessThanOrEqual(600);
    expect(tail.endsWith(lines[49] as string)).toBe(true);
    expect(tail.startsWith("line ")).toBe(true);
    // one huge line: its end
    expect(outputTail("y".repeat(2000))).toHaveLength(600);
  });
});

describe("runSiteBuildCommand", () => {
  const node = (code: string) => ({ command: process.execPath, args: ["-e", code], cwd: "." });

  it("succeeds on exit 0 and forwards only site-build lines", async () => {
    const logs: string[] = [];
    const r = await runSiteBuildCommand({
      ...node(
        'console.log("site-build: start"); console.log("[astro] 3 pages"); console.log("built d from snap_abcdefgh (published)")',
      ),
      log: (l) => logs.push(l),
    });
    expect(r).toEqual({ ok: true, state: "published", snapshotId: "snap_abcdefgh" });
    expect(logs).toEqual(["site-build: start"]);
  });

  it("fails on another exit code with the last lines as the reason", async () => {
    const r = await runSiteBuildCommand(
      node('console.log("building"); console.error("Error: the theme threw"); process.exit(2)'),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("exited with 2: building\nError: the theme threw");
  });

  it("fails when the command cannot start", async () => {
    const r = await runSiteBuildCommand({ command: "/nonexistent/site-build", args: [], cwd: "." });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("ENOENT") });
  });
});

describe("siteBuildAuditEntry", () => {
  it("names the system actor, the snapshot, the duration and the failure", () => {
    expect(
      siteBuildAuditEntry("site_aaaaaaaa", {
        ok: false,
        at: "2026-11-10T12:00:00.000Z",
        durationMs: 4200,
        error: "exited with 1: boom",
        trigger: "release",
      }),
    ).toEqual({
      at: "2026-11-10T12:00:00.000Z",
      actor: { kind: "system", id: "sys_sitebuild", name: "Site build" },
      siteId: "site_aaaaaaaa",
      tool: "site.build",
      decision: "allow",
      outcome: "error",
      durationMs: 4200,
      reason: "exited with 1: boom",
      input: { trigger: "release" },
    });
  });
});
