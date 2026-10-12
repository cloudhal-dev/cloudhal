/**
 * @cloudhal/core-contracts — domain contracts for Cloudhal.
 *
 * The JSON Schemas under ./schemas are the single source of truth; everything under
 * ./src/generated is produced from them (`pnpm gen`). Import types from here, and load
 * schemas via `loadBundledSchemas()` when you need runtime validation.
 */

export { ROOT_SCHEMAS, type RootSchemaName } from "../scripts/schema-list.ts";
export * from "./generated/index.ts";
export * from "./generated/schemas.ts";
export * from "./validate.ts";

/** Current contract version. Every root document carries `schemaVersion` equal to this. */
export const CONTRACT_SCHEMA_VERSION = 1 as const;
