/**
 * `@cloudhal/core-ts/fields` (RFC-0041 / ADR-0043): typed custom fields per collection. One
 * eval-free checker for the store, the API and MCP's precheck: definition rules the schema cannot
 * express, values compiled to ADR-0030's props subset (`validateProps`), the JSON Schema agents
 * receive, and the values readers see (`resolveFields`); RFC-0042's listings by field (`query.ts`)
 * and derived expiry gates (`gate.ts`). Worker-safe and Temporal-free.
 *
 * RFC-0045 (`../references/`): the `reference` and `repeater` types' gate and definition rules,
 * values, strict JSON Schema profile, `pickMember` and `referenceIssues`. Both types are refused on
 * every write path (`fields_unsupported`) until rollout step 7.
 */

export {
  type ConversionEntries,
  conversionCollections,
  conversionEntries,
  conversionTargets,
  foldText,
} from "../references/conversion-maps.ts";
export {
  FIELDS_FEATURE_VERSION,
  FIELDS_SUPPORTED,
  type FieldTypeSupport,
  type ReferenceDefinitionOptions,
  referenceDefinitionIssues,
  referenceTypesSupported,
  subFieldCount,
  unsupportedFieldTypeIssues,
} from "../references/definitions.ts";
export {
  hasReferenceFields,
  type ReferenceIssue,
  type ReferenceIssueReason,
  type ReferenceSnapshot,
  referenceIssues,
} from "../references/issues.ts";
export {
  isMemberOf,
  type MemberLike,
  memberGroup,
  membersByGroup,
  type PickedMember,
  type PickMemberOptions,
  pickMember,
} from "../references/members.ts";
export {
  type ReferenceUse,
  referenceCountIssues,
  referenceUses,
  referenceValues,
  requiredSubFieldIssues,
} from "../references/values.ts";
export {
  type Conversion,
  type ConvertContext,
  canConvert,
  convertFieldValue,
  dayIn,
  escapeMarkdown,
  FIELD_CONVERSIONS,
  markdownToPlain,
  midnightIn,
} from "./conversions.ts";
export {
  checkFieldDefinitions,
  type FieldDefinitionChange,
  fieldDefinitionChanges,
} from "./definitions.ts";
export {
  type DerivedGate,
  derivedGate,
  derivedGates,
  type EntryVisibility,
  type ExpiryAction,
  entryVisibility,
  type GatedEntry,
  hasExpiryRules,
  listFieldInstants,
  originalsOf,
} from "./entry-gates.ts";
export { type FormatFieldOptions, formatFieldValue } from "./format.ts";
export { dayStartIn, effectiveUntil, expiryInstant, fieldGateInstant, nextDay } from "./gate.ts";
export {
  type FieldsJsonSchemaOptions,
  fieldJsonSchema,
  fieldsJsonSchema,
  JSON_SCHEMA_KEYWORDS,
  type JsonSchema,
  type JsonType,
} from "./json-schema.ts";
export { type StrictCost, strictFieldsSchema, strictSchemaCost } from "./json-schema-strict.ts";
export {
  convertContext,
  type FieldMigrationKind,
  isBeingRemoved,
  migrationKind,
  normalizeThroughMarkers,
  type RewriteInput,
  type RewriteResult,
  rewriteFields,
  type ValueChange,
} from "./migration.ts";
export {
  ASSET_ID_PATTERN,
  DATE_PATTERN,
  fieldPropSchema,
  fieldsPropsSchema,
  GROUP_ID_PATTERN,
  INSTANT_PATTERN,
  subFieldPropSchema,
} from "./props.ts";
export {
  canOrderBy,
  checkFieldQuery,
  compareByField,
  FIELD_QUERY_LIMITS,
  FIELD_QUERY_OPS,
  type FieldOperand,
  type FieldQuery,
  type FieldQueryIssue,
  type FieldQueryOp,
  matchesFieldQuery,
  NOW,
  type ParsedCondition,
  type ParsedFieldQuery,
  type ParseFieldQueryResult,
  parseFieldQuery,
} from "./query.ts";
export { fieldRefusalCode, refuseFieldIssues } from "./refusal.ts";
export {
  type FieldsEntry,
  type FieldsOriginal,
  hasFieldValue,
  type ResolvedField,
  type ResolvedFields,
  resolveFields,
} from "./resolve.ts";
export { type DroppedItem, readStrictFields, type StrictFieldsRead } from "./strict-input.ts";
export {
  itemPathRepeater,
  localizedFieldValues,
  sharedFieldIssues,
  sharedFieldKeys,
  type TranslatedItemsInput,
  translatableFieldValues,
  translatedItemValues,
} from "./translation.ts";
export {
  ALL_FIELD_TYPES,
  type EnabledFieldType,
  FIELD_LIMITS,
  FIELD_TYPES,
  type FieldIssue,
  type FieldIssueCode,
  type FieldType,
  fieldDefinitions,
  fieldHelp,
  fieldLabel,
  isKnownFieldType,
  isReferenceFieldType,
  optionLabel,
  REFERENCE_FIELD_TYPES,
  RESERVED_FIELD_KEYS,
  type ReferenceFieldDefinition,
  type ReferenceFieldType,
  type RepeaterFieldDefinition,
  renamedFrom,
  type SiteFields,
  type SubFieldType,
} from "./types.ts";
export {
  isCalendarDay,
  isKnownTimeZone,
  type ValueCheckOptions,
  valueIssues,
} from "./value-checks.ts";
export {
  type CheckInput,
  checkFieldValues,
  checkRequiredToPublish,
  type PublishCheckEntry,
} from "./values.ts";
