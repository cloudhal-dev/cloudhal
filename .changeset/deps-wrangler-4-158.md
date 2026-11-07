---
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
"@cloudhal/cloudflare": patch
---

`@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.158.0, and `@cloudhal/astro-renderer` uses `@astrojs/cloudflare` 14.4.4, which brings `@cloudflare/vite-plugin` 1.67 (its peer range is wrangler ^4.156.1, so the two move together). `@astrojs/cloudflare` 14.4 needs Astro 7.4, so projects move to Astro 7.4.7: the blog starter asks for it, and the `astro` peer range of `@cloudhal/astro-renderer` and `@cloudhal/cli` is now ^7.4.0 (was ^7.3.0). The blog starter asks for wrangler ^4.158.0.
