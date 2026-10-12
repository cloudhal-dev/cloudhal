---
"@cloudhal/api": patch
---

RFC-0008 §7.7, §13: `features.schedules.gates` in `/api/instance` now reports whether the renderer of every site enforces time gates — the same check the writers make (`SiteGraphStore.gatesEnforced`: the site Worker's `GET /__cloudhal/features` handshake over `SITE` on Cloudflare, always on Node) — instead of being `true` whenever schedules are served. Studio can hide or explain the embargo controls until the current site Worker is deployed. `gatesEnforcedEverywhere()` is exported; `schedulesFeature()` takes the answer as its second argument.
