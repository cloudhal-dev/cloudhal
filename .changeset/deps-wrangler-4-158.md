---
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
"@cloudhal/cloudflare": patch
---

`@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.158.0, and `@cloudhal/astro-renderer` uses `@astrojs/cloudflare` 14.4.4, which brings `@cloudflare/vite-plugin` 1.67 (its peer range is wrangler ^4.156.1, so the two move together). The blog starter asks for wrangler ^4.158.0.
