---
"@cloudhal/storage": patch
---

createMiniflareDoSqlite() sends its Durable Object calls over kept-alive connections instead of opening a new TCP connection per call through Miniflare 4's dispatchFetch, so long suites no longer exhaust local ports on macOS (#116).
