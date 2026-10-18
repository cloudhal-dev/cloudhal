# RFC-0034: Multi-site installations: one Studio, many isolated sites

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related:
  - RFC-0033 §7 and §9: "multi-site serving" is named there as the follow-up; phase F (the newsroom's English edition) depends on it.
  - [Studio UX report](../reports/2026-10-multilingual-studio-ux.md): when to choose languages in one site and when to choose separate sites.
  - RFC-0018: one theme per site Worker (this RFC keeps the rule and moves it from the deployment to the site Worker).
  - RFC-0005: per-site roles and the deployment Owner; RFC-0006 / RFC-0007: same-origin host checks.
  - ADR-0012: site Worker entry and workerd prelude.

## Summary
One self-hosted Cloudhal installation (one Studio, one D1, one R2 in one Cloudflare account) manages any number of sites. Each site is isolated: its own content, settings, members, keys, analytics and comments, exportable and deletable on its own. Sites are created from Studio or the CLI, starting empty or copied from another site as a language edition. They are served by one or more site Workers that pick the site from the hostname, so `en.example.com` and `tr.example.com` can be two independent sites run by the same team from one login. A site Worker carries one theme, so sites with different themes get different site Workers in the same installation. One-site installations keep working unchanged.

## Motivation
- **Today, every site is a whole installation.** `cloudhal deploy --name X` creates `X-site`, `X-admin` (Studio and API), `X-db` and `X-blobs` for exactly one site (`CLOUDHAL_SITE_ID`). A second site means a second Studio URL, a second login, inviting the team again, and a second deploy.
  - The data model is ready for more: every table is keyed by `site_id`, Studio has a site list and switcher, and `projects` / `Site.projectId` exist.
  - But Studio says "sites are created with the CLI" (`SitesPage.tsx`), and nothing adds a second site to an existing installation.
- **Who needs it.** All of them are self-hosted, open-source users; this RFC is not about a hosted Cloud.
  - The newsroom with an English edition: RFC-0033 phase F.
  - A team running `en.example.com` and `tr.example.com` as independent sites.
  - An agency with ten client sites, each client seeing only their own.
  - A journal portal with one site per journal, each with its own theme.
- **Research** (UX report §3) shows that separate sites suit divergent structure, separate teams, independent release rhythm, or separate domains. Their usual cost is management overhead. This RFC keeps the separation and removes the overhead.

## Proposal

### 1. Terms
- **Installation:** one Studio (the admin Worker), one D1 database and one R2 bucket in one Cloudflare account. It is the management boundary: one login, one member list, one installation Owner (RFC-0005).
- **Site:** a publication inside an installation. It is the isolation boundary for content and people.
- **Site Worker:** a deployed renderer with one theme. It serves one or more sites of its installation, chosen by hostname.
- **Project** (exists, unused today): an optional grouping of sites inside an installation, for example the en and tr editions of one publication, or one client's sites. It only affects how Studio groups and summarises sites; it is not an isolation boundary.

### 2. Isolation guarantees
A site in a multi-site installation is as independent as a site in its own installation, except for physical storage.
- **Content:** every row is scoped by `site_id`, and every API route checks the caller's role on that site (RFC-0005). Nothing is shared between sites unless someone links it on purpose. A cross-site translation group (RFC-0033 §7) is the only link, and it is opt-in.
- **People:** roles are per site. A member sees only the sites they hold a role on. The installation Owner and admins can create sites and grant roles; they do not get content roles on every site automatically.
- **Keys and agents:** API keys and MCP sessions are issued per site, as today.
- **Readers' data:** analytics, comments, commenter emails and search indexes are per site.
- **Export:** `cloudhal pull --site <id>` and `GET /api/admin/sites/:id/export` produce the whole site: nodes, snapshots, assets, settings, and optionally comments. It can be imported into another installation with `cloudhal push`, so a site can leave with its data.
- **Delete:** `DELETE /api/admin/sites/:id`, owner-only, with a typed confirmation. It removes the site's rows in guarded batches, deletes its R2 objects, its host rows and its cache, and is resumable if interrupted.
- **What is shared:** the D1 database (500 MB on Workers Free, 10 GB on Paid), the R2 bucket, the installation's Cloudflare account limits, and its uptime. A site that needs physical separation stays a separate installation (§8).

### 3. Creating sites
- **API:** `POST /api/admin/sites { name, slug, defaultLocale, locales?, projectId?, from? }`, scope `site:create` (installation Owner and admins).
  - `from` absent creates an empty site seeded like `cloudhal init` (home page, system pages, starter settings).
  - `from: { siteId, copy: "structure" | "structure+translate" }` is the edition flow (§6).
- **CLI:** `cloudhal site create --name … --locale en [--from <siteId>]` and `cloudhal site list`.
- **Studio:** Sites gets a "New site" action, which replaces today's "created with the CLI" note. It asks for name, language and theme (one of the installation's site Workers), and optionally "copy structure from…".
- **MCP:** a `create_site` tool with the same scope. It never publishes.

