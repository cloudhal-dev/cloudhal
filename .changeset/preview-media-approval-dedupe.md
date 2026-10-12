---
"@cloudhal/astro-renderer": patch
"@cloudhal/mcp-server": patch
"@cloudhal/agent-runtime": patch
---

`preview_page` renders media-library images like the site does: the cover falls back to the file's own alt text, `asset:` references in markdown become images, and image/hero sections use the asset (with its caption and credit). `renderEntryPreview`/`renderPagePreview`/`renderSectionHtml` take an optional `MediaContext`. An agent asking again for the same call on the same site state gets the approval request that is already waiting instead of a new copy.
