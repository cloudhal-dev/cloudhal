---
"@cloudhal/api": minor
---

`PATCH /api/agent-keys/:id` accepts `{ addScopes: ["analytics:read"] }`: the one-click "Allow analytics" for keys created before RFC-0006 (open question 4). Only `analytics:read` can be added (read-only, no personal data; 400 `scope_not_addable` otherwise), to the caller's own keys or any key with `agents:manage`, and only when it fits both the caller's and the key creator's role (400 `scope_above_role`: Contributors' keys cannot hold it). Each addition is audited as `agent-key.scopes`; adding a scope the key already holds changes nothing.
