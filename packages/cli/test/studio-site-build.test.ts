/**
 * `cloudhal studio` rebuilds the self-hosted site at start and on publish (#150), through the
 * Node publish path: the API's publish and rollback routes reach the store's `onPublished`, the queue runs the
 * build command in a child process (here a stand-in for the image's `site-build --wait` that
 * counts its runs and notices overlaps), a burst builds once, every result is a `site.build`
 * audit row that `/api/sites/:id/site-build` and the activity feed report, and a failed build is
 * reported and retried by the next publish.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
