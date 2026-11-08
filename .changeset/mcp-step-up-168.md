---
"@cloudhal/agent-runtime": patch
"@cloudhal/api": patch
---

MCP OAuth step-up follow-ups (RFC-0044 phase 1, #168). These stay latent until phase 2 gives connections a `grantId`. A policy denial for missing scopes now carries `missing`, the required scopes that neither the caller's scopes nor an own variant satisfy. The new `stepUpScopes(policy, principal, tool, args)` turns that into the scopes a token should ask for, using the same rules as the handler: a propose call's `proposeScopes`, the own variant the member's role holds (`content:write:own` for an Author, `content:draft:own` for a Contributor, `site:publish:own` for an Author's publish) and the member's role on the call's site (RFC-0034 A2), not their installation role. The `/mcp` step-up 403 asks for exactly that set and now leaves an audit row, like other denials. `createApi` throws when `mcp.oauth.resource` is not the public URL of `/mcp`. A playground refuses both OAuth protected-resource documents (`403 {error: "playground", block: "mcp"}`), as its route table already said.
