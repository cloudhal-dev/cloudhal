# Hardening a Cloudflare deployment

What `cloudhal deploy` already does for security and operations, and the optional steps to take
on your own account. The sources were checked on 2026-10-13 in `cloudflare/cloudflare-docs` at
`0cd4753`, and against the config schema of wrangler 4.148, the version Cloudhal pins.

## What every deployment gets

- **Studio and API:**
  - `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and HSTS on the shell and static files.
  - A default-deny route table: every API route names the scope it needs.
  - Rate limits on sign-in and on every public token endpoint.
- **Site Worker:** a strict `Content-Security-Policy` on HTML pages (`SITE_CSP`: no inline or third-party scripts, no plugins, no foreign framing), `nosniff` and a referrer policy.
- **Content:** `html` bodies are sanitized when rendered (RFC-0012): parsed like a browser, kept to an allowlist (no scripts, styles, frames, forms, SVG or event handlers), and links and media checked like markdown's. This applies to pages, previews, feeds and static builds, whoever wrote the body. Markdown has always been rendered as data.
- **Static builds** (`cloudhal build`) get the same policy and headers through `dist/_headers`. Hosts that read `_headers` apply it: Cloudflare Workers static assets, Cloudflare Pages and Netlify. On any other host, set these headers in its own configuration. `cloudhal dev` sends no CSP, because Vite's live reload needs inline code.
- **Logs:** both Workers send their logs to [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) with **query strings redacted** (`observability.redact_query_string`). Preview links carry their signed token in the query string, and logs are readable by every account member with Workers access.

## Logs sampling and traces

```jsonc
// cloudhal.json
{
  "observability": {
    "logs": 0.25,  // keep the logs of 25 % of requests (default 1: all of them)
    "traces": 0.05 // trace 5 % of requests; true traces all of them (default: off)
  }
}
```

The next `cloudhal deploy` writes these values into both Workers' `observability` block as `head_sampling_rate` values. Sampling is head-based: a request that is not sampled costs nothing extra.

Costs:
- **Workers Logs:**
  - Workers Free: 200,000 log events a day, kept 3 days.
  - Workers Paid: 20 million a month included, then $0.60 per million, kept 7 days.
  - From 2026-12-01, logs move to [Cloudflare Observability pricing](https://developers.cloudflare.com/observability/pricing/).
- **[Workers Traces](https://developers.cloudflare.com/workers/observability/traces/):** kept 7 days. From 2026-12-01, stored traces count toward the same observability usage, which is why traces are off by default.

Traces are the quickest way to see where an MCP call or a publish spends its time: each D1, R2 and service-binding call appears as a span.

## Smart Placement for the admin Worker (trial)

Every API and MCP request to the admin Worker makes several D1 round trips: the session, the membership, and the request itself. [Smart Placement](https://developers.cloudflare.com/workers/configuration/placement/) can run the Worker next to the database instead of next to the person, when that is faster. It is available on all Workers plans.

```jsonc
// cloudhal.json
{ "placement": "smart" }
```

It applies to the admin Worker only. Studio's static files are still served from the location nearest the visitor, and the cron trigger and the scheduler's alarm are unaffected (Smart Placement only moves `fetch` handlers). The site Worker is left alone: published pages come from the Workers Cache.

Measure before you keep it. In the dashboard, open **Workers & Pages → `<name>-admin` → Metrics** and note the request duration (median and P99) for a few days. Deploy with `"placement": "smart"`, then compare over the same span of normal use. Cloudflare needs some traffic before it moves the Worker, and it only places the Worker in locations where it already runs. If the numbers do not improve, remove the key and deploy again.

## WAF on custom domains

The WAF works only on a zone, so it applies when you serve the site or Studio on your own domain (`cloudhal domain set`). The `workers.dev` addresses are not covered.

1. **[Free Managed Ruleset](https://developers.cloudflare.com/waf/managed-rules/).** Available on every plan, and it protects against widely exploited vulnerabilities. Deploy it on the zone: **Security → WAF → Managed rules**. On Pro and above, the broader Cloudflare Managed Ruleset includes it.
2. **One [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/).** The Free plan allows one rule. It can match the request path only, counts requests per IP, and uses a 10-second period and a 10-second block. Cloudhal already limits these endpoints itself; the WAF rule stops floods before they reach the Worker and its D1 limits. A rule that covers sign-in, the public token endpoints and reader comments:

   ```
   (http.request.uri.path in {"/api/auth/sign-in/email" "/api/password-reset/request" "/api/password-reset/complete" "/api/invites/accept" "/__cloudhal/comments" "/__cloudhal/comments/report"})
   ```

   With **20 requests per 10 seconds** per IP and the action **Block**, people are never affected: a person needs a handful of these requests a minute. Paid plans allow more rules, longer periods and matching on method and host.

## Rate Limiting binding (analytics beacon, comment submissions)

`analytics.rateLimit` and `comments.rateLimit` in `cloudhal.json` add a [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). It is a limit shared across isolates in a Cloudflare location, on top of Cloudhal's own checks: proof of work and per-key limits for comments, the beacon's own checks for analytics.

- The binding has been generally available since 2025-09-19, and its documentation names no plan restriction.
- Whether it deploys on Workers Free has **not been verified** yet, so it stays opt-in.
- To try it, set `"rateLimit": true` under `analytics` or `comments` and deploy. If wrangler refuses the binding, remove the key: the app-level checks keep working without it.
- The binding fails open: when it cannot answer, the request goes through.

## Remote MCP clients (OAuth)

Claude, ChatGPT, Cursor, VS Code and the MCP Inspector connect to `https://<admin host>/mcp` by URL: the admin Worker is their OAuth 2.1 authorization server ([RFC-0044](../rfcs/0044-mcp-oauth-authorization.md), [ADR-0045](../adr/0045-mcp-authorization-server.md)). A member approves each connection on Studio's consent screen, and a connection never holds more than an agent key of that member would. Agent keys keep working next to it.

