# Starter themes: references and gaps

Research for strengthening `starters/blog` (and a possible newsroom starter) before the first public demo. Collected 2026-10-15. Visitor-facing sites use the theme system, not Kumo; DESIGN.md does not apply here.

Constraints every idea below respects: sites ship **no client JavaScript** except Cloudhal's first-party scripts (analytics, comments, the video player), the CSP is `script-src 'self'`, and everything a theme shows comes from the graph through `@cloudhal/astro-renderer`.

## 1. What competing themes ship

| Feature | Ghost Source | Ghost Headline | Ghost Casper | Newspack | AstroPaper | Fuwari | Substack / Beehiiv | **Cloudhal blog today** |
|---|---|---|---|---|---|---|---|---|
| Homepage lead / hero | 4 header styles (Landing, Highlight, Magazine, Search) | "Latest" grid of 7 | publication cover | Homepage Posts blocks | intro + featured + recent | banner | Feature / Magazine / Newspaper | hero text + title list |
| Topic sections on home | – | primary grid + secondary lists by tag | – | blocks filtered by category/tag | – | – | by section | `contentList` with `filter` (titles only) |
| List ↔ grid feed | setting | – | Classic / Grid / List | per block | – | – | list / grid | list only |
| Kicker (primary category) | yes | yes | yes | yes | – | yes | – | breadcrumb only |
| Dek / subtitle | excerpt | excerpt | excerpt | subtitle | description | – | – | `summary` |
| Byline + avatar | yes | yes | yes | + author bios | – | – | co-authors | **no** (JSON-LD only) |
| Reading time | yes | – | yes | – | – | – | – | **no** |
| Cover image caption | yes | – | yes | – | – | – | – | caption from asset |
| Table of contents | – | – | – | – | yes | yes | – | **no** (headings have no ids) |
| Related / more | 4 | yes | 3 | prev/next | prev/next | – | – | yes (`RELATED_POSTS`) |
| Newsletter CTA | yes | yes | yes | plugin | – | – | core | **no** |
| Tag / author archives | yes / yes | yes / yes | yes / yes | yes | tags + years | tags + categories | archive page | categories + tags / **no authors** |
| Search | built in | yes | yes | yes | Pagefind (JS) | Pagefind (JS) | – | **no** |
| Dark mode | – | – | Light / Dark / Auto | – | toggle (JS) | toggle (JS) | – | **no** |
| Generated OG images | – | – | – | – | yes | – | – | **no** |
| Article JSON-LD + `article:*` | ghost_head | ghost_head | ghost_head | Yoast | yes | – | – | **yes** (Article, author, section, keywords, breadcrumbs) |
| Corrections log | – | – | – | yes | – | – | – | **no** (snapshots exist) |
| RSS / sitemap | core | core | core | core | yes | yes | yes | **yes** (+ per term feeds) |

Sources: Ghost [Source](https://github.com/TryGhost/Source), [Headline](https://github.com/TryGhost/Headline), [Casper](https://github.com/TryGhost/Casper) (templates and `package.json` custom settings), [Ghost custom settings](https://docs.ghost.org/themes/custom-settings/), [Newspack posts](https://help.newspack.com/themes/posts), [Newspack corrections](https://help.newspack.com/?p=15444), [AstroPaper](https://github.com/satnaing/astro-paper), [Fuwari](https://github.com/saicaca/fuwari), [Substack homepage layouts](https://pubstacksuccess.substack.com/p/new-layouts-yay-for-homepages-on), [Beehiiv pages](https://www.beehiiv.com/support/article/33699539470615-using-pages-in-the-website-builder).

## 2. Homepage patterns

**Blog**
- Intro hero (with a signup) then the list — Ghost Source "Landing", Casper.
- One featured post, then a list or grid — Substack "Feature", AstroPaper.
- Card grid with images — Casper Grid, Source `post_feed_style`.

**Newsroom**
- **Lead + rails:** one large lead story, 3 secondary stories beside it, then more (Source "Highlight", "Magazine"; Substack "Newspaper").
- **Topic sections:** a grid per primary topic, compact text lists for secondary topics (Headline).
- **Latest river** with read times, paginated rather than "load more" ([Rest of World](https://restofworld.org/)).
- **Section modules:** one featured card plus 2–3 text links per series or region ([ProPublica](https://www.propublica.org/), [The Markup](https://themarkup.org/)).

## 3. Article anatomy (consensus order)

1. Kicker (primary category, linked)
2. Title
3. Dek (summary)
4. Byline: author, published date, "Updated" date when it differs, reading time — dates must match the structured data ([Google: byline dates](https://developers.google.com/search/docs/appearance/publication-dates))
5. Cover image with caption and credit
6. Table of contents for long pieces
7. Body
8. Corrections / updates note
9. Tags, share links
10. Author card
11. Newsletter CTA
12. Comments
13. Related posts

## 4. Settings competitors expose

Ghost allows at most 20 settings (select, boolean, color, image, text) grouped as site-wide, homepage and post, and recommends settings with a visible effect.
- **Source:** navigation layout (logo left/middle/stacked), background, header/footer color, title font, body font, homepage `header_style`, feed list/grid, feed images/author/date toggles, drop caps, related articles.
- **Headline:** header style (light/accent/dark), fonts, signup text, homepage primary/secondary tag slugs.
- **Casper:** navigation layout, fonts, cover, feed layout (Classic/Grid/List), color scheme (Light/Dark/Auto), post image style (Wide/Full/Small/Hidden).

Cloudhal's `src/settings.ts` already holds brand, link, background, text, typeface and corners (RFC-0017 7a), so these map onto the same mechanism.

## 5. Priorities for Cloudhal

Grouped by where the work lands.

**Theme only (`starters/*`, no contract or renderer change)**
1. Wider, responsive layout: reading column for articles, wide grid for home and archives; skip link; real header and footer.
2. Homepage layout setting: `list`, `grid`, `lead` (lead + rails) — a `contentList` override in `theme.ts` with cover images, kicker, date.
3. Article header: kicker, dek, byline (author name, published, updated, reading time).
4. Color scheme setting: Light / Dark / Auto through `prefers-color-scheme` (no toggle, no JS).
5. Title and body typeface settings, header style setting.
6. Archive cards with images and dates; first item larger on newsroom layouts.

**Renderer (`@cloudhal/astro-renderer`, additive)**
7. Heading ids in rendered markdown, so themes can build a table of contents with no JS.
8. A reading-time helper next to `entryArticleParts`.
9. Author archives (`/author/<id>`) and author cards — needs an author profile source first.
10. Server-rendered search (`/search?q=`) on the Site Worker; Pagefind is out (needs JS and `wasm-unsafe-eval`).
11. Generated OG images per entry.

**Contract / RFC**
12. Corrections and updates log per entry — fits snapshots and diffs; needs fields and a rendering rule.
13. Newsletter signup — builds on email delivery (ADR-0025).
14. Live updates entries (`LiveBlogPosting`) — verify Google's current guidance first.

Already ahead of most competitors: Article JSON-LD with section, keywords and breadcrumbs; per-term RSS; redirects and 410s; typed blocks; first-party comments; cache-tag purges.

## 6. Local development note

Tailwind v4 detects sources automatically from the project. For a project inside a git-ignored folder of another repository (`examples/` here), the scanner walked up the file system and the first CSS request never finished. The starter therefore names its sources: `@import "tailwindcss" source("..");` in `src/styles/global.css`.
