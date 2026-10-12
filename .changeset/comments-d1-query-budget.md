---
"@cloudhal/comments": minor
"@cloudhal/api": minor
---

Comment routes stay within D1 Free's 50 queries per Worker request on large sites. `GET /api/sites/:siteId/comments/export` (also with `personal=1`) answers one page (500 comments or 100 commenters) with `cloudhal-next-cursor`, like the deploy-token export. New store methods: `commenters(siteId, ids, keys)` (a page of commenters in three reads), `commenterComments` (a commenter's export in one read) and `hideApprovedOf` ("ban and hide past comments": set-based batches, at most 1,000 a request, `more` when some remain; the ban route answers `more`). `EXPORT_PAGE_COMMENTERS` is now 100.
