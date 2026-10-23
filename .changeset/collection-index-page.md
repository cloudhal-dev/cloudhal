---
"@cloudhal/core-ts": patch
---

A collection's template may now sit on top of a page at its prefix: `set_collection_permalink` with `posts` → `/blog/{slug}` no longer fails with `path_conflict` because a page lives at `/blog`. That page is the collection's index page (RFC-0038), so only pages strictly under the prefix conflict, in the template check, its SQL race guard (`noPageUnder`) and the reverse check on page writes. Studio's "Create listing page" now works for a collection with its own permalink too.
