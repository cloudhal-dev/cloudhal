---
"@cloudhal/comments": minor
"@cloudhal/astro-renderer": patch
"@cloudhal/mcp-server": patch
---

Reader-comment hardening from the 2026-10-12 review. The isolate limiter counts an IPv6 client by its /64. Requests without a client address share one bucket with stricter limits (1 submission and 5 challenges a minute), and an IP ban never targets their shared hash. The `COMMENTS_RL` binding is keyed with `rateLimitKey`, under a key derived from `CLOUDHAL_COMMENTS_KEY` (`CommentKeys.rateLimit`), instead of an HMAC under the raw secret. MCP comment views charge staff names to the 20,000-character budget. Normalising removes directional marks (LRM, RLM, ALM) and zero-width characters (ZWSP, ZWNJ, WJ, BOM, and ZWJ outside emoji sequences).