### 4. Serving: site Workers and hostnames
- **Host table** (D1, written only by the API):
  ```sql
  CREATE TABLE site_hosts (
    host    TEXT PRIMARY KEY,      -- lower case, no port
    site_id TEXT NOT NULL,
    locale  TEXT,                  -- a per-locale domain (Site.localization.domains)
    primary_host INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX site_hosts_site ON site_hosts(site_id);
  ```
  - It is derived from `Site.domains` and `Site.localization.domains` and rewritten in the same `batch()` as the site update, guarded on the site's new content hash (hard rule 4).
  - Because `host` is the primary key, a hostname belongs to one site. The API answers `409 host_taken` before writing.
- **Site Worker registry** (D1):
  ```sql
  CREATE TABLE site_workers (
    name      TEXT PRIMARY KEY,    -- the Worker's script name
    url       TEXT NOT NULL,       -- where the admin Worker sends purges
    theme     TEXT NOT NULL,       -- manifest name@version
    site_ids  TEXT NOT NULL        -- JSON array: the sites it may serve
  );
  ```
  - `cloudhal deploy` writes the Worker's row.
  - The admin Worker sends a site's purge to the Worker that serves it.
  - Every site Worker of an installation shares the installation's purge token.
- **Deploying site Workers.** `cloudhal.json` takes either `siteId` (today, unchanged) or `sites: ["site_…", …]`; the two are mutually exclusive.
  - The first `cloudhal deploy` creates the installation as today.
  - Another project directory (another theme, or the same theme for another group of sites) deploys only a site Worker into the existing installation with `"installation": "<name>"` in its `cloudhal.json`. The Worker binds the installation's D1 and R2 (`databaseName` / `bucketName` already exist in the deploy config) and registers in `site_workers`.
  - With `sites`, the Worker gets `CLOUDHAL_SITE_IDS`. That list is its allow-list.
- **Resolution in the Worker** (`resolveSite(request)`, a new module next to `runtime-workerd.ts`):
  1. Single-site mode: `CLOUDHAL_SITE_ID`, exactly as today.
  2. Multi-site mode, up to 1,000 hosts: the host rows of the allowed sites are loaded into isolate memory. They are reloaded when older than 60 s and on every purge call. Beyond 1,000 hosts, each host is looked up on first use and cached for 60 s.
  3. An unknown host, or one whose site is not in the allow-list, gets a plain 404, cached for 60 s. No other site's content is ever served for it.
  4. The Worker's `*.workers.dev` hostname serves the first site in `sites`, marked `noindex`, so a fresh deploy has something to check.
- **Per-site state.** `getResolver(siteId)`, media, search, feeds and the analytics and comments settings use the resolved id. The module-level caches become maps keyed by `siteId`. Same-origin checks (RFC-0006 §5.2, RFC-0007 §6.2) read the site's host rows. `CLOUDHAL_SITE_HOSTS` keeps working in single-site mode.
- **Cache.** The edge cache key already contains the host. Every response, 404s included, carries `cloudhal-site-<id>`. In multi-site mode, purges use tags only, never `purgeEverything`, so one site's publish never empties another site's cache.
- **Locale domains** (RFC-0033 §4) are host rows with `locale` set; the host decides the locale before the path, as today.

