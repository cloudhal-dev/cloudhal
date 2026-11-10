/**
 * `cloudhal studio` rebuilds the self-hosted site at start and on publish (#150), through the
 * Node publish path: the API's publish and rollback routes reach the store's `onPublished`, the queue runs the
 * build command in a child process (here a stand-in for the image's `site-build --wait` that
 * counts its runs and notices overlaps), a burst builds once, every result is a `site.build`
 * audit row that `/api/sites/:id/site-build` and the activity feed report, a failed build is
 * reported and retried by the next publish, "Publish now" on a release builds once, and stopping
 * Studio during a build ends the build's whole process group within the deadline.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "@cloudhal/agent-runtime";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, type StudioHandle, studio } from "../src/index.ts";

/** Counts runs in `<dir>/count`, flags overlaps, fails while `<dir>/fail` exists. */
const FAKE_BUILD = `
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const dir = process.argv[2];
const at = (f) => path.join(dir, f);
if (existsSync(at("running"))) writeFileSync(at("overlap"), "");
writeFileSync(at("running"), "");
const n = (existsSync(at("count")) ? Number(readFileSync(at("count"), "utf8")) : 0) + 1;
writeFileSync(at("count"), String(n));
setTimeout(() => {
  rmSync(at("running"));
  console.log("site-build: building the published snapshot");
  if (existsSync(at("fail"))) {
    console.error("astro: something broke");
    process.exit(3);
  }
  console.log("built /data/.site-build/dist from snap_fakebuild1 (published)");
}, 150);
`;

type Status = {
  enabled: boolean;
  state?: string;
  last?: {
    ok: boolean;
    trigger?: string;
    snapshotId?: string;
    state?: string;
    error?: string;
    durationMs?: number;
  } | null;
};

describe("cloudhal studio: rebuild the site on publish", () => {
  let tmp: string;
  let projectDir: string;
  let runs: string;
  let s: StudioHandle;
  let base: string;
  let siteId: string;
  const logs: string[] = [];

  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json()) as unknown;
    if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${JSON.stringify(json)}`);
    return json;
  };
  const status = () => call("GET", `/api/sites/${siteId}/site-build`) as Promise<Status>;
  const count = async () =>
    existsSync(path.join(runs, "count"))
      ? Number(await readFile(path.join(runs, "count"), "utf8"))
      : 0;
  /** Waits until `n` builds have finished and nothing is queued or running. */
  const builds = async (n: number): Promise<Status> => {
    for (let i = 0; i < 200; i++) {
      const st = await status();
      if ((await count()) >= n && st.state === "idle" && st.last) return st;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no ${n} finished builds; logs:\n${logs.join("\n")}`);
  };
  const publish = async () =>
    (
      (await call("POST", `/api/sites/${siteId}/snapshots`, { publish: true })) as {
        snapshot: { id: string };
      }
    ).snapshot;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-site-build-"));
    projectDir = path.join(tmp, "site");
    runs = path.join(tmp, "runs");
    await init({ dir: projectDir, name: "Rebuild" });
    await writeFile(path.join(tmp, "fake-build.mjs"), FAKE_BUILD);
    await mkdir(runs);
    siteId = (await readProjectConfig(projectDir)).siteId;
    s = await studio({
      projectDir,
      noAuth: true,
      port: 0,
      scheduler: false,
      env: { CLOUDHAL_SITE_BUILD: "on" },
      siteBuild: {
        command: { command: process.execPath, args: [path.join(tmp, "fake-build.mjs"), runs] },
        debounceMs: 300,
      },
      log: (l) => logs.push(l),
    });
    base = s.url.replace(/\/$/, "");
  });

  afterAll(async () => {
    await s?.stop();
    await rm(tmp, { recursive: true, force: true });
  });

  it("builds once at start, through the same queue and audit row", async () => {
    const first = await status();
    expect(first).toMatchObject({ enabled: true, last: null });
    expect(["queued", "running"]).toContain(first.state);
    const st = await builds(1);
    expect(st.last).toMatchObject({ ok: true, trigger: "start" });
  });

  it("builds a burst of publishes once, and records it", async () => {
    const first = await publish();
    await publish();
    await publish();
    const st = await builds(2);
    expect(await count()).toBe(2);
    expect(st.last).toMatchObject({
      ok: true,
      trigger: "publish",
      snapshotId: "snap_fakebuild1",
      state: "published",
    });
    expect(st.last?.durationMs).toBeGreaterThanOrEqual(100);
    expect(logs).toContain("site-build: building the published snapshot");
    const activity = (await call("GET", `/api/sites/${siteId}/activity?limit=5`)) as {
      items: { tool: string; outcome?: string; actor: { kind: string } }[];
    };
    expect(activity.items[0]).toMatchObject({
      tool: "site.build",
      outcome: "ok",
      actor: { kind: "system" },
    });
    // a rollback is a publish too
    await call("POST", `/api/sites/${siteId}/snapshots/${first.id}/rollback`);
    await builds(3);
    expect(await count()).toBe(3);
    expect(existsSync(path.join(runs, "overlap"))).toBe(false);
  });

  it("reports a failed build and retries on the next publish", async () => {
    await writeFile(path.join(runs, "fail"), "");
    await publish();
    const failed = await builds(4);
    expect(failed.last?.ok).toBe(false);
    expect(failed.last?.error).toContain("exited with 3");
    expect(failed.last?.error).toContain("astro: something broke");
    expect(logs.some((l) => l.includes("the previous site is still served"))).toBe(true);
    await rm(path.join(runs, "fail"));
    await publish();
    const again = await builds(5);
    expect(again.last).toMatchObject({ ok: true, snapshotId: "snap_fakebuild1" });
    expect(existsSync(path.join(runs, "overlap"))).toBe(false);
  });
});

