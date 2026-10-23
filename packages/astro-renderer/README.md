# @cloudhal/astro-renderer

Renders a Cloudhal Site Graph with Astro 7. The main pieces:

| Export | What |
|---|---|
| `@cloudhal/astro-renderer/integration` | `cloudhal({ dataDir, siteId })` — exposes the project config as `virtual:cloudhal/config`, externalises the native SQLite module, and in dev watches the data directory to clear Astro's route cache when pages are added (Astro ≥6.3 caches `getStaticPaths()` across requests). |
| `@cloudhal/astro-renderer/runtime` | `getSource(config)` — a `GraphSource`: **live** nodes in dev (drafts visible), a **snapshot** in builds (`CLOUDHAL_SOURCE=snapshot:<id>`). |
| `@cloudhal/astro-renderer/components` | `Sections` dispatcher + `Hero`, `RichText`, `Image`, `ContentList` `.astro` components. Themes override any of them through the `components` prop. |
| `@cloudhal/astro-renderer/fields` | Typed custom fields (RFC-0041 §9): `entryFields`, `renderFields`, `hasShownFields`, and `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` re-exported from `@cloudhal/core-ts/fields`. `EntryFields.astro` in `./components` draws them. |

A page route in a starter looks like this:

```astro
---
import { Sections } from "@cloudhal/astro-renderer/components";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import config from "virtual:cloudhal/config";
export async function getStaticPaths() {
  const source = await getSource(config);
  return (await source.pages()).map((p) => ({ params: { path: p.path === "/" ? undefined : p.path.slice(1) } }));
}
const source = await getSource(config);
const page = await source.pageByPath(Astro.params.path ? `/${Astro.params.path}` : "/");
---
<Sections sections={page.sections} />
```

`.astro` files ship as source (no build step); the consumer's Astro compiles them. `astro` is a peer dependency.

## Theme-facing API stability
`cloudhal init` copies `starters/blog/src` into each project, so a site keeps calling this package's exports (and `@cloudhal/core-ts`'s) as they were when it was created. Every export a theme imports is therefore a public API: never change its meaning under the same name. A breaking change keeps a deprecated fallback for the old call. In 0.3.11 `entryPath(entry)` became `entryPath(site, entry)` without one, and every site with an older theme copy rendered empty pages until 0.3.13 restored it. `packages/cli/test/old-theme-compat.test.ts` builds frozen copies of earlier starters (`packages/cli/test/fixtures/theme-v*/`) with today's packages. Add a new frozen copy when a release changes theme-facing APIs.

### Typed custom fields (RFC-0041, added in 0.5.0)
Additive; `entry.fields` still means exactly what is stored, and themes that never call these keep rendering as before (`theme-v0.4.0` in the compat test).

| Export | Signature |
|---|---|
| `GraphSource.entryFields?` | `(entry: ContentEntry, options?: EntryFieldsOptions) => Promise<RenderedFields>` on `LiveSource` and `SnapshotSource` (optional on the interface, like `search?`) |
| `entryFields` (`./fields`, `.`) | `(source: FieldsSource, entry: ContentEntry, options?: EntryFieldsOptions) => Promise<RenderedFields>`: the same for any source (`site()`, optional `entryById()` and `asset()`) |
| `renderFields` | `(resolved: ResolvedFields, options: RenderFieldsOptions) => RenderedFields`: the pure step, for values you resolved yourself |
| `hasShownFields` | `(fields: RenderedFields) => boolean` |
| `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` | re-exported from `@cloudhal/core-ts/fields` |
| `EntryFields` (`./components`) | `<EntryFields fields={…} label?="Details" class?="…" />`: a `<dl class="ch-fields">` of the fields with a value, nothing when none has one; no styles of its own |

`EntryFieldsOptions`: `locale` (default: the entry's), `media` (the page's `MediaContext`), `timeZone`, `words` (`{ yes, no }`), `sizes`. Each `RenderedField` has `key`, `label`, `help?`, `empty`, `text` (escaped plain text), and per type `html` (rich text through the body's markdown pipeline), `href` (`safeHref`, dropped when unsafe), `image` (`imageAttributes` plus `assetId`, alt in the page's language) or `datetime`, plus `def`, `value` and `fromOriginal` from `resolveFields`. Theme guide: [`docs/guides/fields.md`](../../docs/guides/fields.md).

### Collections stage 3 (RFC-0042, added in 0.6.0)
Additive. `entryHead`, `entries()`, `allEntries()` and every existing export keep their meaning; the only differences an old theme copy renders come from settings a site opts into (`theme-v0.5.0` in the compat test): entries past a collection's `expiry` leave lists, feeds, the sitemap and search, and `contentList` sections with `where`/`orderBy` list by field (`ContentList.astro` ships here and queries the source a theme's list came from).

