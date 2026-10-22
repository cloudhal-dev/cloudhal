---
"@cloudhal/cli": minor
---

Studio: first-class collections (RFC-0040 step 3).
- **Sidebar:** lists every collection of the site, declared ones and those that agents or imports filled. Each shows its name in Studio's language, its icon and its entry count, followed by **Collections**.
- **Collections screen:** shows each collection's address, entry count and whether it is named. It has a **New collection** dialog with plural and singular name, key, icon and address, and the API checks the address for overlaps.
- **Collection list:** each collection gets the Articles list (`/collections/<key>`, where `/articles` now redirects). Category and tag columns and filters appear only where those taxonomies apply.
- **Collection settings:** names in every site language, icon, RSS feed, sitemap, default order, and which categories and tags apply.
- **Editor:** its breadcrumb leads back to the entry's own collection.
- **Elsewhere:** the comments queue, the language review options and the taxonomy dialog cover every collection.
- **Translations:** new strings in all 19 languages; every language except English is an AI draft awaiting review.
