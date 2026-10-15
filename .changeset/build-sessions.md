---
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/ui": minor
"@cloudhal/astro-renderer": patch
---

Live build view (RFC-0020 phase 20b, part 1): `BuildObserver` in the MCP tool context (`patch_draft` and `update_page` report changes, refused builds report their issues); the API's in-process `BuildHub` and `GET /api/sites/:siteId/pages/:pageId/build/events` (server-sent events: snapshot, deltas with the rendered preview and changed sections, validation failures); `@cloudhal/ui` `BuildActivity` and `PreviewPanel morph` (merge new versions in place, outline changes; scripts stay off); previews style the surface primitives.
