# Structured data, expiry and listings: a guide for site owners and theme authors

A collection of events, jobs, products or recipes can do more than hold typed fields. It can tell search engines what each entry **is** (a JSON-LD preset), let entries **end on a date** of their own (expiry), and **list entries by their fields** ("upcoming events, soonest first"), on listing pages and in the collection's own feed.

All three are collection settings: they build on [typed custom fields](fields.md), are approved like any other site setting, and change nothing until a site opts in. The design and its reasons are in [RFC-0042](../rfcs/0042-collections-stage-3.md) and [ADR-0044](../adr/0044-collections-stage-3.md).

## Structured data presets

Without a preset, every entry page describes itself as a `BlogPosting`. A preset replaces that document with the entry's real type, built from its fields, and keeps the `BreadcrumbList`.

| Type | Required (Google) | Typical mapping |
|---|---|---|
| `Event` | `name`, `startDate`, `location.name`, at least one `location.address.*` | `startDate` ← a datetime field, `location.name` ← a venue text field, `eventStatus` ← a select |
| `JobPosting` | `title`, `description`, `datePosted`, `hiringOrganization.name`, `jobLocation.address.*` (or `jobLocationType` with `applicantLocationRequirements.name`) | `validThrough` ← a date field, `employmentType` ← a select, `jobLocationType` ← a boolean (true means remote) |
| `Product` | `name`, `offers.price` | `offers.price` ← a number field, `offers.priceCurrency` ← a constant such as `EUR` |
| `Recipe` | `name`, `image` | `recipeIngredient` ← a multiline text field (one per line), `recipeInstructions` ← rich text (one step per paragraph), times ← whole minutes |

Why these four: they are in Google's current search gallery, and each describes one item per page, which is exactly an entry page.

- **`FAQPage` is not offered.** Google deprecated FAQ rich results and stopped showing them in 2026; it was also never a one-item-per-page type.
- **No ratings or reviews.** Google's policy forbids self-serving review markup and Cloudhal stores no reviews, so `aggregateRating` and `review` are not in the table (a constant could otherwise fake one).
- **`Organization` / `LocalBusiness`** describe the site, not an entry, and belong to site settings later.

Every property takes its value from one of four sources: a **field** of the collection (its type must fit the property), an **entry** property (`title`, `summary`, `body`, `coverImage`, `url`, `publishedAt`, `updatedAt`), a **site** property (`name`, `url`, `logo`), or a short plain **constant** (only on enum paths such as `eventStatus` and on currencies; required values always come from the entry). Many paths have a default (an event's `name` is the entry title, a job's `hiringOrganization.name` is the site name), so a working Event needs only a start date, a venue and a city.

Values are converted per field type: a datetime gives its instant with its own zone's offset (`2026-11-05T19:30:00+03:00`), a date gives `YYYY-MM-DD`, images become absolute asset URLs, rich text becomes plain text, URLs are made absolute (unsafe ones are dropped), and select options map through the property's vocabulary (`cancelled` → `https://schema.org/EventCancelled`). An option with no meaning there leaves the property out.

### Mapping fields

- **Studio:** a collection's settings, **Structured data**. Pick a type, then a source for each property (required first). The card flags mismatches, suggests marking fields mapped to required properties **Needed to publish**, and reminds you that search engines expect the values to be visible on the page (the starter's `EntryFields` shows every field with a value).
- **Agents (MCP):** `update_collection` takes `structuredData` (`{ "type": "Event", "properties": { "startDate": { "kind": "field", "field": "startsAt" } } }`). It waits for a person who may change site settings; try `dryRun: true` first.
- **API:** `PUT /api/sites/:siteId/collections/:key`. An invalid preset answers `422 structured_data_invalid` with one issue per path.

### Checking the result

An entry whose required values are missing emits **no** preset document (Google treats incomplete items as invalid): its page keeps the `BlogPosting`, and Studio says which value is missing.

- **Studio:** the Structured data card's **Preview** shows, for a chosen entry, exactly what its page emits with the saved settings, and links to **Google's Rich Results Test** for the entry's public URL.
- **Agents:** `preview_structured_data { siteId, entryId }` (read-only, `content:read`) returns the document and its issues. Check it before asking for a publish.

## Expiry: entries that end on a date

`expiry` names a date or datetime field and an action. Once an entry's date has passed, the site treats it as ended. Nothing runs at that moment: no job, no write, no unpublish. Every page view compares the date with the clock, as [time gates](schedules.md#embargoes-and-expiries-time-gates) do, so removing the rule brings every entry back at the next publish.

| Action | Entry page | Lists, `contentList`, archives, related | Feeds, sitemap, search, `llms.txt` |
|---|---|---|---|
| `unlist` (default) | stays (200), JSON-LD unchanged with its dates in the past | left out (themes can ask for them with `includeExpired`) | left out |
| `hide` | 404 `no-store`, like an expired embargo | left out | left out |

