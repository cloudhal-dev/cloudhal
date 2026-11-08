---
"@cloudhal/astro-renderer": patch
---

Status page fixes after RFC-0043 PR 1 (#167). The Site Worker no longer turns a 5xx the renderer or the theme answers on purpose into the `error` page: the starter's own `not-published` 503 for a request that reaches Astro (a `POST`, say) passes unchanged and logs nothing; only Astro's own 500 page and thrown errors become the `error` page. A store that cannot be read before rendering answers 503 `unavailable` with `Retry-After: 300`, as `/__cloudhal/health` reports it, instead of a 500. The `error` page uses the site's language and name when the request has already read the site. An invalid preview token on a feed, sitemap, `llms.txt` or JSON path answers 410 instead of the published content, and no response says why a token failed any more (`x-cloudhal-preview-error` is now always `invalid`).
