---
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
---

The site Worker's responses carry `Vary: Host`, and redirect-host 301s never enter the edge cache (#62). Workers Cache keys by path, not hostname, so before this every host routed to one site Worker shared a cache entry per path: a `--redirect` host's 301 could be served on the site's own domain (a redirect loop), and the sites of a multi-site Worker could serve each other's cached pages.
