# Typed custom fields: a guide for site owners and theme authors

A collection can declare **typed fields**: an event has a venue, a start time and a ticket link; a job has a deadline and a salary range. Agents fill them through a JSON Schema instead of guessing, people get a form in Studio, and themes can rely on every value being there in the right shape.

The design and its reasons are in [RFC-0041](../rfcs/0041-typed-custom-fields.md) and [ADR-0043](../adr/0043-typed-custom-fields.md).

## What a field is

Each field has a **key** (lower camelCase, like `startsAt`), **labels** per language (with optional help text), a **type**, and a choice of whether it is **localized**. Definitions live in the site's collection settings, in form order, at most 30 per collection and 200 per site. Values live in each entry's `fields` object under the key.

| Type | Value | Shown on the site as |
|---|---|---|
| `text` | a string up to `maxLength` (5,000); `multiline` allows line breaks | escaped text |
| `richText` | Cloudhal Markdown, up to 50,000 characters | HTML from the same Markdown pipeline as article bodies |
| `number` | a number; optional `integer`, `minimum`, `maximum` | formatted for the reader's language (`1,234.5`, `1.234,5`) |
| `boolean` | `true` / `false` | the theme's words for yes and no |
| `date` | a calendar day, `YYYY-MM-DD` (never shifts across time zones) | a long date in the reader's language |
| `datetime` | `{ "at": "2026-11-05T16:30:00Z", "timeZone": "Europe/Istanbul" }` | the date and time in the value's own zone ("7:30 PM GMT+3") |
| `url` | `https:`, `http:`, `mailto:`, `tel:`, a site-relative path or a `#fragment` | a link |
| `image` | an image asset of the same site (`asset_…`) | an `<img>` with the asset's alt text in the reader's language |
| `select` | one of the field's options, or a list of them with `multiple` | the options' labels in the reader's language |

A field can be **required to publish** (`requiredToPublish`, every type but `boolean`): drafts save without it, but an entry cannot go to review or be published while the value is missing. Text and rich-text fields marked **searchable** add their words to site search from the next publish on (off by default, so internal notes never reach search snippets; see the [search guide](search.md)).

Collections without definitions keep `fields` as free-form JSON, exactly as before. Once a collection has definitions, new keys without a definition are refused (keys stored earlier are kept).

## Defining fields

- **Studio:** open the collection's settings, then **Fields**. Add fields (the key follows the label until you save), reorder them, and edit labels, help, limits and options. Only people who may change site settings can edit fields. Entries of that collection then get a **Fields** card in the editor, one control per type.
- **Agents (MCP):** `list_collections` returns each collection's `fields` and `fieldsSchema` (the JSON Schema of the values, with labels and help in the caller's language). `update_collection` changes definitions, and `create_entry` / `update_entry` take `fields` (`null` removes a value). Definition changes always wait for a person who may change site settings, in every mode.
- **API:** `PUT /api/sites/:siteId/collections/:key` with `fields` in the settings; entry routes take `fields` like any other property. Invalid values answer `422 invalid_fields` with one issue per problem (`fields/startsAt/at`).
- **Files:** definitions travel in the site node, values in entries, so `cloudhal push`/`pull` and [site archives](site-archives.md) carry them unchanged.

### Changes that touch values: field operations

Adding fields, reordering, editing labels and help, adding options and toggling `multiline`, `searchable` or `requiredToPublish` are plain edits. A plain edit can never lose a value, so these changes are **operations** instead:

| Change | Studio | CLI | MCP |
|---|---|---|---|
| rename a key | the field's menu, **Rename…** | `cloudhal fields rename <collection> <from> <to>` | `rename_field` |
| change the type | **Change type…** | `cloudhal fields retype <collection> <key> <type> [--options a,b] [--multiple] [--clear]` | `change_field_type` |
| localized on/off | **Languages…** | `cloudhal fields localize <collection> <key> on\|off` | `set_field_localized` |
| remove | **Remove…** | `cloudhal fields remove <collection> <key>` | `remove_field` |

