# RFC-0034: Multi-site serving, projects and language editions

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related:
  - RFC-0033 §7 and §9: "multi-site serving" is named there as the follow-up; phase F (the newsroom's English edition) depends on it.
  - [Studio UX report](../reports/2026-10-multilingual-studio-ux.md): when to choose languages in one site and when to choose a separate edition.
  - RFC-0018: one theme per deployment; this RFC keeps that rule.
  - RFC-0005: per-site roles; RFC-0006 / RFC-0007: same-origin host checks for analytics and comments.
  - ADR-0012: site Worker entry and workerd prelude.

## Summary
One site Worker deployment can serve several sites of the same project. It resolves the site from the request's hostname through a host table that the API keeps. Studio gains a project overview, a "new edition from this site" flow, and translation coverage across sites, so mid-size teams can run language editions or several publications without managing one deployment per site. One-site deployments keep working unchanged.

## Motivation
- RFC-0033 offers two ways to publish in several languages: languages inside one site, or a separate site per edition joined by cross-site translation groups. The contract supports both, but only the first is practical today.
  - Each site Worker is bound to one `CLOUDHAL_SITE_ID` (`packages/cli/src/cloudflare/config.ts`, `astro-renderer/src/runtime-workerd.ts`), so every edition needs its own build, deploy, cache, analytics dataset and custom-domain setup.
  - Studio has no project level. `projects` exists in D1 and `Site.projectId` in the contract, but no API route or screen uses them, so editions appear as unrelated sites.
- Research (UX report §3) shows that separate sites or spaces suit divergent structure, separate teams, independent release rhythm, or separate domains and legal rules (Storyblok spaces, Contentful space-level). Their cost is management overhead and structure that drifts out of sync. This RFC removes most of that overhead so the choice is about content, not operations.
- Who it affects: the newsroom (an English edition, phase F), journal portals (one site per journal, RFC-0033 §7), and agencies running several small sites.

## Proposal

### 1. Serving: hostname → site
- **Deployment modes.** `cloudhal.json` takes either `siteId` (today, unchanged) or `sites: ["site_…", …]` (new; the two are mutually exclusive).
  - With `sites`, the site Worker gets `CLOUDHAL_SITE_IDS` (comma-separated) instead of `CLOUDHAL_SITE_ID`. It serves only those sites. That list is the deployment's allow-list.
- **Host table.** A new D1 table, written only by the API:
  ```sql
  CREATE TABLE site_hosts (
    host    TEXT PRIMARY KEY,      -- lower case, no port
    site_id TEXT NOT NULL,
    locale  TEXT,                  -- set for a per-locale domain (Site.localization.domains)
    primary_host INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX site_hosts_site ON site_hosts(site_id);
  ```
  - It is derived from `Site.domains` and `Site.localization.domains` and rewritten in the same `batch()` as the site update. The statements are guarded on the site's new content hash (hard rule 4).
  - `host` is the primary key, so one hostname can belong to only one site in the database. The API answers `409 host_taken` before writing.
- **Resolution in the Worker** (`resolveSite(request)`, a new module next to `runtime-workerd.ts`):
  1. Single-site mode: `CLOUDHAL_SITE_ID`, exactly as today.
  2. Multi-site mode: the whole host table for the allowed sites is loaded into isolate memory. It is a few rows per site. It is reloaded when it is older than 60 s and on every purge call. Lookup is by `URL.hostname`.
  3. An unknown host, or a host whose site is not in `CLOUDHAL_SITE_IDS`, gets a plain 404 that is cached for 60 s. No other site's content is ever served for it.
  4. The `*.workers.dev` hostname serves the first site in `sites`, so a fresh deploy has something to look at. It is marked `noindex`.
- **Everything already keyed by site** uses the resolved id. This covers `getResolver(siteId)`, media, search, feeds, analytics settings and comment settings. Module-level caches that assume one site become maps keyed by `siteId`: the analytics and comments settings caches and the purge resets.
  - Same-origin checks (RFC-0006 §5.2, RFC-0007 §6.2) use the site's rows in `site_hosts` instead of `CLOUDHAL_SITE_HOSTS`. In single-site mode `CLOUDHAL_SITE_HOSTS` still works.
- **Cache.** The edge cache key already contains the host. Every response, 404s included, carries `cloudhal-site-<id>`.
  - In multi-site mode, purges use tags only, never `purgeEverything`, because one site's publish must not empty another's cache.
  - The stale-404 case that `purgeEverything` covered today is handled by tagging 404s with the site tag.
- **Locale domains** (RFC-0033 §4) are rows with `locale` set. The locale is taken from the host before the path, as today.

### 2. Domains and deploy
- **Own zone (self-hosted, the default).** `cloudhal deploy` writes one `routes` entry (`custom_domain: true`) for every host of every listed site, read from the API. It still writes the single `domain` from `cloudhal.json` when that is set.
  - Adding a domain in Studio needs one redeploy, or the `cloudhal domains sync` command, which only updates routes.
  - Studio says which of the two is needed.
- **Cloudhal Cloud / many customer domains.** Cloudflare for SaaS custom hostnames, with this Worker as the fallback origin, so new domains need no deploy. It is specified here so the host table fits it, and built later with Cloud.
- **Analytics.** One Analytics Engine dataset per deployment. Rows already carry `site_id` (RFC-0006), so queries filter by it. No change is needed beyond writing the resolved id.

### 3. Themes: one theme per deployment, per-site design
- RFC-0018's rule stays: a deployment bundles one theme package.
  - Sites in a multi-site deployment share that package and each keeps its own theme settings, design tokens (RFC-0021/0023), menus, chrome and languages.
  - This covers editions and sister publications.
- A site whose `Site.theme.name` differs from the deployed manifest is refused at deploy (`cloudhal deploy` lists it) and flagged in Studio. Such a site goes in another deployment.
- Several theme packages in one bundle stays deferred (RFC-0018 alternatives: bundle size and test matrix).

### 4. Projects in the API and Studio
- **API**:
  - `GET /api/admin/projects` lists the projects the user can see.
  - `GET /api/admin/projects/:id` returns, for each site the user can see: name, primary host, default locale and locales, last publish, pending approvals, and translation coverage across sites.
  - `PATCH /api/admin/projects/:id` changes the name and slug only.
  - Sites already have `projectId`. Moving a site between projects is out of scope.
- **Roles stay per site** (RFC-0005). The project view shows only the sites in which the user holds a role. Project-level roles are an open question.
- **Studio**:
  - A project switcher in the sidebar header, above the site switcher, shown only when a project has more than one site.
  - A project overview screen (`dashboard` template): one row per site with publish state, approvals and coverage. Primary action: "New edition".
  - The Translations coverage view gains a scope "This site / All sites in the project". Cross-site group members link to their own site's editor.

### 5. New edition from a site
`POST /api/admin/sites/:id/editions { name, slug, defaultLocale, locales?, domain?, copy }`, where `copy` is one of `"structure"` or `"structure+translate"`.

- **Creates** a site in the same project with:
  - the theme name and settings, design and tokens;
  - menus (labels copied, items that point to pages kept as structure);
  - taxonomies and terms (labels for the new locale left empty);
  - system pages and the home page as drafts in the new default locale.
- **Never copies** articles, comments, analytics, members (the requester becomes the owner) or API keys.
- **Assets** are copied as references to the same blobs where storage allows; otherwise R2 server-side copies. `media_blobs` is keyed by `(site_id, sha256)`, so this is a row copy plus an R2 copy, with no re-upload.
- **Translation groups.** Copied pages join cross-site groups with `source.siteId`.
  - `structure+translate` also queues agent translations as drafts through the existing pipeline: `save_translation`, glossary, review. Nothing auto-publishes.
- **Write discipline.** The whole operation is a series of `batch()` calls, each guarded so a retry resumes rather than duplicates. The edition id is chosen up front and returned at once, and progress is shown in Studio. There are no interactive transactions (hard rule 4).
- The CLI equivalent is `cloudhal site edition <siteId> --locale en --name "…"`.

### 6. Studio guidance: languages in a site, or a new edition
Language settings show the choice from UX report §4b as a short comparison, with "Add a language here" and "Create an edition" side by side. The default and recommendation for most teams is languages in one site. The guide states what each option gives up: per-locale menus and rollback for the first, synced structure for the second.

### Invariants
1. A hostname resolves to at most one site, enforced by the `site_hosts` primary key and checked by the API before writing.
2. A multi-site Worker serves only the sites in its `CLOUDHAL_SITE_IDS`. Anything else is a 404, never a fallback to another site.
3. In multi-site mode no purge empties another site's cache: tags only.
4. Single-site deployments (`siteId`) behave exactly as before. The new code paths are inactive without `sites`.
5. All sites in one deployment use the deployed theme package. A mismatch blocks the deploy.
6. Creating an edition never copies readers' data (comments, analytics, subscribers), members or credentials, and never publishes.
7. Project views show only sites in which the user holds a role.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep one deployment per site (status quo) | Simple, full isolation | N builds, deploys, caches, domain setups; editions feel like strangers in Studio | The overhead this RFC exists to remove; still possible for sites that need it |
| Host map in Workers KV | Fast global reads | New binding; KV is eventually consistent (up to 60 s), and a second store must be kept in sync with D1 | D1 is already bound; the table is tiny and cached in memory with the same 60 s staleness |
| Host map baked into the build (`vars`) | No runtime lookup | Every domain change needs a redeploy, even with SaaS custom hostnames | Rules out Cloud; acceptable only for the routes themselves |
| Workers for Platforms (a Worker per site) | Per-site code and themes | Paid product, more moving parts | Kept as the option for custom code (RFC-0033 §7), not the default |
| Several themes in one bundle | Theme choice per site without a redeploy | Bundle size, test matrix (RFC-0018) | Deferred; separate deployments cover it |
| Project-level roles now | One invite for a whole portal | New role model, policy and audit surface | Open question; per-site roles work for the first users |

## Compatibility & migration
- **Contracts:** none. `Site.domains`, `Site.localization.domains` and `Site.projectId` exist already, and `site_hosts` is a storage table, not a contract. `schemaVersion` is unchanged.
- **Migration** `00xx_site_hosts.ts`: create the table and backfill it from every site's domains.
  - A conflicting host from data written before uniqueness was enforced makes the migration report the pair and skip the later one.
  - Studio shows it as a domain error on that site.
- **CLI:** `sites` is additive. An existing `cloudhal.json` with `siteId` keeps producing exactly today's config (tests pin it).
- **Rollout, in order, one PR each:**
  - A: host table, API writes and uniqueness;
  - B: Worker resolution and per-site caches, tested on workerd with two sites;
  - C: CLI `sites`, routes and `domains sync`;
  - D: projects API and Studio overview and switcher;
  - E: new edition (API, CLI, Studio);
  - F: cross-site coverage and the language-settings guide;
  - then RFC-0033 phase F on top.
- **Rollback:** switch `cloudhal.json` back to `siteId` and redeploy. The host table is ignored in single-site mode.

## Security & policy impact
- **Tenant isolation inside a deployment.**
  - The allow-list (invariant 2) and host uniqueness (invariant 1) stop one site from claiming another's hostname or being served under it.
  - The cache key includes the host, and purge tags are per site.
- **Domain claims.** Adding a host needs the existing `site:settings` scope. On the own-zone path, Cloudflare's custom-domain route proves zone control at deploy. On the SaaS path (later), hostname verification is Cloudflare's.
- **New scopes:**
  - `project:read` (implied by any role on a site of the project, limited to those sites);
  - `site:create` for editions, held by owners and admins of the source site.
  - Creating an edition is an audited action. It does not need approval because nothing is published.
- **MCP:** agents can create editions only with `site:create`, through a new `create_edition` tool that follows the same rules (no publish, audit).
- **Preview tokens and cookies** are per host, so a preview link for one site does not open another.

## Open questions (recommendations given)
1. **Project-level roles** (a "project admin" who sees and manages every site)? *Recommend: defer.* Per-site roles plus an "invite to all sites" convenience in the project overview.
2. **Should the `*.workers.dev` host serve the first site, or a 404 listing nothing?** *Recommend: the first site, `noindex`.* It keeps the post-deploy check (`cloudhal deploy`'s feed check) working.
3. **Shared assets across editions without copying?** *Recommend: copy for now* (`media_blobs` is per site). A project-level media library is a later RFC.
4. **Should an edition's structure keep following its source** (RFC-0033 §4a "linked" groups for pages)? *Recommend: copied pages start `linked`,* so structural changes arrive as drafts. Editors can switch a page to `independent`.
5. **Per-deployment analytics dataset or one per site?** *Recommend: one per deployment,* filtered by `site_id`, as rows already carry it.

## References
- Cloudflare Workers custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Cloudflare for SaaS, custom hostnames and fallback origin: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
- Workers Cache purge by tag: https://developers.cloudflare.com/workers/cache/purge/
- Workers KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Storyblok multi-space orchestration: https://www.storyblok.com/docs/manuals/multi-space-orchestration
- Contentful localization strategies (space-level): https://www.contentful.com/help/localization/field-and-entry-localization/
- Google, cross-domain hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
