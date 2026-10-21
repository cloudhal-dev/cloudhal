---
"@cloudhal/cli": patch
---

`cloudhal domain set <host>` also makes the host the local site's primary domain, so canonical links, the sitemap and feeds use it before the first deploy (#48).
