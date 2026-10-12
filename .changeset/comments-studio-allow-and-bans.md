---
"@cloudhal/api": minor
"@cloudhal/comments": minor
---

RFC-0007 rollout step 8 (the API side of Studio's comment screens). `PATCH /api/agent-keys/:id` also accepts `{ addScopes: ["comments:read"] }`: Studio's one-click "Allow comments" for keys made before reader comments (RFC-0007 §10.1), with the same rules as "Allow analytics" (own keys or `agents:manage`, never above the caller's or the creator's role, audited `agent-key.scopes`). `GET /api/sites/:id/comment-bans?commentId=` lists only the bans on that comment's author, matched by keyed hash (`SqlCommentStore.listBans(siteId, { commentId })`), so the commenter page can show and lift a ban without anyone seeing an address.
