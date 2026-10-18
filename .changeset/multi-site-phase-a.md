---
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": patch
"@cloudhal/cli": minor
---

Multi-site installations, phase A (RFC-0034 / ADR-0036). One installation can now hold several isolated sites.

**Storage**
- Migration `0027_multi_site` adds two tables:
  - `site_hosts`: one hostname belongs to one site;
  - `site_workers`: the registry later phases fill.
- Existing sites' domains are backfilled; the oldest site keeps a contested hostname.

**core-ts**
- Site writes and site imports keep `site_hosts` in step. A hostname another site holds is refused with `host_taken` (409).
- `seedStarterSite` can add a site to an existing project.
- `deleteSiteData` removes one site's rows and media in resumable chunks. `SITE_TABLES` is checked against every table with a `site_id` column.

**API (deployment token)**
- `GET /api/admin/sites`
- `POST /api/admin/sites`
- `DELETE /api/admin/sites/:siteId`, which needs the slug as confirmation and never deletes the last site.

**CLI**
- `cloudhal site list | create | delete`, locally or with `--remote`.
