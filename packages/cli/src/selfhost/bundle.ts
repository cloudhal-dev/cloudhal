/**
 * RFC-0047 §9: the release bundle inside the image. `fetchBundle` runs at image build: the signed
 * key and yank lists, the release's statement, signature and manifest, `verifyRelease` over the
 * tarball, then the extracted files and `manifest.json` in a fresh directory, the same steps 1–4
 * and 6 as `cloudhal deploy --release` (the build-provenance attestation is the workflow's job:
 * docker.yml checks it with `gh attestation verify` before it builds). `checkBundle` runs at every
 * start: every extracted file against the manifest's SHA-256, so a changed file is refused.
 */
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
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

import { MANIFEST_FILE } from "./bundle-check.ts";

export { checkBundle, MANIFEST_FILE, readBundleManifest } from "./bundle-check.ts";

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
