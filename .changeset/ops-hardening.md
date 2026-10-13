---
"@cloudhal/cli": minor
"@cloudhal/astro-renderer": patch
---

Operations and security hardening.

- **Logs without tokens:** both Workers now redact query strings from Workers Logs and Traces (`observability.redact_query_string`). Preview links carry their signed token there.
- **`cloudhal.json` `observability`** (RFC-0013): `{ "logs": 0–1, "traces": true | 0–1 }` samples Workers Logs and switches on Workers Traces for both Workers. Traces are off by default, because stored traces are billed from 2026-12-01.
- **`cloudhal.json` `placement: "smart"`** (RFC-0013): Smart Placement for the admin Worker (opt-in trial), so it can run next to D1.
- **Static builds** (`cloudhal build`) write the Site Worker's `Content-Security-Policy`, `nosniff` and referrer policy to `dist/_headers` for every path. An owner's own `/*` rule is kept as it is.
- **New guide** `docs/guides/cloudflare-hardening.md`: logs and traces costs, measuring Smart Placement, a WAF baseline for custom domains (the Free Managed Ruleset and one Free rate limiting rule), and the Rate Limiting binding on Workers Free (still unverified, so it stays opt-in).
