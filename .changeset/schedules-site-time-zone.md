---
"@cloudhal/core-ts": patch
"@cloudhal/api": patch
---

RFC-0008 §4.1: `Site.timeZone` is now checked on write against the writing runtime's zones (`Intl.supportedValuesOf("timeZone")`, its aliases, and `UTC`). `SiteGraphStore.createSite` and `updateSite`, and bundle imports (`importSite`, so `cloudhal push`/`pull` and the deploy-token import route), refuse an unknown zone such as `Europe/Atlantis` with `InvariantError("invalid_time_zone")`, which the API answers as `400 invalid_time_zone` with `details.timeZone`. A zone the site already stores is accepted unchanged, so a site saved under other time-zone data stays editable. `checkTimeZone()` is exported from `@cloudhal/core-ts/availability`.
