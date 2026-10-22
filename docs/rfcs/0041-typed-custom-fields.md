# RFC-0041: Typed custom fields per collection

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-23
- Related:
  - #71 stage 2; RFC-0040 / ADR-0042 ("Stage 2 (sketch, own RFC)").
  - RFC-0015 / ADR-0030 (the eval-free props subset and its checker, `validateProps`), RFC-0004 / ADR-0020 (assets, `asset_refs`), RFC-0014 / ADR-0028 (Cloudhal Markdown v1), RFC-0033 / ADR-0035 (one node per locale, translation groups), RFC-0008 / ADR-0023 §9.1 (instants and zones), RFC-0002 (`Taxonomy.required`), RFC-0019 / RFC-0029 (search), RFC-0039 / ADR-0041 (archives), RFC-0012 (sanitizer, `safeHref`).
  - Prior art (checked 2026-10-23; "unverified" where a primary page could not be read):
    - [Payload fields](https://payloadcms.com/docs/fields/overview) (18 stored types), [localization](https://payloadcms.com/docs/configuration/localization) (`localized: true` per field; changing it on a field with data loses that data without a migration), [drafts](https://payloadcms.com/docs/versions/drafts) ("required fields are not enforced" on draft saves).
    - [Sanity validation](https://www.sanity.io/docs/studio/validation) (errors block publishing, not saving; rules "only run in Sanity Studio", API mutations are not checked), [Agent Actions](https://www.sanity.io/docs/agent-actions/introduction) (schema-aware generate/transform, writes to drafts only).
    - Contentful: [50 fields per content type](https://contentful.com/developers/docs/platform/technical-limits-2025.md); [required fields block publishing](https://www.contentful.com/help/fields/available-validations/), new validations apply only when an entry is re-published; [`contentful-migration`](https://github.com/contentful/contentful-migration) (`changeFieldId` keeps content, `transformEntries`). Per-field `localized` (unverified: the data-model page returned 429).
    - [Webflow Data API: create field](https://developers.webflow.com/data/reference/cms/collection-fields/create) (15 creatable types, validation "not available through the API"), [60 fields per collection](https://developers.webflow.com/home/changelog/2025/2/5); type changes after creation (unverified).
    - [Framer CMS plugin API](https://www.framer.com/developers/cms) (about 13 field types; formatted text is HTML; enum needs declared cases).
    - [Wix: 512 KB per item](https://support.wix.com/en/article/cms-understanding-collection-storage-limits-and-quotas), media fields excluded.
    - Strapi: [v3 docs](https://docs-v3.strapi.io/user-docs/latest/content-types-builder/managing-content-types.html), a renamed field's data "will not be accessible from the admin panel"; [open request](https://feedback.strapi.io/developer-experience/p/gracefully-handle-renaming-of-content-types-and-fields-in-the-ctb). ACF: renaming a field's name orphans its post meta ([ACF feedback](https://feedback.wpengine.com/acf/p/keep-same-field-nnnnn-even-if-meta-slug-is-changed)). Directus: [validation filter rules](https://docs.directus.io/reference/filter-rules).
    - Structured output: [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) (every property `required`, `additionalProperties: false`, optional as a `null` union; up to 5000 properties, 10 levels); [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) (no `minimum`/`maximum`/`minLength`/`maxLength`; formats `date`, `date-time`, `uri`, …; at most 24 optional parameters across strict schemas in a request).
    - [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/): 2 MB per row, 100 bound parameters, 100 KB per statement.

## Summary

A collection can declare typed fields: an ordered list of definitions on `Site.collections.<key>.fields`, in nine closed types (text, rich text, number, boolean, date, datetime, URL, image, select). Values stay in the existing `ContentEntry.fields` object. One eval-free checker in `@cloudhal/core-ts/fields` validates them for the store, the API and MCP, and also emits the JSON Schema agents receive.

Each field decides up front whether it is localized. `requiredToPublish` is checked at review and publish, like `Taxonomy.required`. Renaming a field, changing its type or localization, and removing it are explicit, snapshotted, approved operations that rewrite entries in guarded batches. A plain edit of the definitions can never lose a value. Studio generates the entry form and gets a fields builder; themes read typed, resolved values through a new additive API.

## Motivation

- **Today** (RFC-0040 shipped):
  - `ContentEntry.fields` is "Collection-specific values; any JSON". Nothing reads it except a Studio duplicate, and nothing validates it.
  - `create_entry` accepts `fields: {type: "object"}`, and `update_entry` cannot change them at all.
  - An agent writing an event puts the date in the body, where no theme, feed, schedule or JSON-LD can find it.
- **Who:** every non-`posts` collection from #71 (events, jobs, team, products, locations), and the agents that fill them.
- **Why typed fields:**
  - Schema-constrained output is more reliable than free text, and the person approving sees structured values (#71, value 2).
  - Typed values are what stage 3 needs: JSON-LD (`Event.startDate`, `JobPosting.validThrough`), expiry automations, filtered listings.
- **Why now:** RFC-0040 made `Site.collections` the registry, and ADR-0042 §7 already fixed the outline: values in `fields`, an eval-free checker, per-field localization, migrations as explicit operations. This RFC settles the details.

## Proposal

### 1. Contract (`site.schema.json`)

`CollectionSettings` gains one optional property. `content-entry.schema.json` changes only its description of `fields`.

```jsonc
// $defs.CollectionSettings.properties (new)
"fields": {
  "type": "array",
  "description": "RFC-0041: the collection's typed custom fields, in form order. Values live in ContentEntry.fields under each key. At most 200 per site and unique keys (checked in code).",
  "minItems": 1,          // absent = no fields; also keeps the Rust round-trip exact (serde skips empty Vecs)
  "maxItems": 30,
  "items": { "$ref": "#/$defs/FieldDefinition" }
}

// $defs (new). Every variant has the same four required properties, then its own.
"FieldDefinition": {
  "description": "RFC-0041: one typed custom field of a collection, discriminated by `type`.",
  "oneOf": [
    { "title": "TextField", "type": "object", "additionalProperties": false,
      "required": ["key", "type", "labels", "localized"],
      "properties": {
        "key": { "$ref": "#/$defs/FieldKey" },
        "type": { "type": "string", "enum": ["text"] },
        "labels": { "$ref": "#/$defs/FieldLabels" },
        "localized": { "type": "boolean", "description": "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it." },
        "requiredToPublish": { "type": "boolean", "description": "An entry in review or published needs a value. Absent: false." },
        "migration": { "$ref": "#/$defs/FieldMigration" },
        "maxLength": { "type": "integer", "minimum": 1, "maximum": 5000 },      // absent: 5000
        "multiline": { "type": "boolean" },
        "searchable": { "type": "boolean", "description": "Its words go into site search. Absent: false." }
      } },
    { "title": "RichTextField",  /* common properties */ "searchable": "…" },
    { "title": "NumberField",    /* common properties */ "integer": { "type": "boolean" }, "minimum": { "type": "number" }, "maximum": { "type": "number" } },
    { "title": "BooleanField",   /* common properties WITHOUT requiredToPublish: absent reads as false */ },
    { "title": "DateField",      /* common properties */ },
    { "title": "DateTimeField",  /* common properties */ },
    { "title": "UrlField",       /* common properties */ },
    { "title": "ImageField",     /* common properties */ },
    { "title": "SelectField",    /* common properties; "options" is required */
      "options": { "type": "array", "minItems": 1, "maxItems": 50, "items": { "$ref": "#/$defs/FieldOption" } },
      "multiple": { "type": "boolean" } }
  ]
},
"FieldKey": {
  "type": "string",
  "description": "The field's key in ContentEntry.fields: lower camelCase, a JavaScript identifier. Unique in its collection; built-in entry property names are reserved (checked in code).",
  "pattern": "^[a-z][A-Za-z0-9]{0,39}$"
},
"FieldLabels": {
  "type": "object",
  "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
  "minProperties": 1,
  "additionalProperties": { "$ref": "#/$defs/FieldLabel" }
},
"FieldLabel": {
  "type": "object", "additionalProperties": false, "required": ["label"],
  "properties": {
    "label": { "type": "string", "minLength": 1, "maxLength": 100 },
    "help": { "type": "string", "maxLength": 300 }
  }
},
"FieldOption": {
  "type": "object", "additionalProperties": false, "required": ["value", "labels"],
  "properties": {
    "value": { "$ref": "common.schema.json#/$defs/Slug" },   // stored in entries, never shown
    "labels": { "type": "object", "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
                "minProperties": 1, "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 100 } }
  }
},
"FieldMigration": {
  "type": "object",
  "description": "RFC-0041 §6: present only while a field operation rewrites entries.",
  "additionalProperties": false, "required": ["id"],
  "properties": {
    "id": { "$ref": "common.schema.json#/$defs/Id" },          // the operation's "before" snapshot
    "fromKey": { "$ref": "#/$defs/FieldKey" },
    "fromType": { "type": "string", "enum": ["text", "richText", "number", "boolean", "date", "datetime", "url", "image", "select"] },
    "fromLocalized": { "type": "boolean" }
  }
}
```

- **Discriminator `type`, not `kind`.** Every CMS in the prior art calls it `type`, and so does the props subset Studio already renders (`StringPropSchema.type`). The shape is exactly rule 2's: `oneOf`, inline variants, a one-value enum, the discriminator required. Generators treat the name as data: cargo-typify emits `#[serde(tag = "type", deny_unknown_fields)] enum FieldDefinition`. ADR wording for rule 2: "a one-value enum discriminator, `kind` unless the domain says otherwise".
- **Array, not map.** Order is the form order, and agents read the list as written. Unique keys and option values are checked in code, because JSON Schema cannot express uniqueness by property.
- **The schema does not hold:** reserved keys, the per-site cap, `minimum ≤ maximum`, and cross-field rules. They live in the definition check (§3), like RFC-0008's `from < until`.
- **Reserved keys** (refused with `field_key_reserved`):
  - every `ContentEntry` property (`id`, `siteId`, `collection`, `slug`, `locale`, `status`, `title`, `summary`, `body`, `fields`, `tags`, `terms`, `author`, `coverImage`, `publishedAt`, `availability`, `rev`, `createdAt`, `updatedAt`, `translation`, `metadata`, `corrections`);
  - `url`, `path`, `href`, `entry`, `site`;
  - `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`.

  Themes and stage 3's JSON-LD presets merge fields into an entry view, so a field called `title` would shadow the real one. `__proto__` cannot match the pattern.
- **Not offered:** a `pattern` on text fields (agent-written regexes are a ReDoS risk, and Anthropic's strict mode rejects many patterns); per-field defaults (rule 2 has no `default`, and Studio pre-fills instead); `required` without publishing (all fields stay optional in the contract, as #71 and rule 3 ask).

### 2. Types, values and checks

Values are plain JSON under `entry.fields[key]`. An absent key means no value. `null` is never stored: API and MCP inputs use `null` to remove a key.

| Type | Value | Checked on write | Studio control |
|---|---|---|---|
| `text` | string ≤ `maxLength` (5000) | length; no C0 controls except `\n` when `multiline` | `Input` / `InputArea` |
| `richText` | Cloudhal Markdown v1 string ≤ 50 000 | length; directives and ```` ```surface ```` fences as in bodies (`checkBodyDirectives`); `asset:` refs tracked | the body editor (lazy `@cloudhal/ui/editor`) |
| `number` | finite JSON number | `integer`, `minimum`, `maximum` | `Input type=number` |
| `boolean` | `true` / `false` | type | `Switch` |
| `date` | `YYYY-MM-DD` | a real calendar day | Kumo `DatePicker` (lazy) |
| `datetime` | `{ "at": Timestamp, "timeZone": TimeZone }` | `at` is RFC 3339 UTC; the zone is in `Intl.supportedValuesOf("timeZone")` | `DateTimeField` (site zone by default) |
| `url` | string ≤ 2048 | `https:`, `http:`, `mailto:`, `tel:`, a site-relative path or a `#fragment` (`isBlockUrl` without `asset:`) | `Input` |
| `image` | an asset id (`asset_…`) | an image Asset of the same site | `MediaPicker` |
| `select` | option `value`, or a list of them when `multiple` | the value is one of `options`, with no repeats | `Select` / `Checkbox` group |

- **Why these nine.** They are the types every platform in the prior art shares (Webflow, Framer, Payload, Contentful). Each maps to a schema.org property that stage 3 needs. References, repeaters, colors, files and geo points wait for stage 3 or later (#71 "type sprawl").
- **`richText` is markdown, not HTML.** That is the entry body's own format (ADR-0028), so it shares the renderer path, the raw-HTML escaping, the directive checks and the asset tracking. Framer stores formatted text as HTML. Here, HTML stays a person-only body format.
- **`datetime` keeps its zone** (RFC-0008 §9.1). An event at 19:30 in Istanbul stays "19:30 Istanbul" in Studio, in themes and in JSON-LD (`2026-11-05T19:30:00+03:00`), and comparisons use `at`. The site Worker formats it with `Intl` and needs no Temporal. `date` is a calendar day with no zone (a deadline, a birthday): a date never shifts by a day across zones.
- **`image` is a bare asset id.** The alt text is the Asset's own per-locale `alt`, so an image field needs no localized copy. The id is recorded in `asset_refs` under `fields.<key>`, so a used asset cannot be deleted, exactly like `coverImage` (RFC-0004).
- **Size cap:** `JSON.stringify(entry.fields)` is at most **256 KB** (UTF-8), checked by the store (`too_large`). The body keeps its own 1 MB, so an entry stays well under D1's 2 MB row. Wix caps a whole item at 512 KB; here the body is counted separately.

### 3. The checker: one module, three callers

`@cloudhal/core-ts/fields` (new subpath, Worker-safe, no Ajv):

```ts
export function checkFieldDefinitions(site: Site, before?: Site): FieldIssue[];           // §1 code rules + §6 guard
export function fieldsPropsSchema(defs: readonly FieldDefinition[]): PropsSchema;         // compiled once per site rev
export function checkFieldValues(defs: readonly FieldDefinition[], input: CheckInput): FieldIssue[];
export function fieldsJsonSchema(defs: readonly FieldDefinition[], locale: string): JsonSchema; // what agents see
export function resolveFields(site: Site, entry: ContentEntry, original?: ContentEntry): ResolvedFields; // §5
export interface FieldIssue { path: string; code: string; message: string }  // path: "fields/startsAt/at"
```

- **One checker, reused.** `fieldsPropsSchema` compiles definitions into ADR-0030's props subset, which already covers every type here:
  - strings with `maxLength`/`enum`/`format: url|markdown`;
  - numbers with bounds;
  - booleans;
  - an array of enum for `multiple`;
  - a flat `{at, timeZone}` object.

  `validateProps`, already eval-free and already used by store, Studio and the theme generator, does the type checks. `checkFieldValues` adds what the subset lacks: calendar days, the zone list, select uniqueness, the C0 rule, the 256 KB cap and markdown directives. Rule 6 holds: nothing compiles a JSON Schema at runtime.
- **Callers:**
  1. The store, in `EntryEngine.write` after `assertValid`. It checks only keys whose value changed against the stored entry. Contentful also validates on re-publish, not retroactively, so an old value that a later, narrower definition rejects does not block unrelated edits. Studio shows it as a warning.
  2. The API's entry routes, through the store (`invalid_fields`, 422, with issues).
  3. MCP `precheck` for `create_entry`/`update_entry`, so an invalid call never reaches a person (§8).
- **Keys without a definition:**
  - in a collection with no `fields`, `fields` stays "any JSON", as today;
  - in a collection with definitions, a new unknown key is refused (`unknown_field`, naming the defined keys);
  - unknown keys already stored are kept unchanged.
- **The JSON Schema for agents** uses only keywords both OpenAI and Anthropic strict modes accept: `type`, `enum`, `pattern` (only the fixed ones above), `format: date|date-time|uri`, `items`, `additionalProperties: false`, and properties that are not required.
  - Numeric and length limits, which Anthropic's strict mode drops, go into each property's `description` ("at most 200 characters"). The checker enforces them anyway.
  - Labels and help (in the caller's locale, then the default) become `title`/`description`.
  - Non-localized fields are marked "set on the original only".
- **`requiredToPublish`:** in `EntryEngine.write`, an entry whose status is `review` or `published` needs a resolved value for every required field (§5: a translation reads non-localized ones from its original). Otherwise the write fails with `required_field`, the same place and shape as `required_term` (`taxonomy.ts` `#checkAssignments`).
  - Drafts save freely, as in Payload drafts, Sanity and Contentful.
  - Adding `requiredToPublish` later does not touch published entries. Studio's collection screen counts the published entries that lack the value.

### 4. Where definitions live: the site node, with caps

Measured as compact JSON:

| | per field | 5 collections × 10 fields | 50 × 30 (RFC-0040's max) |
|---|---|---|---|
| 2 locales, label + help | 275 B (a 20-option select: 1.9 KB) | about 22 KB | 412 KB |
| 10 locales | 1.2 KB (a 50-option select: 14 KB) | about 70 KB | 1.7 MB |

Every render and every site write reads the site node, and D1 allows 2 MB per row. Uncapped, the right column would make the hot node huge.

**Decision: stay on `Site.collections`, with caps:**
- 30 fields per collection;
- 200 per site;
- `Site.collections` at most 256 KB serialized (`too_large`).

A typical site lands at 20–70 KB. The cap bounds the worst case at a few milliseconds of `JSON.parse` per request.

A `Collection` node kind would move definitions off the hot node, but:
- entry pages need the definitions to resolve values anyway (§5);
- it costs a node kind, tables, sync, snapshot, archive, MCP and Rust plumbing;
- field operations would still need one CAS anchor next to the entries.

RFC-0040 kept the key and the settings shape stable so the move stays possible. Revisit it if the 256 KB cap is ever reached in practice.

### 5. Localization

Entries are one node per locale in a translation group (ADR-0035). For each field:

| | stored on | a translation reads |
|---|---|---|
| `localized: true` | every language version | its own value; if absent, the original's (flagged `fromOriginal`, Payload's fallback) |
| `localized: false` | the group's original only | the original's value; its own copy is refused unless equal (`field_not_localized`, "set it on entry_…") |

- **Language editions** (an original in another site of the project, RFC-0034): non-localized values are copied when the translation is made, because the other site's definitions may differ. Each site owns its values.
- **`resolveFields`** is a pure function returning `{ key → { def, value, fromOriginal } }`:
  - the renderer and `requiredToPublish` call it with the original loaded;
  - values that no longer fit the definition resolve to `undefined`, with an issue, never a throw;
  - during an operation it applies `migration` (§6).
- **Staleness:** a change to a localized value of the original makes its translations stale, as body edits already do. A change to a non-localized value does not: translations read it live.
- **Machine translation:** `get_translation_source` returns only the localized `text`/`richText` values for translating, and `save_translation` refuses non-localized ones (`field_not_localized`). Non-localized values are never copied within a site.

### 6. Changing definitions: free edits and explicit operations

**Free, through `update_collection` or Studio:**
- add a field;
- reorder fields;
- edit labels and help;
- add select options or change their labels;
- toggle `multiline`, `searchable` or `requiredToPublish`;
- change `maxLength`/`minimum`/`maximum`. Narrowing them is allowed: existing values are checked on their next write (§3).

**Refused by `updateSite` (`field_change_needs_operation`):** any change that could lose or reinterpret stored values:
- dropping a key that still has values (one `json_type` count query);
- changing `type` or `localized`;
- changing `multiple`;
- removing a select option in use.

The error names the operation to use. A diff of the definitions is never read as a rename. That is how Strapi's builder and ACF lose data.

| Operation | Rewrites | Unconvertible values |
|---|---|---|
| `rename_field {from, to}` | moves `fields[from]` to `fields[to]` | none |
| `change_field_type {key, type, options?, multiple?}` | converts by a closed table: text↔richText (escape / plain text), text→number, number→text, text→select (value or default-locale label), select→text, text↔url, date↔datetime (00:00 in the site zone / the day in its zone), single↔multiple select | refused unless `onInvalid: "clear"` |
| `set_field_localized {key, localized}` | true→false: keeps the original's value, deletes translations' copies; false→true: nothing (translations fall back to the original's) | none |
| `remove_field {key}` | deletes `fields[key]` everywhere, then the definition | not applicable |

Every operation follows the tags migration's pattern (`tags-migration.ts`, RFC-0002): resumable, idempotent, snapshotted, revertible. Each phase is an atomic `batch()` (rule 4).

1. **Dry run** (always first, and what `precheck` runs):
   - entries touched;
   - values converted, unchanged and unconvertible;
   - up to 5 samples before and after;
   - whether a theme file references the key (a grep of `fields.<key>` in the local project's theme, CLI only).

   The approval prompt is built from it.
2. **Snapshot** `before <op> <collection>.<key>`. Its id is the operation id, with `metadata["cloudhal.migration"] = "0041-field"`.
3. **Phase A: one batch.** The site CAS writes the new definition and its `migration: { id, fromKey | fromType | fromLocalized }`. From this point every reader (`resolveFields`, Studio, the renderer, the checker) reads through the marker:
   - falls back to `fromKey`;
   - converts values still in `fromType`;
   - ignores translations' stale copies.

   The site is consistent at every moment, however many entries remain.
4. **Phase B: batches of 200 entries.**
   - Each statement is the existing CAS update guarded on the entry's stored hash, and on the site still carrying `migration.id`.
   - A translation whose `translation.source.hash` equalled its original's old hash gets the new one in the same batch, so an operation never makes translations look stale.
   - An entry changed meanwhile is skipped and retried in the next pass. A person's write during the operation already goes through the marker: the store normalizes the entry on write, so concurrent edits converge.
5. **Phase C: one batch.** The site CAS drops `migration`, guarded by `NOT EXISTS` (one SQL predicate per operation, e.g. `json_type(body,'$.fields.<fromKey>') IS NOT NULL`, or a `json_type` mismatch for a type change).
6. **Snapshot** `<op> <collection>.<key>`.

- **Runs and budgets:**
  - The API runs phases in one request up to a budget (2,000 entries or 20 s), then answers `{ done: false, operationId }`. Studio continues on its own; the CLI loops.
  - An interrupted run resumes from the marker. Only one operation per collection runs at a time (`operation_in_progress`).
  - `revertFieldOperation(operationId)` restores the `before` snapshot's site node and the touched entries, as `revertTagsToTerms` does.
- **Nothing goes live.** Operations change the draft graph only. The published snapshot keeps the old definitions together with the old values until the next publish, so the live site is never half-migrated.
- **Themes:** a rename or type change breaks theme code that reads `entry.fields.<from>` directly. The approval text says so, and themes using `entryFields` (§9) keep working.

### 7. Studio

All new UI follows `kumo-design`, `studio-ui` and a new DESIGN.md section ("Fields"). Words go in a new lazy namespace `fields`.

- **Entry editor** (`EntryEditorPage`): a "Fields" `SectionCard` under the title and summary renders a new block, `EntryFieldsForm` (`packages/ui/src/blocks`, lazy), with one Kumo control per type (§2 table).
  - Issues from `checkFieldValues` show on each control, and required fields are marked "Needed to publish".
  - On a translation:
    - non-localized fields are read-only, with "From the original (English)" and a link;
    - empty localized fields show the original's value as a placeholder.
  - `BlockPropsForm` is not stretched to dates, multi-selects, markdown and translation fallbacks. The new block reuses its scalar controls.
- **Fields builder:** a "Fields" `SectionCard` in `CollectionSettingsPage`:
  - **List:** a row per field with its label, key in mono, a type `Badge`, "Localized" / "Needed to publish" badges, up/down order, and a ⋯ menu (Edit, Rename…, Change type…, Localization…, Remove…).
  - **Add field dialog:**
    - type and label;
    - the key, derived from the label and editable until saved;
    - `localized`, pre-set by type: on for text, rich text and URL; off for the rest;
    - needed to publish, and the options of the type.
  - **Operation dialogs:** they run the dry run and show its counts and samples, the snapshot note, and "Values that cannot be converted will be cleared" with a checkbox when there are any. Progress is shown while `done: false`.
- **Bundle:** the editor and collection settings routes are lazy already. `EntryFieldsForm`, the builder, the date picker and the markdown editor load only when a collection has fields. The target is +0 kB on the initial load (388.3 of 420 kB today), checked by `bundle-budget.ts`.

### 8. API and MCP

- **API:**
  - Entry routes accept and validate `fields` (`invalid_fields`, `required_field`, `unknown_field`, `field_not_localized`).
  - `PUT /sites/:id/collections/:key` accepts `fields` (the §6 guard).
  - `POST /sites/:id/collections/:key/fields/operations` with `{ op, …, dryRun? }` and `?continue=<operationId>`. It needs `site:settings` and `content:write`.
- **`list_collections`** adds `fields` (the definitions) and `fieldsSchema` (§3's JSON Schema in the caller's locale) per collection. Its description and `server-instructions.ts` tell agents to read them before writing entries.
- **`create_entry`** keeps `fields: {type: "object"}`: a static tool schema cannot vary by site. Its description points to `fieldsSchema`, and `precheck` runs `requireRegistered` plus `checkFieldValues`, including the asset check.
- **`update_entry`** gains `fields` as a merge patch: given keys are set, `null` removes. Precheck validates it, and the approval prompt lists typed changes ("startsAt → 5 Nov 2026 19:30 Istanbul", "format → Talk, Workshop") with values quoted and truncated.
- **`update_collection`** gains `fields` (whole list; free edits only, §6), with the same policy as today: `site:write`, `requiresApproval`, `approverScopes: ["site:settings"]`, `classify: dryRun ? "read" : "person"`.
- **New tools:** `rename_field`, `change_field_type`, `set_field_localized` and `remove_field`.
  - Policy: `scopes: ["site:write", "content:write"]`, `requiresApproval`, `approverScopes: ["site:settings"]`, `classify: dryRun ? "read" : "person"`, so even `bypass` mode waits for a person. `destructiveHint: true` for `change_field_type` and `remove_field`.
  - Precheck runs the dry run, so a call that would clear values without `onInvalid: "clear"` never reaches a person.
  - An operation that hits its budget returns `{ done: false, operationId }`. A person continues it in Studio, or the agent calls again, which needs a new approval.
- The MCP tool reference is regenerated (`node scripts/mcp-tools-doc.ts`).

### 9. Renderer and themes

- **Unchanged:** `entry.fields` keeps meaning exactly what is stored. No existing export changes, and `old-theme-compat.test.ts` stays green.
- **New exports:**
  - from `@cloudhal/core-ts/fields`, re-exported by the renderer: `resolveFields`, `fieldLabel(def, locale, defaultLocale)`, `optionLabel(def, value, locale, defaultLocale)` and `formatFieldValue(value, def, { locale, timeZone })`.
  - `GraphSource.entryFields(entry)` loads the original when needed and resolves image ids into `{ assetId, src, width, height, alt }` (alt in the entry's locale). It returns rich text as sanitized HTML from the body's markdown pipeline (`markdown.ts`, raw HTML escaped, `safeHref` on every link) and URLs passed through `safeHref` (dropped if unsafe).
- **`EntryFields.astro`** (new component): a plain `<dl>` of labelled, escaped values. The blog starter's entry layout renders it for collections that have fields.

  This pulls RFC-0040's "generic field renderer" into stage 2. Without it, values would be invisible on new sites until someone writes theme code. Named slots and JSON-LD presets stay in stage 3. Old theme copies are untouched and simply do not show fields.

### 10. Search, archives, push/pull, Rust

- **Search:** `text` and `richText` fields with `searchable: true` add their resolved words to the entry's body text in `search-rows.ts`. That means no new column and no FTS5 schema change, and the index changes at the next publish (RFC-0019's index is written with the publish batch).

  The default is off: a theme may not render a field (internal notes, a price rule), and search snippets would leak it. Filtering and sorting by field stay in stage 3, with indexes only on those fields (#71).
- **Archives, `push`/`pull`:**
  - Definitions travel in the site node and values in entries, so the archive format (RFC-0039) is unchanged.
  - Import and pull validate nodes with the precompiled validators but do not re-check values: values are checked when written, not when read or imported. `cloudhal import --dry-run` reports `fieldIssues` per collection.
  - Pushing definitions to a server older than this RFC fails its site validation (`additionalProperties: false`), so servers upgrade first, as with every contract addition.
- **Rust mirror:** generated. Values stay `serde_json::Value`, and the checker is mirrored when the Rust core takes over writes.

### 11. Rollout (one PR each)

1. **Contract:** fixtures, `pnpm gen`, and `@cloudhal/core-ts/fields` (definition check, compiled props schema, value checker, JSON Schema emitter, `resolveFields`) with unit tests. No behaviour change.
2. **Store:** the definition guard and caps in `updateSite`; value, unknown-key, translation and `requiredToPublish` checks plus the 256 KB cap in `EntryEngine.write`; image `asset_refs`; `searchable` in search rows; API entry and collection routes. Behavioural suite on sqlite and Miniflare D1.
3. **Field operations:** `runFieldOperation` / `revertFieldOperation` (dry run, phases, resume), the API route, and `cloudhal fields rename|retype|localize|remove [--dry-run]`.
4. **MCP:** `list_collections` fields and schema, `create_entry`/`update_entry` fields and precheck, `update_collection` fields, the four operation tools, regenerated docs.
5. **Studio:** `EntryFieldsForm`, the fields builder and operation dialogs, screenshots (`design:shots`), the `fields` namespace and translations.
6. **Renderer:** `entryFields`, `formatFieldValue`, `EntryFields.astro`, the starter layout, a new frozen theme copy for the compat test, and `docs/guides/fields.md`.

Steps 4 and 5 can swap. Step 3 ships before step 4, so agents never meet a definition change they cannot make.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| A `Collection` node kind for definitions | Smaller site node; own rev | New node kind and all its plumbing; entry pages need definitions anyway; operations still need one CAS anchor | §4: the caps keep the site node at 20–70 KB typically and ≤ 256 KB at worst |
| A JSON Schema per collection, checked by Ajv | Any rule people can express | Runtime compile is forbidden in Workers (rule 6); arbitrary schemas defeat Studio forms and strict agent output | A closed type set compiles to ADR-0030's subset |
| Values keyed by a stable field id (`fld_…`), labels and keys only in definitions | A rename touches no entry (Contentful-style) | `entry.fields` becomes unreadable to themes, agents, archives and JSON-LD; every reader needs a lookup | Readable keys; renames are rare and explicit (§6) |
| Infer renames and type changes from a diff of definitions | One "save" button | Ambiguous (rename vs remove + add); how Strapi and ACF lose data | Explicit operations with a dry run and approval |
| Rewrite every entry in one batch | Simple | D1 batches are bounded; a large collection fails; no progress or resume | Guarded batches with a marker that keeps readers consistent (§6) |
| Non-localized values copied onto every translation | Each node self-contained | Every change fans out to N writes and N stale flags; copies drift | Payload's model: stored once on the original |
| Validate only in Studio (Sanity) | Fast to build | API and agent writes go unchecked, exactly the case that matters here | One checker in the store, API and MCP |
| `required` (on every save) as well as `requiredToPublish` | Stricter | Agents and people cannot save partial drafts; Contentful, Payload and Sanity all allow them | Only `requiredToPublish` |
| HTML rich text (Framer) | Matches some importers | A second untrusted HTML path; the sanitizer runs per render | Markdown, like bodies (ADR-0028) |
| `datetime` as a bare UTC instant | Simplest value | Loses the venue's zone; "19:30 Istanbul" becomes the viewer's time | `{at, timeZone}` (RFC-0008 §9.1) |
| Discriminator named `kind` | Matches every other union in the repo | Every CMS and the props subset say `type`; a field type is a JSON Schema type in agents' eyes | `type`, same generator-safe shape (open question 1) |

## Compatibility & migration

- **Contract:**
  - Optional `CollectionSettings.fields` plus new `$defs`, so existing sites, snapshots and bundles stay valid. No `schemaVersion` bump.
  - `ContentEntry.fields` keeps its shape; only its description changes.
- **Generators (checked on this branch, then reverted):**
  - With the §1 diff applied, `pnpm gen` succeeded for TypeScript (a `FieldDefinition` union of nine interfaces, validators regenerated) and Rust (cargo-typify 0.8.0: `#[serde(tag = "type", deny_unknown_fields)] enum FieldDefinition`).
  - The core-contracts fixture tests passed (457) with a valid fixture covering all nine types plus a `migration` marker, and seven invalid ones: unknown type, kebab-case key, missing `localized`, a boolean with `requiredToPublish`, a select without options, options on a text field, and `maxLength` 10000.
  - `cargo test -p cloudhal-schema` round-tripped the valid fixture only once its `minimum`/`maximum` were fractional: a `number` schema property becomes `f64`, so `0` re-serializes as `0.0`. The JSON is equal, but a byte-wise hash is not. The real fixtures use fractional bounds, and the Rust core needs canonical number serialization (RFC 8785) before it writes nodes.
  - `minItems: 1` on `fields` avoids the same kind of drift for an empty list (`skip_serializing_if = "Vec::is_empty"`).
- **Data:** no migration. Existing `fields` values in collections without definitions stay "any JSON". When definitions are added later, old values are checked only on their next change.
- **Behaviour changes:**
  - In collections with definitions, new unknown keys and invalid values are refused, and review/publish needs the required fields.
  - `update_entry` can change `fields`.
- **Themes:** additive. Old copies render as before; new starters show fields through `EntryFields.astro`.
- **Rollback:**
  - A snapshot restores the site node with its definitions.
  - An operation reverts through its `before` snapshot.
  - Going back to a version without this RFC leaves values in `fields`, where the old code ignores them, and the old validator would refuse a site node carrying `fields`, so the downgrade restores a snapshot from before definitions were added.

## Security & policy impact

- **No new scopes.**
  - Definitions are site settings: `site:settings` in Studio and the API; `site:write` plus a person holding `site:settings` for agents.
  - Field operations also need `content:write`, because they rewrite entries.
  - Values are content (`content:write`, with `:own` limits as for every entry field).
  - Every definition change and operation is `person`-classed, so it waits in every mode, `bypass` included.
- **Values are untrusted content:**
  - Text is always escaped.
  - Rich text goes through the body's markdown pipeline (raw HTML escaped, directives checked, `safeHref`), never `set:html` of stored HTML.
  - URLs are allowlisted on write (`https:`, `http:`, `mailto:`, `tel:`, relative, fragment) and re-checked by `safeHref` on render, so `javascript:` and `data:` never reach a page.
  - Image values must be image assets of the same site (store check plus `asset_refs`), so a value cannot point at another tenant's media or an external URL.
  - Select values are closed.
  - Labels, help and option labels are plain text, escaped in Studio, approval prompts and themes.
- **Agents:**
  - Field values are data, never instructions. Approval prompts quote and truncate them (`quote()`, 60 characters by default).
  - Definitions cannot carry regexes, so there is no ReDoS.
  - `fieldsSchema` is generated by Cloudhal, never from text an agent wrote.
- **Limits:** 30 fields per collection, 200 per site, 256 KB of `collections`, 256 KB of values per entry, 50 options per select, 5,000 characters of text, 50,000 of rich text.
- **Tenant isolation:** unchanged; everything is per site, and language editions copy values instead of reading across sites.

## Open questions (recommended defaults)

1. **Discriminator name:** `type`, with rule 2 reworded to "a one-value enum discriminator, `kind` unless the domain says otherwise", recorded in the ADR. *Recommended.* The alternative, `kind`, is consistent with the rest of the repo but reads oddly for field types.
2. **Localized fallback:** an empty localized field on a translation shows the original's value (flagged `fromOriginal`), and Studio shows it as a placeholder. *Recommended.* The alternative is to show nothing.
3. **Field cap vs Anthropic's 24 optional strict parameters:** keep 30 per collection. MCP tool calls are not strict, and a strict caller can split `update_entry` calls. *Recommended.*
4. **`multiple` on select** in stage 2: yes, as an option of `select`, not a tenth type. *Recommended.*
5. **`EntryFields.astro` in stage 2** (pulled from stage 3): yes, so values are visible on new sites. *Recommended.*
6. **`searchable` default:** false. *Recommended.*
7. **Values in Studio's collection list** (columns, filters): stage 3, with listings by field. *Recommended.*
8. **Import and pull with invalid values:** report, do not refuse. *Recommended.*
9. **Continuing an agent's unfinished operation:** a person continues it in Studio, or the agent asks again with a new approval. Approvals stay single use (ADR-0014). *Recommended.*
10. **`datetime` with `localTime`:** not stored. Content dates are facts, not jobs, so a later tzdata change moves the wall-clock reading. Add `localTime` (as releases have) if a real case appears. *Recommended.*
