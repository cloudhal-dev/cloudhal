---
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": patch
---

Multi-site Site Worker, phase B (RFC-0034 §4 / ADR-0036). With `CLOUDHAL_SITE_IDS`, one Site Worker serves several sites of the same installation, and the request's hostname picks the site through `site_hosts`. Workers with `CLOUDHAL_SITE_ID` behave as before.

**Serving**
- **Unknown hostnames** get a plain 404, cached for 60 s and never another site.
- **The Worker's `*.workers.dev` host** shows the first site, marked `noindex`.
- **Per-request site:** the entry runs each request inside the chosen site's context, so Astro's render, media, search, analytics and comments all see that site. Pointers, settings and same-origin hosts are cached per site.
- **Host map:** loaded once and kept in memory up to 1,000 hosts. Beyond that, each host is looked up on first use. Entries are refreshed after 60 s and on every purge.

**Purge**
- `POST /__cloudhal/purge` accepts `{siteId}`.
- On a multi-site Worker a purge is tag-only and never `purgeEverything`. Without tags it purges the named site's tag, or every served site's tag.

**cli**
- `siteWorkerConfig` takes `siteIds` and writes `CLOUDHAL_SITE_IDS`. Wiring this into `cloudhal.json` and `cloudhal deploy` comes in phase C.
