---
"@cloudhal/api": minor
---

Commenter lookup is now `POST /api/sites/:siteId/commenters/lookup` with `{email}` or `{commentId}` in a JSON body (`commenters:data`), so an email address never appears in a URL or a request log. The `GET …/commenters?email=|commentId=` variant is removed.
