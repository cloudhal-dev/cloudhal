import type { ErrorObject } from "ajv";
import type { RootSchemaName } from "../scripts/schema-list.ts";
import type {
  AnalyticsBeacon,
  AnalyticsEvent,
  Asset,
  Automation,
  Comment,
  CommentSubmission,
  ContentEntry,
  Menu,
  Page,
  Project,
  Redirect,
  Release,
  ScheduleRun,
  Section,
  Site,
  SkillManifest,
  Snapshot,
  Taxonomy,
  Term,
} from "./generated/index.ts";
import * as v from "./generated/validators.js";

/** Map from contract name to its TypeScript type. */
export interface ContractTypes {
  project: Project;
  site: Site;
  page: Page;
  section: Section;
  "content-entry": ContentEntry;
  snapshot: Snapshot;
  "skill-manifest": SkillManifest;
  taxonomy: Taxonomy;
  term: Term;
  redirect: Redirect;
  asset: Asset;
  menu: Menu;
  "analytics-event": AnalyticsEvent;
  "analytics-beacon": AnalyticsBeacon;
  comment: Comment;
  "comment-submission": CommentSubmission;
  release: Release;
  automation: Automation;
  "schedule-run": ScheduleRun;
}

const validators: { [K in RootSchemaName]: v.StandaloneValidator<ContractTypes[K]> } = {
  project: v.validateProject,
  site: v.validateSite,
  page: v.validatePage,
  section: v.validateSection,
  "content-entry": v.validateContentEntry,
  snapshot: v.validateSnapshot,
  "skill-manifest": v.validateSkillManifest,
  taxonomy: v.validateTaxonomy,
  term: v.validateTerm,
  redirect: v.validateRedirect,
  asset: v.validateAsset,
  menu: v.validateMenu,
  "analytics-event": v.validateAnalyticsEvent,
  "analytics-beacon": v.validateAnalyticsBeacon,
  comment: v.validateComment,
  "comment-submission": v.validateCommentSubmission,
  release: v.validateRelease,
  automation: v.validateAutomation,
  "schedule-run": v.validateScheduleRun,
};

export class ContractValidationError extends Error {
  override readonly name = "ContractValidationError";
  readonly contract: RootSchemaName;
  readonly errors: ErrorObject[];

  constructor(contract: RootSchemaName, errors: ErrorObject[]) {
    super(
      `${contract}: ${errors.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ")}`,
    );
    this.contract = contract;
    this.errors = errors;
  }
}

/** Type guard: true when `data` conforms to the named contract. Works on Workers (no eval). */
export function isValid<K extends RootSchemaName>(
  contract: K,
  data: unknown,
): data is ContractTypes[K] {
  return validators[contract](data);
}

/** Returns the validation errors for `data`, or an empty array when valid. */
export function validationErrors(contract: RootSchemaName, data: unknown): ErrorObject[] {
  const fn = validators[contract];
  return fn(data) ? [] : [...(fn.errors ?? [])];
}

/** Asserts conformance and narrows the type; throws `ContractValidationError` otherwise. */
export function assertValid<K extends RootSchemaName>(
  contract: K,
  data: unknown,
): asserts data is ContractTypes[K] {
  const fn = validators[contract];
  if (!fn(data)) throw new ContractValidationError(contract, [...(fn.errors ?? [])]);
}
