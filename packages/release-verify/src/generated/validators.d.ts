/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/release-{manifest,statement}.schema.json
 * (run `pnpm gen`; packages/release-verify/scripts/gen-validators.ts)
 */

import type { ReleaseManifest } from "./release-manifest.ts";
import type { ReleaseStatement } from "./release-statement.ts";

export interface StandaloneValidator<T> {
  (data: unknown): data is T;
  errors?: { instancePath: string; message?: string }[] | null;
}

export declare const validateReleaseManifest: StandaloneValidator<ReleaseManifest>;
export declare const validateReleaseStatement: StandaloneValidator<ReleaseStatement>;
