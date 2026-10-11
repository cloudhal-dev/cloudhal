---
"@cloudhal/analytics": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": patch
---

Site analytics on the site (RFC-0006 rollout step 5).

- `@cloudhal/analytics/client`: the browser sources of the first-party page-view script (one beacon per page view once visible; prerender, back/forward-cache restores and Astro view transitions; referrer host and UTM values only; no cookies, storage or identifiers) and the sampled vitals module (`web-vitals`).
- `@cloudhal/astro-renderer`: the `cloudhal()` integration builds them into hashed static assets (`/_cloudhal/p.<hash>.js` ≤ 1 KB gzipped, `/_cloudhal/v.<hash>.js`) for the Site Worker. The Site Worker answers `POST /__cloudhal/e` (always `204`, never cached) and writes to Workers Analytics Engine through the `ANALYTICS` binding, injects the script tag into published HTML pages while the site's setting is on, and records `render` events for published renders, redirects, 404, 410, 451 and 5xx. It needs `CLOUDHAL_ANALYTICS=on` and the binding; without them nothing changes. `cloudhal dev` answers the endpoint too and records into the local SQLite store only with `analytics.dev`. New exports: `./analytics` (`SiteAnalytics`, `publishedNode`, `isRenderEvent`, …) and `./analytics-middleware`.
- `@cloudhal/cli`: the blog starter passes `cloudhal.json`'s `analytics` block to the integration (for `cloudhal dev`).
