/**
 * Single list of root contracts. Order is the order generators emit in; keep it stable
 * so generated files and `tools/list`-style outputs are deterministic.
 */
export const ROOT_SCHEMAS = [
  "project",
  "site",
  "page",
  "section",
  "content-entry",
  "snapshot",
  "skill-manifest",
  "taxonomy",
  "term",
  "redirect",
  "asset",
  "menu",
  "analytics-event",
  "analytics-beacon",
  "comment",
  "comment-submission",
  "release",
  "automation",
  "schedule-run",
  "glossary",
  "release-manifest",
  "release-statement",
] as const;

export type RootSchemaName = (typeof ROOT_SCHEMAS)[number];

/**
 * Roots whose module the package index re-exports only by these names. The release roots
 * (RFC-0046) keep their local `$defs` local: those definitions are portable copies (`SiteId`,
 * `Capability`, `Sha256Hex`, …) whose generic names would claim the package's public type
 * namespace with meanings that hold only inside a release manifest. Every listed name must be
 * declared by the generated module (gen-ts refuses otherwise).
 */
export const INDEX_EXPORTS: Partial<Record<RootSchemaName, readonly string[]>> = {
  "release-manifest": ["ReleaseManifest", "WorkerArtifact", "BindingTemplate"],
  "release-statement": ["ReleaseStatement", "StatementAsset"],
};

export const COMMON_SCHEMA = "common";
