---
"@cloudhal/core-contracts": minor
---

RFC-0006 draft contracts for site analytics: two new roots. `AnalyticsEvent` (`analytics-event.schema.json`) is a stored event — a page view, a Core Web Vitals sample or a server-side render (miss, redirect, 404/410/5xx) — with only privacy-preserving fields (path of a published route, node id, referrer host, channel, normalised UTM values, country, device/browser/OS families, an optional daily-salted visitor hash), each documenting its fixed Workers Analytics Engine slot. `AnalyticsBeacon` (`analytics-beacon.schema.json`) is what the first-party script may send to `POST /__cloudhal/e`. `assertValid("analytics-event" | "analytics-beacon", …)` and `ROOT_SCHEMAS` include them.
