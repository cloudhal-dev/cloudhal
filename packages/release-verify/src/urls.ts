/**
 * Where a release's five assets (RFC-0046 §1) are downloaded from. Downloading is discovery only,
 * never a trust factor: `verifyRelease` decides.
 */
import {
  MANIFEST_FILE,
  SIGNATURE_FILE,
  STATEMENT_FILE,
  sigstoreName,
  tarballName,
} from "./limits.ts";

export const RELEASE_REPOSITORY = "cloudhal-dev/cloudhal";

/** `CloudhalVersion` of the contracts: anchored, bounded alternatives, no overlapping runs. */
const VERSION =
  /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(-[0-9A-Za-z.-]{1,64})?$/;

/** The five assets of `version`, in §1's order (tarball, manifest, statement, signature, Sigstore). */
export function releaseAssetNames(version: string): string[] {
  if (!VERSION.test(version)) throw new TypeError(`not a Cloudhal version: ${version}`);
  return [
    tarballName(version),
    MANIFEST_FILE,
    STATEMENT_FILE,
    SIGNATURE_FILE,
    sigstoreName(version),
  ];
}

/** `{ name, url }` of each asset of `version` on the GitHub release `v<version>`. */
export function releaseAssetUrls(version: string): { name: string; url: string }[] {
  return releaseAssetNames(version).map((name) => ({
    name,
    url: `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/${name}`,
  }));
}