### 5. Domains
- `cloudhal deploy` writes one route (`custom_domain: true`) for every host of the sites a site Worker serves, read from the API.
- `cloudhal domains sync` updates only the routes, so a domain added in Studio is live without a rebuild. Studio tells the user to run it, and shows each host's state (pending, live, error).
- Cloudflare's own limits apply per zone: 100 custom domains and 1,000 routes. Subdomains of one zone (`en.example.com`, `tr.example.com`, `client3.example.com`) count against the same zone.

### 6. Language editions
A site created with `from` (§3):
- **Copies:** the theme settings, design and tokens; menus (labels copied, page items kept as structure); taxonomies and terms (labels for the new locale left empty); and the system pages and home page, as drafts in the new default locale.
- **Never copies:** articles, comments, analytics, members (the requester becomes the owner) or API keys.
- **Assets** are copied as rows and server-side R2 copies (`media_blobs` is keyed by `(site_id, sha256)`), with no re-upload.
- **Translation groups:** copied pages join cross-site groups with `source.siteId`, starting `linked` (RFC-0033 §4a), so structural changes arrive as drafts. Editors can switch a page to `independent`. With `structure+translate`, agent translations are queued as drafts through the existing pipeline (`save_translation`, glossary, review). Nothing auto-publishes.
- **Write discipline:** a series of guarded `batch()` calls. The new site's id is chosen up front and returned at once; a retry resumes rather than duplicates. Progress shows in Studio.

### 7. Studio
- **Sites screen:** a "New site" action (§3), each site's primary host and theme, and grouping by project when there is more than one.
- **Switcher:** the sidebar's site switcher lists only the sites the user holds a role on, grouped by project.
- **Project overview** (`dashboard` template), shown when a project has more than one site: one row per site with publish state, pending approvals and translation coverage. Actions: "New site in this project", "New edition".
- **Translations:** the coverage view gains a scope, "This site / All sites in the project". Cross-site group members link to their own site's editor.
- **Language settings guide** (UX report §4b): "Add a language here" next to "Create a separate site / edition", with what each gives up. Languages in one site stay the recommended default.

### 8. Out of scope
- **Sites in different Cloudflare accounts under one Studio.** A Worker can bind only its own account's D1 and R2, so this would need Studio to manage remote installations over HTTP. That is a later RFC. Until then, a site that must live in another account (for example a client's own) is a separate installation.
- **Separate storage per site under one Studio** (a D1 per site): for data residency or very large sites. It would need per-site bindings and is a later RFC. Today's answer is a separate installation.
- **Hosted Cloud custom hostnames** (Cloudflare for SaaS): the host table is designed to fit it, but it is not built here.
- **Project-level roles:** open question 1.

### Invariants
1. A hostname resolves to at most one site, enforced by the `site_hosts` primary key and checked by the API before writing.
2. A site Worker serves only the sites in its allow-list. Anything else is a 404, never a fallback to another site.
3. Every API read and write is scoped to one site and checked against the caller's role on it. Nothing crosses sites except opt-in translation-group links.
4. In multi-site mode no purge empties another site's cache: tags only.
5. One-site installations (`siteId`) behave exactly as before. The new paths are inactive without `sites`.
6. A site Worker serves only sites designed for its theme (`Site.theme.name` matches its manifest). A mismatch blocks the deploy and is flagged in Studio.
7. Creating a site never copies readers' data, members or credentials, and never publishes.
8. A site can always be exported whole and deleted whole on its own.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| One installation per site (status quo) | Full physical isolation | One Studio, login, team and deploy per site | The overhead this RFC removes; kept for sites that need physical separation |
| One D1 per site under one Studio | Physical data separation | A binding per site means a redeploy per new site; cross-site views need fan-out queries | Later RFC (§8); logical isolation covers the users above |
| Host map in Workers KV | Fast global reads | A new binding; eventually consistent; a second store to keep in sync with D1 | D1 is already bound; the table is tiny and cached with the same 60 s staleness |
| Host map baked into the build | No runtime lookup | Every domain change needs a rebuild | `domains sync` already needs only a route update |
| Several themes in one site Worker | One Worker for everything | Bundle size, test matrix (RFC-0018) | Several site Workers per installation give the same result |
| Workers for Platforms | Per-site code | Paid product, more parts | Not needed for open-source installations |

