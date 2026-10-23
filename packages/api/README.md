# @cloudhal/api

The Cloudhal HTTP API as a Hono app — one `fetch` handler that runs on Node (`@cloudhal/api/node`) and on Cloudflare Workers.

The core routes are below; the feature routes (taxonomy, menus, media, comments, schedules, analytics, members, approvals, …) are one module each in `src/routes/`.

| Route | What |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/me` | the calling actor (401 when anonymous) |
| `/api/auth/*` | Better Auth (sign-up, sign-in, session, organization, admin) |
| `GET/PUT /api/sites[/:id]` | sites (PUT = full document, CAS on `rev`) |
| `GET /api/sites/:id/pending` | what a publish would carry, as counts (Studio's badge beside Publish) |
| `/api/sites/:id/pages[/:pageId]` | pages (POST creates and appends to `Site.pageIds` atomically; DELETE needs `?rev=`) |
| `/api/sites/:id/entries[/:entryId]` | content entries (`?collection=`, `locale`, `status`, `filter`); `fields` is checked against the collection's typed fields (RFC-0041), and `null` removes a key there. RFC-0042 §4: with `collection`, `where` (a JSON list of up to 4 `{field, op, value?/values?}`; ops by type, `value: "now"` for date/datetime fields) and `orderBy` (JSON `{field, direction: "asc"\|"desc"}`) filter and sort by the collection's `listFields`, e.g. `?collection=events&where=[{"field":"startsAt","op":"gte","value":"now"}]&orderBy={"field":"startsAt","direction":"asc"}` (URL-encoded). `limit` (1–100) pages the answer as `{entries, total, nextCursor?}`, continued with `cursor=<nextCursor>`; without `limit` the answer stays the plain array |
| `/api/sites/:id/collections[/:key]` | the collection registry; `PUT /:key {settings, rev}` (`?dryRun=1`) declares a collection or changes its settings, typed `fields` included; `DELETE /:key?rev=` |
| `/api/sites/:id/collections/:key/fields/operations` | RFC-0041 §6 field operations (`site:settings` and `content:write`): `POST {op, …, dryRun?}` with `op` one of `rename_field {from, to}`, `change_field_type {key, type, options?, multiple?, onInvalid?: "clear"}`, `set_field_localized {key, localized}`, `remove_field {key}` → `{operationId, done, report, rewritten, skipped}` (a dry run writes nothing; `done: false` when the 2,000-entry / 20 s budget ran out, then `POST ?continue=<operationId>`); `GET /:operationId` → state and pending entries; `POST /:operationId/revert` (again while `done: false`). Only the draft graph changes |
| `/api/sites/:id/snapshots` | create (`{label, publish}`), list, `:id/publish`, `:id/rollback`, `:a/diff/:b` |
| `/api/agent-keys` | API keys for agents: `POST {name, scopes}` (key shown once), `GET`, `DELETE /:id` — signed-in humans only |
| `/mcp` | the Cloudhal MCP server (ADR-0011); session cookie → human, `x-api-key` or `Authorization: Bearer <key>` → agent limited to the key's scopes (REST answers agent keys with a pointer to `/mcp`) |

Errors: `400 validation` (contract errors with ajv details), `409 conflict` (`expectedRev`/`actualRev`), `409 unique`, `404 not_found`, `401 unauthorized`. Store invariants answer with their code (`src/errors.ts`, `INVARIANT_STATUS`).

Typed fields (RFC-0041) answer with every problem and its path in `details.issues` (`[{ path: "fields/startsAt/at", code, message }]`):

| Code | Status | When |
|---|---|---|
| `invalid_fields` | 422 | values that do not fit their definitions (or several kinds of problem at once) |
| `unknown_field` | 422 | a new key without a definition, in a collection that has definitions |
| `field_not_localized` | 422 | a translation's own copy of a non-localized value (set it on the original) |
| `required_field` | 422 | an entry in review or published without a `requiredToPublish` value |
| `too_large` | 409 | `fields` over 256 KB, or collection settings over 256 KB |
| `field_key_reserved`, `field_key_duplicate`, `field_option_duplicate`, `field_bounds` | 400 | definitions that can never be saved as written |
| `too_many_fields` | 422 | over 30 fields per collection, 200 per site or 50 options per select |
| `field_change_needs_operation` | 409 | changing a field's type, localization or `multiple`, or dropping a key or option that entries still hold |
| `operation_in_progress` | 409 | another field operation is still rewriting the collection (`details.operationId`) |
| `field_values_unconvertible` | 422 | a type change would drop values the conversion table cannot convert, without `onInvalid: "clear"` (`details.report` is the dry run) |
| `field_operation_incomplete` | 409 | reverting an operation that has not finished, or was already reverted |

Collections stage 3 (RFC-0042) answers the same way (`details.issues`, slash paths):

| Code | Status | When |
|---|---|---|
| `invalid_query` | 422 | an entry list's `where`/`orderBy`/`limit`/`cursor`, or a `contentList` section's (`sections/2/where/0/value`), names an unlisted field, an operator or value its type does not take, or breaks a bound |
| `unknown_field` | 422 | `listFields` or `expiry.field` names no field of the collection |
| `invalid_expiry` | 422 | `expiry.field` is not a date or datetime field |
| `structured_data_invalid` | 422 | a `structuredData` preset that does not fit the type's table or the collection's fields (warnings are not refused) |
| `list_field_in_use` | 409 | unlisting, dropping or retyping a list field (or dropping a select option) that `contentList` sections still use (`details.pages`); `remove_field` of a field named by `listFields`, `expiry` or `structuredData`; a type change that would break those sections. `rename_field` renames those references instead |

```ts
import { createApi } from "@cloudhal/api";
import { createAuth } from "@cloudhal/api/auth";
const auth = createAuth({ database: db, baseURL, secret });
const app = createApi({
  store,
  resolveActor: auth.resolveActor,
  resolvePrincipal: auth.resolvePrincipal,
  authHandler: auth.handler,
  agentKeys: auth.agentKeys,
  mcp: { stateKey: process.env.MCP_STATE_KEY, audit, skills },
});
```

Auth (ADR-0010): Better Auth 1.7 with email+password, `organization` and `admin`; sessions resolve to `Actor { kind: "human", id: "user_…" }`. Auth tables live in storage migration `0002_auth`. The shared test suite (`src/testing.ts`) runs on better-sqlite3 and Miniflare D1, including the article workflow draft → review → published → snapshot → publish → rollback.
