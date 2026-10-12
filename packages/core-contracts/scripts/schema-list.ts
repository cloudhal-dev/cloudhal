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
] as const;

export type RootSchemaName = (typeof ROOT_SCHEMAS)[number];

export const COMMON_SCHEMA = "common";
