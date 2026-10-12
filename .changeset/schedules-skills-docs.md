---
"@cloudhal/cli": patch
---

Schedules for agents (RFC-0008 rollout steps 10 and 12): the official skills the CLI ships and serves over MCP.

- `publish-article` publishes now or later: `schedule_release` with a wall-clock time in the site's zone, an instant or `on-approval` (a person approves the pinned versions once; the agent does not poll), `propose_release` beyond 30 days, `set_embargo` and `schedule_unpublish`. It declares `schedules:read` and `schedules:write`, and `schedule_release` always asks.
- New `comment-triage`: a scheduled agent task that reads the comment queue and may only label, mark spam and hide (the taint rule); it never approves or replies and holds no write scope.
- New `stale-review`: a weekly review of old articles that makes small safe fixes and leaves one draft release (`propose_release`) for a person; it never schedules or publishes.
- The README documents the scheduler on Cloudflare (minute cron or the `SchedulerClock` alarm), the deploy and push guards and `cloudhal schedules`; the owner's guide is `docs/guides/schedules.md`.
