/** The options `cloudhal deploy --release` adds (RFC-0046 §11b), and what it reports. */
import type { ReleaseKeys, RootKeys } from "@cloudhal/release-verify";
import type { AttestationResult } from "@cloudhal/release-verify/attestation";

export interface ReleaseDeployOptions {
  /** Install this CLI version's signed release instead of building the project. */
  readonly release?: boolean;
  /** `--from <dir>`: the five release assets, `keys.json` and `yanked.json` (with `.sig`) offline. */
  readonly from?: string;
  /** Continue on the release key alone when `gh` is unavailable (never implied). */
  readonly allowSingleFactor?: boolean;
  /** Deploy the official theme although the project's theme files differ (never implied). */
  readonly discardLocalTheme?: boolean;
  /** Tests only: the version to install (default: this CLI's). */
  readonly cliVersion?: string;
  /** Tests only: the release keys to start from (default: `PINNED_KEYS`). */
  readonly pinnedKeys?: ReleaseKeys;
  /** Tests only: the roots `keys.json` must verify with (default: `PINNED_ROOTS`). */
  readonly trustRoots?: RootKeys;
  /** Tests only: where the yank memory lives (default: `~/.cloudhal/release-trust.json`). */
  readonly trustStateFile?: string;
  /** Tests only: the attestation check (default: `gh attestation verify`). */
  readonly attest?: (o: {
    dir: string;
    version: string;
    commit: string;
  }) => Promise<AttestationResult>;
}

export interface ReleaseResult {
  readonly version: string;
  readonly commit: string;
  /** `verified`, or `single-factor` with `--allow-single-factor` and no `gh`. */
  readonly attestation: "verified" | "single-factor";
  /** With `--discard-local-theme`: the project's files the official theme replaced. */
  readonly notDeployed?: readonly string[];
  /** Files extracted into `.cloudhal/deploy/release/<version>/`. */
  readonly files: number;
}
