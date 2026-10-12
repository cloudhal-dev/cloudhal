# @cloudhal/analytics

Cookie-less, first-party site analytics for Cloudhal ([RFC-0006](../../docs/rfcs/0006-site-analytics.md), [ADR-0021](../../docs/adr/0021-site-analytics.md)). Page views and Core Web Vitals come from the site's own script as beacons; the site Worker validates and enriches them and writes `AnalyticsEvent`s to Workers Analytics Engine (WAE) on Cloudflare, or to SQLite locally and on Node. Daily rollups live in D1/SQLite. No cookies, no IP addresses or user agents stored, no API token.

Everything here is **Worker-safe** (AGENTS.md rule 5): SQLite is reached only through `SqlDriver` from `@cloudhal/storage`, validation uses the precompiled contract validators (rule 6), and storage writes are single statements or atomic `batch()`es (rule 4).

| Export | What |
|---|---|
| `@cloudhal/analytics` | query model and result types, classifiers, normalisation, visitor hash, per-isolate limits, settings rules, event builders, the beacon handler, `MemoryAnalytics`, `demoEvents` (demo data for `cloudhal analytics seed`) |
| `@cloudhal/analytics/sql` | `SqlAnalytics` (raw events in `analytics_events`), settings / salt / rollup-run / query-budget accessors |
| `@cloudhal/analytics/wae` | `WaeWriter`, `WaeReader`, `compileWae`, the fixed data-point layout |
| `@cloudhal/analytics/rollup` | `runRollups`, `RollupReader`, `collectDailyRows`, `writeDailyRows` |
| `@cloudhal/analytics/reader` | `CompositeReader` (rollups for complete days, the rest live), `mergeResults` |
| `@cloudhal/analytics/service` | `AnalyticsService` (one per deployment: composite reads, settings with the salt and purge rules, rollups, status, CSV export of rollups), `presetRange`, `rangeFromParams`, `parseFilterParam`, `ANALYTICS_OFF` |
| `@cloudhal/analytics/testing` | conformance, state and rollup suites; `FIXTURE_EVENTS`, `CONFORMANCE_CASES` |
| `@cloudhal/analytics/client` | the browser sources (`pageview.browser.js`, `vitals.browser.js` with `web-vitals`) and their names; build input for the `cloudhal()` integration, which ships them as `/_cloudhal/p.<hash>.js` (≤ `PAGEVIEW_GZIP_BUDGET`, 1 KB gzipped) and `/_cloudhal/v.<hash>.js`. Node only (build time) |

The site side (`POST /__cloudhal/e`, the script tag, render events) lives in `@cloudhal/astro-renderer` (`SiteAnalytics` in `./analytics`, used by the Site Worker entry and the `cloudhal dev` middleware).

## The query model

```ts
type AnalyticsQuery =
  | { kind: "summary"; siteId; range; filter? }                    // { pageviews, visits, visitors | null, renders | null }
  | { kind: "series"; siteId; range; interval: "hour" | "day"; filter? } // { interval, points[{ t, pageviews, visits }] }
  | { kind: "top"; siteId; range; dimension; limit; filter? }      // { dimension, rows[{ key, pageviews, visits }] }
  | { kind: "vitals"; siteId; range; filter? }                     // { metrics[{ metric, p75, samples, good, needsImprovement, poor }] }
  | { kind: "renders"; siteId; range; statuses: "errors" | "redirects" | "crawlers"; limit };
// range: { from, to } ISO instants or YYYY-MM-DD, UTC, [from, to); filter: { node?, channel?, country?, device? }
// dimension: node | refHost | channel | utmSource | utmMedium | utmCampaign | country | device | browser | os

interface AnalyticsReader { kind; query<Q>(q: Q): Promise<{ data; source: "live" | "rollups" | "mixed"; estimated; partial? }> }
interface AnalyticsWriter { write(event: AnalyticsEvent): void }    // never throws, never awaited
interface AnalyticsStore extends AnalyticsReader, AnalyticsWriter { kind: "wae" | "sql" | "memory" }
```

`assertAnalyticsQuery(q, { maxDays })` checks a query (ids, enums, ISO instants, ≤ 92 days live, hourly ≤ 7 days, `limit` 1–1000) and throws `AnalyticsQueryError` (`code: "invalid_query"`). Errors carry a `code` for the API: `analytics_unavailable` (503, `retryable`), `analytics_query_failed` (502), `analytics_budget_exceeded`, `unsupported_query`, `conflict` (409), `invalid_settings`.

Semantics every store shares (checked by the conformance suite): a visit is an entrance page view; `visitors` is the sum of daily distinct hashes (`null` when no view in the range carried one); vitals and renders weigh each event by its `sampleOneIn`; `renders` counts people's HTML `200` renders (no crawler, not a bot) under the node/country/device filter and is `null` under a channel filter or where rollups do not keep it, and `estimatedCacheHitRatio(summary)` turns it into `1 − renders ÷ page views` (an estimate; `AnalyticsService.cacheHitRatio` reports it only for `store: "wae"`); p75 is the weighted nearest rank; top lists order by page views, then key, and leave out views without a value.

## Site Worker: beacons and render events

