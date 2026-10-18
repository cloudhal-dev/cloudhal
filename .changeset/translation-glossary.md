---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/schedules": patch
---

Translation glossary (RFC-0033 / ADR-0035, phase A3).

- New root contract `glossary`: one per site, holding entries. Each entry has a `term`, an optional `note`, `doNotTranslate`, `caseSensitive`, and `translations` per locale.
- New node kind `glossary` with id prefix `gloss_`. Glossaries are snapshotted like any other node, but not as part of a release: like site settings, they publish the ordinary way.
- `SiteGraphStore.glossary` provides `get` and `save`, with CAS on `rev`. Saves are checked:
  - terms must be unique (case-insensitive unless `caseSensitive` is set);
  - a `doNotTranslate` term has no translations;
  - translations only use the site's non-default locales.
