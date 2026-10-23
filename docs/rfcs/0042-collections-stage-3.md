# RFC-0042: Collections stage 3: field presets, structured data, date-driven expiry and field listings

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-23
- Related:
  - #71 stage 3; RFC-0040 / ADR-0042 ("Stage 3 and later (sketch)"), RFC-0041 / ADR-0043 (§7 "Later", §9 renderer, open question 7: Studio list columns and filters).
  - RFC-0008 / ADR-0023 (§7 time gates in the renderer, §7.4 the gate index, §7.6–7.7 how gates go live and the site Worker guard, §9 time model), RFC-0002 §5 (filter expressions, `matches`/`toSql`), RFC-0019 / RFC-0029 (search rows with `gateUntil`), RFC-0038 / ADR-0040 (permalinks; "Later": the collection index page), RFC-0012 (sanitizer, `safeHref`), RFC-0007 §8.1 (`commentsJsonLd`).
  - Prior art (checked 2026-10-23; "unverified" where a primary page could not be read):
    - Google Search Central: [search gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) (supported features, updated 2026-10-16); [FAQ](https://developers.google.com/search/docs/appearance/structured-data/faqpage) (deprecated 2026-05-08, "no longer shown in Google Search results" since the documentation was removed 2026-06-15); [Event](https://developers.google.com/search/docs/appearance/structured-data/event) (required `name`, `startDate`, `location` with a `PostalAddress`; one event per page; UTC offset in dates; `eventStatus` for cancelled/rescheduled; nine countries; physical, publicly bookable events only); [JobPosting](https://developers.google.com/search/docs/appearance/structured-data/job-posting) (required `datePosted`, `description`, `hiringOrganization`, `jobLocation`, `title`; one job per page; an expired posting must have `validThrough` in the past, answer 404/410, or drop the markup); [Product snippet](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) (`name` plus one of `offers`/`review`/`aggregateRating`; `offers.price`); [Recipe](https://developers.google.com/search/docs/appearance/structured-data/recipe) (required `name`, `image`; `recipeIngredient` a string list, `recipeInstructions` `HowToStep`s, ISO 8601 durations).
    - Field-to-JSON-LD mapping: [Rank Math schema templates](https://rankmath.com/kb/schema-templates/) (per-post-type templates with variables; its `%customfield%` variable "will not work on the ACF fields", [ACF note](https://rankmath.com/kb/how-to-use-acf-fields-in-schema-generator/)); [Webflow dynamic embeds](https://help.webflow.com/hc/en-us/articles/33961390851731) (hand-written JSON-LD with field tokens in the collection template; escaping and absolute URLs are the author's problem). Payload, Sanity and Framer have no built-in mapping that we found (unverified: absence of evidence).
    - Expiry: [PublishPress Future](https://wordpress.org/plugins/post-expirator/) (a WP-Cron action moves a post to draft, private or trash on a date); Webflow lists filter upcoming items by a date field relative to today ([date field help](https://help.webflow.com/hc/en-us/articles/33961357365651)); hiding the item page itself needs a scheduled unpublish or an outside automation ([forum](https://discourse.webflow.com/t/unpublish-collection-item-with-expiry-date/67644), unverified).
    - Listings: Webflow collection-list filters (`is after or equal to` today, `is set`) and sort by a field (help page returned 403; from the date-field article and secondary guides, unverified); Framer CMS filters and sort (unverified).
    - Indexes: [SQLite indexes on expressions](https://sqlite.org/expridx.html) (the query must repeat the indexed expression exactly), [generated columns](https://sqlite.org/gencol.html); [D1 generated columns](https://developers.cloudflare.com/d1/reference/generated-columns/) (indexable; `ALTER TABLE ADD COLUMN` only `VIRTUAL`; a definition cannot be edited, only dropped and re-added).

## Summary

A collection can now say what its entries *are*: a JSON-LD preset (`Event`, `JobPosting`, `Product`, `Recipe`) maps its typed fields to schema.org properties, checked against a closed table of paths and field types, and the renderer emits it in place of the generic `BlogPosting`. A collection can derive an expiry from a date field: past `endsAt`, an event leaves listings, feeds, the sitemap and search ("unlist"), or every public route ("hide"), enforced at render time by RFC-0008's gates, so no scheduler, automation or unattended write is involved.

Listings filter and sort by up to four opted-in fields, with one pure evaluator shared by themes (`queryEntries`), `contentList` sections, the API, MCP and Studio's list columns. A collection's index page is an ordinary page with such a section, and per-collection feeds are served by the renderer so that old themes get them without new routes. Reference fields and repeaters stay out (stage 4).

## Motivation

- **Today** (RFC-0041 released in 0.5.0):
  - Every entry page emits a `BlogPosting` (`seo.ts` `entryHead`), whatever its collection. An event, a job or a product is described to search engines as a blog post, and its typed `startsAt`, `validThrough` or price is never used.
  - Nothing reacts to dates in fields. A past event stays on the home page's list and in the feed; an expired job stays live. Google asks for expired postings to be removed and threatens a manual action otherwise.
  - Lists know only `newest`, `oldest` and `title` (`CollectionSettings.sort`, `ContentListSection.sort`) plus term filters. "Upcoming events, soonest first" cannot be expressed by a theme, a section, an agent or Studio.
  - Studio's collection list shows no field values (RFC-0041 open question 7).
- **Who:** every non-`posts` collection from #71, and the agents filling them. An agent that writes a well-typed event today gets nothing for it on the public site.
- **Why now:** RFC-0041 delivered the typed values (`datetime` with its zone, `select` with closed values, `resolveFields`), and RFC-0008 delivered render-time gates with a gate index that caps the edge cache. Stage 3 is mostly wiring those two together.

## Proposal

### 1. Contract

All additions are optional. No `schemaVersion` bump.

```jsonc
// site.schema.json $defs.CollectionSettings.properties (new)
"listFields": {
  "type": "array",
  "description": "RFC-0042: fields that listings, queries, Studio columns and MCP may filter and sort by, in column order. Keys of this collection's fields (checked in code).",
  "minItems": 1, "maxItems": 4, "uniqueItems": true,
  "items": { "$ref": "#/$defs/FieldKey" }
},
"expiry": { "$ref": "#/$defs/CollectionExpiry" },
"structuredData": { "$ref": "#/$defs/StructuredDataPreset" }

// site.schema.json $defs (new)
"CollectionExpiry": {
  "type": "object", "additionalProperties": false, "required": ["field", "action"],
  "description": "RFC-0042: a time gate every entry derives from one of its date or datetime fields, checked at render time like Availability.until. A date ends at the start of the next day in the site's time zone.",
  "properties": {
    "field": { "$ref": "#/$defs/FieldKey" },
    "action": { "type": "string", "enum": ["unlist", "hide"] },
    "afterMinutes": { "type": "integer", "minimum": 0, "maximum": 10080 }   // grace; absent: 0
  }
},
"StructuredDataPreset": {
  "type": "object", "additionalProperties": false, "required": ["type", "properties"],
  "properties": {
    "type": { "type": "string", "enum": ["Event", "JobPosting", "Product", "Recipe"] },
    "properties": {
      "type": "object",
      "description": "Keyed by property path, e.g. startDate or location.address.addressLocality.",
      "propertyNames": { "type": "string", "pattern": "^[a-z][A-Za-z]{0,39}(\\.[a-z][A-Za-z]{0,39}){0,2}$" },
      "minProperties": 1, "maxProperties": 40,
      "additionalProperties": { "$ref": "#/$defs/StructuredDataSource" }
    }
  }
},
"StructuredDataSource": {
  "oneOf": [
    { "title": "FieldValueSource", "type": "object", "additionalProperties": false, "required": ["kind", "field"],
      "properties": { "kind": { "type": "string", "enum": ["field"] }, "field": { "$ref": "#/$defs/FieldKey" } } },
    { "title": "EntryValueSource", "type": "object", "additionalProperties": false, "required": ["kind", "property"],
      "properties": { "kind": { "type": "string", "enum": ["entry"] }, "property": { "$ref": "#/$defs/EntryValueProperty" } } },
    { "title": "SiteValueSource", "type": "object", "additionalProperties": false, "required": ["kind", "property"],
      "properties": { "kind": { "type": "string", "enum": ["site"] }, "property": { "$ref": "#/$defs/SiteValueProperty" } } },
    { "title": "TextValueSource", "type": "object", "additionalProperties": false, "required": ["kind", "value"],
      "properties": { "kind": { "type": "string", "enum": ["text"] },
                      "value": { "type": "string", "minLength": 1, "maxLength": 200, "pattern": "^[^\\x00-\\x1F\\x7F]+$" } } }
  ]
},
"EntryValueProperty": { "type": "string", "enum": ["title", "summary", "body", "coverImage", "url", "publishedAt", "updatedAt"] },
"SiteValueProperty": { "type": "string", "enum": ["name", "url", "logo"] }

// common.schema.json $defs (new): shared by sections and, in code, by the API and MCP
"FieldCondition": {
  "type": "object", "additionalProperties": false, "required": ["field", "op"],
  "description": "RFC-0042: one condition on a typed field of the listed collection. `value` is read by the field's type: a number, YYYY-MM-DD, an RFC 3339 instant, true/false, an option value, or `now`. `values` only with `in`.",
  "properties": {
    "field": { "type": "string", "pattern": "^[a-z][A-Za-z0-9]{0,39}$" },  // FieldKey's pattern, repeated (rule 2: no $ref into site.schema.json's $defs)
    "op": { "type": "string", "enum": ["eq", "ne", "lt", "lte", "gt", "gte", "in", "set", "unset"] },
    "value": { "type": "string", "minLength": 1, "maxLength": 100 },
    "values": { "type": "array", "minItems": 1, "maxItems": 20, "uniqueItems": true,
                "items": { "type": "string", "minLength": 1, "maxLength": 100 } }
  }
},
"FieldOrder": {
  "type": "object", "additionalProperties": false, "required": ["field", "direction"],
  "properties": { "field": { "type": "string", "pattern": "^[a-z][A-Za-z0-9]{0,39}$" },
                  "direction": { "type": "string", "enum": ["asc", "desc"] } }
}

// section.schema.json ContentListSection.properties (new)
"where": { "type": "array", "minItems": 1, "maxItems": 4, "items": { "$ref": "common.schema.json#/$defs/FieldCondition" } },
"orderBy": { "$ref": "common.schema.json#/$defs/FieldOrder" }
```

- **One closed table in code, not a union per type.** Which paths a preset accepts, which are required, which field types fit each, and the vocabulary of enum-valued properties live in `@cloudhal/core-ts/structured-data` (§2). A `oneOf` per type would put about 80 property schemas into the contract and change it whenever Google changes a recommendation. The schema bounds the shape (paths, four source kinds, no HTML); code checks meaning, as RFC-0041 does for reserved keys.
- **Discriminator `kind`** for sources, rule 2's default: these are not field types.
- **Condition values are strings, typed by the field.** A `type: ["string","number","boolean"]` union is outside the generator-safe subset, and a `oneOf` per value type would make sections verbose for agents. RFC-0002's filter is a string read against the site's taxonomy in the same way.
- **The two `property` enums are named `$defs`.** With them inline, cargo-typify 0.8.0 names both `StructuredDataSourceProperty`, keeps only the first, and Rust then refuses `{"kind":"site","property":"name"}`. The mechanical check below caught it.
- **Checked on this branch, then reverted:** with this diff, `pnpm gen` succeeded for TypeScript (`StructuredDataSource = FieldValueSource | EntryValueSource | SiteValueSource | TextValueSource`) and Rust (`#[serde(tag = "kind", deny_unknown_fields)] enum StructuredDataSource`). The core-contracts tests passed (492), and `cargo test -p cloudhal-schema` passed (19) with these fixtures:
  - `valid/site/collection-stage3.json` (an `events` collection with `listFields`, `expiry` and an `Event` preset using all four source kinds) and `valid/section/content-list-where.json` (`startsAt gte now`, `status in [scheduled]`, `orderBy startsAt asc`).
  - `invalid/site/`: preset type `FAQPage`; path `Location`; source kind `html`; a control character in a text constant; a field source with a `value`; expiry action `delete`; a grace of 20,000 minutes; five list fields; a duplicate list field.
  - `invalid/section/`: op `like`; twelve conditions; direction `up`.

### 2. JSON-LD presets

**Initial set: `Event`, `JobPosting`, `Product`, `Recipe`.** All four are in Google's current search gallery, and each has a leaf page per item, which is exactly an entry page.
- **`FAQPage` is out.** Google removed FAQ rich results in June 2026. It was also never an entry-level type (one page, many questions), which would need repeaters or a list-level preset.
- **`Organization`/`LocalBusiness`** describe the site, not an entry, and belong to site settings (later).
- **`Article`** stays the default: an entry without a preset keeps today's `BlogPosting`.

The preset table, abridged (R = Google-required; a value source in parentheses is the default when the property is unmapped):

| Type | Paths (R first) | Accepted sources |
|---|---|---|
| `Event` | R `name` (entry title), R `startDate`, R `location.name`, R `location.address.{streetAddress, addressLocality, postalCode, addressRegion, addressCountry}` (at least one); `endDate`, `description` (entry summary), `image` (cover image), `eventStatus`, `eventAttendanceMode`, `organizer.name`, `organizer.url`, `offers.price`, `offers.priceCurrency`, `offers.url`, `offers.availability`, `offers.validFrom`, `performer.name`, `previousStartDate` | dates: `date`/`datetime` fields; text paths: `text` field, entry or site text, constant; `price`: `number`; enums: `select` or constant |
| `JobPosting` | R `title` (entry title), R `description` (entry body as text), R `datePosted` (entry `publishedAt`), R `hiringOrganization.name` (site name), R `jobLocation.address.*` unless `jobLocationType` is set with `applicantLocationRequirements.name`; `validThrough`, `employmentType`, `hiringOrganization.sameAs`, `hiringOrganization.logo` (site logo), `jobLocationType`, `baseSalary.value`, `baseSalary.currency`, `baseSalary.unitText`, `directApply`, `identifier` | `jobLocationType`: a `boolean` field (true → `TELECOMMUTE`) or constant; `directApply`: `boolean` |
| `Product` | R `name` (entry title), R `offers.price`, `offers.priceCurrency`, `offers.availability`, `offers.priceValidUntil`, `image` (cover image), `description` (summary), `sku`, `brand.name`, `gtin` | `price`: `number` |
| `Recipe` | R `name` (entry title), R `image` (cover image); `description`, `recipeIngredient`, `recipeInstructions`, `prepTime`, `cookTime`, `totalTime`, `recipeYield`, `recipeCategory`, `recipeCuisine`, `keywords`, `nutrition.calories`, `datePublished` | `recipeIngredient`: a multiline `text` field, one item per line; `recipeInstructions`: `richText` or multiline `text`, one `HowToStep` per paragraph; durations: an integer `number` of minutes → `PT{n}M` |

- **Value conversion** is fixed per field type:
  - a `datetime` field gives its instant with its own zone's offset (`2026-11-05T19:30:00+03:00`, RFC-0041 §2), as Google asks;
  - a `date` field gives `YYYY-MM-DD` (Google's form for all-day events);
  - `image` gives an absolute URL of the asset (`imageObject`);
  - `richText` gives plain text (`markdownText`);
  - `url` goes through `absoluteUrl` and is dropped if unsafe;
  - `select` gives its option value, mapped through the property's vocabulary (`eventStatus`: `scheduled`, `cancelled`, `postponed`, `rescheduled`, `moved-online` → `https://schema.org/EventCancelled` …; `employmentType`: `full-time` → `FULL_TIME` …; `availability`: `in-stock` → `InStock` …). An option value outside the vocabulary emits nothing for that property.
- **Not offered:** `aggregateRating` and `review`. Google's policy forbids self-serving review markup, and Cloudhal stores no reviews. A constant could fake a rating, so those paths are not in the table.
- **Checks when the preset is saved** (`checkStructuredData(site)` in `updateSite`, the API and MCP precheck; `structured_data_invalid` with issues):
  - every path is in the type's table;
  - every field source names a field of this collection whose type fits the path;
  - every select used for an enum path has only options in that vocabulary, or the unmatched ones are listed as warnings;
  - text constants on enum paths are in the vocabulary, and `priceCurrency`/`currency` constants match ISO 4217 (`^[A-Z]{3}$`);
  - every required path is mapped or has a default from the table.

  Required *values* are not enforced per entry: fields stay optional (rule 3). Studio suggests `requiredToPublish` for the fields a required path maps to.
- **Per entry** (`structuredDataFor(site, resolved, entry, ctx)`, pure): it reads `resolveFields` (so a translation gets the original's non-localized values) and returns `{ doc?, issues }`. When a required value is missing, the entry emits **no** preset document (Google treats an incomplete item as invalid). `BreadcrumbList` still goes out, and Studio flags the entry "Structured data: start date missing". Each document is capped at 32 KB serialized; over the cap, optional properties are dropped first, `description` last.
- **Renderer:**
  - New export `withStructuredData(head, source, entry, options)` (async: it loads the original and assets). When the entry's collection has a preset and the entry yields a document, it replaces the `BlogPosting` in `head.jsonLd` with the preset document and keeps the `BreadcrumbList`. Otherwise it returns `head` unchanged. The `BlogPosting`'s `commentCount` (RFC-0007) does not move to presets.
  - The blog starter calls it after `entryHead`.
  - `entryHead` itself does not change: an old theme copy keeps emitting exactly today's `BlogPosting` (theme-facing stability; a new frozen copy `theme-v0.5.0` joins `old-theme-compat.test.ts`).
  - Output goes through the existing `jsonLdText` (escapes `<`, `>` and `&`, so no `</script>` breakout) and `SeoHead.astro`.
  - Gated and hidden entries never render, so they never emit JSON-LD (RFC-0008 §7.2).
  - An `unlist`ed expired job keeps its page and its `JobPosting` with `validThrough` in the past, which is one of Google's three accepted ways to retire a posting.
- **Visible content:** Google wants markup to match what readers see. `EntryFields.astro` already renders every field with a value. Studio warns when a mapped field is one the theme does not render (it cannot know, so the warning is a reminder, not a check).

### 3. Date-driven expiry: a derived gate, not an automation

**Decision:** `CollectionSettings.expiry` makes every entry of the collection carry a derived gate instant. The renderer applies it exactly where RFC-0008 applies `availability.until`. No job runs, no entry is rewritten, and nothing needs approval at expiry time.

1. **The instant:**
   - a `datetime` value expires at its `at`;
   - a `date` value expires at the start of the following day in the site's zone (`Site.timeZone`, absent = UTC), so an event "on 5 November" is listed all of 5 November;
   - plus `afterMinutes`;
   - no value means no derived gate.

   One function, `fieldGateInstant(value, def, site, afterMinutes)` in `@cloudhal/core-ts/fields`, used by every caller. A `date` resolves with `Intl` offsets (the site Worker carries no Temporal, RFC-0008 §9.4). Property tests compare it with `temporal-polyfill` across DST zones, and an ambiguous wall-clock midnight takes the later instant, so expiry is never early (§9.1's rule).
2. **The effective gate** is `min(availability.until, derived)`. A person's own `availability` still applies, and `from` (embargo) is unaffected.
3. **What each action does once the gate passes:**

   | | entry URL | listings, `entries()`, `contentList`, archives, related | feeds, sitemap, search, `llms.txt` | JSON-LD |
   |---|---|---|---|---|
   | `unlist` (default) | 200, unchanged | left out unless the query asks `includeExpired` | left out | unchanged (dates in the past) |
   | `hide` | 404 `no-store`, as an expired `availability` | left out | left out | none (not rendered) |

   - `unlist` suits events, whose pages keep links and history, and jobs, where Google accepts a past `validThrough`.
   - `hide` suits offers and anything that must not stay reachable.
   - Neither changes `status`. Studio shows the entry as "Ended (collection rule)", and previews show it with RFC-0008's notice ("Ended on …").
4. **Snapshot parity:**
   - A published snapshot holds the site node (rule and zone) and the entries (values), so the derived gate is a pure function of the snapshot and the clock.
   - The gate index (§7.4) adds every derived instant of published entries. The edge cache therefore expires at each one without a purge, as it does today for `until`.
   - Search rows get `gateUntil = min(…)` when the index is written with the publish batch. A changed rule or zone takes effect in search at the next publish, which is also when it takes effect on the site.
   - Previews and the live source ignore gates, as today.
5. **Going live and who decides:**
   - The rule is a site setting, saved like every collection setting (a person, or an agent with a person's approval holding `site:settings`).
   - A value goes live when its entry is published.
   - Publishing a change that moves a live entry's derived gate **earlier**, or adds one, removes content at a set time. It is classed like `schedule_unpublish` (RFC-0008 §7.6, "expiry removes content, so it waits for a person"): an agent's publish carrying it needs a person in every mode below `bypass`.
6. **Site Worker guard** (RFC-0008 §7.7): an older site Worker would ignore `expiry` and keep showing expired entries.
   - `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers refuse `expiry` (`409 gates_unsupported`) until the site Worker reports at least 2.
   - The reverse is already safe: an older admin Worker refuses the unknown property.
7. **Budget:** none needed. Expiry costs one comparison per entry per view, as gates do. The gate index grows by one instant per entry with a value, and a binary search keeps lookups cheap.

### 4. Listings by field

**Opt-in fields.** `listFields` (≤ 4 per collection) names the fields that may appear in `where`/`orderBy` anywhere and that Studio shows as list columns. It bounds three things:
- what the gate index must track for `now` conditions (below);
- what Studio renders;
- which fields a future index has to cover (§4, indexing).

**Operators by type** (`checkFieldQuery(defs, listFields, query)` refuses the rest with `invalid_query`):

| Field type | `where` ops | `orderBy` | `value` |
|---|---|---|---|
| `number` | `eq ne lt lte gt gte set unset` | yes | decimal |
| `date` | same | yes | `YYYY-MM-DD` or `now` (today in the site zone) |
| `datetime` | same (compares `at`) | yes | RFC 3339 instant or `now` |
| `boolean` | `eq` (absent reads false) | no | `true`/`false` |
| `select` | `eq ne in set unset` (`multiple`: contains / contains any) | no | option value(s) |
| `text`, `url` | `eq set unset` | no | exact string |
| `richText`, `image` | `set unset` | no | none |

- Conditions are ANDed. Values are resolved values (a translation reads the original's non-localized ones, RFC-0041 §5). Entries without a value sort last in both directions. Ties fall back to the section's or collection's `sort`, then `id`.
- **Not offered:** text sort (collation would differ between SQL and `Intl.Collator`), `contains`/`LIKE` (search covers it), OR, and offsets on `now` (`now+7d`; open question 4).
- **One evaluator, every caller.** `@cloudhal/core-ts/fields/query.ts` has `parseFieldQuery`, `matchesFieldQuery(entry, resolved, query, now)` and `compareByField`, following `filter.ts`'s pattern (one parser, one meaning). It runs in memory everywhere:
  - The snapshot source already holds every published entry of the snapshot in memory (`Loaded.entries`).
  - The live source and the store's `listContentEntries` already load a collection's rows (`taxonomy.ts` `listEntries`: `json_extract` conditions on `collection`, `locale`, `status` over the site's `nodes` range, no pagination).
  - Field conditions filter after that prefilter, so SQL and in-memory results cannot drift.
- **Theme API (additive):**
  ```ts
  interface FieldEntryQuery {
    collection: string; locale?: string;              // default: the site's
    where?: readonly FieldCondition[]; orderBy?: FieldOrder;
    sort?: "newest" | "oldest" | "title";             // default: the collection's sort
    filter?: string;                                  // RFC-0002 term filter, unchanged
    limit?: number; offset?: number;                  // ≤ 100; default 20
    includeExpired?: boolean;                          // unlisted (not hidden) entries past their gate: "past events"
  }
  GraphSource.queryEntries?(q: FieldEntryQuery): Promise<{ entries: ContentEntry[]; total: number }>;
  export function queryEntries(source: GraphSource, q: FieldEntryQuery): Promise<…>;  // any source
  ```
  On a published site, an invalid query matches nothing and is logged ("a published snapshot must keep rendering", like unknown terms in `entriesByFilter`). Writers refuse invalid queries, so this only happens after a definition changed.
- **`contentList` sections** honour `where`/`orderBy` through `ContentList.astro`, which ships in the renderer package, so old theme copies that render `Sections` get it on upgrade. Page writes check the conditions against the collection (`invalid_query`). `updateSite` refuses to drop a field from `listFields`, or to change its type, while a section still uses it (`list_field_in_use`, naming the pages). RFC-0041's field operations rewrite those sections' conditions in phase A (a renamed field), or refuse (a removed field still in use).
- **`now` and the cache.** A listing with `startsAt gte now` changes when time passes an entry's value. The snapshot's gate index therefore also gets every value instant of published entries' `listFields` of type `datetime`, and, for `date`, each day's start in the site zone. It is the same site-wide cap mechanism as §3, bounded by ≤ 4 fields per collection.
- **Indexing: none in stage 3.** `nodes` is one table for every site (RFC-0001). An expression index or generated column on `json_extract(body,'$.fields.startsAt')` is global DDL:
  - it cannot be opted in per site without runtime schema changes;
  - every distinct key across tenants would need its own migration;
  - D1 can add generated columns only as `VIRTUAL`, and cannot edit a definition, only drop and re-add it.

  Today's lists already scan the site's `contentEntry` range, and field conditions add only CPU.
  - **Trigger for the next step:** rollout step 3 benchmarks a 10,000-entry collection on Miniflare D1 (rows read, CPU per list).
  - **Next step, if needed:** an `entry_list_values (site_id, collection, locale, field, num, text, node_id)` side table, written in the entry's own batch (rule 4) for `listFields` only, with one composite index.

  Unmeasured today; the benchmark decides whether that side table lands in stage 3 or later.
- **API and MCP:**
  - `GET …/entries` and `list_entries` gain `where` (JSON), `orderBy` and `limit`/`cursor`. Without `limit`, today's unpaged answer stays.
  - `list_collections` returns `listFields` and, per field, the allowed ops.
- **Studio** (RFC-0041 open question 7):
  - the collection list shows `listFields` as columns (formatted with `formatFieldValue`);
  - a filter bar offers one control per list field (date range with "upcoming", select, boolean);
  - a sortable header for number and date columns;
  - the state lives in the URL search params, as the term filters' does.

### 5. Collection index pages and per-collection feeds

- **Index pages: in, as ordinary pages, with no new setting.** Collection settings get a "Create listing page" action. It creates a draft `Page` at the collection's prefix (`/events`), titled with the plural label and holding one `contentList` section. For a collection with a date list field and an expiry, the section defaults to `where: startsAt gte now`, `orderBy: startsAt asc`.
  - It goes through the normal page write: path checks and RFC-0038's "pages under a prefix win".
  - Agents do the same with `create_page`.
  - The renderer's `collectionIndex` hook already defaults to the prefix, so menus link to it.
  - Old themes render it, because pages and `ContentList.astro` are the renderer's.
  - RFC-0038's explicit `indexPath` stays "Later". It is only needed if an index must live away from its prefix.
- **Feeds: in, served by the renderer.** `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml`) lists that collection's newest available entries:
  - expiry and gates apply;
  - `feed: false` answers 404;
  - it uses the site feed's cache tag.

  A `cloudhal()` integration middleware serves it **only when the theme's own routes answered 404**, so an old theme copy (no route) gets the feed on upgrade, and a theme with its own route keeps it. A new `collectionFeedLink(site, collection, origin, locale)` gives themes the `<link rel="alternate">`; the starter adds it on entry and listing pages, and `entryHead` is unchanged.

### 6. Reference fields and repeaters: out (stage 4)

- **References** need:
  - referential integrity across nodes (deleting, retiring or unpublishing a target);
  - a rule for which locale a reference resolves to;
  - cycles and resolution cost in snapshots;
  - their own field operations.
- **Repeaters** need nested values, per-item validation, nested Studio forms and nested localization.
- Neither is needed for this RFC's goals:
  - `organizer`, `performer` and `brand` map from text;
  - ingredients and steps map from multiline text and rich text.
- Doing either well is an RFC of its own. Stage 4 starts from §2's table, which already names the paths references would fill (`performer`, `organizer`, `location` as a `Place` collection).

### 7. MCP and Studio, together

- **MCP:**
  - `create_collection`/`update_collection` accept `listFields`, `expiry` and `structuredData`, with unchanged policy (`site:write`, `requiresApproval`, `approverScopes: ["site:settings"]`, person-class). Precheck runs `checkStructuredData`, the expiry field-type check and the §3.6 guard.
  - The approval text says, for example, "Events will leave listings, feeds and search 1 hour after `endsAt`; 12 published events are already past it".
  - A new read-only `preview_structured_data { siteId, entryId }` (`content:read`) returns the document and issues, so an agent can check its work.
  - Tool docs are regenerated.
- **Studio** (`CollectionSettingsPage`, `SectionCard`s, lazy namespace `collections`, `kumo-design`/`studio-ui`, DESIGN.md "Fields"):
  - **Structured data:**
    - a type `Select`, then a table of the type's paths (required first, each with a `Select` of fitting sources, or a constant `Input`);
    - a preview of the JSON-LD for a chosen entry, computed by the same pure `structuredDataFor`;
    - issue badges;
    - an external link to Google's Rich Results Test for the entry's public URL.
  - **Expiry:** the field (date/datetime only), the action as a radio pair with the table of §3.3 in words, the grace, and a live count ("3 published entries are already past it").
  - **List fields:** an ordered multi-select of up to 4.
  - **Bundle:** all three cards and the preview load with the settings route, so the initial bundle grows by +0 kB.

### 8. Rollout (one PR each)

1. **Contract and pure core:**
   - the §1 diff, fixtures and `pnpm gen`;
   - `@cloudhal/core-ts/structured-data` (table, `checkStructuredData`, `structuredDataFor`);
   - `fields/query.ts`;
   - `fieldGateInstant` with oracle property tests.

   No behaviour change.
2. **Store and API:**
   - `updateSite` checks (`listFields` keys, expiry field type, preset, `list_field_in_use`);
   - `invalid_query` on page writes;
   - the API's entry list `where`/`orderBy`/paging;
   - behavioural suite on sqlite and Miniflare D1.
3. **Renderer:**
   - derived gates in `visible`, the gate index, search rows, sitemap, feeds and archives;
   - `features` `gates: 2` and the writer guard;
   - `queryEntries` on both sources, `ContentList` `where`/`orderBy`, `withStructuredData`;
   - the starter;
   - RFC-0008's route sweep test extended to derived gates;
   - the frozen `theme-v0.5.0` copy;
   - the 10k-entry benchmark (§4).
4. **MCP:** collection tools, `list_entries`, `preview_structured_data`, docs.
5. **Studio:** the three settings cards, list columns and filters, "Create listing page"; `design:shots`, translations.
6. **Feeds:** collection feed middleware, `collectionFeedLink`, `docs/guides/structured-data.md`.

Step 3 ships before step 4, so agents never set a rule the live site ignores. Step 6 is independent.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Expiry as an RFC-0008 automation that unpublishes or archives entries | Reuses the scheduler; real status change | Built-in jobs "never publish" (RFC-0008), so it would need an agent task or a new publishing job; writes and publishes without a person; misses runs when the scheduler stalls; a rollback re-publishes expired content | A derived gate holds without any scheduler, and is undone with the rule |
| Copy the field into `availability.until` on write | No renderer change | Two sources of truth; a person's own `until` is overwritten or blocks it; a rule change rewrites every entry | Derive at render; `min()` keeps both |
| `noindex` on expired entries | Page stays for readers | Google does not list `noindex` as a way to retire jobs; leaves lists and feeds wrong | `unlist` and `hide` |
| 410 for `hide` | "Gone" is precise | Diverges from expired `availability` (404, RFC-0008 open question) | Same answer as `until`; revisit with that question (open question 3) |
| A free JSON-LD template per collection (Webflow embed, Rank Math variables) | Any type, any property | Agents and people write JSON with tokens; escaping, required properties and URL absolutization become everyone's problem; injection surface | A closed preset table checked on save |
| A `oneOf` per preset in the contract | The contract shows each type's paths | ~80 property schemas; contract churn with every Google change; a Rust enum per type | Shape in the schema, meaning in one table |
| Keep `BlogPosting` and add the preset beside it | No replacement logic | Two main entities on one page; Google expects one item per leaf page | Replace; breadcrumbs stay |
| Expression indexes or generated columns on `fields.*` | Indexed filter and sort | Global DDL on the shared `nodes` table; per-site opt-in impossible without runtime migrations; D1 `VIRTUAL`-only adds | In-memory over today's scan; a side table if the benchmark says so |
| Extend RFC-0002's filter string (`fields.startsAt>=now`) | No contract change | `+` already means AND; values with `:`/`+`; agents get no schema | Structured `where` |
| A collection `indexPath` setting now | Explicit | New setting, new overlap checks; a page at the prefix already works | Page + "Create listing page"; `indexPath` stays RFC-0038 "Later" |
| Feeds through a starter route | Simple | Old theme copies lack the route | Middleware after a theme 404 |
| References in stage 3 | Richer `performer`/`location` | Integrity, locale, cost; a second RFC's worth | Stage 4 |

## Compatibility & migration

- **Contract:** optional properties and new `$defs` only; existing sites, snapshots and bundles stay valid. No `schemaVersion` bump.
  - An older admin Worker refuses the new properties (`additionalProperties: false`). Servers upgrade before clients push, as with every addition.
  - An older site Worker is covered by the `gates: 2` guard (§3.6).
- **Generators:** checked (§1). Named `$defs` for the two enums are required for Rust.
- **Data:** no migration. Nothing is set until a person or an approved agent sets it.
- **Themes:**
  - `entryHead`, `entries()` and every existing export keep their meaning. The only rendered differences on an old theme copy come from settings the site opts into: entries past an expiry leave lists and feeds, and `contentList` sections with `where` filter.
  - Preset JSON-LD needs the new starter (or one `withStructuredData` call).
  - Feeds appear on old copies only where the theme answered 404.
- **Studio:** additive cards and columns.
- **Rollback:**
  - Removing `expiry` restores every unlisted or hidden entry at the next publish, with nothing lost.
  - Removing `structuredData` restores `BlogPosting`.
  - A snapshot restores the site node with all three settings.
  - Downgrading below this RFC restores a snapshot from before the settings were added, because the old validator refuses them.

## Security & policy impact

- **No new scopes.** All three settings are collection settings: `site:settings` in Studio and the API; `site:write` plus a person holding `site:settings` for agents. `preview_structured_data` and list queries need `content:read`.
- **JSON-LD injection:**
  - documents are built as objects from typed values, never from strings;
  - serialized with `JSON.stringify` and then `jsonLdText` (`<`, `>` and `&` escaped), inside a non-executed `application/ld+json` block;
  - text constants are plain, have no control characters, are ≤ 200 characters, and are vocabulary-checked on enum paths;
  - rich text becomes plain text;
  - URLs pass `absoluteUrl`/`safeSrc` (no `javascript:`/`data:`), and images are same-site assets;
  - documents are capped at 32 KB.
- **Misleading markup:** rating and review paths are not offered. Required values come from the entry, never a constant (except currency and enum constants).
- **Nothing acts without a person:**
  - expiry is a render-time comparison over a published snapshot;
  - the rule is approved like any collection setting;
  - a publish that advances or adds a live entry's derived gate is classed as an unpublish (§3.5);
  - audit is unchanged: settings changes and publishes are already audited.
- **Leaks:** RFC-0008's route sweep test is extended to derived gates (`hide`), checking that no hidden id, path, title or asset appears in any public output; `unlist` is checked against lists, feeds, the sitemap and search.
- **Queries:** a closed operator set, ≤ 4 conditions, ≤ 20 values, values ≤ 100 characters, and no regex or `LIKE`. Evaluation is linear in the collection size the site already loads.
- **Tenant isolation:** unchanged; everything is per site.

## Open questions (recommended defaults)

1. **Initial preset set:** `Event`, `JobPosting`, `Product`, `Recipe`; `FAQPage` out (removed by Google in 2026). *Recommended.*
2. **Default expiry action:** `unlist`. *Recommended*; `hide` is one click away.
3. **404 or 410 for `hide`:** 404, the same as expired `availability`; decide both together if RFC-0008's 410 question is reopened. *Recommended.*
4. **Offsets on `now`** (`now+7d`, "this week"): not in stage 3. Every offset adds instants to the gate index; add it with a real case. *Recommended.*
5. **`listFields` cap:** 4 per collection. It bounds Studio columns, gate-index growth and a future side table. *Recommended.*
6. **Studio suggests `requiredToPublish`** for fields mapped to required preset paths, but does not force it. *Recommended.*
7. **Index pages:** "Create listing page" makes an ordinary page; no `indexPath` setting. *Recommended.*
8. **Per-collection feeds** via middleware after a theme 404, in stage 3 (step 6). *Recommended.*
9. **Google Indexing API for job removals:** out. It needs a Google service account per site; Google's page recommends it for faster recrawls, but `validThrough` in the past is sufficient. *Recommended.*
10. **Side table for list values:** only if step 3's benchmark shows a 10,000-entry list above 50 ms CPU or 10,000 rows read per request. *Recommended.*
11. **References and repeaters:** stage 4, its own RFC. *Recommended.*
