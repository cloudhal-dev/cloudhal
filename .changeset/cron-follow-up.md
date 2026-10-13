---
"@cloudhal/schedules": patch
"@cloudhal/cloudflare": patch
---

A cron tick that fires late in the minute runs work due before the next tick at its time: `TickReport.nextDueAt` and `followUpDelay`.
