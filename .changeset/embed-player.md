---
"@cloudhal/astro-renderer": minor
---

Click-to-load video player for `embed` blocks (RFC-0015 §4). The link card now carries the player's address and loads the first-party module `/_cloudhal/embed.1.js`, which swaps it for the YouTube (no-cookie) or Vimeo player on click, so nothing loads from the video host before. Pages that may show a player set `x-cloudhal-embeds` (`usesEmbeds` from `@cloudhal/astro-renderer/embeds`), and the Site Worker allows the two player hosts in that page's `frame-src`. Static builds allow them in `_headers` only when a page shows a player. Builds write the module, and `cloudhal dev` serves it.
