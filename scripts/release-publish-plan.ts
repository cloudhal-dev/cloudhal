/**
 * The publication order of a release on immutable GitHub Releases (RFC-0046 §6), as a pure
 * planner plus a driver over an injected port, used by `scripts/publish-ci.ts` and its tests:
 *
 *   1 tag `v<v>` on the release commit (= HEAD = the statement's commit)
 *   2 draft release (`--verify-tag`, never Latest)
 *   3 upload the five assets while it is a draft (`--clobber`), re-read, compare names + digests
 *   4 npm publish
 *   5 re-check the draft immediately before publishing
 *   6 publish the release (`--latest` only for the highest stable version)
 *
 * `planPublish` looks at what exists and returns the steps still to run, so a rerun resumes from
 * the first incomplete one. A published release is never changed: one that lacks or differs in an
 * asset is refused (the fix is a new version). Without a bundle the same order runs with no assets,
 * and both checks require that the draft has none. A dry run uses `v<v>-dryrun.<n>`, pushes no tag
 * (a draft with `--target` creates none), runs `npm publish --dry-run` (with `--force` for a version
 * npm already has: see `npmFlags`) and deletes its draft.
 * Node built-ins only: the release workflow runs the planning part without a pnpm install.
 */

export interface LocalAsset {
  readonly name: string;
  /** SHA-256, lowercase hex. */
  readonly sha256: string;
  readonly bytes: number;
  /** Where publish-ci reads it from. */
  readonly file: string;
}

export interface RemoteAsset {
  readonly name: string;
  /** GitHub's `sha256:<hex>`; null for assets uploaded before GitHub recorded digests. */
  readonly digest: string | null;
  readonly size: number;
}

export interface ReleaseView {
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly assets: readonly RemoteAsset[];
}

export interface PublishInput {
  readonly version: string;
  /** The checked-out commit (`git rev-parse HEAD`). */
  readonly head: string;
  readonly dryRun: boolean;
  /** `GITHUB_RUN_NUMBER`, for the dry run's tag. */
  readonly runNumber?: string;
  /** The signed bundle (`--bundle-dir`), or null when `RELEASE_BUNDLES` is off. */
  readonly bundle: {
    readonly statement: {
      readonly version: string;
      readonly channel: string;
      readonly commit: string;
    };
    readonly assets: readonly LocalAsset[];
  } | null;
  /** The commit the remote tag names, or null when there is no tag. */
  readonly tagCommit: string | null;
  /** Every release (draft or not) whose tag name is the tag. */
  readonly releases: readonly ReleaseView[];
  /** Every package of the fixed group, in publish order (a dry run publishes them all with `--dry-run`). */
  readonly packages: readonly string[];
  /** Packages npm does not have yet. */
  readonly npmMissing: readonly string[];
  /** Every `v*` tag name, for the Latest decision. */
  readonly tags: readonly string[];
}

export type Step =
  | { readonly kind: "push-tag"; readonly tag: string; readonly commit: string }
  | {
      readonly kind: "create-draft";
      readonly tag: string;
      readonly prerelease: boolean;
      /** Dry run: the commit the draft points at, since no tag exists. */
      readonly target?: string;
    }
  | { readonly kind: "sync-assets"; readonly tag: string }
  | { readonly kind: "check-assets"; readonly tag: string; readonly before: "npm" | "publish" }
  | {
      readonly kind: "npm-publish";
      readonly packages: readonly NpmPublish[];
      readonly dryRun: boolean;
    }
  | {
      readonly kind: "publish-release";
      readonly tag: string;
      readonly latest: boolean;
      readonly prerelease: boolean;
    }
  | { readonly kind: "delete-draft"; readonly tag: string };

export class PublishRefusal extends Error {
  override readonly name = "PublishRefusal";
}

/** One `npm publish <tarball> ...flags` call. */
export interface NpmPublish {
  readonly name: string;
  readonly flags: readonly string[];
}

/**
 * The flags of one `npm publish` of a packed tarball. npm (11 and 12) asks the registry even with
 * `--dry-run` and refuses a version it already has ("You cannot publish over the previously
 * published versions") or one not above its highest ("Cannot implicitly apply the latest tag"),
 * unless `--force`; with `--dry-run` it never uploads. So a dry run passes `--force` exactly for a
 * version npm already has, and keeps the real checks for one it lacks. A real publish never
 * forces and never republishes. npm 12 also refuses a prerelease without `--tag`: it goes to `next`.
 */
