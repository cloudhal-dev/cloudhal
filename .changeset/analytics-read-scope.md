---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": patch
---

New scope `analytics:read` (RFC-0006 §9.1): read-only site analytics for Authors and above, in the default scopes of new agent keys in every mode (plan included); abilities `analytics.read` and `analytics.settings` (Administrator, via `site:settings`). It implies nothing, and only `*` implies it.
