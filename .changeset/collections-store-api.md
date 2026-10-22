---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": patch
---

First-class collections, step 2 (RFC-0040 / ADR-0042).
- **Store:** the first entry of a new collection is refused (`path_conflict`, `reserved_path`) when its default prefix `/<collection>` overlaps another collection's permalink, a taxonomy archive, `/search` or a locale prefix. This closes the gap RFC-0038 left. A site update that declares a new collection runs the same check, and a declared collection that still has entries, or that a taxonomy names, cannot be undeclared (`collection_in_use`).
- **API:** new routes under `/api/sites/:id/collections`:
  - `GET` (`content:read`) lists the registry;
  - `PUT /:key { settings, rev }` declares or changes a collection (`site:settings`), with `?dryRun=1`;
  - `DELETE /:key?rev=` undeclares an empty one.

  Creating an entry in a collection outside the registry is refused with `collection_undeclared` (422).
- **Renderer:** RSS feeds leave out collections with `feed: false`, and `sitemap.xml` leaves out those with `sitemap: false`. The defaults are unchanged. `collectionLabel` and `collectionSettings` are re-exported from `./routing` for themes.
- **MCP:** resetting a permalink with `set_collection_permalink` keeps the collection declared. Agents get hints for the new error codes.
