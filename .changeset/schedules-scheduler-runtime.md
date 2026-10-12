---
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

The scheduler runs everywhere (RFC-0008 rollout step 6 and the deploy part of step 12).

- Admin Worker: one tick a minute runs due releases, automation occurrences and the hourly jobs behind `system_jobs` watermarks — the analytics rollup and the comments job keep their code and log lines, and `schedules.retention` runs daily. The `scheduled` handler ticks on cron; with `CLOUDHAL_SCHEDULER=alarm` the SQLite-backed `SchedulerClock` Durable Object (exported by the admin entry) ticks on its alarm, re-arms at the next due time (at most an hour away) and moves earlier when poked; admin requests run a tick when the heartbeat is more than two minutes behind. A published release's purge goes through the site Worker within the shared purge budget, or into the purge queue (`deferred`) when the bucket is empty. The request-time comments job and the `on-read` analytics rollups are gone: `CLOUDHAL_ANALYTICS_CRON=off`/`CLOUDHAL_COMMENTS_CRON=off` now read as `alarm`.
- `cloudhal deploy`: the minute cron trigger (`* * * * *`) replaces `17 * * * *` in the same slot, the clock's binding and migration are always declared, and `CLOUDHAL_SCHEDULER` is set; when Cloudflare refuses the trigger the deploy goes on with the alarm ("Cloudflare refused the cron trigger: … The scheduler runs on a Durable Object alarm instead.") and remembers it (`--scheduler cron` tries again). Deploying code with a lower schedules level over open releases or time gates is refused unless `--force-downgrade`.
- `cloudhal schedules status | list | run-due` (`--remote` with the deployment token); `cloudhal dev`, `studio` and `mcp` run the scheduler's Node ticker (catch-up at start, at most 60 s apart, poked when something becomes due); `cloudhal push` refuses while the deployment has open releases unless `--cancel-schedules`.
- API wiring: `ApiDeps.scheduler` (mode, poke, a tick on demand), the deploy-token routes `GET /api/admin/schedules/status`, `GET /api/admin/sites/:siteId/schedules/releases` and `POST /api/admin/schedules/run-due`, and the bundle import's `schedules_pending` guard.
