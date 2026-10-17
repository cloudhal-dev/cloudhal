---
"@cloudhal/mcp-server": patch
---

The HTTP transport no longer rebuilds the tool list and recompiles every tool's JSON Schema on each request: both are built once per process. Each MCP call was spending most of its time in schema compilation (seconds under load), and every request's fresh schema objects stayed in the validator's cache, so a long-running Node server's memory grew with traffic.
