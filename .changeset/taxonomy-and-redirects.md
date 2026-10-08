---
"@cloudhal/core-ts": minor
"@cloudhal/storage": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
"@cloudhal/mcp-server": patch
"@cloudhal/agent-runtime": patch
---

Taxonomy and redirects (RFC-0002, core).

- `@cloudhal/core-ts`: explicit node kinds (`NODE_KINDS`, `NODE_SPEC`, `uniquenessKey(kind, node)`, `siteIdOf(kind, node)`; `kindOf` is removed). `SiteGraphStore` gains taxonomies (`createTaxonomy`, `createDefaultTaxonomies`, `getTaxonomy`, `getTaxonomyByKey`, `listTaxonomies`, `updateTaxonomy`), terms (`createTerm`, `getTerm`, `getTermBySlug`, `listTerms`, `updateTerm`, `termUsage`, `resolveTerms`), one-batch governance operations (`renameTerm`, `mergeTerms`, `retireTerm`, `setTermParent`, `setTermVisibility`, `reviewTerm`; more than 400 entries → `too_large`), redirects (`createRedirect`, `getRedirect`, `updateRedirect`, `deleteRedirect`, `listRedirects`, `redirectFor`) and `migrateTagsToTerms` / `revertTagsToTerms`. Entry writes enforce the assignment invariants (`InvariantError` with a `code`) and translate a deprecated non-empty `tags` into `terms.tag`; a published entry's slug change and a published page's path change leave 301 redirects. `listContentEntries(siteId, { collection, filter, locale, status })` compiles to SQL; the string form still works. New subpath `@cloudhal/core-ts/filter` (`parseFilter`, `resolveFilter`, `matches`, `toSql`). `createSnapshot` takes `metadata`. The starter seed creates the default taxonomies with a "News" category and a "Cloudhal" tag.
- `@cloudhal/storage`: migration `0011_op_guards`.
- `@cloudhal/astro-renderer`: `GraphSource` gains `taxonomies`, `terms`, `termBySlug`, `entriesByFilter`, `entriesByTerm` and `redirectFor`; snapshots with unknown node kinds still render.
- `@cloudhal/cli`: `cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]`.
- `@cloudhal/mcp-server`, `@cloudhal/agent-runtime`: approval prompts name taxonomy, term and redirect changes; the auto-mode reason reads "it changes pages, site settings, taxonomies or redirects".
