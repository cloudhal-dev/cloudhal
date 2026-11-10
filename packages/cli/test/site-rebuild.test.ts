/**
 * The rebuild-on-publish queue (#150): a burst of publishes builds once (debounced, bounded by the
 * max wait), two builds never overlap and requests during a build give exactly one more, and a
 * failure is recorded and retried by the next publish, not in a loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSiteRebuilder,
  type SiteBuildOutcome,
  type SiteBuildResult,
} from "../src/commands/site-rebuild.ts";

/** A build that finishes when the test says so, and counts overlaps. */
function controlledBuilds() {
  let active = 0;
  let maxActive = 0;
  const starts: number[] = [];
  const finishers: ((o: SiteBuildOutcome) => void)[] = [];
  return {
    run: () =>
      new Promise<SiteBuildOutcome>((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        starts.push(Date.now());
        finishers.push((o) => {
          active--;
          resolve(o);
        });
      }),
    finish(o: SiteBuildOutcome = { ok: true, state: "published", snapshotId: "snap_aaaaaaaa" }) {
      const f = finishers.shift();
      if (!f) throw new Error("no build is running");
      f(o);
    },
    starts,
    get maxActive() {
      return maxActive;
    },
  };
}

describe("site rebuild queue", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a burst of publishes once, after the last one", async () => {
    const builds = controlledBuilds();
    const results: SiteBuildResult[] = [];
    const q = createSiteRebuilder({
      run: builds.run,
      onResult: (r) => {
        results.push(r);
      },
      debounceMs: 1000,
    });
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(600);
    q.schedule("rollback");
    await vi.advanceTimersByTimeAsync(600);
    q.schedule("release");
    expect(q.state()).toBe("queued");
    expect(builds.starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(builds.starts).toEqual([2200]);
    expect(q.state()).toBe("running");
    await vi.advanceTimersByTimeAsync(250);
    builds.finish();
    await q.idle();
    expect(q.state()).toBe("idle");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ok: true,
      trigger: "publish", // the first request of the burst
      snapshotId: "snap_aaaaaaaa",
      state: "published",
      at: new Date(2200).toISOString(),
      durationMs: 250,
    });
  });

  it("starts at the latest maxWait after the first request of a steady stream", async () => {
    const builds = controlledBuilds();
    const q = createSiteRebuilder({ run: builds.run, debounceMs: 1000, maxWaitMs: 3000 });
    for (let t = 0; t < 6; t++) {
      q.schedule("publish");
      await vi.advanceTimersByTimeAsync(800);
    }
    expect(builds.starts).toEqual([3000]);
    builds.finish();
    await vi.advanceTimersByTimeAsync(5000);
    // requests after the build started give one more build
    expect(builds.starts).toHaveLength(2);
    builds.finish();
    await q.idle();
  });

  it("never runs two builds at once; requests during a build give exactly one more", async () => {
    const builds = controlledBuilds();
    const results: SiteBuildResult[] = [];
    const q = createSiteRebuilder({
      run: builds.run,
      onResult: (r) => {
        results.push(r);
      },
      debounceMs: 100,
    });
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(100);
    expect(builds.starts).toHaveLength(1);
    for (let i = 0; i < 5; i++) q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(builds.starts).toHaveLength(1); // still the first one
    expect(q.state()).toBe("running");
    builds.finish();
    await vi.advanceTimersByTimeAsync(99);
    expect(builds.starts).toHaveLength(1); // the follow-up waits for the debounce
    await vi.advanceTimersByTimeAsync(1);
    expect(builds.starts).toHaveLength(2);
    builds.finish();
    await q.idle();
    expect(builds.maxActive).toBe(1);
    expect(results).toHaveLength(2);
  });

  it("records a failure, does not retry on its own, and builds again on the next publish", async () => {
    const results: SiteBuildResult[] = [];
    const outcomes: (() => SiteBuildOutcome)[] = [
      () => ({ ok: false, error: "exited with 1: astro build failed" }),
      () => {
        throw new Error("spawn site-build ENOENT");
      },
      () => ({ ok: true, state: "not-published" }),
    ];
    const logs: string[] = [];
    const q = createSiteRebuilder({
      run: async () => (outcomes.shift() as () => SiteBuildOutcome)(),
      onResult: (r) => {
        results.push(r);
      },
      debounceMs: 10,
      log: (l) => logs.push(l),
    });
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10);
    await q.idle();
    expect(results).toEqual([expect.objectContaining({ ok: false, error: expect.any(String) })]);
    expect(logs.at(-1)).toContain("the previous site is still served");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(results).toHaveLength(1); // no retry loop
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10);
    await q.idle();
    expect(results[1]).toMatchObject({ ok: false, error: "spawn site-build ENOENT" });
    q.schedule("rollback");
    await vi.advanceTimersByTimeAsync(10);
    await q.idle();
    expect(results[2]).toMatchObject({ ok: true, state: "not-published", trigger: "rollback" });
  });

  it("keeps building when recording a result fails", async () => {
    let runs = 0;
    const logs: string[] = [];
    const q = createSiteRebuilder({
      run: async () => {
        runs++;
        return { ok: true };
      },
      onResult: () => {
        throw new Error("database is locked");
      },
      debounceMs: 10,
      log: (l) => logs.push(l),
    });
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10);
    await q.idle();
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10);
    await q.idle();
    expect(runs).toBe(2);
    expect(logs.some((l) => l.includes("could not record the result: database is locked"))).toBe(
      true,
    );
  });

  it("stop drops a queued build, waits for the running one and ignores later requests", async () => {
    const builds = controlledBuilds();
    const q = createSiteRebuilder({ run: builds.run, debounceMs: 10 });
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(10);
    q.schedule("publish"); // queued behind the running build
    let stopped = false;
    const stopping = q.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(stopped).toBe(false);
    builds.finish();
    await stopping;
    q.schedule("publish");
    await vi.advanceTimersByTimeAsync(1000);
    expect(builds.starts).toHaveLength(1);
    expect(q.state()).toBe("idle");
  });
});