Each runs a **dry run** first (`--dry-run`): how many entries change, and which values move, convert or would be cleared. A type change converts values with a fixed table (text to rich text, number, select or link; any of those back to text; date to datetime at midnight in the site's time zone and back); values that do not convert block it unless you opt in to clearing them (`--clear`, `onInvalid: "clear"`). Every operation takes a snapshot first and can be reverted (`cloudhal fields revert <collection> <id>`). A long operation resumes where it stopped (`cloudhal fields continue`). Operations change the draft graph only; publish as usual.

## Languages

Each field decides once whether it is **localized**:

- **Localized** (`localized: true`): every language version of an entry has its own value. When a translation has none, readers see the original's value (Studio shows it as a placeholder; themes get `fromOriginal: true`). Changing a localized value of the original marks its translations as needing an update, like body edits.
- **Not localized** (`localized: false`): only the translation group's original holds the value, and every translation shows it. A translation cannot store its own different copy (`field_not_localized`). Changing it never makes translations stale. Machine translation never sends these values.
- **Language editions** (an original in another site of the project): values are copied when the edition is made, and each site owns its own from then on.

Labels, help and option labels are per language too. A site language without its own label uses the site's default language, then any.

## Showing fields in a theme

New sites created with `cloudhal init` show field values on entry pages automatically: the blog starter's article draws a **Details** list under the cover for collections with fields. Entries of collections without definitions render exactly as before. Themes copied before this release keep working unchanged; they simply do not show the values until you add the lines below.

### `EntryFields`: the generic list

```astro
---
import { EntryFields } from "@cloudhal/astro-renderer/components";
// in your entry route, with `source`, `entry`, the page's `media` context and your theme's words
const fields = await source.entryFields?.(entry, { media, words: { yes: "Yes", no: "No" } });
---
{fields && <EntryFields fields={fields} label="Details" />}
```

It draws a plain definition list of the fields that have a value, in definition order, and nothing at all when none does:

```html
<dl class="ch-fields" aria-label="Details">
  <div class="ch-field" data-field="venue" data-type="text"><dt>Venue</dt><dd>Kadıköy Hall</dd></div>
  <div class="ch-field" data-field="startsAt" data-type="datetime"><dt>Starts</dt><dd><time datetime="2026-11-05T16:30:00Z">November 5, 2026 at 7:30 PM GMT+3</time></dd></div>
</dl>
```

It has no styles of its own. Style `.ch-fields`, `.ch-field[data-type="…"]` or one field with `[data-field="<key>"]`. Multi-line text fields carry `data-multiline` (give them `white-space: pre-line`), and values read from the original carry `data-from-original`.

### Your own markup: `entryFields`

`source.entryFields(entry, options)` (or `entryFields(source, entry, options)` from `@cloudhal/astro-renderer/fields`, for any source) returns every defined field by key, in definition order, ready to draw:

| Property | What |
|---|---|
| `label`, `help` | in the page's language |
| `empty` | nothing to show: no value, an unreadable one, an unsafe link or a missing image |
| `text` | the value as plain text in the page's language; print it escaped |
| `html` | `richText` only: sanitized HTML (render with `set:html`) |
| `href` | `url` only: the checked link target |
| `image` | `image` only: `<img>` attributes (`src`, `srcset`, `sizes`, `width`, `height`, `alt`, …) and `assetId` |
| `datetime` | `date` and `datetime`: the machine-readable value for `<time datetime>` |
| `value`, `def`, `fromOriginal` | the resolved value, its definition, and whether it came from the original |

Options: `locale` (default: the entry's), `media` (the page's media context: assets, image transforms, placeholders), `timeZone` (show every `datetime` in one zone instead of its own), `words` (`{ yes, no }`), `sizes` (for image fields).

```astro
---
const f = (await source.entryFields?.(entry, { media })) ?? {};
---
{f.startsAt && !f.startsAt.empty && <p class="when"><time datetime={f.startsAt.datetime}>{f.startsAt.text}</time></p>}
{f.tickets?.href && <a class="cta" href={f.tickets.href}>{f.tickets.label}</a>}
```

### Lower-level helpers

From `@cloudhal/astro-renderer` (re-exported from `@cloudhal/core-ts/fields`):

- `resolveFields(site, entry, original?)`: the values a reader sees, applying the language rules above (pure; you load the original).
- `formatFieldValue(value, def, { locale, defaultLocale?, timeZone?, words? })`: one value as plain text.
- `fieldLabel(def, locale, defaultLocale)`, `fieldHelp(…)`, `optionLabel(def, value, locale, defaultLocale)`.

`entry.fields` still holds exactly what is stored: no fallback, no formatting. Prefer `entryFields` for anything a reader sees.

## Security notes

- **Values are content, never markup.** Text is escaped. Rich text goes through the article body's Markdown pipeline: raw HTML is shown as text, links keep only safe schemes, and stored HTML is never written to a page.
- **Links are checked twice:** on write (`https:`, `http:`, `mailto:`, `tel:`, relative, fragment) and again on render, so `javascript:` and `data:` links never reach a page; an unsafe stored value is dropped.
- **Images** must be image assets of the same site, so a value can never point at another site's media or an outside URL, and a used asset cannot be deleted.
- **Agents** see field values as data. Definitions cannot carry regular expressions, and every definition change and field operation waits for a person.
- **Limits:** 30 fields per collection, 200 per site, 256 KB of values per entry, 50 options per select.
