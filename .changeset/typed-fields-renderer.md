---
"@cloudhal/astro-renderer": minor
"@cloudhal/core-ts": minor
"@cloudhal/cli": minor
---

Typed custom fields, step 6 (RFC-0041 §9 / ADR-0043): renderer and themes. Additive only: `entry.fields` still means exactly what is stored, and themes copied before this release build and render as before (a frozen 0.4.0 theme joins the compat test).

- **`GraphSource.entryFields(entry, options?)`** on live and snapshot sources (and `entryFields(source, entry, options?)` from `@cloudhal/astro-renderer/fields` for any source): an entry's typed fields as a theme draws them, by key in definition order. Values are resolved by the language rules (a translation's empty localized field reads the original's, `fromOriginal`; non-localized fields come from the translation group's original; language editions own their values), labelled in the page's language and made safe: rich text as HTML from the article body's markdown pipeline (raw HTML escaped, `safeHref` on links), URLs through `safeHref` (dropped when unsafe), images as `<img>` attributes with the asset's alt in the page's language, everything else as formatted text. Also `renderFields`, `hasShownFields`, and `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` re-exported.
- **`formatFieldValue(value, def, { locale, defaultLocale?, timeZone?, words? })`** in `@cloudhal/core-ts/fields`: a value as plain text with `Intl` (numbers, dates that never shift a day, instants in their own zone, option labels as a list, yes/no words).
- **`EntryFields.astro`** in `@cloudhal/astro-renderer/components`: a plain, unstyled `<dl class="ch-fields">` of the fields that have a value, with `data-field` / `data-type` hooks for themes; nothing at all when none has one.
- **Blog starter:** articles of collections with fields show a "Details" list under the cover (English, Turkish and Japanese words). Entries of collections without definitions render byte for byte as before.
- New guide: `docs/guides/fields.md` (defining fields in Studio, MCP, the API and the CLI; operations; languages; theme API; security).
