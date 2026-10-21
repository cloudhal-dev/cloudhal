---
"@cloudhal/api": minor
---

Agent keys are also accepted as `Authorization: Bearer <key>` (what most MCP clients and Codex's `bearer_token_env_var` send), on `/mcp` and wherever `x-api-key` was. `/api/admin/*` keeps its deployment-token bearer and never reads it as an agent key.
