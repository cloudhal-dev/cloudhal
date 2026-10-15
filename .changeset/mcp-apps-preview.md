---
"@cloudhal/mcp-server": minor
---

MCP Apps preview (RFC-0020 phase 20f): `preview_page` and `patch_draft` carry `_meta.ui.resourceUri: "ui://cloudhal/preview"`, and the server serves that resource (`text/html;profile=mcp-app`) — Cloudhal's own View, which shows the page an agent is building inside Claude, ChatGPT and other MCP Apps hosts, refreshing it after each `patch_draft` through the host's `tools/call`. `ToolDefinition` gains `ui`.
