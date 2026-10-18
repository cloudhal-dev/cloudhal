import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0033 invariant 2: a translation group has at most one page (or entry) per locale in a site.
 * An expression index over the node body backs the store's check against concurrent writes; nodes
 * without `translation` are left out by the partial `WHERE`.
 */
export const migration0025TranslationGroups: Migration = {
  name: "0025_translation_groups",
  sql: `
CREATE UNIQUE INDEX nodes_translation_locale ON nodes (
  site_id, kind, json_extract(body, '$.translation.group'), json_extract(body, '$.locale')
) WHERE json_extract(body, '$.translation.group') IS NOT NULL;
`,
};
