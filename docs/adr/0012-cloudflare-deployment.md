# ADR-0012: Cloudflare deployment — two Workers, pointer-flip publishing, Workers Cache
- Status: Accepted
- Date: 2026-10-08
- Related: ADR-0002 (storage), ADR-0004 / ADR-0011 (MCP, agent layer), ADR-0009 (renderer sources), ADR-0010 (auth). Corrects the Miniflare rationale in ADR-0008.
- Sources: https://docs.astro.build/en/guides/integrations-guide/cloudflare/ · https://developers.cloudflare.com/workers/cache/ (+ `/cache-keys/`, `/purge/`) · https://developers.cloudflare.com/workers/runtime-apis/cache/ · https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ · https://developers.cloudflare.com/workers/wrangler/configuration/ · https://developers.cloudflare.com/workers/testing/test-harness/ · https://developers.cloudflare.com/d1/best-practices/read-replication/ · https://www.better-auth.com/docs/installation · versions verified with `npm view` on 2026-10-08 (astro 7.3, @astrojs/cloudflare 14.3.4, wrangler 4.148.0, miniflare 4.20260730.0)

## Context
Sprint 6 puts a Cloudhal site on Cloudflare. Publishing and rollback must be instant and must not need a build server: agents publish through MCP, and an approved publish should be live on the next request. Drafts and arbitrary snapshots must be previewable on the real deployment without leaking into the cache. Everything has to be testable without a Cloudflare account.

## Decision
1. **Two Workers over one D1 database and one R2 bucket.**
   - *Site Worker* — the project's Astro build with `@astrojs/cloudflare` (`CLOUDHAL_TARGET=cloudflare`). Every project route renders on demand (`astro:route:setup` sets `prerender = false`). `@cloudhal/astro-renderer/runtime` has a `workerd` export condition that reads D1/R2 bindings through `SiteResolver`: the site's `publishedSnapshotId` decides what renders, so **publish and rollback are pointer flips** — no rebuild, no redeploy. Snapshot sources are immutable and cached per isolate; the pointer is read on every cache miss.
   - *Admin Worker* (`@cloudhal/cloudflare/admin`) — Studio SPA as static assets plus the Hono API, Better Auth (D1 binding, D1-backed rate limiting, `cf-connecting-ip`), `/mcp` and the push/pull endpoints, on one origin. `run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"]` because SPA navigation requests otherwise never reach the Worker.
2. **Workers Cache, not `caches.default`.** Published pages carry `Cloudflare-CDN-Cache-Control: public, max-age=31536000`, `Cache-Control: public, max-age=0, must-revalidate` and `Cache-Tag: cloudhal-site-<siteId>`. A hit never runs the Worker. Publish/rollback purge the tag: purges are scoped to the Worker that cached, so the admin Worker calls the site Worker's authenticated `POST /__cloudhal/purge` over the `SITE` service binding (`SiteGraphStore.onPublished`). `caches.default` was rejected: no effect on workers.dev, per-colo only.
3. **Previews never touch the cache.** The cache key ignores the hostname and cookies, so previews are signed URL tokens (`?cloudhal-preview=`, HMAC, site-bound, expiring) answered with `no-store`; the entry rewrites internal links with HTMLRewriter to keep the token while navigating. Invalid tokens fall back to the published page, uncached.
4. **The deployment is the source of truth after the first deploy.** `cloudhal deploy` provisions D1/R2 (ids recorded in the wrangler configs), generates secrets once (`.cloudhal/deploy/secrets.json`, 0600), deploys site then admin with `wrangler deploy --secrets-file`, and pushes the local site only if the deployment does not have it. `cloudhal push` refuses to overwrite diverged content (agents edit production); `cloudhal pull` brings it home. Transfers are JSON site bundles verified by content hash, through `/api/admin/sites/:id/bundle` behind a deployment token — no Cloudflare API token handling in Cloudhal; wrangler uses the user's own login.
5. **Migrations run from the admin Worker** (our `_migrations` ledger, once per isolate), not `wrangler d1 migrations apply` — one ledger only.
6. **Testing:** both Workers run on workerd through wrangler's `createTestHarness` with local D1/R2 (`packages/cli/test/cloudflare*.test.ts`). `@cloudflare/vitest-pool-workers` is not used (needs Vitest 4). **Correction to ADR-0008:** Miniflare 5 alpha *does* expose `getD1Database`/`getR2Bucket`; its constructor options changed shape. We pin the last stable **Miniflare 4.20260730.0**, which needs no code change.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Static build per snapshot uploaded to R2, tiny host Worker | No SSR in production | Publish needs a build (Astro cannot build inside a Worker), so agent publishes over MCP would need CI | Breaks "approved publish is live on the next request" |
| Published pointer in KV | Cheap reads | Eventually consistent (≥60 s); a stale read after a purge re-caches the old snapshot | D1 read-after-write is required |
| Preview on a separate hostname of the same Worker | Pretty URLs | Cache key excludes the host → previews could be served from / poison the production cache | Unsafe |
| Single Worker for site and admin | One deploy | Auth, MCP and Studio code on every page view; cache rules mixed | Separation of concerns and blast radius |
| `cloudhal deploy` uploading data with `wrangler r2 object put` / D1 REST | No admin endpoint | One process per object; D1 REST params are strings only; needs extra token scopes | Admin API with bindings is simpler and atomic |

## Consequences
- Positive: agent → approval → live in one request; rollback is instant; previews are safe; the whole loop is tested on workerd in CI.
- Negative: on-demand SSR on cache misses (bounded by the edge cache); two Workers to deploy; the generated admin entry needs `@cloudhal/cloudflare/workerd-prelude` first — esbuild does not initialise lazily-wrapped zod before `@modelcontextprotocol/core` evaluates (remove when fixed upstream).
- Risks: Workers Cache purge rate limits are the Free-tier limits — purges are per publish, not per edit. Enabling D1 read replication later requires `withSession("first-primary")` for the pointer read. Real deployment was not exercised from CI (no account); the dry run bundles both Workers with the real wrangler.
