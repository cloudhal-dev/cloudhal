---
"@cloudhal/core-contracts": minor
---

RFC-0003 (draft) navigation contract: a new root `Menu` (`menu.schema.json`) — a named, per-site tree of items that link to pages, entries and term archives by id, to collection indexes, or to external https URLs, plus label-only groups — with labels per locale, generated TypeScript and Rust types, a precompiled validator (`isValid("menu", …)`) and golden fixtures. Additive only: no existing contract changes; `NodeRef.kind` gains `menu` later, together with the store code that handles it.
