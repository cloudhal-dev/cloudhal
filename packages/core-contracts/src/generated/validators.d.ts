/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

import type { ErrorObject } from "ajv";
import type { Project, Site, Page, Section, ContentEntry, Snapshot, SkillManifest, Taxonomy, Term, Redirect, Asset, Menu, AnalyticsEvent, AnalyticsBeacon, Comment, CommentSubmission, Release, Automation, ScheduleRun, Glossary } from "./index.ts";

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
export declare const validateTaxonomy: StandaloneValidator<Taxonomy>;
export declare const validateTerm: StandaloneValidator<Term>;
export declare const validateRedirect: StandaloneValidator<Redirect>;
export declare const validateAsset: StandaloneValidator<Asset>;
export declare const validateMenu: StandaloneValidator<Menu>;
export declare const validateAnalyticsEvent: StandaloneValidator<AnalyticsEvent>;
export declare const validateAnalyticsBeacon: StandaloneValidator<AnalyticsBeacon>;
export declare const validateComment: StandaloneValidator<Comment>;
export declare const validateCommentSubmission: StandaloneValidator<CommentSubmission>;
export declare const validateRelease: StandaloneValidator<Release>;
export declare const validateAutomation: StandaloneValidator<Automation>;
export declare const validateScheduleRun: StandaloneValidator<ScheduleRun>;
export declare const validateGlossary: StandaloneValidator<Glossary>;
