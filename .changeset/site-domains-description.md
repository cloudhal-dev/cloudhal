---
"@cloudhal/core-contracts": patch
---

`Site.domains`' description no longer mentions a `*.cloudhal.app` subdomain: sites run on their own domains or their Cloudflare account's workers.dev address, never on a Cloudhal domain (ADR-0037). Description only; the shape is unchanged.
