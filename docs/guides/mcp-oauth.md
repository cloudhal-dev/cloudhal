# Remote MCP clients by URL: a guide for members and operators

Claude, ChatGPT, Cursor, VS Code and other MCP clients can connect to a Cloudhal deployment with nothing but its URL, `https://<studio-host>/mcp`. The client asks the deployment to authorize it (OAuth 2.1), Studio asks you, and the client gets access of its own: never more than your role allows, recorded in the activity log like any agent, and ended the moment you disconnect it. Agent keys keep working next to it. The design is [RFC-0044](../rfcs/0044-mcp-oauth-authorization.md) and [ADR-0045](../adr/0045-mcp-authorization-server.md). The setup for each client is in [Connect an agent](../agents/clients.md#connect-by-url-oauth).

## Connecting a client

1. In the client, add a remote MCP server with the URL. Studio shows it under **Agents › Connect an MCP client › Connect by URL**, with the steps for each client.
2. The client opens Studio in your browser. Sign in if you are not.
3. The consent screen shows:
   - **Who is asking.** A client with a metadata document is named by the host that serves it, first in the title ("claude.ai: connect Claude Code"). A client that registered itself is labelled **Self-registered, not verified**. Its name is shown as plain text and at most 100 characters long. A name that looks like a well-known client's (Claude, ChatGPT, Codex, VS Code), when the client is not that client's document on its real host, gets a warning.
   - **Where it sends you back:** a web host, or an app on this computer. When every address is on this computer, a warning says so: approve only if you started the connection here.
   - **What it may do:** the permissions it asks for, each as your role turns it. What your role does not give is shown but left out, and you can untick the rest.
   - **How it works:** the agent mode (Plan, Manual, Edits or Auto, capped by your role). Auto asks for an explicit confirmation.
4. Approve. The browser goes back to the client, which can now call the MCP tools as you.

Asking again later for the same or fewer permissions skips the screen. Asking for more (a tool needs a permission the connection lacks) shows it again, with today's permissions ticked and the new ones marked.

## Connected agents

**Agents › Connected agents** lists your connections: the client as the consent screen named it, what it can do (Read, Write, Publish and roll back; the details are in the tooltip), its mode, when it was last used, and when you connected it. **Disconnect** ends a connection at once: its access tokens stop working on their next call, its refresh tokens and stored consent are deleted, and if it asks again you decide again.

Administrators (and anyone with `agents:manage`) see **Everyone's connected agents** under the **All keys** tab, with each member, and can disconnect any of them. Removing a member from the Studio ends their connections in the same step. Changing a member's role narrows their connections on the next call, as it narrows their keys.

A connection lasts at most 90 days. After that the client asks you to approve it again.

## For operators

- **Where it runs.** On Cloudflare, the admin Worker is the authorization server at its own origin. On your own server, `cloudhal studio` needs `--base-url` (`CLOUDHAL_BASE_URL`) with an `https://` origin, or `http://localhost` for clients on the same machine. Without it, OAuth stays off, Studio logs why, and keys still work. Behind a reverse proxy, also set `CLOUDHAL_BEHIND_PROXY=1` ([self-hosting](self-host.md)).
- **How clients identify themselves.** Most (Claude, Claude Code, Codex, VS Code) name a Client ID Metadata Document, an HTTPS URL the server fetches. Cursor and the MCP Inspector register themselves (dynamic client registration). Both are on by default.
- **Switches:** `CLOUDHAL_MCP_OAUTH`, `CLOUDHAL_MCP_CIMD`, `CLOUDHAL_MCP_DCR`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES`. Their limits, the fetch and registration budgets, and what turning each off does to existing connections are in [hardening](cloudflare-hardening.md#remote-mcp-clients-oauth).
- **Rotating `BETTER_AUTH_SECRET`** also invalidates the key that signs access tokens. Delete the `jwks` rows afterwards, as the [hardening guide](cloudflare-hardening.md#rotating-better_auth_secret) explains.
- **Discovery.** `/mcp` answers an unauthenticated request with `401` and a `WWW-Authenticate` challenge. That points to `/.well-known/oauth-protected-resource/mcp`, which names the authorization server `https://<host>/api/auth`, whose metadata is at `/.well-known/oauth-authorization-server/api/auth`. A proxy must pass `/.well-known/*` and `/api/auth/*` through unchanged.

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| The client says the server does not support OAuth, or fails at "authorization server metadata" | OAuth is off on this deployment (no `--base-url` on `cloudhal studio`, or `CLOUDHAL_MCP_OAUTH=off`). Use an agent key. |
| Cursor or the MCP Inspector cannot register | Dynamic client registration is off (`CLOUDHAL_MCP_DCR=off`). Studio's Connect-by-URL tab says so per client. |
| "invalid redirect uri" | The client's return address is not https, not this computer, not a known app scheme, or not on the operator's host list. |
| "temporarily_unavailable" | The server is rate-limiting metadata fetches or registrations from your address. Wait a minute. |
| A connected client stops working | It was disconnected, its member left, it reached 90 days, or the operator rotated the secret. Connect it again. |
