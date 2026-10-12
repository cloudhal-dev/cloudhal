---
"@cloudhal/cli": minor
"@cloudhal/comments": minor
"@cloudhal/api": minor
"@cloudhal/cloudflare": minor
---

Reader comments, rollout step 10 (RFC-0007): CLI, deployment and docs.

- **`cloudhal.json` → `comments`**: `{ available, rateLimit }`. Comments are available unless `available` is `false`, and stay off for every site until someone turns them on in Studio. `cloudhal init` writes `{ "available": true }`.
- **`cloudhal deploy`**:
  - generates `CLOUDHAL_COMMENTS_KEY` once into `.cloudhal/deploy/secrets.json` (0600) and binds it to both Workers as a secret, never printed or written into a config;
  - sets `CLOUDHAL_COMMENTS_AVAILABLE` on the admin Worker;
  - keeps the hourly cron trigger for comments even when analytics are off. Without a free cron slot it sets `CLOUDHAL_COMMENTS_CRON=off`, and the admin Worker runs the comments job after requests, at most hourly;
  - adds the `COMMENTS_RL` Rate Limiting binding with `comments.rateLimit`, and sets `CLOUDHAL_SITE_HOSTS` for a custom domain whatever analytics say;
  - purges the site cache once when availability changes;
  - asks where a new D1 database should live (`--jurisdiction eu` decides in advance; the choice cannot be changed later, and existing databases are never touched).
- **`cloudhal comments status|export|import`**, locally or `--remote` over the deployment token. The export is JSON lines; `--with-personal-data` adds commenters' emails and writes an owner-only file. The import is idempotent by id and importer origin, checks entries and parents, takes the site from the target and encrypts emails again under the target's key.
- **`cloudhal studio` and `cloudhal mcp`** run the hourly comments job on a timer (Node has no cron) and empty the local purge queue.
- **`@cloudhal/comments/sql`**: `exportPage`, `importLines` and `commentsStatus`.
- **`@cloudhal/api`**: the operator routes `GET /api/admin/sites/:siteId/comments/status|export` and `POST …/import`, declared in `ROUTE_SCOPES` and audited.
- **`@cloudhal/cloudflare`**: the `./comments` export and the on-request hourly job (`commentsHourlyDue`).