`unlist` suits events (pages keep their links and history) and jobs (a `JobPosting` with `validThrough` in the past is one of Google's accepted ways to retire a posting). `hide` suits offers that must not stay reachable. Neither changes the entry's status; Studio shows it as ended, and previews show it with an "Ended on …" notice.

- **When it ends:** a datetime ends at its instant. A **date ends at midnight after it in the site's time zone** (`Site.timeZone`, UTC when unset), so an event "on 5 November" is listed all of 5 November. `afterMinutes` adds a grace period of up to 10,080 minutes (one week). An entry without a value never ends.
- **Your own gates still apply:** the entry ends at the earlier of its own `availability.until` and the derived date.
- **Caching:** every ended instant joins the published snapshot's gate index, so the edge cache expires at each one without a purge. Static builds show the site as of the build and warn when a gate lies ahead; build again then.
- **Who decides:** the rule is a collection setting (`site:settings`). Publishing a change that ends a live entry earlier, or gives it an end, removes content at a set time, so an agent's publish carrying it waits for a person.
- **Deploy first on Cloudflare:** an older site Worker would ignore the rule and keep showing ended entries. The admin Worker refuses `expiry` (`409 gates_unsupported`, over REST, MCP and `cloudhal push`) until the site Worker answers `{ "gates": 2 }` on `GET /__cloudhal/features`. After upgrading, deploy both Workers (`cloudhal deploy` does), then save the rule. Locally and on Node there is nothing to wait for.

## Listings by field

`listFields` names up to four fields a collection may be filtered and sorted by: they are the columns of its list in Studio, the conditions `contentList` sections and agents may use, and what the gate index watches for `now`. Conditions are ANDed; values are strings read by the field's type.

| Field type | `where` operators | `orderBy` | `value` |
|---|---|---|---|
| `number` | `eq ne lt lte gt gte set unset` | yes | a decimal |
| `date` | same | yes | `YYYY-MM-DD` or `now` (today in the site's zone) |
| `datetime` | same (compares the instant) | yes | an RFC 3339 instant or `now` |
| `boolean` | `eq` (no value reads as false) | no | `true` / `false` |
| `select` | `eq ne in set unset` (with `multiple`: contains, contains any) | no | option values (`values` for `in`, up to 20) |
| `text`, `url` | `eq set unset` | no | the exact string |
| `richText`, `image` | `set unset` | no | none |

Entries without a value sort last in both directions; ties fall back to the section's or collection's `sort`, then the id. Not offered: text sorting (collation differs between SQL and browsers), `contains`/`LIKE` (search covers it), OR, and offsets on `now`. A translation filters by its original's non-localized values.

```json
{ "where": [{ "field": "startsAt", "op": "gte", "value": "now" }],
  "orderBy": { "field": "startsAt", "direction": "asc" } }
```

Everywhere: `contentList` sections (`where`, `orderBy` beside `sort` and `filter`), `list_entries` and `GET /api/sites/:siteId/entries` (`where` as JSON, `orderBy`, `limit`/`cursor`), and Studio's filter bar and sortable columns. Writers check conditions against the collection (`422 invalid_query`), and a field cannot leave `listFields` or change type while a section still uses it (`409 list_field_in_use`, naming the pages). On a published site an invalid query matches nothing and is logged, so a snapshot keeps rendering.

### Listing pages

A collection's index page is an ordinary page with a `contentList` section, at the collection's prefix (`/events` for `/events/{slug}`). **Create listing page** in the collection's settings makes a draft there, titled with the plural label; for a collection with a date listing field and an expiry, the section starts as "upcoming, soonest first". Agents do the same with `create_page`. Menus link to it through the renderer's `collectionIndex` default, and old themes render it, because pages and `ContentList.astro` are the renderer's.

### Collection feeds

Each collection with a prefix has its own RSS feed at `<prefix>/rss.xml` (`/events/rss.xml`, and `/<locale>/events/rss.xml` or the locale's domain for other languages): its newest listed entries, so ended and gated entries stay out, titled after the plural label, with the site feed's cache tag and edge-cache cap. A collection with `feed: false` has none (404), and so does one whose permalink has no prefix (`/{slug}`, whose feed would be the site's `/rss.xml`).

The renderer serves it with a middleware that answers **only when the theme's own routes answered 404**: a theme with its own route for the path keeps it, and theme copies from before this feature gain the feeds on upgrade. Static builds write the files through the starter's `[...path]/rss.xml` route (it lists the paths, answers 404, and the middleware fills in the feed); the Cloudflare site Worker and `cloudhal dev` answer per request. The starter links the feed (`<link rel="alternate" type="application/rss+xml">`) on entry pages and on pages that list the collection.

## Theme API

All additive (`@cloudhal/astro-renderer`; see its README's "Theme-facing API stability"). `entryHead`, `entries()`, `allEntries()` and every older export keep their meaning.

| Export | What |
|---|---|
| `withStructuredData(head, source, entry, { origin, media? })` (`./seo`) | Call after `entryHead`: replaces the `BlogPosting` with the collection's preset when the entry yields one, keeps the breadcrumbs, otherwise returns `head` unchanged. `entryStructuredData` returns the document and its issues. |
| `queryEntries(source, q)` (`./queries`) | `{ collection, locale?, where?, orderBy?, sort?, filter?, limit? (1–100, default 20), offset?, includeExpired? }` → `{ entries, total }` on any source; `now` is the source's clock. |
| `contentListEntries(source, sections, locale?)` (`./queries`) | The `entries` map `Sections` reads: by collection, and by section id for sections with a term `filter` or `where`/`orderBy`. |
| `collectionFeedLink(site, collection, origin, locale?)` (`./seo`, `./collection-feeds`) | `{ title, href }` for the collection's feed on the locale's URL, or `undefined` without one. Add it to `head.feeds` **after** `localizeHead`, which would otherwise localize the URL twice. |

```astro
---
const head = await withStructuredData(entryHead(site, entry, origin, terms, media), source, entry, { origin, media });
const meta = localizeHead(head, site, { locale, origin, alternates });
const feed = collectionFeedLink(site, entry.collection, origin, locale);
const shown = feed ? { ...meta, feeds: [...meta.feeds, feed] } : meta;
const upcoming = await queryEntries(source, {
  collection: "events",
  where: [{ field: "startsAt", op: "gte", value: "now" }],
  orderBy: { field: "startsAt", direction: "asc" },
  limit: 5,
});
---
```
