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
