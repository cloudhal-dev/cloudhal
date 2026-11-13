# Typed custom fields: a guide for site owners and theme authors

A collection can declare **typed fields**: an event has a venue, a start time and a ticket link; a job has a deadline and a salary range. Agents fill them through a JSON Schema instead of guessing, people get a form in Studio, and themes can rely on every value being there in the right shape.

The design and its reasons are in [RFC-0041](../rfcs/0041-typed-custom-fields.md) and [ADR-0043](../adr/0043-typed-custom-fields.md); references and repeaters in [RFC-0045](../rfcs/0045-collections-stage-4-references-and-repeaters.md) and [ADR-0046](../adr/0046-references-and-repeaters.md).

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
| `reference` | another entry of the same site, by its translation group id (`entry_…`), or a list of them with `multiple` | a link to the target in the reader's language, or nothing while no published version shows |
| `repeater` | an ordered list of items, each a flat object of sub-fields | a nested list, one item each |

References and repeaters have [their own section](#references-and-repeaters) below.

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

## References and repeaters

### Reference fields

A **reference** points to entries of the same site: an event's venue, a talk's speakers, a product's brand.

- **Targets.** `collections` names one to five collections a target may belong to (declared collections of the site, or ones its entries already use). A target is never the entry itself or another language version of it.
- **One or several.** Without `multiple` the value is one target. With `multiple: true` it is an ordered list without repeats, of at most `maxItems` targets (20 when absent, 50 at most).
- **Conditions.** With exactly one target collection, `where` (up to four conditions on that collection's list fields, [RFC-0042](../rfcs/0042-collections-stage-3.md), no `now`) narrows what may be *newly* chosen, as Studio's picker does: "only places with `capacity` ≥ 500". A target that stops meeting it later stays.
- **What is stored.** The target's **translation group id**: the id of its group's original, the same in every language version and in every language edition of the project. A page in Turkish shows the Turkish version of the venue, else the default language's under `localization.fallback: default-with-notice`, else nothing. When the target has no published version the page can show (a draft, archived, embargoed or hidden entry, or one deleted elsewhere), the field shows nothing: no id, no title, no empty link.
- **Publishing warns, never fails.** Studio's site publish dialog lists published entries whose references will not resolve, and `cloudhal import --dry-run` reports them for an archive.

### Repeater fields

A **repeater** is an ordered list of items with the same sub-fields: an agenda's sessions, a recipe's ingredients, a job's benefits.

- **Sub-fields.** `fields` holds one to ten sub-fields, each with a key, labels and a type: `text`, `richText`, `number`, `boolean`, `date`, `url`, `image`, a single `select` or a single `reference`. No `datetime`, no multiple select or reference, and no repeater inside a repeater, so every schema agents see has a fixed depth.
- **Items.** At most `maxItems` items (20 when absent, 50 at most). An item holds only sub-field keys, and an empty item is refused. `requiredToPublish` on a sub-field means every item of an entry in review or published needs it; on the repeater, at least one item.
- **Item labels.** `itemLabel` names the text, select or reference sub-field that names an item in Studio's legends ("Item 2: Ada Lovelace") and in approval prompts. Absent: the first such sub-field.
- **Languages.** `localized` is the repeater's and applies to the whole list: each language version has its own list, or only the original holds one. Sub-fields have no `localized` of their own.
- **Images and rich text** inside items are checked like top-level ones (an image sub-field takes image assets only) and count as uses of the asset.

### Limits

- **100 leaves per collection:** fields plus repeater sub-fields. Top-level fields stay at 30 per collection.
- **200 per site**, sub-fields included.
- **100 references per entry**, across fields and repeater items (`too_many_references`).

### The delete lock and "Used by"

A reference holds its target in place while a **published** entry shows it, its own value or one a published translation inherits:

- **Deleting** the target's last version in the site, or **relinking** it into another translation group, is refused with `409 entry_referenced`; **moving** it to a collection the field does not allow, with `409 reference_target_moved`. Both name up to 20 published referrers and the total. Studio's delete dialog lists them before you confirm; drafts that would lose the value are listed too, without blocking. Deleting one language version while another remains is allowed: that language's pages then fall back or show nothing, and the dialog says which.
- **Archiving or unpublishing** the target is always allowed. It renders nothing from then on, but it does **not** release the lock: the referrers still hold it, so the delete stays refused until they change or are unpublished. Unpublishing a referrer releases its hold at once.
- Drafts, entries in review and archived entries lock nothing on their own. A contributor, who cannot publish, therefore never pins anyone's entry.
- **"Used by"** on an entry's page in Studio lists the entries that reference it, published or not, with the field. Agents use `list_references` (`direction: "to"` or `"from"`).

### Field operations on references and repeaters

The four operations above work on both types, and take `sub` to work on one sub-field of a repeater (`cloudhal fields rename events speakers who --sub person` renames the sub-field `person` of `speakers` to `who`; in Studio, pick the sub-field in the operation's dialog):

- **Rename and remove** a sub-field. Removing a repeater's only sub-field is refused: remove the repeater instead. `set_field_localized` takes no `sub`, since sub-fields share their repeater's setting.
- **Change type** has these conversions besides RFC-0041's table:
  - text ↔ reference: a text value becomes the target whose title it matches in the field's collections (exactly one, not the entry itself); a reference becomes its target's title;
  - reference single ↔ multiple, and reference (multiple) ↔ repeater with one reference sub-field;
  - a repeater with exactly one text, rich-text or reference sub-field → text (one line per item) or reference (multiple);
  - a sub-field's type (`--sub`), with `--collections` for a new reference sub-field.

  A conversion that carries ids over may only widen the target collections. The CLI takes `--collections a,b`, `--max-items n` and `--sub-fields file.json` (a JSON list of sub-field definitions).
- **While a conversion into references runs**, deletes, moves and relinks of entries in its target collections wait (`409 field_operation_running`), so no value it converts can lose its target.
- **"Clear and finish."** A value can stop converting while an operation runs (its target was archived, or a second entry took the same title). The operation then stops with those entries listed as unconvertible and keeps its marker. Studio's dialog offers **Clear and finish** behind a confirmation; the CLI's `continue` and `revert` take `--clear`, the API and MCP `onInvalid: "clear"`. It drops only what no longer converts.

### Agents (MCP)

- **Schemas.** `list_collections` returns `fieldsSchema` (references as `entry_…` strings, repeaters as arrays of flat objects; no `$ref`, depth at most 4) and `fieldsSchemaStrict` for providers' strict modes, with `strictCost` (`properties`, `depth`, `enumValues`, `unions`) so an agent can tell when to send a subset. Each property of the strict schema stands alone, so splitting it is safe.
- **Writing.** `create_entry` and `update_entry` take `fields` (a merge patch: `null` removes a key) or **`fieldsStrict`** (strict output: `null` means "leave as it is", and inside an item "unset"), with **`clearFields`** for removals. A given reference or repeater value replaces the whole value. Items left empty by `null`s are dropped and reported (`droppedItems`). The prechecks run the store's own checks, and approval prompts name targets readably (`venue → "Main hall" (entry_…, Places)`).
- **Translations.** Item paths are `key/index/sub` (`speakers/0/talk`). `get_translation_source` returns `sourceRev`, which `save_translation` needs with item paths. Once a translation holds its own list for a repeater, item paths into it are refused (`translation_shape_mismatch`): `get_translation_source` then returns the source's whole list under the repeater's key in `fields` and names it in **`wholeLists`**. Translate its text and rich-text sub-values and send the whole list back, in the source's order. A whole list sent alone is the translation's own and is stored as sent. References and other sub-values are not translated.
- **`update_collection`** and **`change_field_type`** list both types where the server can render them; the store still decides per site (below).

### Where they are available

Both types are accepted on every write path (Studio, MCP, the API, `cloudhal fields`, imports, `push`, `pull`, `cloudhal import --replace` and `--revert`) wherever the renderer serving the site reads them:

- **Cloudflare:** once the site Worker serving that site answers `GET /__cloudhal/features` with `fields: 2` (0.9.0 and later). With several site Workers (an attached theme, [multi-site](multi-site.md)), each is asked for the sites it serves, so a site on an older attached Worker keeps refusing while the others accept. Deploy the site Worker first; until it reports it, the admin Worker refuses both types for its sites with `fields_unsupported`, and a push or archive that defines them is refused whole.
- **Node** (`cloudhal dev`, `studio`, self-host, Docker): always, since the renderer runs in the same process.

Upgrading runs a one-time check of every site's reference index (`refs.rebuild`, every five minutes on the admin Worker until each site is done; at start-up on Node). It is a safety net and should find nothing to change. It leaves a site alone while a text ↔ reference type change runs there, and checks it once the change is done.

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

A **reference** is a link to each target the page shows, by its graph path (localized like every entry link, with `lang` on a card from the fallback language), several in a `ul.ch-references`. A **repeater** is an `ol.ch-items` with one nested `dl` per item that has something to show:

```html
<div class="ch-field" data-field="venue" data-type="reference"><dt>Venue</dt><dd><a href="/places/main-hall/">Main Hall</a></dd></div>
<div class="ch-field" data-field="speakers" data-type="repeater"><dt>Speakers</dt><dd><ol class="ch-items">
  <li><dl class="ch-fields"><div class="ch-field" data-field="person" data-type="reference"><dt>Person</dt><dd><a href="/people/ada/">Ada Lovelace</a></dd></div></dl></li>
</ol></dd></div>
```

Themes from v0.5.0 on draw both with no change of their own.

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
| `references` | `reference` only: the targets the page shows, in stored order, as cards (`title`, `path`, `url`, `summary`, `image`, `collection`, `locale`, `fromFallbackLocale`) |
| `items` | `repeater` only: each item's sub-fields, rendered like fields |

Options: `locale` (default: the entry's), `media` (the page's media context: assets, image transforms, placeholders), `timeZone` (show every `datetime` in one zone instead of its own), `words` (`{ yes, no }`), `sizes` (for image fields), `depth` (`1`, the default: reference cards; `2`: each card's own `fields` too, with *their* references as cards without fields).

A page resolves at most 200 targets (`placeholderBudget().references`); pass one `placeholderBudget()` per request in `media.budget`, as the starter does. For "events at this venue", `source.referencedBy?.(groupId, { collection, field, limit })` lists the entries the page's view shows whose values name the group, newest first; its page is purged when such an entry appears, goes or changes. Drawing *those* entries' own fields is outside that guarantee.

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
- **References stay inside the site.** A value names a translation group, and resolves and locks only through members of the same site, so no value can reach or pin another tenant's entry.
- **Limits:** 30 fields per collection (100 with repeater sub-fields), 200 per site, 256 KB of values per entry, 50 options per select, 100 references per entry.
