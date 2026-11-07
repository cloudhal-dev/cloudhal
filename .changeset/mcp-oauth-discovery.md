---
"@cloudhal/api": patch
"@cloudhal/agent-runtime": patch
---

MCP OAuth discovery (RFC-0044 §1, phase 1 of #144): with `mcp.oauth` set, the 401 of `/mcp` carries a `WWW-Authenticate` challenge naming the RFC 9728 protected resource metadata and the scopes to request, the metadata is served at both well-known forms, and a token principal calling a tool without a scope its member's role holds gets a `403 insufficient_scope` step-up challenge. Deployments do not set the option yet: the authorization server is phase 2.
