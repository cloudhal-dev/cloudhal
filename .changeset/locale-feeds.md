---
"@cloudhal/astro-renderer": minor
---

Every locale in sitemaps, feeds and llms.txt (RFC-0033 / ADR-0035, phase B2).

- New `@cloudhal/astro-renderer/locale-feeds`:
  - `localizedSitemap`: every locale a host serves, on the locale's own URLs. Each URL lists its language versions as `xhtml:link` alternates, and `sitemapXml` writes them out.
  - `localeFeedXml`: a site feed per locale.
  - `llmsTxt`: one per locale.
- RSS:
  - `rssXml` takes `locale` (written as `<language>`) and `linkOrigin`, which localizes item, channel and self links. Media URLs are not changed.
  - Archive feeds follow the locale.
- Taxonomy:
  - `loadTaxonomyIndex(source, locale)`.
  - `taxonomyIndex` knows the default locale.
  - `archiveSummaries` paths use the locale's term slugs.
  - `staticPaths` writes the archives of every locale.
- `localizeHead`:
  - links versions in JSON-LD: `workTranslation` on the original, `translationOfWork` on a translation;
  - names the `translator`: the reviewer, or the engine for unreviewed machine output.
- `Alternate` marks the group's original.
- Blog starter:
  - `Content-Language` on pages;
  - `/<locale>/rss.xml` and archive feeds per locale;
  - `/llms.txt` and `/<locale>/llms.txt`;
  - the sitemap covers every locale.
