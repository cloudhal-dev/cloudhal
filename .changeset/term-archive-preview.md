---
"@cloudhal/astro-renderer": minor
"@cloudhal/api": minor
---

Term archive previews (RFC-0002 §7, §8).

- `@cloudhal/astro-renderer`: `renderArchivePreview(site, { taxonomies, terms, termId, entries })` renders a term's archive page as the blog starter does (breadcrumb, name, post count, feed link, image, intro, newest entries, pagination; English and Turkish visitor words) with `archiveHead`'s title and description, whatever the archive's state, and returns that state (`archiveState`) with a `reason` (`indexed`, `thin`, `noindex`, `empty`, `proposed`, `internal`, `retired`, `archiveOff`). Every preview document now repeats the preview CSP in a `<meta http-equiv>`, so it also holds in an iframe `srcdoc`.
- `@cloudhal/api`: `GET /api/sites/:siteId/terms/:termId/preview` serves the saved term's archive preview (sandboxed like page and article previews); `POST` with the editor's unsaved presentation (`labels`, `image`; never slug, status, visibility or parent) answers `{ html, archive: { status, indexable, reason, total, minEntriesToIndex, path } }` without writing anything.
