# Cloudhal blog starter

Created by `cloudhal init`. Pages, posts, categories, tags and redirects live in `.cloudhal/` (SQLite + blobs); this project only holds the theme: `src/layouts`, `src/components`, `src/styles`, `src/theme.ts` (component overrides and theme settings) and the routes under `src/pages`.

```bash
cloudhal dev      # live preview of the current graph (drafts visible)
cloudhal snapshot # freeze the current state
cloudhal build    # static HTML from the published (or latest) snapshot
```

## Routes
- `[...path].astro` — pages at their path, posts at `/<collection>/<slug>`, category and tag archives at `/category/<slug>` and `/tag/<slug>` (`/page/<n>` for older posts). Anything else follows the site's redirects (301), answers 410 for a retired term, or 404.
- `[...path]/rss.xml.ts` — a feed per category and tag (`/category/<slug>/rss.xml`).
- `rss.xml.ts`, `sitemap.xml.ts`, `robots.txt.ts` — the site feed, the sitemap (pages, posts and indexable archives) and robots rules.

## Theme settings (`src/theme.ts`)
- `ARCHIVE_PAGE_SIZE` — posts per archive page (20).
- `NAV_CATEGORIES` — append top-level categories (by position) to the header after the pages; `false` for a pages-only menu.
- `RELATED_POSTS` — how many related posts to show under an article (0 hides the list).

## Redirects in static builds
A static host cannot be told to answer with a status code by HTML alone. `cloudhal build` therefore writes each redirected path as a small meta-refresh page and also writes `dist/_redirects`, which Cloudflare (Workers/Pages static assets) and Netlify turn into real 301s. Deployed with `cloudhal deploy`, the Site Worker answers redirects itself.
