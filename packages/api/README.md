# @cloudhal/api

The Cloudhal HTTP API as a Hono app — one `fetch` handler that runs on Node (`@cloudhal/api/node`) and on Cloudflare Workers.

| Route | What |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/me` | the calling actor (401 when anonymous) |
| `/api/auth/*` | Better Auth (sign-up, sign-in, session, organization, admin) |
| `GET/PUT /api/sites[/:id]` | sites (PUT = full document, CAS on `rev`) |
| `/api/sites/:id/pages[/:pageId]` | pages (POST creates and appends to `Site.pageIds` atomically; DELETE needs `?rev=`) |
| `/api/sites/:id/entries[/:entryId]` | content entries (`?collection=` filter) |
| `/api/sites/:id/snapshots` | create (`{label, publish}`), list, `:id/publish`, `:id/rollback`, `:a/diff/:b` |

Errors: `400 validation` (contract errors with ajv details), `409 conflict` (`expectedRev`/`actualRev`), `409 unique`, `404 not_found`, `401 unauthorized`.

```ts
import { createApi } from "@cloudhal/api";
import { createAuth } from "@cloudhal/api/auth";
const auth = createAuth({ database: db, baseURL, secret });
const app = createApi({ store, resolveActor: auth.resolveActor, authHandler: auth.handler });
```

Auth (ADR-0010): Better Auth 1.7 with email+password, `organization` and `admin`; sessions resolve to `Actor { kind: "human", id: "user_…" }`. Auth tables live in storage migration `0002_auth`. The shared test suite (`src/testing.ts`) runs on better-sqlite3 and Miniflare D1, including the article workflow draft → review → published → snapshot → publish → rollback.
