---
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": patch
---

Build rooms (RFC-0020 phase 20b, part 2): Studio's Build view works across the admin Worker's isolates. `BuildRoom`, one Durable Object per page (`BUILD_ROOMS`, SQLite-backed, hibernatable WebSockets, migration `v2`, declared by every deploy), and `createDurableBuildHub` over it; `BuildHub.subscribe` may be async and refuses a viewer past the limit with `BuildViewerLimitError`; build observers may be async and are awaited through `notifyBuild` (bounded, never failing the write).
