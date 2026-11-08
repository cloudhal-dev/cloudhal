---
"@cloudhal/storage": patch
"@cloudhal/api": patch
---

Cloudhal's own rate-limit counters move out of Better Auth's `rateLimit` table into `rate_limits` (migration `0030_rate_limits`, #168). This covers the hourly cap of 3 reset mails per address, the per-minute buckets of the public token endpoints and each agent key's window. Better Auth prunes `rateLimit` by its own 60 s window, so the hourly reset-mail cap used to restart about a minute after any sign-in from the same address. The migration deletes the old `cloudhal:` rows from `rateLimit`, so each counter starts over once at upgrade.
