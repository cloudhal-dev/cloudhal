---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
---

Agents can translate into a language edition over MCP (RFC-0034 §6).

**MCP tools**
- `get_translation_source` and `save_translation` take `targetSiteId`: another site of the project that the translation lives on.
- The saved translation records `source.siteId`.
- The article's images are copied into the edition by content, and the references are rewritten.
- Categories and tags become the edition's terms with the same slugs. A missing term is refused with `required_term`, naming the term, so it can be created there first.
- A target outside the project, or one the caller cannot write to, is refused.
- `provenance.glossaryRev` is now recorded.

**core-ts**
- New helpers: `copyAssetsToSite`, `withAssets`, `termsOnSite`, `forEdition` and `assetIdsOf`.
