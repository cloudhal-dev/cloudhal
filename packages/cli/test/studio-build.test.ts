/**
 * The Studio build check `cloudhal deploy` runs from the monorepo: a fake repo in a temp dir with
 * controlled mtimes, and a stand-in builder, so no pnpm or Vite runs.
 */
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureStudioBuild,
  newestFile,
  type StudioBuilder,
  studioBuildState,
} from "../src/studio-build.ts";

const T0 = new Date("2026-10-12T09:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

async function put(file: string, when: Date, body = "x"): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  await utimes(file, when, when);
}

describe("Studio build freshness", () => {
  let repo: string;
  let dist: string;
  let log: string[];
  let builds: number;
  /** Stands in for `pnpm --filter @cloudhal/studio build`: writes index.html at `builtAt`. */
  let builtAt: Date;
  const builder: StudioBuilder = async (root, say) => {
    builds++;
    say("vite build");
    await put(path.join(root, "apps/studio/dist/index.html"), builtAt, "<!doctype html>");
  };

  beforeEach(async () => {
    repo = await mkdtemp(path.join(os.tmpdir(), "cloudhal-studio-build-"));
    dist = path.join(repo, "apps/studio/dist");
    log = [];
    builds = 0;
    builtAt = at(60);
    await put(path.join(repo, "apps/studio/index.html"), at(0));
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(1));
    await put(path.join(repo, "apps/studio/src/routes/schedules/calendar.tsx"), at(2));
    await put(path.join(repo, "packages/ui/src/blocks/index.ts"), at(3));
    await put(path.join(dist, "index.html"), at(10));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  const ensure = (
    over: { build?: boolean; studioDir?: string; repoRoot?: string | undefined } = {},
  ) =>
    ensureStudioBuild({
      studioDir: over.studioDir ?? dist,
      repoRoot: "repoRoot" in over ? over.repoRoot : repo,
      build: over.build ?? true,
      log: (l) => log.push(l),
      builder,
    });

  it("finds the newest file across files and nested directories", async () => {
    const newest = await newestFile([
      path.join(repo, "apps/studio/src"),
      path.join(repo, "apps/studio/index.html"),
      path.join(repo, "packages/ui/src"),
      path.join(repo, "does/not/exist"),
    ]);
    expect(newest?.file).toBe(path.join(repo, "packages/ui/src/blocks/index.ts"));
    expect(newest?.mtimeMs).toBe(at(3).getTime());
    expect(await newestFile([path.join(repo, "nothing")])).toBeUndefined();
  });

  it("a build newer than every source is current: nothing runs", async () => {
    expect(await studioBuildState(repo)).toEqual({ state: "current" });
    expect(await ensure()).toBe(false);
    expect(builds).toBe(0);
    expect(log).toEqual([]);
  });

  it("an edit under apps/studio/src after the build makes it stale and rebuilds it", async () => {
    // 2026-10-13: the Schedules screens changed a day after the last Studio build.
    await put(path.join(repo, "apps/studio/src/routes/schedules/calendar.tsx"), at(24 * 60));
    builtAt = at(24 * 60 + 5);
    expect(await studioBuildState(repo)).toEqual({
      state: "stale",
      newest: path.join("apps/studio/src/routes/schedules/calendar.tsx"),
    });
    expect(await ensure()).toBe(true);
    expect(builds).toBe(1);
    expect(log[0]).toContain("older than apps/studio/src/routes/schedules/calendar.tsx");
    expect(log[0]).toContain("pnpm --filter @cloudhal/studio build");
    expect(log).toContain("vite build");
    expect(await studioBuildState(repo)).toEqual({ state: "current" });
  });

  it("apps/studio/index.html and packages/ui/src count as Studio sources", async () => {
    await put(path.join(repo, "apps/studio/index.html"), at(11));
    expect(await studioBuildState(repo)).toMatchObject({
      state: "stale",
      newest: path.join("apps/studio/index.html"),
    });
    await utimes(path.join(dist, "index.html"), at(12), at(12));
    await put(path.join(repo, "packages/ui/src/blocks/new-block.tsx"), at(13));
    expect(await studioBuildState(repo)).toMatchObject({
      state: "stale",
      newest: path.join("packages/ui/src/blocks/new-block.tsx"),
    });
  });

  it("a source with the same mtime as the build is not stale", async () => {
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(10));
    expect(await studioBuildState(repo)).toEqual({ state: "current" });
  });

  it("files outside the Studio sources do not matter", async () => {
    await put(path.join(repo, "apps/studio/README.md"), at(30));
    await put(path.join(repo, "packages/core-ts/src/index.ts"), at(30));
    expect(await studioBuildState(repo)).toEqual({ state: "current" });
  });

  it("--no-build-studio fails on a stale build and names the command", async () => {
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(20));
    await expect(ensure({ build: false })).rejects.toThrow(
      /older than apps\/studio\/src\/main\.tsx\. Run `pnpm --filter @cloudhal\/studio build`/,
    );
    expect(builds).toBe(0);
  });

  it("a missing build is built, or refused with --no-build-studio", async () => {
    await rm(dist, { recursive: true });
    expect(await studioBuildState(repo)).toEqual({ state: "missing" });
    await expect(ensure({ build: false })).rejects.toThrow(
      /no Studio build at apps\/studio\/dist\. Run `pnpm --filter @cloudhal\/studio build`/,
    );
    expect(builds).toBe(0);
    expect(await ensure()).toBe(true);
    expect(builds).toBe(1);
    expect(await studioBuildState(repo)).toEqual({ state: "current" });
  });

  it("fails when the build runs but leaves no index.html", async () => {
    await rm(dist, { recursive: true });
    await expect(
      ensureStudioBuild({
        studioDir: dist,
        repoRoot: repo,
        build: true,
        log: () => {},
        builder: async () => {},
      }),
    ).rejects.toThrow(/finished without apps\/studio\/dist\/index\.html/);
  });

  it("a source dated after the fresh build is reported, not fatal", async () => {
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(24 * 60));
    builtAt = at(30); // e.g. clock skew: the new index.html is still older than the source
    expect(await ensure()).toBe(true);
    expect(log.at(-1)).toMatch(/dated after the new build/);
  });

  it("leaves any other Studio dir alone: a published install's shipped copy or an explicit one", async () => {
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(20));
    const shipped = path.join(repo, "node_modules/@cloudhal/cli/dist/assets/studio");
    await put(path.join(shipped, "index.html"), at(0));
    // Published install: no monorepo root at all.
    expect(await ensure({ studioDir: shipped, repoRoot: undefined, build: false })).toBe(false);
    // Monorepo root known, but the deploy uploads another directory.
    expect(await ensure({ studioDir: shipped, build: false })).toBe(false);
    expect(builds).toBe(0);
    expect(log).toEqual([]);
  });

  it("matches the monorepo dist however the path is spelled", async () => {
    await put(path.join(repo, "apps/studio/src/main.tsx"), at(20));
    const spelled = `${path.join(repo, "apps/studio/src")}/../dist/`;
    await expect(ensure({ studioDir: spelled, build: false })).rejects.toThrow(/older than/);
  });
});
