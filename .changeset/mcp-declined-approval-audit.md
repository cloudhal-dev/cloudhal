---
"@cloudhal/mcp-server": patch
---

When a person declines a gated call in their own MCP client, the audit row now records the tool's audited arguments (`auditArgs`) instead of the raw ones. A declined `draft_comment_reply` no longer keeps the reply text in the audit log, and a declined `moderate_comments` no longer keeps its note (RFC-0007 invariant C8).
