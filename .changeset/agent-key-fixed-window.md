---
"@cloudhal/api": patch
---

API keys are limited per fixed window (600 requests per minute by default, `agentKeyRateLimit`) and get a 429 with `Retry-After` when over it. Better Auth's per-key limiter is off: its window only reset after a pause as long as the window, so an agent polling steadily was locked out for good after 600 calls in total, and the refusal looked like a 401.
