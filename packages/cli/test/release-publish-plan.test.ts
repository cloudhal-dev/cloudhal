import { describe, expect, it } from "vitest";
import {
  assetProblems,
  isHighestStable,
  type LocalAsset,
  type NpmPublish,
  npmFlags,
  type PublishInput,
  type PublishPort,
  PublishRefusal,
  planPublish,
  type ReleaseView,
  type RemoteAsset,
  runPublish,
  type Step,
} from "../../../scripts/release-publish-plan.ts";

const HEAD = "a".repeat(40);
const hex = (c: string) => c.repeat(64);
const NAMES = [
  "cloudhal-release-0.8.0.tar.gz",
  "manifest.json",
  "release-statement.json",
  "release-statement.sig",
  "cloudhal-release-0.8.0.sigstore.json",
];
const ASSETS: LocalAsset[] = NAMES.map((name, i) => ({
  name,
  sha256: hex(String(i + 1)),
  bytes: 100 + i,
  file: `/b/${name}`,
}));
const remote = (a: LocalAsset): RemoteAsset => ({
  name: a.name,
  digest: `sha256:${a.sha256}`,
  size: a.bytes,
});
const draft = (assets: RemoteAsset[] = ASSETS.map(remote)): ReleaseView => ({
  draft: true,
  prerelease: false,
  assets,
});
const published = (assets: RemoteAsset[] = ASSETS.map(remote)): ReleaseView => ({
  ...draft(assets),
  draft: false,
});

function input(over: Partial<PublishInput> = {}): PublishInput {
  return {
    version: "0.8.0",
    head: HEAD,
    dryRun: false,
    bundle: { statement: { version: "0.8.0", channel: "stable", commit: HEAD }, assets: ASSETS },
    tagCommit: null,
    releases: [],
    packages: ["@cloudhal/core-contracts", "@cloudhal/cli"],
    npmMissing: ["@cloudhal/core-contracts", "@cloudhal/cli"],
    tags: ["v0.7.2", "v0.7.3"],
    ...over,
  };
}
const BASE = ["--access", "public", "--ignore-scripts"];
const DRY_FORCE = [...BASE, "--dry-run", "--force"];
const kinds = (steps: Step[]) =>
  steps.map((s) => (s.kind === "check-assets" ? `check-before-${s.before}` : s.kind));

