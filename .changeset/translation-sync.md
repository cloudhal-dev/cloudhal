---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/cli": minor
---

Keeping translations in step (RFC-0033 / ADR-0035, phase D2).

- **`linkedLayout`**: rebuilds a linked page translation on its original's current layout. Translated sections are kept; new sections arrive untranslated and are named; removed sections go; the original's order is followed. Nothing is written.
- **`get_translation_source`** returns that rebuilt layout when the source changed its layout.
- **`list_stale_translations`** lists the translations whose source changed or is gone, optionally for one locale.
- **Blog starter**: the theme settings gain `strings`, one item per language with the theme words a site may reword:
  - the translation notices;
  - the language switcher;
  - home, menu, search;
  - related posts;
  - skip to content.

  `strings()` applies them, so the reader's notice can speak every locale.
