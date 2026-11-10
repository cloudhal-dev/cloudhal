/**
 * How `cloudhal studio` runs a rebuild (#150): `CLOUDHAL_SITE_BUILD`, finding the image's
 * `site-build`, reading what `cloudhal build --published` rendered from its output, a failed
 * child's reason (as plain text), its deadline and abort (the whole process group ends), what
 * `site/current.json` says is served, and the `site.build` audit row.
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findOnPath,
  localSiteBuild,
  outputTail,
  parseBuildOutput,
  plainText,
  runSiteBuildCommand,
  siteBuildAuditEntry,
  siteBuildEnabled,
  siteBuildTimeoutMs,
} from "../src/commands/site-build-run.ts";
import { parseServed, readServed } from "../src/commands/site-build-served.ts";

/** Whether `pid` still runs (a reaped process is gone). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

describe("CLOUDHAL_SITE_BUILD_TIMEOUT", () => {
  it("is whole seconds, 30 minutes by default, and reports a value it ignores", () => {
    const logs: string[] = [];
    expect(siteBuildTimeoutMs({})).toBe(1_800_000);
    expect(siteBuildTimeoutMs({ CLOUDHAL_SITE_BUILD_TIMEOUT: " 90 " })).toBe(90_000);
    for (const v of ["0", "-5", "1.5", "ten", "86401"])
      expect(siteBuildTimeoutMs({ CLOUDHAL_SITE_BUILD_TIMEOUT: v }, (l) => logs.push(l))).toBe(
        1_800_000,
      );
    expect(logs).toHaveLength(5);
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

describe("plainText", () => {
  it("drops ANSI escapes and control characters, keeps lines and tabs", () => {
    expect(
      plainText("\u001b[31merror\u001b[0m: \u001b]8;;https://x\u0007link\u001b]8;;\u0007\tok\n"),
    ).toBe("error: link\tok\n");
    expect(plainText("50%\r100%\r\ndone\u0000\u0008\u007f\u009b")).toBe("50%\n100%\ndone");
    // an escape cut off at the end
    expect(plainText("text\u001b[12")).toBe("text");
    expect(plainText("text\u001b]0;title")).toBe("text");
  });

  it("stays linear on 100k characters of unterminated escapes", () => {
    for (const long of [
      "\u001b[".repeat(50_000),
      "\u001b]".repeat(50_000),
      "\u001b".repeat(100_000),
    ]) {
      const t = performance.now();
      plainText(long);
      expect(performance.now() - t).toBeLessThan(500);
    }
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

  it("stores the failure's output as plain text", async () => {
    const r = await runSiteBuildCommand(
      node('console.error("\\u001b[31mError:\\u001b[0m broke"); process.exit(1)'),
    );
    expect(r.error).toBe("exited with 1: Error: broke");
  });

  describe("ends the whole process group", () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-site-build-group-"));
    });
    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    /** A shell (like `site-build`) whose grandchild would hold the lock: it writes its pid. */
    const slowShell = (name: string) => ({
      command: "/bin/sh",
      args: [
        "-c",
        `echo "site-build: waiting"; sleep 30 & echo $! > "${path.join(dir, name)}"; wait`,
      ],
      cwd: ".",
    });
    const grandchild = async (name: string) => {
      for (let i = 0; i < 100 && !existsSync(path.join(dir, name)); i++)
        await new Promise((r) => setTimeout(r, 20));
      return Number((await readFile(path.join(dir, name), "utf8")).trim());
    };
    const gone = async (pid: number) => {
      for (let i = 0; i < 100 && alive(pid); i++) await new Promise((r) => setTimeout(r, 20));
      return !alive(pid);
    };

    it("at the build's deadline, reported as timed out", async () => {
      const t = performance.now();
      const run = runSiteBuildCommand({ ...slowShell("timeout.pid"), timeoutMs: 300 });
      const pid = await grandchild("timeout.pid");
      const r = await run;
      expect(r.ok).toBe(false);
      expect(r.error).toBe("timed out after 300 ms: site-build: waiting");
      expect(performance.now() - t).toBeLessThan(3000);
      expect(await gone(pid)).toBe(true);
    });

    it("when aborted, with the abort's reason", async () => {
      const ac = new AbortController();
      const run = runSiteBuildCommand({ ...slowShell("abort.pid"), signal: ac.signal });
      const pid = await grandchild("abort.pid");
      ac.abort(new Error("stopped: Studio is shutting down"));
      const r = await run;
      expect(r).toEqual({
        ok: false,
        error: "stopped: Studio is shutting down: site-build: waiting",
      });
      expect(await gone(pid)).toBe(true);
    });

    it("with SIGKILL when the group ignores SIGTERM", async () => {
      const t = performance.now();
      const r = await runSiteBuildCommand({
        command: "/bin/sh",
        args: ["-c", "trap '' TERM; sleep 30 & wait; sleep 30"],
        cwd: ".",
        timeoutMs: 100,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("timed out after 100 ms");
      expect(performance.now() - t).toBeLessThan(5000);
    });
  });
});

describe("what is served", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-served-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads site/current.json for the build site/current names, defensively", async () => {
    const project = path.join(dir, "p1");
    expect(await readServed(project)).toBeNull();
    await mkdir(path.join(project, "site", "20261111T010203Z.7"), { recursive: true });
    await symlink("20261111T010203Z.7", path.join(project, "site", "current"));
    // a build from before the file: its time only
    expect(Object.keys((await readServed(project)) ?? {})).toEqual(["at"]);
    const record = {
      at: "2026-11-11T01:02:05.000Z",
      build: "20261111T010203Z.7",
      state: "published",
      snapshotId: "snap_SERVED123",
      source: "cron",
    };
    await writeFile(path.join(project, "site", "current.json"), JSON.stringify(record));
    expect(await readServed(project)).toEqual({
      at: "2026-11-11T01:02:05.000Z",
      state: "published",
      snapshotId: "snap_SERVED123",
      source: "cron",
    });
    // a record of another build (written before a swap was interrupted): its time only
    await writeFile(
      path.join(project, "site", "current.json"),
      JSON.stringify({ ...record, build: "older" }),
    );
    expect(Object.keys((await readServed(project)) ?? {})).toEqual(["at"]);
  });

  it("refuses what does not check out", () => {
    const ok = { at: "2026-11-11T01:02:05Z", build: "b1", state: "not-published", source: "start" };
    expect(parseServed(JSON.stringify(ok), "b1")).toEqual({
      at: "2026-11-11T01:02:05.000Z",
      state: "not-published",
      source: "start",
    });
    for (const bad of [
      "not json",
      "[]",
      "null",
      JSON.stringify({ ...ok, at: "yesterday" }),
      JSON.stringify({ ...ok, build: "../x y" }),
      JSON.stringify({ ...ok, at: "x".repeat(50) }),
      `${JSON.stringify(ok)}${" ".repeat(5000)}`,
    ])
      expect(parseServed(bad, "b1"), bad.slice(0, 40)).toBeUndefined();
    // unknown values are left out, not passed on
    expect(
      parseServed(
        JSON.stringify({ ...ok, state: "published", snapshotId: "<script>", source: "evil" }),
        "b1",
      ),
    ).toEqual({ at: "2026-11-11T01:02:05.000Z", state: "published" });
  });

  it("reports a 0.6.3 dist folder as online", async () => {
    const project = path.join(dir, "p2");
    await mkdir(path.join(project, "dist"), { recursive: true });
    expect(Object.keys((await readServed(project)) ?? {})).toEqual(["at"]);
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
