# @cloudhal/cli

```
cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
cloudhal studio [--port <n>] [--no-auth]                API + Studio UI (+ /mcp) for this project
cloudhal mcp [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                        MCP server over stdio for this project
cloudhal deploy [--name <base>] [--dry-run] [--jurisdiction eu] [--scheduler cron|alarm] [--plan free|paid]
                [--force-downgrade] [--no-build-studio] site + admin Workers on Cloudflare
cloudhal domain [set <hostname>] [--studio <hostname>] | remove [site|studio|all]
cloudhal push [--replace] [--cancel-schedules] [--admin-url <url>]
                                                        local site → deployment
cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]
                                                        entry tags → tag terms (RFC-0002)
cloudhal analytics status [--remote]                    site analytics (RFC-0006): settings, totals, budget
cloudhal analytics rollup [--days <n>] [--remote] [--redo]
                                                        daily totals (--remote backfills from WAE)
cloudhal analytics seed [--days <n>] [--views <n>]      demo traffic, local SQLite only
cloudhal analytics export [--from <date> --to <date>] [--remote] [--out <file>]
                                                        daily totals as CSV
cloudhal comments status [--remote]                     reader comments (RFC-0007): counts, daily cap, purges
cloudhal comments export [--remote] [--with-personal-data --out <file>]
                                                        comments as JSON lines
cloudhal comments import --in <file> [--remote]         idempotent; safe to run again
cloudhal schedules status [--remote]                    schedules (RFC-0008): scheduler health, open releases, gates
cloudhal schedules list [--remote] [--limit <n>]        the site's releases
cloudhal schedules run-due [--remote]                   one scheduler tick now
```

**Studio build.** The published CLI ships Studio prebuilt. Run from the monorepo, `cloudhal deploy` uploads `apps/studio/dist` and first checks that it is current: when it is missing, or its `index.html` is older than the newest file in `apps/studio/src`, `apps/studio/index.html` or `packages/ui/src`, it runs `pnpm --filter @cloudhal/studio build`. With `--no-build-studio` it never builds and fails on a missing or stale build instead.

### Schedules (RFC-0008)

Releases, embargoes and expiries, time zones, automations, recipes for scheduled agents and the Free-plan notes: [schedules](../../docs/guides/schedules.md).

**On Cloudflare.** `cloudhal deploy` gives the admin Worker one cron trigger, **every minute** (`* * * * *`): the scheduler's tick, which also runs the analytics rollup and the comments job behind hourly watermarks (at :17). It always declares the SQLite-backed `SchedulerClock` Durable Object (binding `SCHEDULER_CLOCK`, migration `v1`) and sets `CLOUDHAL_SCHEDULER`:
- `cron` (default): the trigger ticks;
- `alarm`: when Cloudflare refuses the trigger because the account's cron triggers are used up (Workers Free allows 5), the deploy goes on without it and the Durable Object's alarm ticks instead. The choice is kept in `.cloudhal/deploy/state.json`; `--scheduler cron` tries the trigger again, `--scheduler alarm` chooses the clock up front. Deployments that had `CLOUDHAL_ANALYTICS_CRON=off` or `CLOUDHAL_COMMENTS_CRON=off` move to `alarm` and lose those variables.

Every admin request is also a backstop: when the heartbeat is more than two minutes behind, it runs a tick in the background. The migration `0017_schedules` runs on the admin Worker's first request.

**Guards.**
- `deploy` refuses to deploy code with a lower schedules level (`cloudhal.schedulesLevel` of `@cloudhal/core-ts`) over a deployment that has open releases or gated pages and entries: older code ignores holds and gates. `--force-downgrade` overrides it.
- `push` refuses while the deployment has open releases (their pinned versions point into the graph a push replaces); `--cancel-schedules` cancels them first.

