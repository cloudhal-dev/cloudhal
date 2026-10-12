---
"@cloudhal/agent-runtime": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/cloudflare": minor
"@cloudhal/comments": minor
"@cloudhal/cli": minor
---

RFC-0007 rollout steps 5–7 — reader comments for people and agents. **Policy:** scopes `comments:read`, `comments:moderate(:own)`, `comments:reply(:own)` (key-grantable) and the person-only `commenters:data`; Authors moderate and reply on their own entries, Editors and above everywhere with commenter emails, Contributors nothing; new agent keys get `comments:read`; abilities `comments.*` and `commenters.data`. `ToolPolicy.classify` decides per call (`read`, `advisory`, `reduce`, `person`): `person` calls wait for a person in every mode, `bypass` included. **MCP:** `list_comments`, `get_comment_thread`, `comments_summary`, `label_comments`, `moderate_comments`, `draft_comment_reply`, `set_comment_thread`, with reader text inside escaped untrusted blocks and capped (20,000 characters per call), approvals bound to the comments' `cm1:` state (`ToolDefinition.bindState`) and carried out when a person approves them in Studio. **REST:** `/api/sites/:id/comments…`, `comment-threads`, `commenters` and `comment-bans`, all in `ROUTE_SCOPES`; comment notifications; `features.comments`. **Admin Worker:** the purge-queue flusher sharing the purge budget with publishes (every purge request is logged), the hourly retention/closing/salt job; comments need `CLOUDHAL_COMMENTS_KEY`. `cloudhal studio` and `cloudhal mcp` serve the project's comments.
