---
"@cloudhal/core-contracts": minor
---

RFC-0002 contracts (additive, `schemaVersion` stays 1): new roots `Taxonomy`, `Term` and `Redirect` with validators; `ContentEntry.terms` (term ids per taxonomy key with an explicit primary) and `tags` marked deprecated; `ContentListSection.filter`; shared `Path` and `Seo` definitions in `common.schema.json`, with `Seo.ogImage` (Page uses the shared `Seo`). The store, MCP tools, renderer and Studio do not use them until RFC-0002 is accepted and implemented.
