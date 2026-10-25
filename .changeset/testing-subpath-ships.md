---
"@cloudhal/storage": patch
"@cloudhal/analytics": patch
"@cloudhal/comments": patch
"@cloudhal/schedules": patch
---

The `./testing` subpath now ships. The published packages pointed `./testing` at `dist/src/testing.js` and `.d.ts`, but the build left those files out, so importing `@cloudhal/{storage,analytics,comments,schedules}/testing` failed with ERR_MODULE_NOT_FOUND. The suites run on your own vitest, 3 or later, which is an optional peer dependency. `@cloudhal/storage`'s Miniflare helpers also load your own `miniflare`, an optional peer of any version. The ranges are wide on purpose. When a direct dependency's optional peer does not match the copy in your project, npm stops with ERESOLVE, even if nothing imports `./testing`. No semver range matches the prerelease miniflare that wrangler currently brings in, so with a narrower range npm would install a second miniflare beside it.
