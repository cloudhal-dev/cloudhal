/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

import type { ErrorObject } from "ajv";
import type { Project, Site, Page, Section, ContentEntry, Snapshot, SkillManifest } from "./index.ts";

export interface StandaloneValidator<T> {
  (data: unknown): data is T;
  errors?: ErrorObject[] | null;
}

export declare const validateProject: StandaloneValidator<Project>;
export declare const validateSite: StandaloneValidator<Site>;
export declare const validatePage: StandaloneValidator<Page>;
export declare const validateSection: StandaloneValidator<Section>;
export declare const validateContentEntry: StandaloneValidator<ContentEntry>;
export declare const validateSnapshot: StandaloneValidator<Snapshot>;
export declare const validateSkillManifest: StandaloneValidator<SkillManifest>;
