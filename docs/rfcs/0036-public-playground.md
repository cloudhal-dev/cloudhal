# RFC-0036: Public playground: a disposable Cloudhal per visitor on a SQLite Durable Object

- Status: Accepted (2026-10-20, by Halil; ADR-0038). Open questions 1 and 2 decided as recommended (session in the path, seed per session); 3 and 4 are measured in phase 3 and before launch; 5 and 6 stay out of the MVP (recorded walkthrough instead of the agent, share links in phase 5). Phases 1–3 implemented (#22, #23 and the phase 3 PR); "Implementation notes" below records where they differ from the text.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-20
- Related:
  - Spike: an internal spike report, the numbers behind §1 and §3.
  - ADR-0002 (storage interfaces shaped by D1) and ADR-0012 (Workers, workerd prelude).
  - RFC-0005 (roles and scopes); RFC-0010 (snapshot bundles); RFC-0029 (FTS5 search).
  - RFC-0034 (projects, site creation).
  - ADR-0037 (domains: `cloudhal.com` for marketing, Cloud and the playground; `cloudhal.dev` for developers).
  - Prior art: EmDash's playground ([demos/playground](https://github.com/emdash-cms/emdash/tree/main/demos/playground)) with one Durable Object per session and a playground middleware.

## Summary
`try.cloudhal.com` gives every visitor their own Cloudhal, with no account: Studio, the API and the rendered site. It runs over a private SQLite-backed Durable Object that is seeded with demo content and deleted after an hour. The monorepo gains three general-purpose pieces:
- a `SqlDriver` for Durable Object SQLite (`@cloudhal/storage/do-sqlite`) with a SQL-kept `BlobStore`;
- a *playground mode* (a pure route guard, a fixed principal and a Studio feature flag);
- a single-Worker entry `@cloudhal/cloudflare/playground`.

The deployable site (wrangler config, landing page, demo pack, domain) lives in a separate repo, `cloudhal-dev/try`. Agents are off in the MVP.

## Motivation
- **Trying Cloudhal today needs a toolchain.** `cloudhal init` and `cloudhal deploy` need Node, wrangler and a Cloudflare account, which is too much for someone deciding whether Cloudhal is worth an afternoon.
- **A playground answers "what is it like?" in ten seconds.**
  - The visitor edits a post, changes the design, publishes, and sees the site.
  - The "Deploy to your Cloudflare" button sits next to it.
  - EmDash shows the model works on Cloudflare at near-zero idle cost.
- **The pieces are useful beyond the demo.**
  - A DO-SQLite `SqlDriver` lets anyone run Cloudhal with no D1 at all, including on Workers Free.
  - A route guard with a fixed principal is how a read-mostly kiosk or a hands-on workshop would run too.
- **Why now.**
  - The domain decision (ADR-0037) puts the playground on `cloudhal.com`.
  - RFC-0034 made one installation hold many sites, so a playground session is just a one-site installation.
  - The spike settled the two open technical questions: RPC latency and bundle size.

## Proposal

### 1. Shape
```
browser ──► Worker  cloudhal-playground  (try.cloudhal.com)
            ├─ /, /assets/*, /studio/*        static (ASSETS): landing page, Studio SPA
            ├─ POST /_playground/session      new session cookie (rate-limited, §7)
            ├─ isBlockedInPlayground(path) ─► 404 / 403 (§5)
            └─ everything else ──► stub.fetch(req)   DO = idFromName(session)
                                   PlaygroundSite (SQLite-backed Durable Object)
                                   ├─ DoSqliteDriver ─ migrations, SiteGraphStore, SqlBlobStore
                                   ├─ createApi({ fixed principal })      /api/*
                                   ├─ Astro handler, request-scoped store /s/<session>/*
                                   └─ alarm: deleteAll() at TTL (§6)
```
- **The store, API and renderer run inside the session's DO.** The Worker only serves static files, checks the cookie, applies the guard and rate limits, and forwards.
- The spike measured the alternative: the store in the Worker, with every SQL call an RPC to the DO.
  - That costs one network hop per query.
  - A publish makes 26 sequential calls; locally it was 7 ms against 2 ms with the store in the DO.
  - In production it would add an estimated 25–130 ms of RPC.
- In the DO, every request is one hop, however chatty the call.
- The DO runs the same script, so the code is already in its isolate. A one-person, one-hour site does not stress the DO's 128 MB or its single thread.

### 2. `@cloudhal/storage/do-sqlite`: a `SqlDriver` and a SQL-kept `BlobStore`
```ts
// packages/storage/src/sql/do-sqlite.ts  (Worker-only; types from @cloudflare/workers-types)
export class DoSqliteDriver implements SqlDriver {
  readonly name = "do-sqlite";
  constructor(storage: DurableObjectStorage);
  // get/all/run: storage.sql.exec(sql, ...params); run reads changes() and last_insert_rowid()
  // batch: storage.transactionSync(() => statements.map(run)); rolls back on any throw
  // exec: storage.sql.exec(sql) (multi-statement DDL)
}

// packages/storage/src/blob/sql.ts  (any SqlDriver; created by a migration-like DDL on first use)
export class SqlBlobStore implements BlobStore {
  constructor(sql: SqlDriver, options?: { maxBytes?: number; maxObjectBytes?: number });
}

// packages/storage/src/blob/layered.ts
/** Reads `upper` first, then `base`; every write goes to `upper`; `list` merges both. */
export class LayeredBlobStore implements BlobStore {
  constructor(base: BlobStore, upper: BlobStore);
}
/** A BlobStore over static files (the Worker's ASSETS fetcher); writes throw StorageError. */
export class FetcherBlobStore implements BlobStore {
  constructor(fetcher: Fetcher, prefix: string);
}
```
Invariants:
1. `DoSqliteDriver` enforces `SQL_LIMITS` like every adapter (ADR-0002). Nothing works in the playground that would fail on D1.
2. `batch` is atomic: it runs inside `transactionSync`, and a throw rolls back every statement. The driver never exposes `transactionSync` or `BEGIN` to callers, so hard rule 4 holds and callers keep the `batch`-only discipline.
3. `exec` is for DDL (migrations) only, as on D1.
4. `SqlBlobStore` keeps blobs in the same database (`_blobs(key PRIMARY KEY, data BLOB, content_type, size, sha256)`). It verifies `sha256` like the other stores, stays below DO SQLite's 2 MB value limit (`maxObjectBytes`, default 1 MiB), and enforces a total `maxBytes` cap. It is general purpose, also for Node tests.
5. **The playground's BlobStore cannot be read-only.** The spike showed that `SiteGraphStore` writes `nodes/<hash>.json` on every snapshot, and publish snapshots write bundle shards (RFC-0010). The playground therefore uses `LayeredBlobStore(FetcherBlobStore(ASSETS, "demo/"), SqlBlobStore(driver, { maxBytes: 8 MiB }))`. Demo media are read-only, and the session's own node and bundle blobs are writable and capped. Media *uploads* are refused by the route guard (§5), not by the store.
6. Conformance: `describeSqlDriverConformance` and `describeBlobStoreConformance` run against `DoSqliteDriver` and `SqlBlobStore` on Miniflare, through a test-only DO. `core-ts`'s behavioural suite (`src/testing.ts`) gets a third backend next to sqlite and D1. Tests stay sequential (one Miniflare at a time).
7. Worker-safe: the module imports nothing Node-only and is never reachable from `@cloudhal/storage`'s root export, so Node code never pulls in `cloudflare:workers` types.

### 3. Seeding and first open
- On the first request without data, the DO runs `migrate(driver, migrations)` and then `seedPlayground(store)`.
  - `seedPlayground` is `seedStarterSite` plus a demo pack: about 10 posts, an about page, a menu, the blog theme's design and three demo images.
  - The demo pack is JSON built into the `try` repo's bundle, applied with the store's normal writes, so no hand-written SQL can drift from migrations.
- Spike numbers (workerd, warm isolate):
  - Migrations take 8–15 ms and the starter seed 2–13 ms. The first open is 24–41 ms of server work in all.
  - A fresh database is about 815 KB.
  - 20 sessions opened at once all succeeded (416 ms wall).
- Target: the first open is under 1 s at p95 in production. The plan's target was 3 s.
- The demo pack's language is English (the global default); its `tr` edition is a later option.

### 4. Rendering the session's site
- The site renders at `try.cloudhal.com/s/<sessionId>/…` from the DO, through the same Astro handler as a site Worker.
- `@cloudhal/astro-renderer` gains a request-scoped store override, next to `withRequestSite` (RFC-0034):
  ```ts
  // runtime-workerd.ts
  export function withRequestStore<T>(store: SiteGraphStore, siteId: string, fn: () => T): T;
  ```
- `getSource` uses that store when one is set, with the same resolver logic otherwise.
- Playground responses carry `cache-control: private, no-store`, `x-robots-tag: noindex`, and never a `cache-tag`: the edge cache must never hold one session's page.
- Only the cookie's owner can open `/s/<sessionId>/…`. A signed share link (1 hour) is phase 3.
- Bundle size (spike): the API, store and DO bundle is 800 KiB gzip and the blog site Worker 772 KiB gzip. Both share core-ts, storage and validators, so one Worker is at most 1.6 MiB gzip, inside Workers Free's 3 MiB limit.

### 5. Playground mode: guard, principal, Studio flag
```ts
// packages/api/src/playground.ts  (pure, no I/O; unit-tested with a table of paths)
export type PlaygroundBlock = "auth" | "people" | "keys" | "mcp" | "uploads" | "outbound"
  | "transfer" | "sites" | "domains" | "agent";
/** Why `method path` is refused in playground mode, or undefined when it is allowed. */
export function isBlockedInPlayground(method: string, path: string): PlaygroundBlock | undefined;

/** The one principal of a playground session: an Editor with site settings; nothing installation-wide. */
export const PLAYGROUND_PRINCIPAL: Principal; // actor { kind: "human", id: "usr_playground", name: "Playground Owner" }
```
The guard is a **deny list with an allow list as a test oracle**:
- **Blocked.**
  - `/api/auth/*`, invites, members, password reset.
  - Agent and API keys; `/mcp`; elevation.
  - Asset upload tickets and uploads; media import by URL (SSRF).
  - Bundle import and export (`/api/admin/*`); `push` and `pull`.
  - Site and project create and delete (RFC-0034); domains.
  - Email, webhooks, analytics settings, comment settings, schedule automations that call out; AI and Build chat.
- **Allowed.** Content, pages, sections, taxonomies, menus, design and theme settings, snapshots, diff, publish, rollback, search, previews.
- A test walks every route registered by `createApi` and checks that each one is either blocked or on the allow list. A new route is then refused in the playground until someone classifies it, so it is never silently exposed.

Layers, so that no single mistake opens a hole:
1. The Worker applies `isBlockedInPlayground` before forwarding: 404 for blocked pages, `403 {error: "playground"}` for API calls.
2. `createApi` gets `playground: true`, which mounts the same guard as middleware. It also leaves auth, MCP, staff, mail, AI and analytics unconfigured, so those routes do not exist.
3. `PLAYGROUND_PRINCIPAL` holds the Editor scopes plus `site:settings`. It does not hold `asset:upload`, `members:manage`, `agents:manage`, `site:create` or `*`. Even a route the guard missed fails the scope check (RFC-0005 I15, default-deny).
4. `InstanceInfo.features.playground = { expiresAt, resetUrl, deployUrl }` is set. Studio hides the blocked screens and controls behind it, puts the "Available in your own install" note in their place, and shows the session bar ("Playground · 58:12 left · Reset · Deploy to Cloudflare"). These are Kumo components with `useT()` strings, per DESIGN.md.

`features.playground` is a TypeScript field of the API's `InstanceInfo`, not a JSON Schema contract. No `schemaVersion` changes.

### 6. Sessions, TTL and reset
- **Session.**
  - `POST /_playground/session` sets `__Host-cloudhal_try=<ULID>` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`).
  - The DO is `idFromName(ulid)`. There is no server-side session table: the ULID's timestamp is the creation time.
  - The cookie is unsigned. An unguessable 80-bit random part is enough, because a session holds nothing of value and leaks nothing about anyone else. *Amended in phase 3: the cookie is signed, see Implementation notes 1.*
- **TTL.**
  - On the first write the DO sets an alarm at `min(lastAccess + 60 min, createdAt + 120 min)`.
  - Each request moves it forward, never past the 2-hour cap.
  - `alarm()` calls `ctx.storage.deleteAll()` (data and alarm). A request after expiry gets a 410 and the landing page offers a new session.
- **Reset.** `POST /_playground/reset` runs `deleteAll()` at once, and the next request seeds again.
- **No resurrection.** A DO whose `createdAt` (kept in its own storage) is older than 2 hours refuses requests even if the alarm failed to run.

### 7. Abuse limits and kill switch
| Limit | Value (start) | Mechanism |
|---|---|---|
| New sessions | 5 / min per IP | Workers Rate Limiting binding (`ratelimits`, key = `CF-Connecting-IP`) |
| Writes | 120 / min per session | Rate Limiting binding, key = session |
| DO database | 20 MB | `sql.databaseSize` checked before writes: over the cap → 507 `playground_full` |
| Blobs | 8 MiB per session, 1 MiB per object | `SqlBlobStore` caps |
| Nodes | 500 per session | count checked on create |
| Body | 200 KB per entry or section | API body limit in playground mode |
| Request body | 1 MB | Worker, before forwarding |

- **Turnstile on suspicion.** After a rate-limit hit, the next session creation needs a Turnstile token. Ordinary visitors never see it.
- **Kill switch.** `PLAYGROUND_ENABLED=false` makes the Worker serve only the landing page with the "Deploy to Cloudflare" button. Existing DOs simply expire.
- **Low value to abusers.** Published pages are private to the session, `noindex` and uncached. There are no uploads, outbound requests or email. That makes phishing, SEO spam, file hosting and SSRF unrewarding.

### 8. Privacy
- No account and no personal data are asked for. The page says: "Everything you enter is deleted within 2 hours. Don't enter personal data."
- **No logging of content.** Workers logs keep method, path template, status and duration, never bodies or session IDs.
- **Aggregate counts only.** Analytics are sessions opened, first publish, and "Deploy" clicks, through Workers Analytics Engine with no IP and no cookie ID.
- Deletion is the TTL alarm or Reset. Nothing is backed up.

### 9. Cost (estimate; verify against the current price list before launch)
- **Per session** (spike rows; assumed 150 requests and 5 publishes):
  - about 150 DO requests;
  - about 1–2 k rows written and 5–10 k rows read;
  - under 1 MB stored for at most 2 hours;
  - a few seconds of DO wall time for active requests.
- **Monthly.** Against Workers Paid's included DO quotas (1 M requests, 50 M rows written, 400 k GB-s), about 6 k sessions a month fit inside the $5 plan; requests are the first limit. Above that, the cost is roughly $0.001–0.003 per session, about $100–300 per 100 k sessions.
- **Daily ceiling.** A `PLAYGROUND_DAILY_SESSIONS` cap turns on the kill-switch page for the rest of the UTC day.

### 10. Agents
- **Off in the MVP.** There is no `/mcp`, no Build chat and no AI commands. In their place a card reads "Try the agent in your own install", linking to the docs on `cloudhal.dev`.
- A later RFC may add a budgeted Build chat:
  - our key, with a per-session request and token cap, behind Turnstile;
  - `plan`/`manual` mode (ADR-0015), no auto-publish, no outbound fetch;
  - a daily global budget that switches it off.

  That needs its own cost and abuse analysis, so it is not part of this RFC.

### 11. Where the code lives
| Monorepo (`cloudhal-dev/cloudhal`, versioned, tested in `pnpm check`) | `cloudhal-dev/try` (deployable, pinned `@cloudhal/*`) |
|---|---|
| `@cloudhal/storage/do-sqlite` (`DoSqliteDriver`), `SqlBlobStore`, `LayeredBlobStore`, `FetcherBlobStore` + Miniflare conformance | `wrangler.jsonc`: DO binding, `new_sqlite_classes` migration, rate limits, `try.cloudhal.com` custom domain, vars |
| `@cloudhal/api` playground mode: `isBlockedInPlayground`, `PLAYGROUND_PRINCIPAL`, `features.playground` | Landing page, demo content pack, Turnstile site key |
| `@cloudhal/astro-renderer` `withRequestStore` | Deploy pipeline, alerts, the kill switch |
| `@cloudhal/cloudflare/playground`: `createPlaygroundWorker({ seed, limits })` and the `PlaygroundSite` DO class (session cookie, TTL, guard, forwarding) | |
| Studio: the `features.playground` UI (session bar, hidden screens) | |

The monorepo's CI never deploys or holds playground secrets. The `try` repo only composes published packages.

### 12. Phases
| Phase | Content | Done when |
|---|---|---|
| 0 · Spike | DO-SQLite driver and store under workerd: latency, first open, bundle size | ✅ internal spike report: go, store in the DO |
| 1 · Storage | `do-sqlite` driver and the three blob stores; conformance and core-ts suite on Miniflare | `pnpm check` green with the DO backend |
| 2 · Mode | `isBlockedInPlayground` with the route-walk test; `PLAYGROUND_PRINCIPAL`; `features.playground`; Studio session bar and hidden screens | every route classified; Studio design lint green |
| 3 · Entry | `@cloudhal/cloudflare/playground` (DO, TTL, reset, limits, kill switch); `withRequestStore` rendering | workerd test: open, edit, publish, render, expire, reset; 20 concurrent sessions |
| 4 · Launch | `cloudhal-dev/try` repo, landing page, demo pack, custom domain | live; production first open < 1 s p95; abuse checklist green |
| 5 · Later | signed share links, theme gallery, guided tour, funnel metrics; budgeted agent (own RFC); moving a trial to your own account | |

## Implementation notes (phases 1–3)
Where building the phases showed the text above wrong or silent, the code follows these notes.

1. **Session cookies are signed** (§6, amends "The cookie is unsigned" and the alternatives row). An unsigned ULID lets a client mint sessions at will, which skips the per-IP limit, Turnstile and the daily cap on session creation. The cookie is `<ulid>.<HMAC-SHA-256 of the ulid, 128 bits, base64url>` keyed by the secret `PLAYGROUND_SECRET` (≥ 32 characters); without it the Worker serves only the landing page. A ULID dated in the future (more than a minute) or older than the 2-hour cap is refused in the Worker as well as in the object.
2. **Studio is served at the root** (§1 diagram showed `/studio/*`). Studio has no base path; its client routes (`/sites`, …) and `/assets/*` come from the static files with SPA fallback. `/` is the landing page (`landingPath`, default `/landing/`) for visitors without a session, Studio for those with one. `POST /_playground/session` answers `303 → /sites` with the cookie. `/media/*` goes to the session's object too, and rendered pages keep `a[href]` and `form[action]` under `/s/<session>/` (HTMLRewriter), except Worker paths (`/media`, `/_astro`, `/_cloudhal`, `/assets`, `/api`, `/_playground`).
3. **Studio without sign-in.** `requireSession` accepts the 403 that the playground gives `/api/auth/*` when `/api/instance` reports `features.playground`. The account surface leaves out Agents, Team and Account, and a direct visit shows "Available in your own install".
4. **The guard** (§5) has two more answers: `schedules` (releases, gates, automations, runs and the scheduler need a ticker and may call out) and `unclassified` (a route on neither list, or not declared at all, is refused at run time, not only by the test). Every media-library change is blocked as `uploads`, since a session's media are the read-only demo pack. The body limit is per request (200 KB) in the API and 1 MB in the Worker.
5. **The principal** is `user_playground` (the existing `user_` prefix). Besides the installation-wide scopes it lacks `asset:manage`, because `asset:manage` implies `asset:upload` in the scope lattice, and the Editor's `members:invite`, `commenters:data` and `automations:manage`.
6. **Entry API** (§11): `createPlaygroundWorker({ seed, render, deployUrl, demoMedia, limits, landingPath })` returns `{ worker, PlaygroundSite }`. `seed(store)` returns the site to show. `render(request, { store, siteId, env, ctx })` is the deploying repo's Astro handler; it wraps it in `withRequestStore` (and `serveMedia`) from `@cloudhal/astro-renderer/runtime`, so the monorepo needs no Astro build. The daily cap counts in an object of the same class named `daily:<UTC date>`, deleted after midnight UTC.
7. **Blob stores** (§2): `FetcherBlobStore` cannot list static files, so it takes the demo keys (`keys`) for `list`; `LayeredBlobStore.delete` only removes the upper copy, so a demo object stays readable after a delete.
8. **Measured** (workerd via wrangler's test harness, iMac): opening a session, editing, publishing and rendering pass; 20 sessions opened at once answered in 0.44 s, each with its own seeded site.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Store in the Worker, SQL over DO RPC (the plan's first idea) | DO only runs SQL; render CPU off the DO | One hop per query: 26 for a publish, 7 for menus | Spike: 1.5–3.5× slower locally on chatty calls, and the gap grows with real network RTT |
| One shared D1, a site per visitor (RFC-0034 multi-site) | No new driver | Cross-visitor blast radius; cleanup is row deletes across 30+ tables; one noisy visitor slows all; D1 size cap | The playground's whole promise is isolation |
| A D1 database per visitor | Real D1 | DB creation goes through the API and takes seconds; account database limits | Too slow and too limited for anonymous traffic |
| Client-only (SQLite WASM in the browser) | No server cost | No real Worker rendering; a large download; hides the platform | It would not show Cloudhal running on Cloudflare |
| Read-only BlobStore (the plan) | Simplest | Snapshots and publishes write blobs (finding 3) | It would break every save |
| Signed (HMAC) session cookie | Tamper-evident | A secret to manage; a forged ID only reaches an empty, fresh DO | Unneeded: the ID is unguessable and sessions hold nothing of value |

## Compatibility & migration
- No contract change, no `schemaVersion` change, no data migration. Existing deployments are unaffected.
- `createApi` gains an optional `playground` flag, and `InstanceInfo.features` an optional field. Studio treats a missing field as "not a playground".
- New subpaths: `@cloudhal/storage/do-sqlite` and `@cloudhal/cloudflare/playground`. Both need changesets.
- **Rollout.** Phases 1–3 ship in the monorepo behind no flag, because nothing uses them until the `try` repo deploys.
- **Rollback.** Set `PLAYGROUND_ENABLED=false` or remove the custom domain. Sessions expire by themselves within 2 hours.

## Security & policy impact
- **No new scopes.** `PLAYGROUND_PRINCIPAL` is a fixed subset of today's scopes, with nothing installation-wide.
- **Defence in depth.**
  - The guard runs in the Worker and again in the API.
  - The default-deny scope check sits under both.
  - The route-walk test means a new route is never silently open.
- **Tenant isolation.**
  - Each visitor's data is in a separate DO, addressed only by their own unguessable cookie.
  - There is no shared database and no edge caching of session pages.
- **No outbound I/O.** Uploads, URL import, email, webhooks, MCP and AI are all unreachable, so there is no SSRF or mail-abuse path.
- **Residual risks.**
  - Cookie theft on the visitor's own device; the session is private and short-lived.
  - Abuse of compute; rate limits, size caps, the daily cap and the kill switch bound it.
  - The playground on `cloudhal.com` shares no cookies with Cloud (`__Host-` cookie, own subdomain; ADR-0037).

## Open questions
1. **Session in the URL as well?** `/s/<sessionId>/` makes the rendered site look like a real site path. A subdomain per session (`<id>.try.cloudhal.com`) would need a wildcard certificate and route, but gives cleaner absolute URLs. Recommendation: path for the MVP.
2. **Seed on first request, or a pre-seeded template?** DO storage cannot be cloned, and seeding is about 40 ms, so seeding per session is fine. Revisit if the demo pack grows past about 1 MB.
3. **Startup CPU.** A 1.6 MiB bundle must start within the Worker startup limit. Measure on a real deploy in phase 3. If it is tight, lazy-import the Astro handler inside the DO.
4. **Production latency.** The spike ran the DO in-process. Phase 3 measures real first-open and per-call latency from three regions before launch.
5. **Show the agent in the MVP?** The agent is the product's main difference (RFC-0020), and leaving it out undersells it. A recorded walkthrough on the landing page could stand in until the budgeted Build chat RFC.
6. **Share links.** Should a signed, one-hour read-only link to the session's published site be in the MVP, for "look what I made"? It raises the abuse value of a session slightly.
