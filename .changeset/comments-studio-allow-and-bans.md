---
"@cloudhal/api": minor
"@cloudhal/comments": minor
---

RFC-0007 rollout step 8 (the API side of Studio's commenter page): `GET /api/sites/:id/comment-bans?commentId=` lists only the bans on that comment's author, matched by keyed hash (`SqlCommentStore.listBans(siteId, { commentId })`), so Studio can show and lift a commenter's ban without anyone seeing an address.
