---
"@cloudhal/core-ts": patch
"@cloudhal/cli": patch
---

Collection permalinks, step 2 (RFC-0038 §3–§4): changing a collection's permalink in a site update adds a prefix redirect from the old URL prefix to the new one, in every locale and in the same batch as the site update. A template may not overlap another collection, a taxonomy archive, a page or a reserved path (`path_conflict`/`reserved_path`), and pages and archives may not be created inside a configured prefix. The search index rewrites entry links on the next publish.
