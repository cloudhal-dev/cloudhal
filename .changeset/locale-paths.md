---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": patch
---

`@cloudhal/core-ts/locale-paths`: the locale URL helpers (`localeRouting`, `localizedPath`, `localeUrl`) move from the renderer into core-ts, browser-safe, with `itemUrl(site, origin, item)` for a page's or entry's public URL. `@cloudhal/astro-renderer/locales` re-exports them unchanged.