| Export | Signature |
|---|---|
| `GraphSource.queryEntries?` | `(q: FieldEntryQuery) => Promise<FieldEntryResult>` on `LiveSource` and `SnapshotSource`: `{ collection, locale?, where?, orderBy?, sort?, filter?, limit? (1–100, default 20), offset?, includeExpired? }` → `{ entries, total }`; `now` in conditions is the source's instant |
| `queryEntries` (`./queries`, `.`) | `(source: GraphSource, q: FieldEntryQuery) => Promise<FieldEntryResult>`: any source (falls back to `entries()` on sources without `queryEntries`); an invalid query matches nothing and is logged |
| `contentListEntries` (`./queries`, `.`) | `(source, sections, locale?) => Promise<Record<string, ContentEntry[]>>`: the `entries` map `Sections` reads (by collection; by section id for `filter` and for `where`/`orderBy`) |
| `sectionQuery`, `listsByField`, `evaluateEntryQuery` (`./queries`) | the query a section runs; whether it lists by field; the pure evaluator both sources share |
| `GraphSource.routableEntries?` | `(locale?) => Promise<ContentEntry[]>`: every entry with a public URL, unlisted ones included (routes, static builds, alternates); `allEntries` stays the listed ones |
| `withStructuredData` (`./seo`, `.`) | `(head: HeadMeta, source, entry, { origin, media? }) => Promise<HeadMeta>`: call after `entryHead`; replaces the `BlogPosting` with the collection's preset (`Event`, `JobPosting`, `Product`, `Recipe`) when the entry has every required value, keeps the `BreadcrumbList`, returns `head` unchanged otherwise |
| `entryStructuredData` (`./seo`, `.`) | `(source, entry, { origin, media? }) => Promise<{ doc?, issues }>`: the preset document and why there is none |
| `collectionFeedLink` (`./seo`, `./collection-feeds`, `.`) | `(site, collection, origin, locale?) => FeedLink \| undefined`: `{ title, href }` of the collection's feed (`<prefix>/rss.xml`) on the locale's URL, `undefined` with `feed: false` or a permalink without a prefix; add it to `head.feeds` after `localizeHead` |
| `collectionFeedPath`, `feedCollections`, `collectionFeedPaths`, `collectionForFeedPath` (`./collection-feeds`) | which collections have a feed and where; `staticPaths().feeds` now includes every collection feed path |
| `collectionFeedXml`, `serveCollectionFeed` (`./collection-feed-route`) | a collection's RSS in a locale; the middleware's decision (a theme's 404 for a feed path becomes the feed) |

Collection feeds: the `cloudhal()` integration adds a middleware (`collection-feed-middleware`) on every target that serves `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml`) only where the theme's own routes answered 404, so a theme's own route wins and old copies gain the feeds; static builds write them through the starter's `[...path]/rss.xml` route, whose paths come from `staticPaths().feeds`. Same rules and cache tag as `rss.xml`.

Previews: `renderSectionHtml(section, entries, media?, listing?)` takes `{ site, now? }` as a fourth argument, and `renderPagePreview` passes it, so `contentList` sections with `where`/`orderBy` preview through `evaluateEntryQuery` like the site (a term `filter` is still applied on the site only).

Guide: [`docs/guides/structured-data.md`](../../docs/guides/structured-data.md).

Derived gates: `unlist` keeps an entry's page (200), comments and menu links but leaves `entries()`, `allEntries()`, `entriesByFilter`/`entriesByTerm` (archives, related), feeds, the sitemap and search; `hide` is a 404 like an expired `availability`. Both sources apply them, the gate index caps the edge cache at every derived instant and at every value instant of date/datetime list fields (for `now` conditions), and previews ignore them with an "Ended on …" notice. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`; writers refuse `expiry` until it does.

## Site analytics (RFC-0006)

The renderer carries the site side of Cloudhal's cookie-less analytics (`@cloudhal/analytics`):

- **Scripts.** On a Site Worker build (`target: "cloudflare"`) the `cloudhal()` integration bundles `@cloudhal/analytics/client` with Astro's Vite into two hashed static assets, `/_cloudhal/p.<hash>.js` (the page-view script, ≤ 1 KB gzipped, held there by a test) and `/_cloudhal/v.<hash>.js` (vitals, `web-vitals`, loaded by one page view in N). No cookies, no storage, no identifiers, nothing third-party; the CSP stays `script-src 'self'; connect-src 'self'`.
- **Site Worker** (`cloudflare-entry.ts`, `analytics.ts`). `POST /__cloudhal/e` answers `204` for every outcome (`405` for other methods) and writes one event through `WaeWriter(env.ANALYTICS)`; published HTML `200`s get `<script type="module" src="/_cloudhal/p.<hash>.js" data-v="N">` in `<head>` while the site's setting is on (never previews, errors or feeds); responses the Worker renders become `render` events (published HTML `200`s, redirects, `404`, `410`, `451`, `5xx`). A purge re-reads the settings.
- **What the Site Worker expects** (written by `cloudhal deploy` in rollout step 9): the Analytics Engine binding `ANALYTICS` (dataset `<deployment>_events`), `CLOUDHAL_ANALYTICS = "on"`, `CLOUDHAL_ANALYTICS_DEFAULTS` (`cloudhal.json`'s `analytics` block as JSON; `enabled` defaults to `true`), migration `0014_analytics` in D1 (until it has run, analytics count as off), and optionally `CLOUDHAL_SITE_HOSTS` (extra hostnames; `Site.domains` and `*.workers.dev` request hosts are accepted already). Without the switch or the binding nothing is collected and no tag is added.
- **`cloudhal dev`** (`analytics-middleware.ts`, `analytics-node.ts`). The same endpoint; it records into the local SQLite store (`analytics_events`) only with `analytics.dev: true` (the integration's `analytics` option, which the blog starter passes from `cloudhal.json`, or `CLOUDHAL_ANALYTICS`, `CLOUDHAL_ANALYTICS_DEFAULTS` and `CLOUDHAL_ANALYTICS_DEV=1` in the environment), and then serves the scripts and injects the tag. Static builds carry no analytics.