describe("planPublish: the order on immutable releases", () => {
  it("a fresh release: tag → draft → attach → check → npm → check → publish", () => {
    const steps = planPublish(input());
    expect(kinds(steps)).toEqual([
      "push-tag",
      "create-draft",
      "sync-assets",
      "check-before-npm",
      "npm-publish",
      "check-before-publish",
      "publish-release",
    ]);
    expect(steps[0]).toEqual({ kind: "push-tag", tag: "v0.8.0", commit: HEAD });
    expect(steps.at(-1)).toEqual({
      kind: "publish-release",
      tag: "v0.8.0",
      latest: true,
      prerelease: false,
    });
  });

  it("refuses a bundle from another commit, version or channel, and a tag on another commit", () => {
    const st = (s: Partial<{ version: string; channel: string; commit: string }>) =>
      input({
        bundle: {
          statement: { version: "0.8.0", channel: "stable", commit: HEAD, ...s },
          assets: ASSETS,
        },
      });
    expect(() => planPublish(st({ commit: "b".repeat(40) }))).toThrow(
      /built from b+, but HEAD is a+/,
    );
    expect(() => planPublish(st({ version: "0.7.9" }))).toThrow(/for 0\.7\.9, not 0\.8\.0/);
    expect(() => planPublish(st({ channel: "next" }))).toThrow(/channel next/);
    expect(() => planPublish(input({ tagCommit: "c".repeat(40) }))).toThrow(PublishRefusal);
  });

  it("Latest only for the highest stable version; a prerelease is marked and never Latest", () => {
    expect(isHighestStable("0.8.0", ["v0.7.3", "v0.8.0-rc.1"])).toBe(true);
    expect(isHighestStable("0.7.4", ["v0.8.0"])).toBe(false);
    expect(isHighestStable("0.10.0", ["v0.9.9"])).toBe(true);
    expect(isHighestStable("0.8.0-rc.1", [])).toBe(false);
    const pre = planPublish(
      input({
        version: "0.8.0-rc.1",
        bundle: {
          statement: { version: "0.8.0-rc.1", channel: "next", commit: HEAD },
          assets: ASSETS,
        },
      }),
    );
    expect(pre.find((s) => s.kind === "create-draft")).toMatchObject({ prerelease: true });
    expect(pre.at(-1)).toMatchObject({
      kind: "publish-release",
      tag: "v0.8.0-rc.1",
      latest: false,
      prerelease: true,
    });
    expect(planPublish(input({ tags: ["v0.9.0"] })).at(-1)).toMatchObject({ latest: false });
  });

  it("resume: the tag and the draft exist, npm is done → check, check, publish", () => {
    const steps = planPublish(input({ tagCommit: HEAD, releases: [draft()], npmMissing: [] }));
    expect(kinds(steps)).toEqual([
      "sync-assets",
      "check-before-npm",
      "check-before-publish",
      "publish-release",
    ]);
  });

  it("resume: published with every asset and npm done → nothing; npm missing → npm only", () => {
    expect(
      planPublish(input({ tagCommit: HEAD, releases: [published()], npmMissing: [] })),
    ).toEqual([]);
    expect(
      kinds(
        planPublish(
          input({ tagCommit: HEAD, releases: [published()], npmMissing: ["@cloudhal/cli"] }),
        ),
      ),
    ).toEqual(["npm-publish"]);
  });

  it("refuses a published release with missing or different assets (immutable)", () => {
    const missing = published(ASSETS.slice(1).map(remote));
    expect(() => planPublish(input({ tagCommit: HEAD, releases: [missing] }))).toThrow(
      /published and immutable.*\(missing cloudhal-release-0\.8\.0\.tar\.gz\); release a new version/,
    );
    const wrong = published(
      ASSETS.map((a, i) => ({
        ...remote(a),
        digest: i === 1 ? `sha256:${hex("f")}` : remote(a).digest,
      })),
    );
    expect(() => planPublish(input({ tagCommit: HEAD, releases: [wrong] }))).toThrow(
      /wrong digest manifest\.json/,
    );
  });

  it("refuses two releases on one tag (duplicate drafts)", () => {
    expect(() => planPublish(input({ releases: [draft(), draft()] }))).toThrow(
      /2 releases use the tag v0\.8\.0/,
    );
  });

  it("without a bundle: the same order with no assets, and a published release with none is complete", () => {
    expect(kinds(planPublish(input({ bundle: null })))).toEqual([
      "push-tag",
      "create-draft",
      "sync-assets",
      "check-before-npm",
      "npm-publish",
      "check-before-publish",
      "publish-release",
    ]);
    expect(
      planPublish(
        input({ bundle: null, tagCommit: HEAD, releases: [published([])], npmMissing: [] }),
      ),
    ).toEqual([]);
  });

  it("a dry run pushes no tag, publishes nothing, runs every package with --dry-run and deletes its draft", () => {
    const steps = planPublish(input({ dryRun: true, runNumber: "17", npmMissing: [] }));
    expect(kinds(steps)).toEqual([
      "create-draft",
      "sync-assets",
      "check-before-npm",
      "npm-publish",
      "check-before-publish",
      "delete-draft",
    ]);
    expect(steps[0]).toEqual({
      kind: "create-draft",
      tag: "v0.8.0-dryrun.17",
      prerelease: false,
      target: HEAD,
    });
    expect(steps.find((s) => s.kind === "npm-publish")).toEqual({
      kind: "npm-publish",
      packages: [
        { name: "@cloudhal/core-contracts", flags: DRY_FORCE },
        { name: "@cloudhal/cli", flags: DRY_FORCE },
      ],
      dryRun: true,
    });
    expect(() => planPublish(input({ dryRun: true }))).toThrow(/GITHUB_RUN_NUMBER/);
    expect(() =>
      planPublish(input({ dryRun: true, runNumber: "17", releases: [published()] })),
    ).toThrow(/a dry run never is/);
  });

  it("npm publish: a dry run forces exactly the versions npm has, a real run never forces", () => {
    const npmOf = (i: PublishInput) => planPublish(i).find((s) => s.kind === "npm-publish");
    const dry = npmOf(input({ dryRun: true, runNumber: "5", npmMissing: ["@cloudhal/cli"] }));
    expect(dry).toHaveProperty("packages", [
      { name: "@cloudhal/core-contracts", flags: DRY_FORCE },
      { name: "@cloudhal/cli", flags: [...BASE, "--dry-run"] }, // npm lacks it: its checks run
    ]);
    expect(npmOf(input({ npmMissing: ["@cloudhal/cli"] }))).toHaveProperty("packages", [
      { name: "@cloudhal/cli", flags: [...BASE, "--provenance"] },
    ]);
    expect(() => npmFlags({ prerelease: false, dryRun: false, onNpm: true })).toThrow(/already/);
    // npm 12 refuses a prerelease without --tag: it goes to `next`.
    const pre = (dryRun: boolean) => npmFlags({ prerelease: true, dryRun, onNpm: dryRun });
    expect(pre(false)).toEqual([...BASE, "--tag", "next", "--provenance"]);
    expect(pre(true)).toEqual([...BASE, "--tag", "next", "--dry-run", "--force"]);
  });

  it("asset problems: missing, unexpected, mismatched size and null digest", () => {
    const view = draft([
      remote(ASSETS[0] as LocalAsset),
      { ...remote(ASSETS[1] as LocalAsset), size: 1 },
      { ...remote(ASSETS[2] as LocalAsset), digest: null },
      { name: "stray.txt", digest: null, size: 1 },
    ]);
    expect(assetProblems(ASSETS, view)).toEqual({
      missing: ["release-statement.sig", "cloudhal-release-0.8.0.sigstore.json"],
      unexpected: ["stray.txt"],
      mismatched: ["manifest.json", "release-statement.json"],
    });
  });
});