### The switches

| Variable | Default | What it does |
| --- | --- | --- |
| `CLOUDHAL_MCP_OAUTH` | on | `off` turns the authorization server off: `/mcp` takes agent keys and Studio sessions only. |
| `CLOUDHAL_MCP_CIMD` | on | `off`: clients can no longer identify themselves with a Client ID Metadata Document (an HTTPS URL as their `client_id`, as Claude Code, Codex and VS Code do). |
| `CLOUDHAL_MCP_DCR` | on | `off`: no dynamic client registration (`/api/auth/oauth2/register`), and the metadata stops advertising it. Cursor has no metadata document and needs it. |
| `CLOUDHAL_MCP_CLIENT_HOSTS` | empty | Comma-separated hosts clients may come from and send members back to, for example `claude.ai,chatgpt.com,vscode.dev,cursor.com,www.cursor.com,localhost`. Empty: any host. |
| `CLOUDHAL_MCP_REDIRECT_SCHEMES` | empty | Extra private-use redirect schemes of native apps, comma-separated. `cursor` and `vscode` are known already. |

With CIMD and DCR both off, no client can start a new connection: an unknown `client_id` is refused at `/oauth2/authorize`, and so is every client either path stored earlier.

On the admin Worker, set them as secrets, which `cloudhal deploy` keeps (it rewrites the Worker's plain vars on every deploy):

```bash
npx wrangler secret put CLOUDHAL_MCP_DCR --name <name>-admin
```

On Node (`cloudhal studio`, the Docker image) they are environment variables; `compose.yml` passes all five through from `.env`.

### What a client can and cannot do

- **Metadata documents (CIMD).** The `client_id` must be an HTTPS URL with a path, and the document there must name exactly that URL as its `client_id`. The server fetches it with the same SSRF-safe fetcher media imports use: HTTPS on port 443, DNS names only (no IP addresses), every resolved address public (on Node the connection is pinned to the checked address), no redirects followed, at most 5 KB, 5 seconds. It never fetches from the admin Worker's own host or a site's domain. A stored client is used from its row for an hour after each fetch, on every runtime, so members' sign-ins and token refreshes cost no fetch. Fetches are budgeted across isolates: 20 a minute per caller address, and for documents not stored yet also 30 a minute per client origin and 120 a minute in all. When a budget is spent, a stored client is served from its row and only new documents are refused (`429`), so anonymous calls cannot lock members' clients out. At most 5,000 document clients are stored (`503` beyond); one nobody connected through or fetched for a day is deleted by the hourly job, and its next authorization stores it again.
- **The consent screen.** A metadata-document client is named by its document's host, in the page title and first; its self-chosen name is shown plain (control, bidirectional and zero-width characters removed) and at most 100 characters long. A dynamically registered client is labelled "Self-registered, not verified", with a warning when its name looks like a well-known client's (Claude, Claude Code, ChatGPT, Codex, VS Code, Cursor).
- **Dynamic registration (DCR).** Anonymous, so it is limited: 10 registrations per client address per hour and 300 per installation per day (invalid attempts count too), at most 5,000 registered clients (`503` beyond), a body of at most 5 KB. Only public clients register: no client secret is ever issued. A client's name (1–100 characters), up to 10 redirect URIs, and the grant and response types are kept; logos, URIs, contacts and keys are dropped, never stored or shown. A client nobody connected, used or disconnected in 30 days is deleted by the scheduler's hourly job; a client with a live connection is never pruned.
- **Redirect URIs.** `https://` on a public host; `http://` on exactly `localhost`, `127.0.0.1` or `[::1]`, where the port may change between runs (RFC 8252 §7.3); or a native app's private-use scheme (RFC 8252 §7.1), written `scheme:/…`, when the scheme is reverse-domain (`com.example.app:/callback`) or a known app's (`cursor://anysphere.cursor-mcp/oauth/callback`, `vscode://…`, plus `CLOUDHAL_MCP_REDIRECT_SCHEMES`). Everything but the loopback port must match the registered URI exactly. Schemes a browser or the system acts on (`javascript`, `data`, `file`, `vbscript`, `about`, `blob`, …) and look-alikes of `http` are always refused, and one refused URI refuses the whole registration.
- **The host list.** With `CLOUDHAL_MCP_CLIENT_HOSTS` set, a metadata document must be served from a listed host, and every client, however it registered, may send members back only to listed hosts. Loopback redirects then need `localhost` on the list, and private-use redirects a known app scheme (reverse-domain schemes are refused). The list applies to new registrations and to every authorization, so removing a host cuts off its clients at their next sign-in; their existing connections keep working until revoked. A list that does not parse turns client registration off, and the log says why.
- **Turning DCR off.** When every client your members use has a metadata document (Claude, Claude Code, Codex and VS Code do), `CLOUDHAL_MCP_DCR=off` removes the anonymous registration endpoint. Clients it registered earlier can no longer start an authorization (for any member), but the connections they already have keep working, refreshes included, until a member disconnects them in Studio or they are pruned 30 days after their last use. Revoke them there to end them at once.

### Rotating `BETTER_AUTH_SECRET`

The secret also encrypts the key that signs access tokens. A new secret signs every member out, and the stored signing key can no longer be decrypted, so the server cannot issue tokens until that key is deleted and a new one is created on the next sign-in. After rotating it:

```bash
npx wrangler d1 execute <name>-db --remote --command 'DELETE FROM jwks'
```

On Node, run `DELETE FROM jwks` on the project's `data.db`. Access tokens signed with the old key stop verifying at once, so every connected client is asked to sign in again on its next call (one holding a refresh token may get a new token without the member). Connections stay listed under the members who made them, and revoking one still ends it at once.
