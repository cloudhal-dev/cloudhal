# Cloudhal blog starter

Created by `cloudhal init`. Pages, posts, categories, tags and redirects live in `.cloudhal/` (SQLite + blobs); this project only holds the theme: `src/layouts`, `src/components`, `src/styles`, `src/theme.ts` (component overrides and theme settings), the routes under `src/pages` and static files in `public/` (the favicon: `favicon.svg` plus a 16/32 px `favicon.ico` for older browsers and `/favicon.ico` requests; replace both with your own). Deployed, `public/` files are Workers static assets, answered before the Site Worker runs, so they never count as renders in analytics.

```bash
npm run dev       # live preview of the current graph (drafts visible)
npm run snapshot  # freeze the current state
npm run build     # static HTML from the published (or latest) snapshot
```

The same scripts run with `pnpm`, `yarn` or `bun run`; `npx cloudhal <command>` (or `pnpm cloudhal`, `yarn cloudhal`, `bunx cloudhal`) reaches every other command. Installing with pnpm 12 needs `pnpm-workspace.yaml`'s `allowBuilds` (written by `cloudhal init`) and with bun the `trustedDependencies` in `package.json`: SQLite, esbuild and workerd build or download their binaries when installed.

## What to commit
Everything but `.gitignore`'s list. `cloudhal.json` holds the project's settings (the site id, custom domains, analytics, comments …) and goes with the project; the content itself lives in `.cloudhal/`, which stays on your machine (or in the deployment: `cloudhal push` / `pull`). Secrets never go in `cloudhal.json`: `cloudhal deploy` keeps them in `.cloudhal/deploy/`.

`cloudhal.json` → `domains.site` (set with `cloudhal domain set <hostname>`) is also the address a static build (`cloudhal build`) writes into canonical links, the sitemap, feeds and `robots.txt`.

## Routes
- `[...path].astro` — pages at their path, posts at `/<collection>/<slug>`, category and tag archives at `/category/<slug>` and `/tag/<slug>` (`/page/<n>` for older posts). Anything else follows the site's redirects (301), answers 410 for a retired term, or 404.
- `[...path]/rss.xml.ts` — a feed per category and tag (`/category/<slug>/rss.xml`).
- `rss.xml.ts`, `sitemap.xml.ts`, `robots.txt.ts` — the site feed, the sitemap (pages, posts and indexable archives) and robots rules.
- `search.json.ts` — the search modal's answers (RFC-0029), where the deployment answers searches (`cloudhal dev`, the Cloudflare Site Worker). `components/SearchDialog.astro` is the modal's markup and words; Cloudhal's `/_cloudhal/search.1.js` wires it, and without it the header form opens `/search`.

## Styles (`src/styles`)
`global.css` (imported by `layouts/Base.astro`) loads Tailwind, `fonts.css`, `font-fallbacks.css` and one file per feature from `styles/features/` (`tokens.css` with `@theme`, `prose.css`, `surfaces.css`, `motion.css`, `chrome.css`, `carousel.css` …) in cascade order. The rules are unlayered and later files override earlier ones, so keep the order; add a feature as a new file and import it from `global.css`. `source("..")` on the Tailwind import is relative to `global.css`, so that import stays there.

Fonts are self-hosted under `public/fonts/v1/` and cached for a year (`public/_headers`): files never change under a path, so a new font set goes in `public/fonts/v2/`. Each web font in the pairing stacks (`tokens.css`) is followed by a metric-matched fallback from `font-fallbacks.css` (a system font scaled to the web font's width, ascent and descent), so the swap when the web font arrives does not move the text. That file is generated: after changing a font, run `pnpm fonts:fallbacks` in the monorepo.

## Theme settings (`src/theme.ts`)
- `ARCHIVE_PAGE_SIZE` — posts per archive page (20).
- `NAV_CATEGORIES` — append top-level categories (by position) to the header after the pages; `false` for a pages-only menu.
- `RELATED_POSTS` — how many related posts to show under an article (0 hides the list).

## Blocks (`src/blocks.ts`)
Typed blocks (RFC-0015) go in page sections and inside article and rich-text bodies. Cloudhal ships `callout`, `button`, `embed` and `faq`; this theme adds `testimonial`.
- **Declare** a type in `src/blocks.ts` (`blockTypes`): a plain English name shared by every theme (`pricing-table`, never `mytheme-pricing`), where it may go, its props in the JSON Schema subset, whether it wraps text, and an example. The file is data only, with type imports only (`import type { BlockType }`); the CLI checks every type.
- **Render** it with a component in `theme.ts` → `blocks` (`{ testimonial: Testimonial }`). The component gets `{ props, content, contentHtml, media }`. `contentHtml` is the wrapped text, already rendered safely; props are checked against the type first. A built-in may be listed there too, to restyle it.
- `embed` shows a link card; Cloudhal's small player module turns it into the YouTube (no-cookie) or Vimeo player on click, and the page's CSP allows those two frames only where a video is shown. The page route sets `x-cloudhal-embeds` for that (`usesEmbeds`); keep it if you rewrite the route.
- `cloudhal studio` and `cloudhal mcp` read the file, so Studio's forms and `/` menu and agents (`list_block_types`) offer the type. `cloudhal deploy` checks it and bundles it into the admin Worker.

## Design settings (`src/settings.ts`)
What Studio's Settings › Appearance, agents (`set_theme_settings`) and the generator may change about the look (RFC-0017): brand, link, background and text colors, the typeface and the corners. The file is data only, in the same JSON Schema subset as block props, with `x-contrast` rules that hold color pairs to WCAG AA and `x-labels` for the choices' words. `layouts/Base.astro` turns the site's values into `--ch-*` CSS variables and `data-ch-*` attributes (`themeVariables`), and the stylesheets in `styles/features/` use them. Add a setting by declaring it here and using its variable or attribute in your CSS.

## Analytics
Themes need nothing for analytics (RFC-0006). Deployed with `cloudhal deploy`, the Site Worker adds the first-party script tag to published pages while analytics are on (`cloudhal.json` → `analytics`, then per site in Studio). `cloudhal dev` records your own visits only with `"dev": true` in that block, which `astro.config.mjs` passes to the `cloudhal()` integration. Static builds (`cloudhal build`) carry no script. What is collected, and a paragraph for your privacy policy: `docs/guides/analytics-privacy.md` in the Cloudhal repository.

## Redirects in static builds
A static host cannot be told to answer with a status code by HTML alone. `cloudhal build` therefore writes each redirected path as a small meta-refresh page and also writes `dist/_redirects`, which Cloudflare (Workers/Pages static assets) and Netlify turn into real 301s. Deployed with `cloudhal deploy`, the Site Worker answers redirects itself.