/** A GitHub that holds one release per tag and records every call. */
function fakeGithub(start: ReleaseView[] = [], hooks: { onNpm?: (gh: FakeGithub) => void } = {}) {
  const gh = {
    releases: new Map<string, ReleaseView>(start.map((r) => ["v0.8.0", r])),
    calls: [] as string[],
    npm: [] as NpmPublish[],
  };
  const put = (tag: string, r: ReleaseView) => gh.releases.set(tag, r);
  const get = (tag: string) => gh.releases.get(tag) as ReleaseView;
  const port: PublishPort = {
    pushTag: (tag) => gh.calls.push(`tag ${tag}`),
    releases: (tag) => (gh.releases.has(tag) ? [get(tag)] : []),
    createDraft(tag, o) {
      gh.calls.push(`draft ${tag}${o.target ? " target" : ""}`);
      put(tag, { draft: true, prerelease: o.prerelease, assets: [] });
    },
    upload(tag, assets) {
      if (!get(tag).draft) throw new Error("immutable");
      gh.calls.push(`upload ${assets.map((a) => a.name).join(",")}`);
      const names = new Set(assets.map((a) => a.name));
      put(tag, {
        ...get(tag),
        assets: [...get(tag).assets.filter((a) => !names.has(a.name)), ...assets.map(remote)],
      });
    },
    deleteAsset(tag, name) {
      gh.calls.push(`delete-asset ${name}`);
      put(tag, { ...get(tag), assets: get(tag).assets.filter((a) => a.name !== name) });
    },
    async npmPublish(packages: readonly NpmPublish[], dryRun) {
      gh.calls.push(`npm ${packages.length}${dryRun ? " --dry-run" : ""}`);
      gh.npm.push(...packages);
      hooks.onNpm?.(gh);
    },
    publishRelease(tag, o) {
      gh.calls.push(`publish ${tag}${o.latest ? " latest" : ""}`);
      put(tag, { ...get(tag), draft: false });
    },
    deleteRelease(tag) {
      gh.calls.push(`delete ${tag}`);
      gh.releases.delete(tag);
    },
    log: () => {},
  };
  return { gh, port };
}
type FakeGithub = ReturnType<typeof fakeGithub>["gh"];

