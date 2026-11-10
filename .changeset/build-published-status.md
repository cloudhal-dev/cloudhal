---
"@cloudhal/cli": patch
---

`cloudhal build --published` (RFC-0043 §1.10) builds the published snapshot only, never the latest snapshot or the drafts. When nothing is published yet, it writes the `not-published` status page as the whole output instead, in the site's default language: `index.html` and `404.html`, a `robots.txt` that disallows everything, a `_headers` file with `no-store` and `noindex`, and a `.cloudhal-status` marker. The Docker image's `site-build` now passes the flag, and the compose file's Caddyfile answers every path except `robots.txt` with that page, status 503 and `Retry-After: 3600` while the marker exists. So a fresh self-hosted site no longer serves drafts before its first publish. `cloudhal build` without the flag is unchanged.
