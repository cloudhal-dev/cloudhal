---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
---

Redirects and term slugs per locale (RFC-0033 / ADR-0035, phase A2).

**Redirects**
- New optional `locale` field. An absent `locale` means the site's default locale. Node keys are now `<locale>:<from>`, so the default locale's keys keep their current shape and no data migration is needed.
- When a published page or entry moves in any locale, a redirect is created in that locale only. Before this change, other locales got no redirect.
- `matchRedirect`, `assertNoLoop`, `collapseTarget` and `RedirectPlan.forLocale` work within one locale.
- `redirectFor(siteId, path, locale?)` looks up a redirect in the given locale.
- Manual redirects keep the default locale untagged. A redirect in a locale the site does not have is refused with `locale_not_enabled`.

**Term slugs**
- Term labels gain an optional `slug`, the archive slug for that locale; `termSlug()` resolves it.
- Slugs are unique per taxonomy and locale (`slug_taken`).
- The default locale always uses the term's own slug.
