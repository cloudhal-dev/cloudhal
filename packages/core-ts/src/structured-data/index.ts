/**
 * `@cloudhal/core-ts/structured-data` (RFC-0042 §2 / ADR-0044): JSON-LD presets mapped from a
 * collection's typed fields. The closed table of `Event`, `JobPosting`, `Product` and `Recipe`
 * (paths, fitting sources, required properties, vocabularies), the save-time check
 * (`checkStructuredData`) and the per-entry builder (`structuredDataFor`). Pure, Worker-safe,
 * eval-free and Temporal-free.
 */
export {
  type JsonLdDocument,
  type StructuredDataResult,
  structuredDataFor,
} from "./build.ts";
export {
  checkPreset,
  checkStructuredData,
  type StructuredDataIssue,
  type StructuredDataIssueCode,
  structuredDataErrors,
} from "./check.ts";
export {
  KIND_SOURCES,
  type KindSources,
  type PathSpec,
  PRESET_TYPES,
  PRESETS,
  type PresetSpec,
  type PresetType,
  REMOTE_JOB_PATHS,
  requiredPaths,
  STRUCTURED_DATA_MAX_BYTES,
  type ValueKind,
  VOCABULARIES,
  type VocabularyEntry,
  type VocabularyName,
  vocabularyEntry,
} from "./table.ts";
export {
  absoluteHttpUrl,
  bodyText,
  type JsonLdValue,
  type StructuredDataContext,
  type StructuredDataEntry,
  type StructuredDataSite,
  withOffset,
} from "./values.ts";