**Tick budget and the automations switch.** Every deploy writes `CLOUDHAL_TICK_BUDGET` and `CLOUDHAL_AUTOMATIONS` on the admin Worker:
- `CLOUDHAL_TICK_BUDGET=free` (default: 40 statements and one release per tick) or `paid` (900 statements and up to 50 releases): `cloudhal deploy --plan paid` or `cloudhal.json` `"schedules": { "plan": "paid" }`. The plan is remembered in `.cloudhal/deploy/state.json`; `--plan free` goes back. Wrangler's login cannot read the account's plan, so the deploy says which budget it used.
- `CLOUDHAL_AUTOMATIONS=off` with `"schedules": { "automations": false }` (else `on`): automations stop; releases and gates go on. On Node, `cloudhal dev`, `studio`, `mcp` and `schedules run-due` honour `CLOUDHAL_AUTOMATIONS=off` from the environment.

**Commands:**
- `cloudhal schedules status [--remote]`: the scheduler's mode and state (`running`, `late`, `stopped`, `unknown`), the last tick and the next wake, the code's schedules level, and each site's open releases and gated pages and entries.
- `cloudhal schedules list [--remote] [--limit <n>]`: the site's releases with their state, time and number of items.
- `cloudhal schedules run-due [--remote]`: one tick now. A self-hosted server without a long-running Cloudhal process runs it from the system's cron every minute.

`--remote` uses the deployment token and the operator routes `/api/admin/schedules/status|run-due` and `/api/admin/sites/:siteId/schedules/releases`.

**Locally.** `cloudhal dev`, `cloudhal studio` and `cloudhal mcp` run the same tick on a timer of at most 60 seconds, with a catch-up tick at start; several of them on one project are safe.

### Reader comments (RFC-0007)

Setup, moderation, agents, spam protection, privacy, erasure and a ready-made privacy paragraph (English and Turkish): [reader comments](../../docs/guides/comments.md).

Comments are **available** on a deployment unless `cloudhal.json` says otherwise, and **off for every site** until someone turns them on in Studio. A deploy never adds a comment form by surprise.

**`cloudhal.json` → `comments`:**

| Key | Default | Meaning |
|---|---|---|
| `available` | `true` (also when the block is missing) | `false` removes comments from the deployment: no endpoints, no script, no hourly comments work. `cloudhal init` writes `{ "available": true }`. |
| `rateLimit` | `false` | `true` or `{ "limit": 10, "namespaceId": "…" }`: a Workers Rate Limiting binding (`COMMENTS_RL`) on the site Worker that limits submissions per client across isolates (`limit` per 60 s, default 10; the namespace id is derived from the deployment name unless set). On top of the per-isolate and D1 limits, which work without it. |

**On Cloudflare.** `cloudhal deploy`:
- generates `CLOUDHAL_COMMENTS_KEY` once into `.cloudhal/deploy/secrets.json` (0600) and gives it to **both** Workers through `--secrets-file`; it is never printed or written into a config. Losing it makes stored emails and the Turnstile secret unreadable;
- sets `CLOUDHAL_COMMENTS_AVAILABLE` on the admin Worker;
- runs the hourly comments job on the scheduler's minute tick (behind an hourly watermark), even when analytics are off; without a free cron slot the tick is the `SchedulerClock` alarm ([Schedules](#schedules-rfc-0008));
- sets `CLOUDHAL_SITE_HOSTS` for a custom domain and, with `comments.rateLimit`, adds `COMMENTS_RL`;
- purges the site's cache once when availability changes.

The migration `0016_comments` runs on the admin Worker's first request. Existing deployments get comments on their next deploy, still off for every site.

**Data location.** A D1 database's jurisdiction is chosen when it is created and cannot be changed:
- the first `cloudhal deploy` in a terminal asks "Automatic" or "EU jurisdiction";
- `--jurisdiction eu` decides in advance (CI);
- a non-interactive first deploy without the flag uses the automatic location and says how to choose;
- once the database exists the flag changes nothing, and the deploy says so;
- to move, export the comments, deploy under a new `--name` with `--jurisdiction eu`, and import.

**Commands:**
- `cloudhal comments status [--remote]`: whether comments are available and the key is there, the site's switch, collections and protection, counts by status, the oldest pending comment, today's stored submissions against the daily cap, and the purge queue with the purge requests of the last minute (Workers Cache allows 5).
- `cloudhal comments export [--remote] [--with-personal-data --out <file>]`: JSON lines (a header, then one `Comment` per line, oldest first) to stdout or `--out`. `--with-personal-data` appends commenter lines with their email and needs `--out`, which is then written owner-only.
- `cloudhal comments import --in <file> [--remote]`: idempotent by id and by importer origin, in batches of 50 lines.
  - Each record must name an article of the target site, so push the site first.
  - The site comes from the target, statuses are kept, and emails are encrypted again under the target's key.
  - Replies whose parent arrives later are retried once.
  - Refused lines are listed with their line number, and the command exits 1.

