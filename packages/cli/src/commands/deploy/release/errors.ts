/**
 * Refusals of `cloudhal deploy --release` (RFC-0046 §11b). Each carries a stable code, so scripts
 * and tests can tell them apart; the verifier's own refusals keep `ReleaseVerifyError`'s codes.
 * There is no option that turns a refusal into a warning.
 */
export type ReleaseDeployCode =
  /** No published release with a bundle for this version: deploy without `--release`. */
  | "release-unavailable"
  /** The signed key and yank lists cannot be checked (no pinned root, a fetch or check failed). */
  | "trust-unavailable"
  /** The project's theme files differ from this CLI's starter (`--discard-local-theme`). */
  | "theme-differs"
  /** `cloudhal.json` sets a build key the bundle cannot honour, or a key this CLI does not know. */
  | "config-build-key"
  /** The project's shape: another installation, several sites, or Workers Builds. */
  | "project-unsupported"
  /** The installed wrangler is older than the one the bundle was built with. */
  | "wrangler-too-old"
  /** The build-provenance attestation failed, or `gh` is unavailable without the flag. */
  | "attestation-failed"
  | "attestation-unavailable"
  /** A bundle entry would land outside the extraction directory, or twice. */
  | "extract-unsafe";

export class ReleaseDeployError extends Error {
  readonly code: ReleaseDeployCode;
  constructor(code: ReleaseDeployCode, message: string) {
    super(message);
    this.name = "ReleaseDeployError";
    this.code = code;
  }
}

export const refuseDeploy = (code: ReleaseDeployCode, message: string): never => {
  throw new ReleaseDeployError(code, message);
};

/** The way forward every refusal that is not about trust names. */
export const WITHOUT_RELEASE =
  "Run `cloudhal deploy` without --release to build the project instead.";