## Capacity
What one installation can hold, from Cloudflare's published limits (Workers and D1 limits pages, checked 2026-10-18):

| Limit | Workers Free | Workers Paid |
|---|---|---|
| Workers per account | 100 | 500 |
| D1 databases per account | 10 | 50,000 |
| D1 database size (all sites of an installation share it) | 500 MB | 10 GB |
| Custom domains per zone | 100 | 100 |
| Routes per zone | 1,000 | 1,000 |

- **An installation needs** 1 admin Worker plus 1 site Worker per theme in use, 1 D1 and 1 R2.
- **Number of sites:** not limited by Workers, because one site Worker serves any number of sites. In practice it is limited by:
  - the shared database size: text content is small and media lives in R2, so tens of sites fit on Free and hundreds on Paid;
  - 100 custom domains per zone;
  - the account's request quota.
- **Today, for comparison:** every site costs 2 Workers and 1 D1. Workers Free stops at 10 sites (the D1 limit) and Paid at 250 (the Worker limit).

## Compatibility & migration
- **Contracts:** none. `Site.domains`, `Site.localization.domains`, `Site.projectId` and `Project` exist. `site_hosts` and `site_workers` are storage tables. `schemaVersion` is unchanged.
- **Migration** `00xx_multi_site.ts`: create both tables and backfill hosts from every site's domains. A conflicting host is reported, the later one is skipped, and Studio shows it as a domain error. The installation's existing site Worker is registered on its next deploy.
- **CLI:** `sites` and `installation` are additive. An existing `cloudhal.json` with `siteId` produces exactly today's config, and tests pin it.
- **Rollout, in order, one PR each:**
  - A: the tables, plus site create, export and delete in the API and CLI;
  - B: Worker resolution and per-site caches, tested on workerd with two sites and two hosts;
  - C: CLI `sites`, `installation`, routes, `domains sync`, and the `site_workers` purge;
  - D: Studio "New site", grouped switcher, project overview;
  - E: editions (`from`);
  - F: cross-site coverage and the language-settings guide;
  - then RFC-0033 phase F on top.
- **Rollback:** switch `cloudhal.json` back to `siteId` and redeploy. The tables are ignored in single-site mode.

## Security & policy impact
- **Isolation within an installation:** invariants 1–4. The cache key includes the host, and purge tags are per site.
- **New scopes:**
  - `site:create`: installation Owner and admins; also used for editions.
  - `site:delete`: Owner only, typed confirmation, audited.
  - `site:export`: site owners.
  - `project:read`: implied by any role on a site of the project, limited to those sites.
- **Domain claims:** adding a host needs `site:settings`. Cloudflare's custom-domain route proves control of the zone at `deploy` / `domains sync`.
- **Site Workers attaching to an installation:** a site Worker binds the installation's D1 and R2 directly, so attaching one requires Cloudflare account access (wrangler login) and the installation's purge token. These are the same powers as deploying the installation itself.
- **MCP:** `create_site` follows the same rules: no publish, audited.
- **Preview tokens and cookies** are per host, so a preview link for one site does not open another.

## Open questions (recommendations given)
1. **Project-level roles** (a "project admin" over all its sites)? *Recommend: defer.* Per-site roles, plus "invite to every site in this project" as a convenience.
2. **Should installation admins see every site's content by default?** *Recommend: no.* They manage sites and roles. They can grant themselves a role, and that grant is audited.
3. **Shared media across sites without copying?** *Recommend: copy for now.* A project media library is a later RFC.
4. **Copied pages in an edition: `linked` or `independent` by default?** *Recommend: `linked`* (§6).
5. **One analytics dataset per installation or per site?** *Recommend: per installation,* filtered by `site_id`, which rows already carry.

## References
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Workers custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Workers Cache purge by tag: https://developers.cloudflare.com/workers/cache/purge/
- Workers KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Storyblok multi-space orchestration: https://www.storyblok.com/docs/manuals/multi-space-orchestration
- Contentful localization strategies (space-level): https://www.contentful.com/help/localization/field-and-entry-localization/
- Google, cross-domain hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
