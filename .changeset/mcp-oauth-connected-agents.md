---
"@cloudhal/api": patch
"@cloudhal/cli": patch
"@cloudhal/mcp-server": patch
---

Studio shows "Connected agents" and how to connect an MCP client by URL (RFC-0044 Phase 3b). On `/agents`, each member sees the apps they connected through OAuth. A client is named as the consent screen named it: a metadata document's host first, a self-registered client as not verified, a name that looks like a well-known client with a warning. Each row shows what the connection can do in words, its mode and when it was last used, and has Disconnect, which uses the existing revoke. Administrators see every member's connections under **All keys**. "Connect an MCP client" gains a **Connect by URL** tab: the deployment's `/mcp` URL, steps for Claude, Claude Code, ChatGPT and Codex, Cursor, VS Code and the MCP Inspector, and a note where a client needs dynamic client registration that is off.

`GET /api/agent-grants` now returns `client` (`kind`, a document client's `host`, `lookalike`) with the name sanitized, and with `?all=1` each owner's `role`. `/api/instance` reports `features.mcpOauthClients`: the `/mcp` resource, and whether metadata documents and dynamic registration are on. The new guide is `docs/guides/mcp-oauth.md`, and the MCP server README has an Authentication section.
