---
"@cloudhal/cli": minor
"@cloudhal/api": minor
"@cloudhal/core-ts": minor
---

Custom domains: `cloudhal domain set <host> [--studio <host>]` / `remove`; `cloudhal deploy` routes them as Cloudflare Custom Domains and makes the site's one primary through `PUT /api/admin/sites/:id/domains` (workers.dev stays secondary). `core-ts` exports `normalizeHostname`, `isHostname`, `withPrimaryDomain`.
