---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/storage": minor
---

Time-boxed elevation (ADR-0016): owners can let an API key work in a more autonomous mode for 5 minutes to 24 hours (`POST /api/agent-keys/:id/elevation`, `DELETE` ends it early). The mode is computed on every call, so it ends by itself; grants and calls under it are audited (migration 0009), and the agent is told when it ends.
