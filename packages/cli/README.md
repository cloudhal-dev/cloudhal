# @cloudhal/cli

```
cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
cloudhal studio [--port <n>] [--no-auth]                API + Studio UI (+ /mcp) for this project
cloudhal mcp [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                        MCP server over stdio for this project
cloudhal deploy [--name <base>] [--dry-run]             site + admin Workers on Cloudflare
cloudhal domain [set <hostname>] [--studio <hostname>] | remove [site|studio|all]
cloudhal push [--replace] [--admin-url <url>]           local site → deployment
cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]
                                                        entry tags → tag terms (RFC-0002)
cloudhal analytics status [--remote]                    site analytics (RFC-0006): settings, totals, budget
cloudhal analytics rollup [--days <n>] [--remote] [--redo]
                                                        daily totals (--remote backfills from WAE)
cloudhal analytics seed [--days <n>] [--views <n>]      demo traffic, local SQLite only
cloudhal analytics export [--from <date> --to <date>] [--remote] [--out <file>]
                                                        daily totals as CSV
```

### Site analytics (RFC-0006)

What is collected, what never is, the unique-visitors mode, retention and a ready-made privacy-policy paragraph (English and Turkish): [site analytics and privacy](../../docs/guides/analytics-privacy.md).

Each published page carries one first-party script (`/_cloudhal/p.<hash>.js`, under 1 KB gzipped) that posts a page view to `POST /__cloudhal/e` on the site Worker. The Worker checks it, resolves the path to a published node and writes the event to Workers Analytics Engine (WAE). The admin Worker reads WAE through the Analytics SQL binding (no API token) and keeps daily totals in D1. Locally and on Node the same model runs on the project's SQLite.

**`cloudhal.json` → `analytics`** (deployment defaults; per-site settings in Studio override them):

| Key | Default | Meaning |
|---|---|---|
| `enabled` | on when the block is there | `false` turns analytics off for the whole deployment: no bindings, no cron, no script. Without the block, analytics are off. `cloudhal init` writes `{ "enabled": true }`. |
| `uniqueVisitors` | `false` | Daily-salted visitor hash (opt-in; see the guide). |
| `vitalsOneIn` | `5` | Core Web Vitals from 1 in N page views: `0` (off), `1`, `2`, `5`, `10`, `20`. |
| `queryBudget` | `8000` | Uncached WAE queries per UTC day; past it, live numbers pause until midnight UTC and complete days still come from D1. |
| `rawRetentionDays` | `90` | Raw events kept in SQLite (local and Node only; WAE keeps 3 months). |
| `dev` | `false` | Record `cloudhal dev` traffic locally (it is your own). |
| `rateLimit` | `false` | Reserved for the Workers Rate Limiting binding; accepted but not wired yet. |

```json
{ "siteId": "site_…", "analytics": { "enabled": true, "vitalsOneIn": 5 } }
```

**On Cloudflare.** With analytics on, `cloudhal deploy` adds:
- to the site Worker, the WAE dataset `<deployment>_events` (binding `ANALYTICS`; Cloudflare creates the dataset on the first write) and the vars `CLOUDHAL_ANALYTICS=on`, `CLOUDHAL_ANALYTICS_DEFAULTS` and, with a custom domain, `CLOUDHAL_SITE_HOSTS`;
- to the admin Worker, the Analytics SQL binding (`ANALYTICS_SQL`), the vars `CLOUDHAL_ANALYTICS_DATASET`, `CLOUDHAL_ANALYTICS_BUDGET` and `CLOUDHAL_ANALYTICS_DEFAULTS`, and an hourly cron trigger (`17 * * * *`) that rolls finished days into D1, deletes old daily salts and applies retention.

It needs **wrangler 4.145 or newer** (the `analytics` config key); the deploy stops and says so when the project's wrangler is older. The migration `0014_analytics` runs on the admin Worker's first request. When analytics switch on or off, the deploy purges the site's cache once so pages gain or lose the script tag. Workers Free allows 5 cron triggers per account: when none is free, the admin Worker is deployed without one (`CLOUDHAL_ANALYTICS_CRON=off`) and daily totals are computed when someone opens Analytics; every later deploy tries the trigger again.

