---
"@cloudhal/cli": patch
---

The Deploy to Cloudflare button deploys the admin Worker under its own name. Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` to the Worker a build is connected to, and wrangler then deploys every config under that name, so the admin Worker overwrote the site Worker (the site's address served Studio). `cloudhal deploy` no longer passes `WRANGLER_CI_OVERRIDE_NAME` or `WRANGLER_CI_MATCH_TAG` to wrangler; it names each Worker itself.
