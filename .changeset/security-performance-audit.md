---
"@cloudhal/api": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/core-ts": patch
"@cloudhal/storage": patch
"@cloudhal/cloudflare": patch
"@cloudhal/cli": patch
---

Security and performance fixes from a project-wide audit.

- **REST scopes:** the route guard checks the path the router dispatches (percent-decoded). `/comments/%65xport` reached the comment export with only the `comments:read` an Author holds; it is now checked as the export.
- **Markdown links:** `safeHref` reads URLs the way browsers do. `java<TAB>script:` links and `/\host` protocol-relative links are dropped.
- **Studio headers:** Studio's static files and the shell the admin Worker serves now carry `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and HSTS. Hashed `/assets/*` files are cached as immutable.
- **Site scripts:** the hashed `/_cloudhal/*` scripts (analytics, comments) are cached as immutable, like `/_astro/*`.
- **Setup link:** `cloudhal deploy` prints the one-time owner setup link with the token in the fragment (`/login#setup=…`), so it never reaches a server or its logs. `?setup=` still works.
- **Snapshots:** a snapshot checks and writes only the node bodies its parent does not hold, a few at a time, instead of one blob round trip per node of the site on every agent edit.
- **D1 indexes** (migration `0018_query_indexes`): site list, per-site lists by kind, daily upload limits and expired upload tickets no longer scan their tables. The notifications endpoint reads the site list once per request.
