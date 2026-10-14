---
"@cloudhal/api": minor
---

Draft previews for articles and pages (RFC-0014 phase 1c): `POST /api/sites/:siteId/entries/:entryId/preview` (title, summary, body, cover) and `POST /api/sites/:siteId/pages/:pageId/preview` (title, SEO, sections) render the editor's unsaved fields over the stored node and answer `{ html }` for a sandboxed frame. Scope `content:read`; nothing is written. Mistyped fields and sections that do not validate keep their stored values, so a draft that would not save still previews.
