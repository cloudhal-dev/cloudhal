---
"@cloudhal/analytics": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

Optional Workers Rate Limiting binding for the analytics beacon (RFC-0006 §5.5, `analytics.rateLimit`). `cloudhal.json` `"analytics": { "rateLimit": true }` (or `{ "limit": 120, "namespaceId": "…" }`) makes `cloudhal deploy` add `ratelimits: [{ name: "ANALYTICS_RL", namespace_id, simple: { limit, period: 60 } }]` to the site Worker; the namespace id is derived from the deployment's dataset name unless pinned. `POST /__cloudhal/e` checks it after the per-isolate limit, keyed by an HMAC of the client IP under a key derived from the site Worker's purge token, so the same client has the same key in every isolate and the IP never leaves the request. New `SharedBeaconRateLimiter` and `RateLimitBinding` in `@cloudhal/analytics`; `SiteAnalytics` takes `rateLimit: { binding, secret }`. Without the binding, without the token, or when the binding fails, the per-isolate limits apply alone.
