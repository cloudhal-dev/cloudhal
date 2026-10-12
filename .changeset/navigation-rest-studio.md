---
"@cloudhal/api": minor
"@cloudhal/core-ts": minor
---

Navigation menus over REST (RFC-0003 §5): `/api/sites/:siteId/menus` lists menus with the well-known keys that have none (and the derived header), reads one with its resolved state per locale, creates, replaces (`PUT` with `rev`), edits by operations (`POST …/ops`, with `dryRun`) and deletes them, creates one from current pages (dry run first), previews unsaved trees with the active item for a path (`POST …/preview`), resolves a stored menu (`GET …/:menuId/resolve`) and lists the menus linking to a page, entry or term (`GET …/references`). Reads need `site:read`, writes `site:write` (Editor and above); each write is one snapshot labelled `<op> by <actor>`, and a stale `rev` is 409 with the current menu. Snapshot diffs report menu deltas with `?menus=1`. `@cloudhal/core-ts/menu` exports `newMenuItemId()` for editors that build items before saving.
