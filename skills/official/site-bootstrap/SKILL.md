---
name: site-bootstrap
description: Set up a new Cloudhal site's first pages and navigation from a short brief. Use when a site is empty or the user asks to "set up", "scaffold" or "bootstrap" a site.
license: Apache-2.0
compatibility: Requires the Cloudhal MCP server (tools list_sites, get_site, create_page, update_page, create_snapshot, preview_page).
metadata:
  cloudhal.schemaVersion: "1"
  cloudhal.requiresCapabilities: "content"
  cloudhal.scopes: "site:read,content:read,content:write,preview:create"
  cloudhal.approval: ""
---

# Site bootstrap

Turn a one-paragraph brief into a usable first version of the site: a home page with a hero and a content list, an about page, and sensible SEO fields. Do not publish; leave everything as drafts for review.

## Steps
1. `get_site` to learn the default locale, existing pages and the theme. Never create a page whose path already exists.
2. Ask (or infer from the brief) three things: site purpose, audience, tone. Keep headings in sentence case.
3. `create_page` for `/` with sections: `hero` (heading = site name or value proposition, subheading = one sentence) and `contentList` (collection `posts`, limit 10, newest).
4. `create_page` for `/about` with one `richText` markdown section of 120–200 words.
5. Set `seo.title` and `seo.description` on both pages (≤ 60 and ≤ 155 characters).
6. `preview_page` for each page and read the HTML back; fix anything empty or truncated.
7. Finish with `create_snapshot` labelled "Bootstrap: <site name>" and summarise what was created with the preview URLs.

## Rules
- Pages stay `draft`; publishing is a human decision (`publish-article` / Studio).
- Every text must be in the site's default locale.
- See `references/content-guidelines.md` for voice and structure.
