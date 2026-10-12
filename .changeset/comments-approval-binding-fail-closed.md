---
"@cloudhal/mcp-server": patch
"@cloudhal/api": patch
---

Approvals of comment tools fail closed when their `cm1:` binding cannot be computed. The MCP server no longer files a request, mints a confirmation or matches an answer against a placeholder (`state_unavailable`), and approving such a request in Studio denies it with 409 `state_changed` instead of comparing two failures as equal. New helper `isBoundState` in `@cloudhal/mcp-server/comments`.
