---
"@cloudhal/mcp-server": minor
"@cloudhal/astro-renderer": patch
---

Collections stage 3, step 4 (RFC-0042 §7 / ADR-0044): MCP.

- **`list_collections`** returns, per collection, its `listFields` with each field's type, operators (`ops`) and whether it sorts, and, for a collection with a JSON-LD preset, `structuredData`: the type, every path it offers (required ones, "at least one of" groups, defaults, the field types, entry and site properties, constants and vocabulary each takes) and the preset's warnings.
- **`update_collection`** takes `listFields`, `expiry` and `structuredData` (`null` removes one). The store's dry run checks them in `precheck`, so `unknown_field`, `invalid_expiry`, `structured_data_invalid`, `list_field_in_use` and `gates_unsupported` refuse the call, with paths, before a person is asked. The approval says what changes in words ("Events leave listings, feeds, the sitemap and search (their pages stay) 1 hour after "Ends at" (endsAt); 2 published entries are already past it", "structured data: Event, maps startDate ← field startsAt, …", vocabulary warnings), and the answer lists the preset's warnings. Policy is unchanged (`site:write`, a person holding `site:settings` approves in every mode).
- **`list_entries`** takes `where`, `orderBy`, `limit` and `cursor`, run by core-ts's shared evaluator (`queryContentEntries`); with `limit` it answers `total` and `nextCursor`. Invalid queries are refused as `invalid_query` with their paths.
- **`create_page` / `update_page`** check a changed `contentList` section's `where`/`orderBy` in `precheck` (`invalid_query`, `sections/0/where/1/value`).
- **New read-only tool `preview_structured_data`** (`content:read`): the JSON-LD an entry's page emits under its collection's preset, built by the renderer's `entryStructuredData`, with the issues (no preset, a required value missing, over 32 KB) and the preset's warnings. 109 → 110 tools.
- Hints for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported` (expiry and `availability` alike), and a "Listings, expiry and structured data" paragraph in the server instructions.
- `@cloudhal/astro-renderer`: new subpath `./structured-data` (`entryStructuredData`, `withStructuredData`), so tools use it without the package root.
