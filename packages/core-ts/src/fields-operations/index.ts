/**
 * RFC-0041 §6 / ADR-0043 §8: field operations — `rename_field`, `change_field_type`,
 * `set_field_localized` and `remove_field` — as resumable, snapshotted, revertible runs over the
 * draft graph. Exported from `@cloudhal/core-ts`.
 */
export { revertFieldOperation } from "./revert.ts";
export { continueFieldOperation, fieldOperationStatus, runFieldOperation } from "./run.ts";
export {
  FIELD_MIGRATION,
  FIELD_OPERATION_BATCH,
  FIELD_OPERATION_BUDGET,
  FIELD_OPERATIONS,
  type FieldOperation,
  type FieldOperationName,
  type FieldOperationOptions,
  type FieldOperationReport,
  type FieldOperationResult,
  type FieldOperationSample,
  type FieldOperationState,
  type FieldOperationStatus,
  type FieldRevertResult,
  type FieldValueCounts,
} from "./types.ts";
