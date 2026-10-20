# ADR-0036: Multi-site installations — one Studio, one D1/R2, many isolated sites served by hostname

- Status: Accepted (2026-10-19, by Halil)
- Date: 2026-10-19
- Related:
  - RFC-0034 and the Studio multilingual UX report (internal)
  - RFC-0033 / ADR-0035 (Site = publication, cross-site translation groups)
  - RFC-0018 (one theme per renderer)
  - RFC-0005 (per-site roles)
- Sources:
  - [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
  - [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
  - [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  - [Workers Cache purge](https://developers.cloudflare.com/workers/cache/purge/)
  - [Storyblok multi-space](https://www.storyblok.com/docs/manuals/multi-space-orchestration)

## Context
Every Cloudhal site is a whole installation today: a site Worker, an admin Worker (Studio), a D1 and an R2 for one `CLOUDHAL_SITE_ID`. A second site means a second Studio, login, team and deploy. On Workers Free that stops at 10 sites (D1 count) and on Paid at 250 (Worker count). The data model is already keyed by `site_id` and Studio already lists sites, but nothing adds a second site to an installation. Self-hosted users want independent sites (`en.example.com`, `tr.example.com`, client sites, journals) run by one team from one login.

## Decision
1. **Installation = management boundary; site = isolation boundary.**
   - An installation is one Studio, one D1 and one R2 in one Cloudflare account.
   - Within it, each site has its own content, settings, members, keys, analytics and comments.
   - Roles are per site.
   - Nothing crosses sites except opt-in translation-group links.
2. **Sites are created inside an installation** from Studio, the CLI or MCP (`site:create`). They start empty, or copy structure from another site as a language edition. Creating a site never copies readers' data, members or credentials, and never publishes.
3. **Every site can be exported whole and deleted whole on its own** (`site:export`, owner-only `site:delete`).
4. **Serving by hostname.**
   - A `site_hosts` D1 table, written only by the API and unique on `host`, maps hostnames (including per-locale domains) to sites.
   - A site Worker with `sites: [...]` serves only that allow-list. Any other host gets a 404, never another site.
   - The table is cached in isolate memory for 60 s and refreshed on purge.
   - Purges are tag-only in multi-site mode.
5. **One theme per site Worker, several site Workers per installation.** A site Worker attaches to an existing installation's D1/R2 and registers in `site_workers`, so sites with different themes still share one Studio.
6. **Single-site installations are unchanged.** `siteId` keeps today's exact config, and the new paths are inactive without `sites`.
7. **Out of scope:**
   - sites in other Cloudflare accounts under one Studio (remote installations);
   - per-site D1 databases;
   - hosted-Cloud custom hostnames;
   - project-level roles.

## Addendum (2026-10-19)
Roles are deployment-wide today (RFC-0005). Per-site roles (decision 1) arrive in phase A2, before Studio can create sites:
- a `site_members` table;
- owners and administrators stay installation-wide;
- other roles with site rows are limited to those sites.

## Alternatives considered
- One installation per site (status quo).
- One D1 per site under one Studio.
- A host map in Workers KV.
- A host map baked into the build.
- Several themes in one site Worker.
- Workers for Platforms.

The reasons each was rejected are in RFC-0034's table.

## Consequences
- **Positive.**
  - One login and team for any number of sites.
  - Site count is no longer bounded by Workers or D1 counts.
  - `en`/`tr` subdomains, client sites and journal portals all fit.
  - Sites stay portable through export and import.
- **Negative.**
  - All sites share one database's size (500 MB on Free, 10 GB on Paid) and the account's request quota.
  - Deleting or exporting a site walks every site-keyed table, so new tables must register for both.
- **Risks.**
  - A missing `site_id` check in a new route would leak across sites. The shared API suite gains a two-site isolation test that every route family must pass.
  - Host conflicts in old data are reported and skipped by the migration.