**Turning it on for an existing deployment.** Projects from before analytics have no `analytics` key. The next interactive `cloudhal deploy` asks once ("Turn on cookie-less analytics for <site>? (Y/n)") and writes the answer to `cloudhal.json`; a non-interactive deploy (CI) keeps analytics off and prints how to turn them on. To decide up front, add `"analytics": { "enabled": true }` (or `false`) and deploy. Adding a script to a live site changes what its privacy policy must say, so update it first ([guide](../../docs/guides/analytics-privacy.md#a-paragraph-for-your-privacy-policy)). Agent keys created before analytics do not get `analytics:read` automatically; allow it per key on Studio's Agents page.

**Limits and costs** (Cloudflare's published numbers as of 2026-10; WAE is not billed yet, its Paid prices are announced):

| | Workers Free | Workers Paid ($5/month) |
|---|---|---|
| Worker requests | 100,000/day, cache hits included | 10 M/month included, then $0.30 per million |
| WAE writes | 100,000/day | 10 M/month included, then $0.25 per million |
| WAE queries | 10,000/day | 1 M/month included, then $1.00 per million |
| D1 rows written | 100,000/day (rollups use ≈ 200–2,200 a day) | see [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Cron triggers | 5 per account | see [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |

Each page view adds one Worker request (the beacon) plus one per sampled vitals view; the script itself is a free static asset. Rough sizes, assuming about 3 cached asset requests per page: a site with 1,000 views a day uses about 5 % of Free's requests; at 20,000 views a day a Free account is over its limit with or without analytics (Free carries about 25,000 views a day without analytics and 19,000 with, 21,000 with vitals off); 200,000 views a day needs Paid, about $11–12 a month in total, of which about $2.20 is analytics. On Free, Studio warns when yesterday's traffic approaches the limit (set "Cloudflare plan" in Site settings › Analytics). Whether the Analytics SQL binding works on Workers Free, and whether its queries count against the 10,000 a day, is not verified yet ([RFC-0006](../../docs/rfcs/0006-site-analytics.md) step 0): if it does not, visits are still recorded and Studio says it can't read them yet.

**Commands:**
- `cloudhal analytics status [--remote]`: effective settings, the store and reader, the last rolled-up day, the query budget and yesterday's request estimate; `--remote` asks the deployment (deployment token).
- `cloudhal analytics rollup [--days <n>] [--remote] [--redo]`: compute daily totals for finished days. `--remote --days 90` backfills a deployment from WAE (it keeps 3 months), a few site-days per request until none are pending. `--redo` recomputes days already done (local only).
- `cloudhal analytics seed [--days <n>] [--views <n>]`: deterministic demo traffic (default 30 days, about 120 views a day) over the published pages, in the local SQLite only; never touches a deployment.
- `cloudhal analytics export [--from <date> --to <date>] [--remote] [--out <file>]`: daily totals as CSV (default: the last 30 days). There is nothing per visitor to export.

Locally, `cloudhal studio` reads the project's SQLite (`analytics_events`), rolls up finished days at start and hourly, and prunes raw events older than `rawRetentionDays`; `cloudhal mcp` reads the same data for the analytics tools. `cloudhal dev` records only with `analytics.dev`.

### Migrating tags to terms (RFC-0002)

`cloudhal migrate tags-to-terms` moves the deprecated `ContentEntry.tags` of the local site into terms of the `tag` taxonomy. It snapshots the site first (`before tags-to-terms`; its id is the migration id), creates the default `category` and `tag` taxonomies if they are missing (`category` is not required on an existing site), creates one active tag per distinct slug, rewrites entries in batches of 200 and snapshots again (`tags-to-terms`). An interrupted run resumes; a second run does nothing. Nothing goes live until you publish. `--dry-run` reports what would change; `--revert <id>` restores the tags of entries nobody edited since, then removes the terms and taxonomies the run created that are no longer used.

### Deploying to Cloudflare (ADR-0012)

`cloudhal deploy` uses **your** wrangler login (`npx wrangler login`, or `CLOUDFLARE_API_TOKEN`); Cloudhal never reads those credentials. It creates the D1 database and R2 bucket if needed, generates the deployment secrets once into `.cloudhal/deploy/secrets.json` (0600 — keep it out of git), builds and deploys the **site Worker** (Astro on demand, edge-cached) and the **admin Worker** (Studio, API, auth, MCP), and on the first deploy pushes your local site.

**Custom domain.** `cloudhal domain set news.example.com --studio studio.example.com` records the hostnames in `cloudhal.json`; the next `cloudhal deploy` routes them to the Workers as [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) (the zone must be in the same Cloudflare account — Cloudflare creates the DNS record and certificate) and makes the site's one its primary hostname, so preview links use it (canonical URLs in the starter are not rendered yet). The workers.dev addresses keep working. `cloudhal domain remove` and a deploy undo it.

After that the deployment is the source of truth — agents edit it there. `cloudhal push` refuses to overwrite content that changed remotely; `cloudhal pull` brings it home. `--dry-run` bundles both Workers with the real wrangler without an account.

Publishing and rollback never rebuild anything: the site Worker follows the published snapshot pointer and the admin Worker purges its cache. Preview links (`?cloudhal-preview=…`) show drafts on the real site.

`cloudhal mcp` is what you register in Claude Code / Cursor / any MCP client:

```json
{ "mcpServers": { "cloudhal": { "command": "cloudhal", "args": ["mcp"], "cwd": "/path/to/site" } } }
```

The local developer owns the project, so the default scopes are `*`; publish, rollback and delete still stop for approval inside the client (or hand back a `confirmToken` when the client cannot elicit). `--scopes site:read,content:write` narrows what the client may do. Skills come from `<project>/skills` or the bundled `skills/official`.

Everything runs offline: the project's `.cloudhal/` holds `data.db` (SQLite) and `blobs/`. `cloudhal.json` records the site id.

Inside the monorepo the bin runs as TypeScript on Node 24 (type stripping): `node packages/cli/bin/cloudhal.ts init examples/my-site`. Projects created under `examples/` are workspace-linked; elsewhere, `workspace:*` dependencies are rewritten to published versions.

`cloudhal dev` cannot run inside a Vitest worker (Astro disables its dev middleware when `VITEST` is set); the e2e test spawns the bin as a child process.
