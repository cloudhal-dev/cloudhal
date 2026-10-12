---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

Publishing basics. Entries get `publishedAt` the first time they are published, whichever path publishes them (Studio's publish never set it). The renderer adds `seo` (canonical, robots, Open Graph/Twitter, JSON-LD `WebSite`/`WebPage`/`BlogPosting`/`BreadcrumbList`, `<SeoHead>`), `feeds` (RSS 2.0 with full content, `sitemap.xml`, `robots.txt`) and `routing` (one resolver for pages and `/<collection>/<slug>` entries, navigation from top-level pages); `GraphSource.allEntries()`. The blog starter uses them: every collection is routable, the cover image is shown, and the header navigation follows the site's pages.
