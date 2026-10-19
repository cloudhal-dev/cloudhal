---
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
---

Several sites from one deployment, phase C1 (RFC-0034 §4–5).

**cli**
- `cloudhal.json` takes `sites`: the sites the site Worker serves, picked by hostname. The project's `siteId` always comes first.
- Before the build, `cloudhal deploy` asks the deployment for those sites. It refuses one that is missing, or one designed for another theme.
- Every hostname those sites hold becomes a Custom Domain route. The deploy writes `CLOUDHAL_SITE_IDS` for the site Worker and the admin Worker.

**cloudflare**
- Every purge the admin Worker sends names its site: publishes, releases, analytics and comments settings, comment purges and media takedowns. A multi-site Worker then purges only that site's tags.
- The scheduler's feed check reaches a multi-site Worker on the site's primary hostname.

See `docs/guides/multi-site.md`.
