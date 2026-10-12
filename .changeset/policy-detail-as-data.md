---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/storage": minor
---

Policy detail as data (ADR-0015 addendum): approvals record the agent's `mode`, the `cause` a person must decide and the `auto`-mode `autoCheck`; audit rows record `cause` and `autoCheck`; `/api/instance` reports the server's agent-mode rules (`agentModes`). Migration 0008.
