/**
 * RFC-0047 §9: the release bundle inside the image. `fetchBundle` runs at image build: the signed
 * key and yank lists, the release's statement, signature and manifest, `verifyRelease` over the
 * tarball, then the extracted files and `manifest.json` in a fresh directory, the same steps 1–4
 * and 6 as `cloudhal deploy --release` (the build-provenance attestation is the workflow's job:
 * docker.yml checks it with `gh attestation verify` before it builds). `checkBundle` runs at every
 * start: every extracted file against the manifest's SHA-256, so a changed file is refused.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mergeTrust,
  PINNED_KEYS,
  type ReleaseManifest,
  verifyRelease,
} from "@cloudhal/release-verify";
import { extractRelease } from "../commands/deploy/release/extract.ts";
import {
  checkBundledVersion,
  fetchRelease,
  fetchTarball,
} from "../commands/deploy/release/fetch-release.ts";
import { loadTrust } from "../commands/deploy/release/trust.ts";

export const MANIFEST_FILE = "manifest.json";

export interface FetchBundleOptions {
  readonly version: string;
  /** The extracted bundle: must not exist yet. */
  readonly out: string;
  /** A directory with the release's assets and lists, instead of the network. */
  readonly from?: string | undefined;
  readonly fetch?: typeof fetch;
  readonly log?: (line: string) => void;
  /** Tests only: release keys and trust roots other than the pinned ones. */
  readonly pinnedKeys?: Parameters<typeof mergeTrust>[0];
  readonly trustRoots?: NonNullable<Parameters<typeof loadTrust>[0]["roots"]>;
}

/** Downloads, verifies and extracts `version`; returns its manifest. */
export async function fetchBundle(o: FetchBundleOptions): Promise<ReleaseManifest> {
  checkBundledVersion(o.version);
  if (existsSync(o.out)) throw new Error(`${o.out} exists: the bundle goes into a new directory`);
  const log = o.log ?? (() => {});
  const work = `${o.out}.download`;
  const trust = await loadTrust({
    from: o.from,
    ...(o.fetch ? { fetch: o.fetch } : {}),
    stateFile: path.join(work, "release-trust.json"),
    ...(o.trustRoots ? { roots: o.trustRoots } : {}),
  });
  const source = {
    version: o.version,
    from: o.from,
    ...(o.fetch ? { fetch: o.fetch } : {}),
    dir: work,
    log,
  };
  const files = await fetchRelease(source);
  const release = await verifyRelease({
    request: { version: o.version },
    statement: files.statement,
    signature: files.signature,
    manifest: files.manifest,
    tarball: await fetchTarball(source),
    planVersion: 1,
    keys: mergeTrust(o.pinnedKeys ?? PINNED_KEYS, trust),
    yanked: trust.yanked,
  });
  log(
    `verified v${o.version} (commit ${release.statement.commit.slice(0, 12)}, key ${release.statement.signing.keyId})`,
  );
  const extracted = await extractRelease(release, o.out);
  await writeFile(path.join(o.out, MANIFEST_FILE), files.manifest, { flag: "wx" });
  await rm(work, { recursive: true, force: true });
  log(`extracted ${extracted.files} verified files into ${o.out}`);
  return release.manifest;
}

const sha256 = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

/** Every file the manifest lists for a role, with its expected digest. */
function expected(m: ReleaseManifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const role of ["site", "admin"] as const) {
    const w = m.workers[role];
    for (const mod of w.modules) out.set(`${role}/modules/${mod.path}`, mod.sha256);
    for (const f of w.assets.files) out.set(`${role}/assets${f.path}`, f.sha256);
    if (w.assets.headers)
      out.set(
        `${role}/assets/_headers`,
        createHash("sha256").update(w.assets.headers).digest("hex"),
      );
  }
  return out;
}

async function filesUnder(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

/**
 * The bundle's manifest, once every file it lists is present with its digest and no other file
 * is there (besides the manifest). Throws naming the first few differences.
 */
export async function checkBundle(dir: string): Promise<ReleaseManifest> {
  const file = path.join(dir, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`no release bundle at ${dir} (${MANIFEST_FILE} missing)`);
  const m = JSON.parse(await readFile(file, "utf8")) as ReleaseManifest;
  const want = expected(m);
  const wrong: string[] = [];
  for (const [rel, digest] of want) {
    const p = path.join(dir, rel);
    if (!existsSync(p)) wrong.push(`${rel} is missing`);
    else if ((await sha256(p)) !== digest) wrong.push(`${rel} changed`);
    if (wrong.length >= 5) break;
  }
  if (wrong.length < 5)
    for (const rel of await filesUnder(dir))
      if (rel !== MANIFEST_FILE && !want.has(rel)) wrong.push(`${rel} is not in the release`);
  if (wrong.length > 0)
    throw new Error(
      `the release bundle at ${dir} is not v${m.version} as released:\n  - ${wrong.slice(0, 5).join("\n  - ")}`,
    );
  return m;
}

/** For tests and `selfhost config`: the manifest without the file check. */
export async function readBundleManifest(dir: string): Promise<ReleaseManifest> {
  return JSON.parse(await readFile(path.join(dir, MANIFEST_FILE), "utf8")) as ReleaseManifest;
}
