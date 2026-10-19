---
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
"@cloudhal/api": minor
---

Site Workers with another theme join an installation, phase C2 (RFC-0034 §4).

**cli**
- `cloudhal.json` takes `installation`, a path to the installation's project. With it, `cloudhal deploy` deploys only a site Worker, named `<installation>-site-<slug>`:
  - it uses the installation's D1 database, R2 bucket, analytics dataset and shared secrets;
  - it pushes this project's site to the installation if the site is not there yet;
  - it registers the Worker with the installation.
- The installation's own deploy binds every registered Worker to its admin Worker (`SITE_1`, `SITE_2`, …) and writes the `CLOUDHAL_SITE_ROUTES` table.

**cloudflare**
- `routedSite` sends each purge to the Worker that serves the `siteId` in its body.
- `bindingFor` does the same for the feed check.
- Sites without a route go to `SITE`, as before.

**api**
- New operator routes: `GET /api/admin/site-workers`, and `PUT` and `DELETE /api/admin/site-workers/:name`.
