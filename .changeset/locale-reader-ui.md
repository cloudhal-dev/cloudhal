---
"@cloudhal/cli": minor
---

Readers see what language they are reading, and in what form (RFC-0033 / ADR-0035, phase B3). These are changes to the blog starter.

- **Machine-translation notice.** An unreviewed machine translation shows a notice that links to the original. A reviewed one shows a "reviewed by a person" notice only when the site sets `localization.label: "always"`.
- **Fallback.** With `localization.fallback: "default-with-notice"`, a page missing in a locale is shown in its original language with a notice. The page is `noindex` and carries no `hreflang`.
- **Language switcher.** Each language is listed by its own name and links to this page's version, or to that language's home page. It appears in the header when the chrome has a `locale` action, and in the footer otherwise.
