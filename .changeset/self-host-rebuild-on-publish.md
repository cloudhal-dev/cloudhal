---
"@cloudhal/cli": patch
"@cloudhal/api": patch
"@cloudhal/core-ts": patch
---

A self-hosted site rebuilds itself on publish (#150). With `CLOUDHAL_SITE_BUILD=on`, which is the Docker image's default, `cloudhal studio` runs the image's `site-build` in a child process after every publish: a publish in Studio or through MCP, an approval, a rollback, or a scheduled release that goes live. It also runs it once at start.

- **One build per burst.** A burst of publishes builds once (3 seconds after the last one, at most a minute after the first).
- **One build at a time.** Studio's builds, a cron `site-build` and a hand-started one share one lock.
- **Failures keep the last good site.** A failed build keeps the previous site and is tried again on the next publish.

Every build is recorded in the site's Activity as "Build public site", with its duration, snapshot and output on failure. The site's overview shows a new "Public site build" card with the same details. `CLOUDHAL_SITE_BUILD=off` turns both off for sites built elsewhere, and a plain `cloudhal studio` keeps it off. For other integrations, `ScheduledTickOptions.onReleasePublished` (core-ts) reports releases that went live, `openLocalStore` takes `onPublished`, and `GET /api/sites/:id/site-build` reports the queue and the last build.