describe("runPublish", () => {
  it("publishes a release whose draft holds exactly the five assets", async () => {
    const { gh, port } = fakeGithub();
    await runPublish(port, input());
    expect(gh.calls).toEqual([
      "tag v0.8.0",
      "draft v0.8.0",
      `upload ${NAMES.join(",")}`,
      "npm 2",
      "publish v0.8.0 latest",
    ]);
    expect(gh.releases.get("v0.8.0")).toEqual(published());
  });

  it("re-uploads a draft asset swapped during npm publish, then re-checks before publishing", async () => {
    const { gh, port } = fakeGithub([], {
      onNpm: (g) => {
        const r = g.releases.get("v0.8.0") as ReleaseView;
        const swapped = r.assets.map((a) =>
          a.name === "manifest.json" ? { ...a, digest: `sha256:${hex("e")}` } : a,
        );
        g.releases.set("v0.8.0", {
          ...r,
          assets: [...swapped, { name: "evil.sh", digest: null, size: 9 }],
        });
      },
    });
    await runPublish(port, input());
    expect(gh.calls.slice(3)).toEqual([
      "npm 2",
      "delete-asset evil.sh",
      "upload manifest.json",
      "publish v0.8.0 latest",
    ]);
    const r = gh.releases.get("v0.8.0") as ReleaseView;
    expect(r.draft).toBe(false);
    expect(assetProblems(ASSETS, r)).toEqual({ missing: [], unexpected: [], mismatched: [] });
  });

  it("refuses to publish when the draft is still wrong after the re-upload", async () => {
    const { gh, port } = fakeGithub();
    const upload = port.upload;
    let n = 0;
    port.upload = (tag, assets) => {
      upload(tag, assets);
      if (++n > 1) {
        const r = gh.releases.get(tag) as ReleaseView;
        gh.releases.set(tag, { ...r, assets: r.assets.slice(1) });
      }
    };
    const onNpm = port.npmPublish;
    port.npmPublish = async (p, d) => {
      await onNpm(p, d);
      const r = gh.releases.get("v0.8.0") as ReleaseView;
      gh.releases.set("v0.8.0", { ...r, assets: r.assets.slice(1) });
    };
    await expect(runPublish(port, input())).rejects.toThrow(/still wrong/);
    expect(gh.calls.some((c) => c.startsWith("publish"))).toBe(false);
  });

  it("resumes a half-done run from its draft: uploads only what is missing", async () => {
    const { gh, port } = fakeGithub([draft(ASSETS.slice(0, 2).map(remote))]);
    await runPublish(
      port,
      input({ tagCommit: HEAD, npmMissing: [], releases: port.releases("v0.8.0") }),
    );
    expect(gh.calls).toEqual([`upload ${NAMES.slice(2).join(",")}`, "publish v0.8.0 latest"]);
  });

  it("without a bundle, removes an asset someone attached to the draft", async () => {
    const { gh, port } = fakeGithub([draft([{ name: "x.zip", digest: null, size: 1 }])]);
    await runPublish(
      port,
      input({ bundle: null, tagCommit: HEAD, npmMissing: [], releases: port.releases("v0.8.0") }),
    );
    expect(gh.calls).toEqual(["delete-asset x.zip", "publish v0.8.0 latest"]);
  });

  it("a dry run deletes its draft at the end, and also when a step fails", async () => {
    const ok = fakeGithub();
    await runPublish(ok.port, input({ dryRun: true, runNumber: "3", npmMissing: [] }));
    expect(ok.gh.calls).toEqual([
      "draft v0.8.0-dryrun.3 target",
      `upload ${NAMES.join(",")}`,
      "npm 2 --dry-run",
      "delete v0.8.0-dryrun.3",
    ]);
    expect(ok.gh.releases.size).toBe(0);
    // Every version here is on npm: no npm publish reaches npm without --force and --dry-run.
    expect(ok.gh.npm.map((p) => p.flags)).toEqual([DRY_FORCE, DRY_FORCE]);
    const bad = fakeGithub();
    bad.port.npmPublish = async () => {
      throw new Error("smoke test failed");
    };
    await expect(runPublish(bad.port, input({ dryRun: true, runNumber: "4" }))).rejects.toThrow(
      /smoke test failed/,
    );
    expect(bad.gh.calls.at(-1)).toBe("delete v0.8.0-dryrun.4");
    expect(bad.gh.calls.some((c) => c.startsWith("tag") || c.startsWith("publish"))).toBe(false);
  });
});