```ts
import { BeaconRateLimiter, buildRenderEvent, handleBeacon, RenderEventSampler, SharedBeaconRateLimiter } from "@cloudhal/analytics";
import { createSaltProvider, getEffectiveSettings } from "@cloudhal/analytics/sql";
import { WaeWriter } from "@cloudhal/analytics/wae";

const limiter = new BeaconRateLimiter();          // per isolate
// optional, across isolates (`analytics.rateLimit`): a Workers Rate Limiting binding keyed by an
// HMAC under a deployment secret; fails open, so the per-isolate limit always applies
const shared = env.ANALYTICS_RL ? new SharedBeaconRateLimiter(env.ANALYTICS_RL, { secret }) : undefined;
const salt = createSaltProvider(sql);             // memoised per UTC day
return handleBeacon(request, {                    // 204 for every outcome, 405 for other methods
  siteId,
  settings: () => memoised60s(() => getEffectiveSettings(sql, siteId, defaults)), // throwing = off
  hosts: [...site.domains.map((d) => d.hostname), workersDevHost],
  resolvePath: (path) => publishedNode(path),     // { nodeId, nodeKind, locale? } or undefined
  writer: new WaeWriter(env.ANALYTICS),
  salt,
  rateLimit: async (ip, kind) => (await limiter.allow(ip, kind)) && (await (shared?.allow(ip) ?? true)),
  onError: (m, e) => console.error(m, e),
});
```

`processBeacon` runs the same checks and returns `{ ok: true, event } | { ok: false, reason }` for tests and logs. `buildRenderEvent({ siteId, now, url, status, hosts, userAgent, referer, node?, location?, renderMs?, sampleOneIn?, country? })` builds a server-side render event (use `RenderEventSampler.next()` for the flood cap). Also exported: `classifyUserAgent`, `crawlerClass`, `knownCrawlers`, `classifyChannel`, `normaliseBeaconPath`, `toRequestPath`, `normaliseHost`, `normaliseUtm`, `visitorHash`, `hasPrivacySignal`, `buildPageviewEvent`, `buildVitalsEvent`.

## Admin Worker / Node: reading, rollups, settings

```ts
import { CompositeReader } from "@cloudhal/analytics/reader";
import { RollupReader, runRollups } from "@cloudhal/analytics/rollup";
import { putAnalyticsSettings, SqlQueryBudget } from "@cloudhal/analytics/sql";
import { WaeReader } from "@cloudhal/analytics/wae";

const live = new WaeReader(env.ANALYTICS_SQL, {    // 60 s per-isolate cache, one retry, error mapping
  dataset: env.CLOUDHAL_ANALYTICS_DATASET,
  budget: new SqlQueryBudget(sql, { limit: 8000 }),
});
const reader = new CompositeReader({ rollups: new RollupReader(sql), live });
await reader.query({ kind: "top", siteId, range: { from: "2026-09-01", to: "2026-10-01" }, dimension: "node", limit: 20 });

// scheduled (hourly): one site-day per call; the cron's reads are exempt from the budget
await runRollups({ reader: new WaeReader(env.ANALYTICS_SQL, { dataset }), sql, siteIds, now: new Date(), defaults });

// PUT …/analytics/settings: CAS on rev; delete today's salt yourself when uniqueVisitors turns off
await putAnalyticsSettings(sql, { siteId, rev, patch: { uniqueVisitors: false }, actorId, now: new Date() });
```

Local and Node self-host use `new SqlAnalytics(sql)` as both writer and live reader (`flush()` waits for queued inserts, `prune(before)` applies `rawRetentionDays`) and run `runRollups` with it on a timer. `parseAnalyticsDefaults` reads `CLOUDHAL_ANALYTICS_DEFAULTS` / `cloudhal.json`; `datasetName("newsroom")` is `newsroom_events`.

## WAE layout

`index1 = siteId`; `blob1` kind, `blob2` schema version, `blob3` path, `blob4` node id, `blob5` node kind, `blob6` referrer host, `blob7` channel, `blob8–10` UTM, `blob11` country, `blob12` device, `blob13` browser, `blob14` OS, `blob15` visitor, `blob16` navigation type, `blob17` locale, `blob18` crawler, `blob19` redirect target, `blob20` same-site referrer path; `double1` entrance, `double2` status, `double3–7` LCP, INP, CLS × 1000, TTFB, FCP, `double8` render ms, `double9` `sampleOneIn`. Absent blobs are `""`; absent metrics and render ms are `-1`. `toDataPoint` / `fromDataPoint` convert.

The compiler (`compileWae`) targets the Analytics SQL API dialect of the binding: table `events.analyticsEngine."<dataset>"`; aggregates are already sample-weighted, so `"sampleInterval"` is never used; `APPROX_MAX` instead of `MAX`; `quantileWeighted(0.75, x, weight)` for p75. Golden statements are in `test/golden/*.sql`.

## Tests

`pnpm --filter @cloudhal/analytics test` runs the conformance suite on `MemoryAnalytics`, `SqlAnalytics` (better-sqlite3 and Miniflare D1) and `WaeReader` over a SQLite-backed fake of the Analytics SQL API; the state and rollup suites on SQLite and D1; golden SQL; the beacon handler with hostile beacons. The live suite (`test/live.test.ts`) runs only with `CLOUDHAL_LIVE_CF=1` against a probe Worker deployed to a real account (see `test/live/probe-worker.ts`); it never runs in CI.
