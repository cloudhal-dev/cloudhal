---
"@cloudhal/cli": patch
"@cloudhal/api": patch
"@cloudhal/core-ts": patch
"@cloudhal/mcp-server": patch
---

A self-hosted site rebuilds itself on publish (#150). With `CLOUDHAL_SITE_BUILD=on`, which is the Docker image's default, `cloudhal studio` runs the image's `site-build` in a child process after every publish: a publish in Studio or through MCP, an approval, a rollback, or a release that goes live (at its time or through "Publish now"). It also runs it once at start.

- **One build per burst.** A burst of publishes builds once (3 seconds after the last one, at most a minute after the first).
- **One build at a time.** Studio's builds, a cron `site-build` and a hand-started one share one lock.
- **Failures keep the last good site.** A failed build keeps the previous site and is tried again on the next publish.
- **Bounded.** A build has a deadline (`CLOUDHAL_SITE_BUILD_TIMEOUT`, 30 minutes by default). Stopping Studio during a build ends it within 5 seconds, with everything it started, and records it as stopped.

Every build is recorded in the site's Activity as "Build public site", with its duration, snapshot and output on failure. The site's overview shows a new "Public site build" card with the same details, and what visitors see now from `/data/site/current.json`, which `site-build` writes after each swap, so builds from cron or by hand show there too. The failure's output is shown only to roles with `audit:read`. `CLOUDHAL_SITE_BUILD=off` turns both off for sites built elsewhere, and a plain `cloudhal studio` keeps it off. For other integrations, `ScheduledTickOptions.onReleasePublished` (core-ts) reports releases that went live, `ReleaseServiceOptions.onReleasePublished` (and the API's `SchedulesDeps.onReleasePublished`) reports a release published now, `openLocalStore` takes `onPublished`, and `GET /api/sites/:id/site-build` reports the queue, the last build and what is served.
