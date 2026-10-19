---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

Language editions, phase E (RFC-0034 §6). A new site can start from another site's structure. It is created in the same project.

**What is copied**
- The theme, design, header, footer and time zone.
- The source's default-language pages, as drafts in the new language. Each copy is joined to the source page's translation group (`source.siteId`, layout `linked`).
- The menus, with page items re-pointed at the copies.
- The default taxonomies.

**What is not copied**
- Articles, terms, media and members. Pages that refer to the source's media or terms are left out and reported.
- Nothing is published.

**Where to use it**
- **core-ts:** `createEdition(store, {fromSiteId, name, slug, locale})`.
- **api:** `from` on `POST /api/sites` and on `POST /api/admin/sites`. The response includes what was copied and what was left out.
- **cli:** `cloudhal site create --from <siteId>`.
- **Studio:** New site › Start from.
