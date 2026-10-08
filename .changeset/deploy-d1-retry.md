---
"@cloudhal/cli": patch
---

`cloudhal deploy` no longer stops when `wrangler d1 info` fails transiently on a redeploy: if `d1 create` reports that the database already exists, it reads the id again.
