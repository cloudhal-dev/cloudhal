---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/storage": minor
"create-cloudhal": minor
---

Agent layer and Cloudflare deployment.

- MCP server with 18 typed tools, policy engine, skills, audit log and human approval for publish/rollback/delete (ADR-0011).
- Cloudflare: site Worker rendering on demand from D1/R2 with pointer-flip publishing, Workers Cache and signed previews; admin Worker with Studio, API, Better Auth and MCP; `cloudhal deploy`, `push`, `pull` (ADR-0012).
- Studio: Agents (API keys, MCP connection), site Activity, live preview in editors, snapshot diff; UI blocks `PreviewPanel`, audit badges, code entry, snapshot compare.
- Breaking for early adopters: `@cloudhal/core-contracts` no longer re-exports the schema bundler (use `@cloudhal/core-contracts/bundle`); Node-only auth helpers moved to `@cloudhal/api/auth/node`.
