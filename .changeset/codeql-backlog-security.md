---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/api": patch
"@cloudhal/mcp-server": patch
"@cloudhal/cloudflare": patch
"@cloudhal/cli": patch
---

Security fixes from the CodeQL backlog on `main`.

- **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
- **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
- **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