`--remote` uses the deployment token and the operator routes `/api/admin/sites/:siteId/comments/status|export|import`; each call is audited as the operator.

**Locally.** `cloudhal dev` takes comments on the project's SQLite. The key is `CLOUDHAL_COMMENTS_KEY` from the environment, or `.cloudhal/comments.key` (random, created on first use, 0600). `cloudhal studio` and `cloudhal mcp` use the same store. Node has no cron, so their scheduler tick runs the hourly comments job (retention, comments of deleted articles, threads closed by time, old salts) behind its watermark, and they empty the local purge queue (there is no edge cache).

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
| `rateLimit` | `false` | `true` or `{ "limit": 120, "namespaceId": "…" }`: adds a Workers Rate Limiting binding (`ANALYTICS_RL`) that limits beacons per client across isolates (`limit` per 60 s, default 120; the namespace id is derived from the deployment name unless set). On top of the per-isolate limits; whether Workers Free offers the binding is unconfirmed. |

```json
{ "siteId": "site_…", "analytics": { "enabled": true, "vitalsOneIn": 5 } }
```

**On Cloudflare.** With analytics on, `cloudhal deploy` adds:
- to the site Worker, the WAE dataset `<deployment>_events` (binding `ANALYTICS`; Cloudflare creates the dataset on the first write) and the vars `CLOUDHAL_ANALYTICS=on`, `CLOUDHAL_ANALYTICS_DEFAULTS` and, with a custom domain, `CLOUDHAL_SITE_HOSTS`;
- to the admin Worker, the Analytics SQL binding (`ANALYTICS_SQL`), the vars `CLOUDHAL_ANALYTICS_DATASET`, `CLOUDHAL_ANALYTICS_BUDGET` and `CLOUDHAL_ANALYTICS_DEFAULTS`, and the hourly rollup on the scheduler's minute tick (behind a watermark at :17), which rolls finished days into D1, deletes old daily salts and applies retention.

It needs **wrangler 4.145 or newer** (the `analytics` config key); the deploy stops and says so when the project's wrangler is older. The migration `0014_analytics` runs on the admin Worker's first request. When analytics switch on or off, the deploy purges the site's cache once so pages gain or lose the script tag. Workers Free allows 5 cron triggers per account: when none is free, the admin Worker is deployed without one and the `SchedulerClock` Durable Object's alarm runs the tick instead, so daily totals are still rolled up on schedule ([Schedules](#schedules-rfc-0008)).

**Turning it on for an existing deployment.** Projects from before analytics have no `analytics` key. The next interactive `cloudhal deploy` asks once ("Turn on cookie-less analytics for <site>? (Y/n)") and writes the answer to `cloudhal.json`; a non-interactive deploy (CI) keeps analytics off and prints how to turn them on. To decide up front, add `"analytics": { "enabled": true }` (or `false`) and deploy. Adding a script to a live site changes what its privacy policy must say, so update it first ([guide](../../docs/guides/analytics-privacy.md#a-paragraph-for-your-privacy-policy)). Agent keys created before analytics do not get `analytics:read` automatically; allow it per key on Studio's Agents page.

**Limits and costs** (Cloudflare's published numbers as of 2026-10; WAE is not billed yet, its Paid prices are announced):

| | Workers Free | Workers Paid ($5/month) |
|---|---|---|
| Worker requests | 100,000/day, cache hits included | 10 M/month included, then $0.30 per million |
| WAE writes | 100,000/day | 10 M/month included, then $0.25 per million |
| WAE queries | 10,000/day | 1 M/month included, then $1.00 per million |
| D1 rows written | 100,000/day (rollups use ≈ 200–2,200 a day) | see [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Cron triggers | 5 per account (Cloudhal uses one, or a Durable Object alarm) | see [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |

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
