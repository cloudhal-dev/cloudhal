---
"@cloudhal/cloudflare": patch
"@cloudhal/cli": patch
"@cloudhal/mcp-server": minor
---

A site created outside the monorepo now installs and deploys without hand-pinned dependencies.
`@cloudhal/cloudflare` asks for `zod@^4.6.5` instead of exactly 4.6.5, so it shares one copy with
`@modelcontextprotocol/core` and Better Auth (two copies left the MCP SDK's zod uninitialised and the
admin Worker failed at startup with "ZodLazy is not a constructor"). The blog starter asks for
`wrangler@^4.148.0`, so a fresh install gets a wrangler that the `@cloudflare/vite-plugin` pulled in by
`@astrojs/cloudflare` accepts. `cloudhal init` (and the package build) copy only the starter files git
knows about when the starter sits in a git checkout, so ignored leftovers no longer reach new projects.
MCP `save_translation` no longer copies the source's cover alt text, which is in the source's language:
a new translation leaves it empty (the image's own alt text in the target language shows) or takes the
new `coverAlt` input.

Also: the local renderer's Chrome profile cleanup (`render-chrome.ts`) retries and never throws, so a profile Chrome is still writing to no longer fails a test run with ENOTEMPTY.
