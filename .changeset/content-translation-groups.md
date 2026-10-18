---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/storage": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Translation groups for published content (RFC-0033 / ADR-0035, phase A1).

Contracts:
- Pages and entries gain an optional `translation`: the group (the original's id), the method (`original`, `human`, `machine`, `machine-reviewed`), the layout (`linked`, `independent`), the source id, locale, rev and hash, the provenance, and the review.
- Sites gain an optional `localization` with these fields: `routing`, a domain per locale, `fallback`, the collections that require review, and the reader `label`.

Store:
- A page's or entry's locale must be one of the site's locales.
- A group holds at most one version per locale, enforced by the `0025_translation_groups` unique index.
- A source must exist, belong to the group, and stay inside the project.
- Machine translations keep their provenance; only a person can review a translation.
- A collection can require review: an unreviewed machine translation in it cannot be published.

`SiteGraphStore.translationGroup(site, group)` lists every language version with its hash, and marks one stale when its source has changed.

New invariant codes: `locale_not_enabled`, `invalid_translation`, `translation_exists`, `review_required`.
