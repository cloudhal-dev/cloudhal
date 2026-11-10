---
"@cloudhal/storage": minor
"@cloudhal/api": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
---

Remote MCP clients can now authorize with OAuth 2.1 against the deployment itself (RFC-0044 Phase 2, ADR-0045). Better Auth's `mcp()` and `jwt()` plugins run in the Studio's auth instance when the runtime has a stable public origin: the admin Worker uses its origin, `cloudhal studio` needs `--base-url` / `CLOUDHAL_BASE_URL` (it logs why OAuth is off otherwise), and `CLOUDHAL_MCP_OAUTH=off` turns it off. Access tokens are Ed25519 JWTs bound to `/mcp` for one hour, refresh tokens rotate with a 30-second reuse window, and each connection is approved on Studio's new consent screen (`/oauth/consent`), which narrows the requested scopes by the member's role and records an `agent_grants` row (migration `0031_oauth`). A token resolves to the same principal an agent key does; revoking a connection (`DELETE /api/agent-grants/:id`) or removing the member refuses it on its next call. The Better Auth family moves to 1.7.18. Client registration (CIMD, DCR) and the "Connected agents" screen follow in Phase 3.
