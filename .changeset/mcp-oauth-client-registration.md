---
"@cloudhal/api": patch
"@cloudhal/cloudflare": patch
"@cloudhal/cli": patch
"@cloudhal/mcp-server": patch
"@cloudhal/core-ts": patch
---

Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Redirect URIs must be https or loopback http (any port on loopback). `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off` and `CLOUDHAL_MCP_CLIENT_HOSTS` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied. `safeFetch` results carry the response headers.
