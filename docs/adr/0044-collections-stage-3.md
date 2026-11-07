# ADR-0044: Collections stage 3: JSON-LD presets from fields, expiry as a render-time gate, listings by field
- Status: Accepted
- Date: 2026-10-23 (decided by Halil)
- Related: RFC-0042, RFC-0041 / ADR-0043, RFC-0040 / ADR-0042, RFC-0008 / ADR-0023, RFC-0038 / ADR-0040, #71
- Sources: [Google Search gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) · [Event](https://developers.google.com/search/docs/appearance/structured-data/event) · [JobPosting](https://developers.google.com/search/docs/appearance/structured-data/job-posting) · [Product snippet](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) · [Recipe](https://developers.google.com/search/docs/appearance/structured-data/recipe) · [Rank Math schema templates](https://rankmath.com/kb/schema-templates/) · [PublishPress Future](https://wordpress.org/plugins/post-expirator/) · [Cloudflare D1 generated columns](https://developers.cloudflare.com/d1/reference/generated-columns/)

## Context
Collections have typed fields since ADR-0043, but the fields do little on the public site:
- every entry emits a generic `BlogPosting`;
- an event stays listed after it ends;
- themes cannot list entries by a field value.

The open stage 3 items from RFC-0040 and RFC-0041 address these: structured data, date-driven expiry, field listings, index pages and per-collection feeds.

## Decision
1. **Contract:** new optional collection settings. There is no `schemaVersion` bump.
   - `listFields`: up to 4 keys.
   - `expiry`: `{field, action: "unlist" | "hide", afterMinutes?}`.
   - `structuredData`: `{type, properties}`. Each property names its source by `kind`: `field`, `entry`, `site` or `constant` (plain text in stage 3). The entry and site property names are named `$defs` (cargo-typify merges inline enums).
   - `contentList` sections gain `where` (up to 4 conditions) and `orderBy`.
   - Which properties each type accepts, the field types that fit them and the required ones are a closed table in code (`@cloudhal/core-ts/structured-data`).
2. **Presets:** Event, JobPosting, Product and Recipe.
   - FAQPage is out, since Google deprecated FAQ rich results.
   - Organization and LocalBusiness belong to site settings later.
   - No rating or review properties.
   - A mapping is checked when it is saved. An entry missing a required value emits no preset.
   - `withStructuredData()` replaces the generic `BlogPosting`; `entryHead` is unchanged, so old themes keep today's output.
   - Output goes through `jsonLdText`, capped at 32 KB.
3. **Expiry is a gate, not an automation.** It reuses ADR-0023's time gates: `min(availability.until, field date + grace)`. A `date` ends at the start of the next day in the site's zone.
   - `unlist` (default): the page stays, but the entry leaves listings, feeds, the sitemap and search.
   - `hide`: 404.
   - No scheduler runs and nothing is rewritten.
   - Publishing a change that adds a gate, or moves a live gate earlier, is approved like `schedule_unpublish`.
   - Writers refuse `expiry` until the site Worker reports `gates: 2`.
4. **Listings by field:**
   - A closed set of operators per field type.
   - Sorting only by number, date or datetime.
   - `now` is the only relative value (no offsets).
   - One in-memory evaluator (`fields/query.ts`) is shared by themes (`queryEntries`), `ContentList`, the API, MCP and Studio.
   - Step 3's benchmark exceeded the threshold (more than 50 ms CPU or 10,000 rows read per list) on the store, API and MCP path, so `entry_list_values` landed in stage 3 (#110): rows of resolved list-field values, written in the entry's batch; per-collection readiness with a fingerprint and a resumable backfill; the in-memory evaluator stays the fallback and the oracle. Themes and snapshots are unchanged.
   - Studio list columns and filters come from `listFields`.
5. **Index pages and feeds:**
   - A collection's index page is an ordinary page made by "Create listing page", with a `contentList`; there is no `indexPath`.
   - Per-collection feeds are served at `<prefix>/rss.xml` by a renderer middleware, only where the theme's routes answer 404.
6. **Later:**
   - reference fields and repeaters (stage 4, own RFC);
   - offsets on `now`;
   - 410 for `hide`, decided with RFC-0008's 410 question;
   - the Google Indexing API.

## Consequences
- Positive:
  - Entries can earn rich results.
  - Ended events and closed jobs leave listings without anyone acting, and without a background job.
  - Themes and agents list by field with one set of semantics.
  - Collections get index pages and feeds.
- Negative:
  - The structured-data table must follow Google's documentation.
  - Listings scan a collection in memory until its list index is ready.
  - Every entry write carries two list-value housekeeping statements.
  - Collection settings grow again.
- Risks:
  - **JSON-LD injection:** mitigated by `jsonLdText` and plain-text constants.
  - **Gates on old site Workers:** guarded by the `gates: 2` feature flag.
  - **Mapping drift:** if a mapped field changes, the operations and `list_field_in_use` refuse or report it.
  - **A stale list index:** never read; every statement checks readiness under the current definitions' fingerprint.
