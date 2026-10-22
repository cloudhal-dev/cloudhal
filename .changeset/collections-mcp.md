---
"@cloudhal/mcp-server": minor
---

MCP collection tools (RFC-0040 step 4):
- `list_collections` (`content:read`) lists every collection with its names, icon, entry counts by status, permalink, feed, sitemap and sort settings, and the taxonomies that apply.
- `create_collection` declares a collection. It needs names in the default locale and optionally takes an icon, permalink, feed, sitemap and sort.
- `update_collection` changes a collection's names (merged by locale), icon, feed, sitemap or sort.
- Both write tools need `site:write` and wait for a person in every mode, and that person must hold `site:settings`. Overlaps, duplicates and missing names are refused before anyone is asked; `dryRun` checks without asking.
- `create_entry` now refuses a collection outside the registry (`collection_undeclared`) and points to `create_collection`. Collections that already have entries keep working.
