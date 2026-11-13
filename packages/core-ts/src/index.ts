/**
 * @cloudhal/core-ts — the Site Graph core in TypeScript (until the Rust port, ADR-0001).
 */

export {
  type AssetFields,
  type AssetPage,
  type AssetQuery,
  type AssetRefRow,
  type AssetUsage,
  type BlobLedgerRow,
  canonicalAsset,
  checkAssetRules,
  type GcResult,
  type IngestAssetInput,
  type IngestAssetResult,
  mediaBlobKey,
  type StreamIngestInput,
  type UploadTicket,
  type UploadTicketRequest,
} from "./assets.ts";
export * from "./availability.ts";
export * from "./body-blocks.ts";
export * from "./body-index.ts";
export * from "./body-ops.ts";
export * from "./bundles.ts";
export * from "./cache-purge.ts";
export * from "./cache-tags.ts";
export * from "./collections.ts";
export * from "./corrections.ts";
export * from "./cross-site.ts";
export * from "./design.ts";
export * from "./domains.ts";
export * from "./editions.ts";
export {
  applyFieldQuery,
  ENTRY_PAGE_LIMIT,
  type FieldEntryList,
  type FieldEntryListQuery,
  queryContentEntries,
} from "./entry-query.ts";
export * from "./errors.ts";
export { advancesDerivedGate, expiringEntries, type GateSide } from "./expiring-entries.ts";
export * from "./fields-operations/index.ts";
export * from "./filter.ts";
export * from "./hash.ts";
export type { NodeHold } from "./holds.ts";
export * from "./hosts.ts";
export * from "./ids.ts";
export {
  type ListValuesBudget,
  type RebuildListValuesOptions,
  type RebuildListValuesResult,
  type RebuiltCollection,
  rebuildListValues,
} from "./list-values/backfill.ts";
export * from "./locale-paths.ts";
export {
  importMediaUrls,
  type LoadedSource,
  MEDIA_MIGRATION,
  type MediaImportOptions,
  type MediaImportResult,
  type MediaRevertResult,
  revertMediaImport,
} from "./media-import.ts";
export * from "./menu.ts";
export * from "./names.ts";
export * from "./permalinks.ts";
export * from "./preview-token.ts";
export * from "./proposals.ts";
export {
  ancestorPaths,
  joinTarget,
  matchRedirect,
  normalisePath,
  type RedirectMatch,
  redirectKey,
  redirectLocale,
  splitTarget,
} from "./redirects.ts";
export {
  getGroupMembers,
  type ReferrerCandidates,
  referrerCandidates,
} from "./references/reads.ts";
export {
  type RebuildEntryRefsOptions,
  type RebuildEntryRefsResult,
  type RebuiltEntryRefs,
  rebuildEntryRefs,
} from "./references/rebuild-job.ts";
export {
  listReferenceTargets,
  listReferrers,
  type ReferenceCard,
  type ReferenceTarget,
  type Referrer,
  referenceCard,
} from "./references/referrers.ts";
export {
  RELEASE_BLOB_ALLOWANCE,
  releaseBlobAllowance,
} from "./references/release-purge.ts";
export type {
  PublishReleaseInput,
  PublishReleaseResult,
  ReleasePurge,
} from "./release-apply.ts";
export * from "./search.ts";
export * from "./search-ai.ts";
export * from "./search-provider.ts";
export * from "./seed.ts";
export * from "./site-delete.ts";
export * from "./site-search.ts";
// RFC-0045 §6: an entry's values through the field-operation markers, as the store reads them
// (MCP's approval prompts describe changes against it).
export { normalizeEntryFields } from "./store/entry-fields.ts";
export * from "./store.ts";
export * from "./sync.ts";
export {
  TAGS_MIGRATION,
  TAGS_MIGRATION_BATCH,
  type TagsMigrationResult,
  type TagsRevertResult,
} from "./tags-migration.ts";
export {
  type DefaultTaxonomyOptions,
  type EntryQuery,
  GOVERNANCE_ENTRY_LIMIT,
  type GovernanceResult,
  MAX_TERM_DEPTH,
  MAX_TERM_IDS_PER_ENTRY,
  type ReviewDecision,
  type TermQuery,
  type TermUsage,
} from "./taxonomy.ts";
export * from "./taxonomy-report.ts";
export { termSlug } from "./term-locales.ts";
export * from "./translation-checks.ts";
export * from "./translation-layout.ts";