/** Release routes act as a person: an owner signed in with the setup token (test values). */
describe("cloudhal studio: Publish now on a release", () => {
  it("builds once, as a release", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-site-build-release-"));
    const projectDir = path.join(tmp, "site");
    const runs = path.join(tmp, "runs");
    await init({ dir: projectDir, name: "Release" });
    await writeFile(path.join(tmp, "fake-build.mjs"), FAKE_BUILD);
    await mkdir(runs);
    const { siteId } = await readProjectConfig(projectDir);
    const s = await studio({
      projectDir,
      port: 0,
      scheduler: false,
      env: { CLOUDHAL_SITE_BUILD: "on" },
      siteBuild: {
        command: { command: process.execPath, args: [path.join(tmp, "fake-build.mjs"), runs] },
        debounceMs: 100,
      },
    });
    const base = s.url.replace(/\/$/, "");
    try {
      const token = new URLSearchParams(new URL(s.setup?.url ?? "").hash.slice(1)).get("setup");
      const signed = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cloudhal-setup-token": token ?? "" },
        body: JSON.stringify({
          name: "Olive Owner",
          email: "owner@example.test",
          password: "correct horse battery",
        }),
      });
      expect(signed.status, await signed.clone().text()).toBe(200);
      const cookie = signed.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] as string)
        .find((c) => c.includes("better-auth.session_token=")) as string;
      const call = async (method: string, p: string, body?: unknown) => {
        const res = await fetch(`${base}${p}`, {
          method,
          headers: { "content-type": "application/json", cookie, origin: base },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const json = (await res.json()) as unknown;
        if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${JSON.stringify(json)}`);
        return json;
      };
      const count = async () =>
        existsSync(path.join(runs, "count"))
          ? Number(await readFile(path.join(runs, "count"), "utf8"))
          : 0;
      const settled = async (n: number) => {
        for (let i = 0; i < 200; i++) {
          const st = (await call("GET", `/api/sites/${siteId}/site-build`)) as Status;
          if ((await count()) >= n && st.state === "idle" && st.last) return st;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error(`no ${n} finished builds`);
      };
      await settled(1); // the start-up build
      const entries = (await call("GET", `/api/sites/${siteId}/entries`)) as
        | { id: string }[]
        | { items: { id: string }[] };
      const [entry] = Array.isArray(entries) ? entries : entries.items;
      const created = (
        (await call("POST", `/api/sites/${siteId}/releases`, { nodeIds: [entry?.id] })) as {
          release: { id: string; rev: number };
        }
      ).release;
      const at = new Date(Date.now() + 5 * 3_600_000).toISOString();
      const scheduled = (
        (await call("POST", `/api/sites/${siteId}/releases/${created.id}/schedule`, {
          when: { at },
          rev: created.rev,
        })) as { release: { rev: number } }
      ).release;
      const now = (await call("POST", `/api/sites/${siteId}/releases/${created.id}/publish-now`, {
        rev: scheduled.rev,
      })) as { release: { state: string } };
      expect(now.release.state).toBe("published");
      const st = await settled(2);
      // and no more than one
      await new Promise((r) => setTimeout(r, 400));
      expect(await count()).toBe(2);
      expect(st.last).toMatchObject({ ok: true, trigger: "release" });
    } finally {
      await s.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("cloudhal studio: stopping during a build", () => {
  it("ends the build's process group within the deadline and records it", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-site-build-stop-"));
    const projectDir = path.join(tmp, "site");
    const pidFile = path.join(tmp, "grandchild.pid");
    await init({ dir: projectDir, name: "Stop" });
    const { siteId, dataDir } = await readProjectConfig(projectDir);
    const logs: string[] = [];
    const s = await studio({
      projectDir,
      noAuth: true,
      port: 0,
      scheduler: false,
      env: { CLOUDHAL_SITE_BUILD: "on" },
      siteBuild: {
        // like site-build: a shell whose child (here a sleep) would hold the lock
        command: {
          command: "/bin/sh",
          args: ["-c", `echo "site-build: waiting"; sleep 60 & echo $! > "${pidFile}"; wait`],
        },
        debounceMs: 10,
        stopDeadlineMs: 300,
      },
      log: (l) => logs.push(l),
    });
    try {
      for (let i = 0; i < 200 && !existsSync(pidFile); i++)
        await new Promise((r) => setTimeout(r, 25));
      const pid = Number((await readFile(pidFile, "utf8")).trim());
      const t = performance.now();
      await s.stop();
      // the deadline, SIGTERM to the group, and the audit row; far inside Docker's 10 s
      expect(performance.now() - t).toBeLessThan(3000);
      let alive = true;
      for (let i = 0; i < 100 && alive; i++) {
        try {
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 20));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
      expect(logs.some((l) => l.includes("stopped: Studio is shutting down"))).toBe(true);
      const local = await openLocalStore(path.join(projectDir, dataDir));
      try {
        const [row] = await new AuditLog(local.sql).list({ siteId, tool: "site.build", limit: 1 });
        expect(row).toMatchObject({
          outcome: "error",
          reason: expect.stringContaining("stopped: Studio is shutting down"),
        });
      } finally {
        await local.close();
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("cloudhal studio without CLOUDHAL_SITE_BUILD", () => {
  it("does not rebuild, and says so", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-no-site-build-"));
    const projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Plain" });
    const { siteId } = await readProjectConfig(projectDir);
    const s = await studio({ projectDir, noAuth: true, port: 0, scheduler: false, env: {} });
    try {
      const res = await fetch(`${s.url.replace(/\/$/, "")}/api/sites/${siteId}/site-build`);
      expect(await res.json()).toEqual({ enabled: false });
    } finally {
      await s.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("cloudhal studio: stopping with a request still open", () => {
  it("cuts the open connection after the shutdown budget, then finishes stopping", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-stop-open-"));
    const projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Open" });
    const { siteId } = await readProjectConfig(projectDir);
    const s = await studio({
      projectDir,
      noAuth: true,
      port: 0,
      scheduler: false,
      env: {},
      shutdownBudgetMs: 300,
    });
    // a request whose body never finishes: an active connection, like a long stream
    const socket = net.connect(s.port, "127.0.0.1");
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    const ended = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.on("error", () => {});
    socket.write(
      `POST /api/sites/${siteId}/snapshots HTTP/1.1\r\nHost: localhost\r\ncontent-type: application/json\r\ncontent-length: 100\r\n\r\n{"pub`,
    );
    await new Promise((r) => setTimeout(r, 100));
    const t = performance.now();
    try {
      await s.stop();
      expect(performance.now() - t).toBeLessThan(2000);
      await ended;
      // nothing listens any more
      const refused = await new Promise<boolean>((resolve) => {
        const again = net.connect(s.port, "127.0.0.1");
        again.once("connect", () => {
          again.destroy();
          resolve(false);
        });
        again.once("error", () => resolve(true));
      });
      expect(refused).toBe(true);
    } finally {
      socket.destroy();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
