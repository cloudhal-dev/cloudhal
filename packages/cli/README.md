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

`cloudhal.json` → `analytics` sets the deployment defaults: `enabled` (on when the block is there; `cloudhal init` writes `{ "enabled": true }`), `uniqueVisitors`, `vitalsOneIn` (0, 1, 2, 5, 10, 20), `queryBudget` (uncached WAE queries per UTC day, default 8000), `rawRetentionDays` (SQLite, default 90) and `dev` (record `cloudhal dev` traffic). With analytics on, `cloudhal deploy` gives the site Worker a Workers Analytics Engine dataset (`<deployment>_events`, binding `ANALYTICS`) and the `CLOUDHAL_ANALYTICS*` vars, and the admin Worker the Analytics SQL binding (`ANALYTICS_SQL`, no API token), its vars and an hourly cron trigger (`17 * * * *`) for the daily rollups. It needs wrangler 4.145 or newer. When analytics switch on or off, the deploy purges the site's cache once so pages gain or lose the script tag. A project without the key (from before analytics) is asked once in a terminal; a non-interactive deploy keeps analytics off and says how to turn them on. When the account has no free cron trigger (Workers Free allows 5), the admin Worker is deployed without one and daily totals are computed when someone opens Analytics.

Locally, `cloudhal studio` and `cloudhal mcp` read the project's SQLite (`analytics_events`) and roll up finished days hourly. `cloudhal analytics seed --days 30` fills demo traffic for Studio work; `rollup --remote --days 90` backfills a deployment from WAE (3 months are kept there); `export` writes the daily totals as CSV — there is nothing per visitor to export.

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
