---
"@cloudhal/astro-renderer": patch
---

Language editions show up in the language switcher, and the `hreflang` set has one `x-default` (RFC-0034 §6).

- The blog starter's language switcher now lists the languages that language editions publish, after the site's own. A single-language edition gets a switcher too.
- When the set spans editions, `x-default` points at the group's original, so every site agrees on it.
