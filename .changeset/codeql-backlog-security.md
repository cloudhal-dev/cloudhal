---
"@cloudhal/core-ts": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/api": patch
"@cloudhal/mcp-server": patch
"@cloudhal/cloudflare": patch
"@cloudhal/cli": patch
---

Security fixes from the CodeQL backlog on `main`.

- **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only. Surface binding pointers with those keys are a `checkSurface` issue, the Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
- **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) decoded entities after dropping tags, so `&lt;script&gt;` came out as `<script>`. It now never returns markup: a `<` that would open a tag becomes `＜` (U+FF1C), `a < b` stays as it is, and entities are decoded once. Every sink also escapes, as before.
- **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers on ordinary input; two intended differences: an svg comment ends at its first `-->`, and an article's leading `#` needs its space on the same line.