export function npmFlags(o: { prerelease: boolean; dryRun: boolean; onNpm: boolean }): string[] {
  if (o.onNpm && !o.dryRun) throw new PublishRefusal("npm already has this version");
  return [
    "--access",
    "public",
    "--ignore-scripts",
    ...(o.prerelease ? ["--tag", "next"] : []),
    // OIDC: npm exchanges the workflow's identity token; provenance is attached automatically.
    ...(o.dryRun ? ["--dry-run", ...(o.onNpm ? ["--force"] : [])] : ["--provenance"]),
  ];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const STABLE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Whether `version` is stable and no stable `v*` tag is higher (the Latest rule). */
export function isHighestStable(version: string, tags: readonly string[]): boolean {
  if (!STABLE.test(`v${version}`)) return false;
  const key = (t: string) => t.slice(1).split(".").map(Number) as [number, number, number];
  const [a, b, c] = key(`v${version}`);
  return tags
    .filter((t) => STABLE.test(t))
    .map(key)
    .every(([x, y, z]) => x < a || (x === a && (y < b || (y === b && z <= c))));
}

export const tagFor = (input: Pick<PublishInput, "version" | "dryRun" | "runNumber">): string => {
  if (!input.dryRun) return `v${input.version}`;
  if (!input.runNumber || !/^\d+$/.test(input.runNumber))
    throw new PublishRefusal("a dry run needs GITHUB_RUN_NUMBER");
  return `v${input.version}-dryrun.${input.runNumber}`;
};

export interface AssetProblems {
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly mismatched: readonly string[];
}

/** How the release's assets differ from exactly the expected names and digests. */
export function assetProblems(
  expected: readonly LocalAsset[],
  release: ReleaseView,
): AssetProblems {
  const remote = new Map(release.assets.map((a) => [a.name, a]));
  const want = new Set(expected.map((a) => a.name));
  return {
    missing: expected.filter((a) => !remote.has(a.name)).map((a) => a.name),
    unexpected: release.assets.filter((a) => !want.has(a.name)).map((a) => a.name),
    mismatched: expected
      .filter((a) => {
        const r = remote.get(a.name);
        return r !== undefined && (r.digest !== `sha256:${a.sha256}` || r.size !== a.bytes);
      })
      .map((a) => a.name),
  };
}

export const clean = (p: AssetProblems): boolean =>
  p.missing.length + p.unexpected.length + p.mismatched.length === 0;

export function describeProblems(p: AssetProblems): string {
  const parts = [
    p.missing.length ? `missing ${p.missing.join(", ")}` : "",
    p.unexpected.length ? `unexpected ${p.unexpected.join(", ")}` : "",
    p.mismatched.length ? `wrong digest ${p.mismatched.join(", ")}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

/** The bundle belongs to this release and this commit (RFC-0046 §6 step 1, §2 invariant 7). */
function checkBundle(input: PublishInput): void {
  const b = input.bundle;
  if (!b) return;
  const s = b.statement;
  if (s.version !== input.version)
    throw new PublishRefusal(`the bundle is for ${s.version}, not ${input.version}`);
  if (s.channel !== (input.version.includes("-") ? "next" : "stable"))
    throw new PublishRefusal(`the bundle's channel ${s.channel} does not match ${input.version}`);
  if (s.commit !== input.head)
    throw new PublishRefusal(`the bundle was built from ${s.commit}, but HEAD is ${input.head}`);
}

/** The steps still to run (see the file comment); throws `PublishRefusal` when none may. */
export function planPublish(input: PublishInput): Step[] {
  if (!SEMVER.test(input.version)) throw new PublishRefusal(`not a version: ${input.version}`);
  checkBundle(input);
  const tag = tagFor(input);
  const prerelease = input.version.includes("-");
  const expected = input.bundle?.assets ?? [];
  if (input.releases.length > 1)
    throw new PublishRefusal(`${input.releases.length} releases use the tag ${tag}; keep one`);
  const release = input.releases[0] ?? null;
  const steps: Step[] = [];
  if (input.dryRun) {
    if (release && !release.draft)
      throw new PublishRefusal(`${tag} is published; a dry run never is`);
    if (!release) steps.push({ kind: "create-draft", tag, prerelease, target: input.head });
    steps.push({ kind: "sync-assets", tag }, { kind: "check-assets", tag, before: "npm" });
    const packages = input.packages.map((name) => ({
      name,
      flags: npmFlags({ prerelease, dryRun: true, onNpm: !input.npmMissing.includes(name) }),
    }));
    steps.push({ kind: "npm-publish", packages, dryRun: true });
    steps.push({ kind: "check-assets", tag, before: "publish" }, { kind: "delete-draft", tag });
    return steps;
  }
  if (input.tagCommit === null) steps.push({ kind: "push-tag", tag, commit: input.head });
  else if (input.tagCommit !== input.head)
    throw new PublishRefusal(
      `${tag} points at ${input.tagCommit}, not the release commit ${input.head}`,
    );
  const packages = input.npmMissing.map((name) => ({
    name,
    flags: npmFlags({ prerelease, dryRun: false, onNpm: false }),
  }));
  const npm: Step[] = packages.length ? [{ kind: "npm-publish", packages, dryRun: false }] : [];
  if (release && !release.draft) {
    const p = assetProblems(expected, release);
    if (!clean(p))
      throw new PublishRefusal(
        `${tag} is published and immutable, and its assets are not the bundle's (${describeProblems(p)}); release a new version`,
      );
    return [...steps, ...npm];
  }
  if (!release) steps.push({ kind: "create-draft", tag, prerelease });
  steps.push({ kind: "sync-assets", tag }, { kind: "check-assets", tag, before: "npm" }, ...npm);
  steps.push({ kind: "check-assets", tag, before: "publish" });
  steps.push({
    kind: "publish-release",
    tag,
    latest: isHighestStable(input.version, input.tags),
    prerelease,
  });
  return steps;
}

/** What the driver needs from GitHub, git and npm. */
export interface PublishPort {
  pushTag(tag: string, commit: string): void;
  releases(tag: string): ReleaseView[];
  createDraft(tag: string, o: { prerelease: boolean; target?: string }): void;
  upload(tag: string, assets: readonly LocalAsset[]): void;
  deleteAsset(tag: string, name: string): void;
  npmPublish(packages: readonly NpmPublish[], dryRun: boolean): Promise<void>;
  publishRelease(tag: string, o: { latest: boolean; prerelease: boolean }): void;
  deleteRelease(tag: string): void;
  log(message: string): void;
}

function draftOf(port: PublishPort, tag: string): ReleaseView {
  const found = port.releases(tag);
  const r = found.length === 1 ? found[0] : undefined;
  if (!r) throw new PublishRefusal(`expected one release ${tag}, found ${found.length}`);
  if (!r.draft) throw new PublishRefusal(`${tag} is no longer a draft; refusing to change it`);
  return r;
}

/** Makes the draft hold exactly `expected`: deletes strays, uploads what is missing or wrong. */
function syncAssets(port: PublishPort, tag: string, expected: readonly LocalAsset[]): void {
  const p = assetProblems(expected, draftOf(port, tag));
  for (const name of p.unexpected) port.deleteAsset(tag, name);
  const upload = expected.filter(
    (a) => p.missing.includes(a.name) || p.mismatched.includes(a.name),
  );
  if (upload.length) port.upload(tag, upload);
}

/** Re-reads the draft; on a mismatch re-uploads while it is still a draft and checks once more. */
function checkAssets(port: PublishPort, tag: string, expected: readonly LocalAsset[]): void {
  let p = assetProblems(expected, draftOf(port, tag));
  if (clean(p)) return;
  port.log(`${tag}: the draft's assets changed (${describeProblems(p)}); re-uploading`);
  syncAssets(port, tag, expected);
  p = assetProblems(expected, draftOf(port, tag));
  if (!clean(p))
    throw new PublishRefusal(`${tag}: the draft's assets are still wrong (${describeProblems(p)})`);
}

/** Runs one step through `port`. */
async function runStep(
  port: PublishPort,
  step: Step,
  expected: readonly LocalAsset[],
): Promise<void> {
  port.log(`step ${step.kind}`);
  switch (step.kind) {
    case "push-tag":
      return port.pushTag(step.tag, step.commit);
    case "create-draft":
      return port.createDraft(step.tag, {
        prerelease: step.prerelease,
        ...(step.target ? { target: step.target } : {}),
      });
    case "sync-assets":
      return syncAssets(port, step.tag, expected);
    case "check-assets":
      return checkAssets(port, step.tag, expected);
    case "npm-publish":
      return port.npmPublish(step.packages, step.dryRun);
    case "publish-release":
      return port.publishRelease(step.tag, { latest: step.latest, prerelease: step.prerelease });
    case "delete-draft":
      return port.deleteRelease(step.tag);
  }
}

/**
 * Deletes a dry run's draft after a failure, best effort (the failure is what gets reported). A
 * cancelled or timed-out job never gets here: release.yml's `publish` job ends with an `always()`
 * step that deletes any `-dryrun.<run number>` draft left.
 */
function cleanUpDryRun(port: PublishPort, tag: string): void {
  try {
    if (port.releases(tag).some((r) => r.draft)) port.deleteRelease(tag);
  } catch {
    port.log(`${tag}: could not delete the dry run's draft; delete it by hand`);
  }
}

/** Runs `planPublish(input)`'s steps through `port`; a dry run deletes its draft even on failure. */
export async function runPublish(port: PublishPort, input: PublishInput): Promise<Step[]> {
  const steps = planPublish(input);
  const expected = input.bundle?.assets ?? [];
  try {
    for (const step of steps) await runStep(port, step, expected);
  } catch (e) {
    if (input.dryRun) cleanUpDryRun(port, tagFor(input));
    throw e;
  }
  return steps;
}
