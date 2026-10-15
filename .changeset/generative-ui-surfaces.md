---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": patch
---

Generative UI surfaces (RFC-0020 phase 20a): a `surface` section kind holding a flat tree of catalog components with a data model; `@cloudhal/core-ts/surfaces` (catalog of primitives and block types, eval-free checks of the tree, props, `{path}` bindings, named functions and visibility conditions, deterministic repairs, RFC 6902 patches, the model prompt); the store refuses broken surfaces with `invalid_surface` and keeps unknown components; `@cloudhal/astro-renderer/surfaces` and `Surface.astro` render them on the server (no-JavaScript tabs and disclosures, entry sources); MCP `get_catalog` and `patch_draft`. Markdown headings h2–h6 now carry ids, and `@cloudhal/astro-renderer/kit` adds the table of contents and reading time (RFC-0018).
