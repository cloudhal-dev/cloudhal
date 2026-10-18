---
"@cloudhal/astro-renderer": minor
"@cloudhal/core-ts": minor
---

Locale routing and the localized head (RFC-0033 / ADR-0035, phase B1).

- **`@cloudhal/astro-renderer/locales`**:
  - `localeRequest` reads the locale from a path prefix or from the host (`localization.domains`). Non-canonical locale URLs get a 301. The locale never comes from `Accept-Language` or a cookie.
  - `localizedPath`, `localeUrl` and `textDirection` build localized URLs and give the text direction.
  - `alternatesFor` returns the `hreflang` set from a translation group, including `x-default`.
  - `localizeHead` sets a self-canonical URL and `og:url` in the locale, `lang`/`dir`, and `og:locale:alternate`.
  - `linkLocalizer` and `localizeLinks` point a localized page's internal links to the same locale, or back to the default locale when no translation exists.
- **`@cloudhal/astro-renderer/locale-middleware`** rewrites the links; starters export it as `src/middleware.ts`.
- **Routing is per locale**: `resolveRoute` takes a `locale` option and resolves pages, entries, archives (with per-locale term slugs), search and redirects in that locale. `routablePaths` and `staticPaths` also take a locale, and `GraphSource.redirectFor` takes one too.
- **Blog starter**: `<html dir>`, `hreflang` links, and locale-prefixed static paths.
- **`@cloudhal/core-ts`** now exports `termSlug`, `redirectKey` and `redirectLocale`.
