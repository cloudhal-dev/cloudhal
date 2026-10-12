---
"@cloudhal/api": minor
---

"Allow comments": `PATCH /api/agent-keys/:id` with `{"addScopes": ["comments:read"]}` adds `comments:read` to a key made before reader comments existed, with the rules of "Allow analytics" (own keys or `agents:manage`, never beyond the creator's role, so never to a Contributor's key; audited `agent-key.scopes`). `ADDABLE_KEY_SCOPES` is now `["analytics:read", "comments:read"]`.
