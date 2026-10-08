---
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
---

One vocabulary hygiene report (RFC-0002 §6.2). `taxonomyReport()` now takes `{ taxonomy, terms, usage, entries?, locale? }` and also reports indexed archives without an intro text (`noIntro`), entries without a required primary term (`missingPrimary`) and entries without any term of a non-required hierarchical taxonomy (`unfiled`); empty categories count published entries (their archive answers 404), oversized ones compare with the filed entries and skip categories that have sub-categories, near-duplicates compare names without hyphens and carry the edit `distance`, and `REPORT_THRESHOLDS` is exported. MCP `taxonomy_report` is now a wording of that report (new finding kind `unfiled`; near-duplicate pairs list the term to merge away first), so it reports exactly what Studio's vocabulary health card shows.
