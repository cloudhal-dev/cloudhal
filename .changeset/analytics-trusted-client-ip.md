---
"@cloudhal/analytics": patch
"@cloudhal/astro-renderer": patch
---

The beacon handler takes the client address only from its caller (`BeaconContext.clientIp`), never from a request header (threat model review of 2026-10-12, item 3). Before, a client-sent `CF-Connecting-IP` won over `clientIp`, so under `cloudhal dev` or a Node host a visitor could dodge the per-client limit and choose the hashed IP. The Site Worker entry now passes Cloudflare's `CF-Connecting-IP` (set by the edge) and the Node middleware the socket address; without an address there is no visitor hash. If you call `handleBeacon`/`processBeacon` yourself, pass `clientIp`.
