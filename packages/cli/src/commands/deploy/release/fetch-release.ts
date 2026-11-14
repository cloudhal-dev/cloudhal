/**
 * The release `deploy --release` installs (RFC-0046 §11b): always this CLI's own version.
 *
 * - `v0.8.0` and older carry no bundle; a version with no published release, a draft (publish-ci's
 *   window between attaching assets and publishing; GitHub does not show it to anyone without
 *   write access), or a release without the bundle assets is `release-unavailable`. It never falls
 *   back to building.
 * - Downloading is discovery only: the assets land in a fresh `.cloudhal/deploy/release-download/
 *   <version>/` with byte caps, and `verifyRelease` decides. The tarball is fetched last, after the
 *   theme and config checks, so a refused project downloads 7 MB for nothing.
 * - `--from <dir>`: the same files, copied from that directory.
 */
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  LIMITS,
  MANIFEST_FILE,
  RELEASE_REPOSITORY,
  releaseAssetNames,
  releaseAssetUrls,
  SIGNATURE_FILE,
  STATEMENT_FILE,
  sigstoreName,
  tarballName,
} from "@cloudhal/release-verify";
import { versionAtLeast } from "../../../cloudflare/wrangler.ts";
import { refuseDeploy, WITHOUT_RELEASE } from "./errors.ts";

/** The first version with a bundle: 0.9.0. */
export const FIRST_BUNDLED_VERSION = "0.9.0";

const CAPS: Record<string, number> = {
  [STATEMENT_FILE]: LIMITS.statementBytes,
  [SIGNATURE_FILE]: 64,
  [MANIFEST_FILE]: LIMITS.manifestBytes,
};
const capOf = (name: string) => CAPS[name] ?? LIMITS.tarballBytes;

export interface ReleaseSource {
  readonly version: string;
  readonly from?: string | undefined;
  readonly fetch?: typeof fetch;
  /** `.cloudhal/deploy/release-download/<version>/`. */
  readonly dir: string;
}

/** The assets downloaded so far, as bytes (the tarball stays on disk). */
export interface ReleaseFiles {
  readonly dir: string;
  readonly statement: Uint8Array;
  readonly signature: Uint8Array;
  readonly manifest: Uint8Array;
  readonly tarballFile: string;
  readonly sigstoreFile: string;
}

const unavailable = (version: string, why: string): never =>
  refuseDeploy(
    "release-unavailable",
    `v${version} cannot be installed with --release: ${why}. ${WITHOUT_RELEASE}`,
  );

/** Refuses versions that never had a bundle, before anything is fetched. */
export function checkBundledVersion(version: string): void {
  releaseAssetNames(version); // throws on a malformed version
  if (!versionAtLeast(version.split("-")[0] as string, FIRST_BUNDLED_VERSION))
    unavailable(version, `releases before v${FIRST_BUNDLED_VERSION} have no signed bundle`);
}

/** The published release `v<version>` and that it lists every bundle asset (GitHub's API). */
async function checkPublished(s: ReleaseSource): Promise<void> {
  const url = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/tags/v${s.version}`;
  let res: Response;
  try {
    res = await (s.fetch ?? fetch)(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "cloudhal-cli" },
    });
  } catch (e) {
    return unavailable(s.version, `GitHub could not be reached (${(e as Error).message})`);
  }
  if (res.status === 404)
    unavailable(
      s.version,
      "there is no published release with that tag (a draft is not published yet)",
    );
  if (!res.ok) unavailable(s.version, `GitHub answered ${res.status} for the release`);
  const release = (await res.json()) as { draft?: unknown; assets?: { name?: unknown }[] };
  if (release.draft !== false) unavailable(s.version, "the release is still a draft");
  const names = new Set((release.assets ?? []).map((a) => a.name));
  const missing = releaseAssetNames(s.version).filter((n) => !names.has(n));
  if (missing.length > 0)
    unavailable(s.version, `the release has no bundle (missing ${missing.join(", ")})`);
}

/** Streams `url` into `file`, refusing more than `cap` bytes. */
async function download(get: typeof fetch, url: string, file: string, cap: number): Promise<void> {
  const res = await get(url);
  if (res.status !== 200 || !res.body) throw new Error(`downloading ${url} answered ${res.status}`);
  const out = await open(file, "wx");
  try {
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > cap) throw new Error(`${url} is above ${cap} bytes`);
      await out.write(chunk);
    }
  } finally {
    await out.close();
  }
}

async function fetchOne(s: ReleaseSource, name: string): Promise<string> {
  const file = path.join(s.dir, name);
  if (s.from !== undefined) {
    const src = path.join(s.from, name);
    if (!existsSync(src)) unavailable(s.version, `--from ${s.from} has no ${name}`);
    if ((await stat(src)).size > capOf(name))
      throw new Error(`${src} is above ${capOf(name)} bytes`);
    await copyFile(src, file);
    return file;
  }
  const asset = releaseAssetUrls(s.version).find((a) => a.name === name);
  if (!asset) throw new Error(`no release asset named ${name}`);
  await download(s.fetch ?? fetch, asset.url, file, capOf(name));
  return file;
}

/** Statement, signature, manifest and the Sigstore bundle (the tarball comes with `fetchTarball`). */
export async function fetchRelease(s: ReleaseSource): Promise<ReleaseFiles> {
  checkBundledVersion(s.version);
  if (s.from === undefined) await checkPublished(s);
  await rm(s.dir, { recursive: true, force: true });
  await mkdir(s.dir, { recursive: true });
  const read = async (name: string) => new Uint8Array(await readFile(await fetchOne(s, name)));
  const statement = await read(STATEMENT_FILE);
  const signature = await read(SIGNATURE_FILE);
  const manifest = await read(MANIFEST_FILE);
  const sigstoreFile = await fetchOne(s, sigstoreName(s.version));
  return {
    dir: s.dir,
    statement,
    signature,
    manifest,
    tarballFile: path.join(s.dir, tarballName(s.version)),
    sigstoreFile,
  };
}

/** The tarball, into the same directory; then a factory that streams it (read twice by the verifier). */
export async function fetchTarball(s: ReleaseSource): Promise<() => ReadableStream<Uint8Array>> {
  const file = await fetchOne(s, tarballName(s.version));
  return () => Readable.toWeb(createReadStream(file)) as unknown as ReadableStream<Uint8Array>;
}
