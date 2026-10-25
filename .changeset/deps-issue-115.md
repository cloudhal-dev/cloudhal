---
"@cloudhal/api": patch
"@cloudhal/cloudflare": patch
"@cloudhal/core-ts": patch
"@cloudhal/schedules": patch
"@cloudhal/astro-renderer": patch
"@cloudhal/cli": patch
---

Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
