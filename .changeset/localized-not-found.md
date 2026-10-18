---
"@cloudhal/astro-renderer": minor
"@cloudhal/core-ts": patch
---

RFC-0033 §4: a miss answers 404 in the request's locale. New `@cloudhal/astro-renderer/not-found` (`notFoundPage`, `notFoundPageIds`, `NOT_FOUND_PATH`): a site's page at `/404` and its translations are each locale's not-found page, kept out of the sitemap, `llms.txt` and site search. `searchHead` takes the request's locale; `localizeHead` points feed links at the locale's URLs.
