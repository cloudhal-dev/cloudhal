---
"@cloudhal/api": minor
---

REST API for taxonomy and redirects (RFC-0002 §6.1, people only): `/taxonomies`, `/terms` (usage counts, status and synonym search), the governance operations `/terms/:id/{rename,merge,retire,parent,visibility,review}` with a `dryRun` preview (affected entries, redirects, the 400-entry limit, required categories), `/redirects`, `/migrations/tags-to-terms` (+ `/revert`), `GET /entries?filter=` and term assignment deltas in snapshot diffs (`?assignments=1`). Every mutation answers with the changed nodes and the one snapshot it took (`<op> by <actor>`). `InvariantError` codes map to 400/409/422 with `{error: code, message, details}` and `FilterError` to 400, so a published entry without its required category is a 422 instead of a 500.
