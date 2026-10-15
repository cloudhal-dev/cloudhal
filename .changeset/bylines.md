---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Bylines (RFC-0019 19a). Terms take an optional `role` per locale and up to ten profile `links`. `createAuthorTaxonomy` adds an `author` taxonomy (archives at `/author/<slug>`, no agent-made terms), and new sites get an empty one. The renderer exposes `authors` on an entry's taxonomy view, credits each author as a JSON-LD `Person` and marks author archives as `ProfilePage`s. The blog starter links bylines and shows author pages with role, bio and profile links.
