---
"@cloudhal/schedules": minor
"@cloudhal/core-ts": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

RFC-0008 rollout step 9: the built-in deterministic automations. `broken-links` (internal links, media references and menu targets of live content that resolve to nothing or to gated content, and the week's top 404 paths from analytics with a redirect proposal), `stale-content` (live entries not updated for `staleAfterDays`, default 365), `feed-check` (the site's own `/rss.xml` and `/sitemap.xml` fetched through the `SITE` binding or the local renderer: well-formed, complete, no future dates, the newest entries present, media live, and the gate self-check that no embargoed or expired node appears), `weekly-digest` (published, scheduled next week, needing attention, open findings) and `cleanup` (runs and their findings after 90 days, terminal releases after 400, finding lists over 200 trimmed, leftover leases cleared, stale open runs closed, reminders for drafts untouched for 90 days). Each runs in bounded, resumable steps within a declared statement cost (Workers Free: 40 per tick), with findings under stable codes (at most 200 per run, exact counts), run accounting (`counts.steps`, `counts.statements`), taint marking when a step reads visitor text or a fetched document, and notifications through a `ScheduleNotifier` seam after the run's end is committed.

- `@cloudhal/schedules`: `createBuiltinRunner` over `BuiltinSources`, the finding codes and types, `checkRss`/`checkSitemap`/`xmlProblem`, `ScheduleNotifier`; `runDue` records taint and accounting, honours `BuiltinRunner.costOf`, and delivers notifications; `SqlScheduleStore.startBuiltinNow`, `cleanupSite` and `digestData`.
- `@cloudhal/core-ts`: `@cloudhal/core-ts/automations` (`graphBuiltinSources`, `graphBuiltinRunner`, `notFoundFromAnalytics`); `runScheduledTick` steps the real jobs by default (`builtinInputs`, `notify`, `builtinOptions`).
- `@cloudhal/cloudflare`: the admin tick gives the jobs analytics' 404 rows and the site's feed through `SITE` (`CLOUDHAL_SITE_ID` limits it to the site the site Worker serves).
- `@cloudhal/cli`: `cloudhal deploy` sets `CLOUDHAL_SITE_ID` on the admin Worker; the Node ticker reads the local analytics (Studio) and the dev server's feed (`cloudhal dev`).
- `@cloudhal/api`: `POST …/automations/:id/run-now` runs built-ins (a manual run stepped by the next tick); the derived `automation-digest` notification carries the digest's summary and counts.
