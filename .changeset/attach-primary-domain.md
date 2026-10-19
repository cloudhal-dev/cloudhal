---
"@cloudhal/cli": patch
---

An attached site Worker (`cloudhal.json` `installation`, RFC-0034 §4) now makes its workers.dev address the site's primary domain when the site has no domain yet, as a first deploy does. Previews, hreflang across editions and same-origin checks rely on that domain. This came up in the first live run (the newsroom's Japanese edition).
