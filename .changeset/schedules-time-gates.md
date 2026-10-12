---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cloudflare": minor
"@cloudhal/api": minor
---

RFC-0008 time gates (rollout step 4 and the gate half of step 5). `@cloudhal/core-ts/availability` is the one gate helper (`isAvailable`, `gateState`, `nextGate`, `gateInstants`, `edgeMaxAge`, `inheritedGate`, `gateChanges`) with an injected `now`; `@cloudhal/core-ts/time` resolves wall-clock times in a site's zone with `temporal-polyfill/implementation` (pinned 1.0.5). The published site hides embargoed and expired pages and entries from every route, list, archive, feed, sitemap, menu, related list and comment or analytics lookup; an image used only by embargoed content is not served before the embargo; published responses are edge-cached no longer than the next gate. Previews still show gated content, with a notice. The site Worker answers `GET /__cloudhal/features` with `{ "gates": 1 }`, and writers (store, REST, MCP, bundle import) refuse `availability` with `409 gates_unsupported` until the renderer has confirmed it enforces gates; `from` must be before `until` (`400 invalid_availability`). An entry first published under an embargo is dated at its `from`.
