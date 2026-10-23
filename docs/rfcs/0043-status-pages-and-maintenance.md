# RFC-0043: Site status pages and maintenance mode

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-23
- Related:
  - #117 (status pages: the agreed direction this RFC turns into a design; it adds maintenance mode at the owner's request).
  - RFC-0008 / ADR-0023 (§7.1 one clock per request, §7.4 the edge cache capped at the next gate, §7.7 the `features` handshake and writer guard, §9 time model, §10.3 call classes), RFC-0042 / ADR-0044 (`gates: 2`), RFC-0034 (multi-site serving; the `Vary: Host` correction from #62), RFC-0036 / ADR-0038 (playground route guard), RFC-0033 / ADR-0035 (locale from host and path prefix), ADR-0033 (RTL), ADR-0032 and ADR-0034 (ICU catalogs; only English hand-edited), RFC-0012 / ADR-0026 (CSP), RFC-0007 §4.5 and §8.3 (settings outside the graph; the shared purge queue and budget), RFC-0006 §3.3, ADR-0014 (single-use approvals), ADR-0015 (agent modes), ADR-0018 (approver must be able to make the call), RFC-0039 (site archives).
  - Code read: `packages/astro-renderer/src/cloudflare-entry.ts` (purge, `features`, media before Astro, preview link rewriting, `cacheOnlySuccess`, `varyByHost`), `runtime-workerd.ts` (`getSource`, `edgeMaxAge`), `resolver.ts` (preview tokens; an invalid token falls back to the published page today), `site-dispatch.ts` (`unknownHost`), `media-middleware.ts`, `collection-feed-middleware.ts`, `packages/cloudflare/src/site-routes.ts` and `features.ts`, `packages/agent-runtime/src/policy.ts`, `starters/blog/src/pages/[...path].astro:117`, `cloudhal.com/scripts/post-deploy-check.mjs`.
  - Prior art and specifications (checked 2026-10-23; "unverified" where no primary page could be read):
    - RFC 9110: [§15.6.4 503](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4) ("temporary overload or scheduled maintenance", `Retry-After` MAY be sent); [§10.2.3 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) (HTTP-date or delay-seconds; with a 503 it says how long the service is expected to be unavailable); [§15.5.11 410](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.11) (likely permanent; **heuristically cacheable**); §15.1 (404 and 410 are heuristically cacheable, 500 and 503 are not).
    - Google Search Central: [Pausing your online business](https://developers.google.com/search/docs/crawling-indexing/pause-online-business) (updated 2025-12-10): a full 503 shutdown only "for a very short period of time (a few days at most)"; send `Retry-After`; **do not return 503 for robots.txt**; do not use 403/404/410 or `noindex` for a pause; for longer closures serve an indexable 200 placeholder. [HTTP and network errors](https://developers.google.com/search/docs/crawling-indexing/http-network-errors) (updated 2026-02-04): 5xx slows crawling, content of 5xx responses is ignored, indexed URLs that persistently return server errors are eventually dropped (no number of days given). [robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec) (updated 2026-10-23): a 5xx robots.txt stops crawling of the whole site for the first 12 hours.
    - Cloudflare: [Workers Cache](https://developers.cloudflare.com/workers/cache/) (updated 2026-10-12): keyed by path, entrypoint, `ctx.props` and Worker version, **not hostname**; checked **before** the Worker runs; honours `Vary` (separate variants; `Vary: *` disables caching), `Cache-Control` per RFC 9111, `private` bypasses; responses with `Set-Cookie` and requests with `Authorization` bypass automatically; nothing on cookies in the key. Whether the query string is in the key is not stated (assumed yes: preview links depend on it today; unverified). Whether `Vary: Host` specifically works is untested (#62 note). [Default cache behaviour](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/): without `Cache-Control`, 404/410 are cached 3 minutes and 5xx are not; `no-store`/`private` prevent caching. [Custom Errors](https://developers.cloudflare.com/rules/custom-errors/) (updated 2026-09-08): Custom Error Rules can replace Worker 4xx/5xx responses, but not on the Free plan, per zone, and Error Pages never apply to 500/503.
    - WordPress: [`wp_maintenance()`](https://developer.wordpress.org/reference/functions/wp_maintenance/) answers 503 with `Retry-After: 600`; a `wp-content/maintenance.php` drop-in replaces the page; [`wp_is_maintenance_mode()`](https://developer.wordpress.org/reference/functions/wp_is_maintenance_mode/) reads a `.maintenance` file whose `$upgrading` timestamp expires after 10 minutes (auto-off). Coming-soon plugins add role bypass and page allowlists (common practice; unverified per plugin).
    - Shopify [password page](https://help.shopify.com/en/manual/online-store/themes/password-page): new stores start private; a shared password lets visitors in; a "message to your visitors"; the theme can restyle the page; pages are not indexed while private. How staff bypass is not on that page (unverified).
    - Webflow [site password](https://help.webflow.com/hc/en-us/articles/33961298873235): a site-wide password page the designer can style; uploaded **assets stay public** by URL (from a secondary summary of the help page; unverified).
    - Ghost private mode: a shared password, indexing off, the page is the theme's `private.hbs` (third-party and forum sources only; unverified).
    - Vercel's [maintenance-page template](https://vercel.com/templates/next.js/maintenance-page): middleware reads an Edge Config flag on every request (secondary summary; unverified). Netlify: no primary source found (unverified).

## Summary

A Cloudhal site answers every state in which it cannot show its pages — not published yet, in maintenance, unavailable, failed, or behind an expired preview link — with one small, translated, self-contained HTML page served by the renderer before Astro, with the right status code (503, 500 or 410), `Retry-After` and `no-store`. Old theme copies get it with no change; a theme may restyle it through an optional `statusPage` export.

Maintenance mode is a per-site record outside the graph (it never rolls back with a snapshot), switched on now or for a scheduled window by people with `site:settings` and by agents only with a person's approval; it ends on its own at its end time. Signed-in people keep seeing the real site through signed links that are never cached, `robots.txt` and media stay up, and a public health endpoint tells monitors and post-deploy checks "maintenance" from "down".

## Motivation

- **Today:**
  - A new site answers every page with a plain-text `503 This site has not been published yet.` from the theme (`[...path].astro:117`, and the feeds, sitemap and `llms.txt` routes). It is the first thing the owner sees on a fresh domain, from the Deploy button, `npm create cloudhal` or try.cloudhal.com.
  - A render failure shows the runtime's default error. An expired or forged preview link silently shows the **published** page (`resolver.ts` falls back), so a reviewer may approve what they think is the draft.
  - There is no way to take a site down for a migration, a domain move, an incident or a launch. The only lever is "unpublish everything", which loses the pointer and is visible in the content history.
- **Who:** every new install (first impression), every owner running a migration or a launch, agents (which today cannot tell "the site is down" from "the site is in maintenance"), and the cloudhal.com deploy pipeline, whose `post-deploy-check.mjs` rolls both Workers back unless `https://cloudhal.com/` answers 200 — a maintenance 503 would trigger a rollback.
- **Why now:** the 0.6 line opened Cloudhal to outside installs (try.cloudhal.com, npm). RFC-0008's render-time gates and RFC-0034's per-site dispatch give us the pieces: an instant compared per request, a site chosen before Astro runs, and a purge path per site.

## Proposal

### 1. Status pages (from #117)

#### 1.1 The module

```ts
// packages/astro-renderer/src/status-page.ts — pure, Worker-safe, no imports beyond the catalog and @cloudhal/messages/format
export type SiteState = "not-published" | "maintenance" | "unavailable" | "error" | "preview-expired";

export interface StatusPageInput {
  readonly site?: { readonly name: string; readonly logo?: ImageRef };   // §1.6 decides what is passed per state
  readonly locale: string;                    // already chosen (§1.4)
  readonly page?: "maintenance" | "coming-soon";
  readonly message?: { readonly text: string; readonly locale: string };  // maintenance only, plain text
  readonly until?: { readonly at: string; readonly timeZone: string };    // maintenance end, for "back by …"
  readonly rayId?: string;                    // error only
  readonly now: number;                       // injected clock (RFC-0008 §9.4)
}

/** The built-in page: status, headers and body. Never throws (a broken input degrades to English text). */
export function statusPage(state: SiteState, input: StatusPageInput): Response;
/** The same document as a string, for theme hooks that only restyle it (§1.7). */
export function statusPageHtml(state: SiteState, input: StatusPageInput, options?: { css?: string }): string;
/** Machine endpoints during the same states (§2.3): short plain text or JSON, same status and headers. */
export function statusPlain(state: SiteState, input: StatusPageInput, as: "text" | "json"): Response;
```

`maintenance` joins the closed set now (#117 deferred it). The set stays closed: a new state is an RFC change, so themes can switch over it exhaustively.

#### 1.2 States, codes and headers

| State | When | Status | `Retry-After` | `x-robots-tag` |
|---|---|---|---|---|
| `not-published` | the site has no `publishedSnapshotId` and the request carries no valid preview | 503 | `3600` | `noindex` |
| `maintenance` | §2 is in effect and the request has no valid preview or bypass link | 503 | seconds to the end (≥ 60); `3600` when open-ended | **none** |
| `unavailable` | the Worker serves no site yet (`siteId` undefined), the site row is missing (deleted, RFC-0034), or the store cannot be read before rendering | 503 | `300` | none |
| `error` | an exception reached the entry's top-level catch, or Astro answered 5xx with no themed error page | 500 | — | none |
| `preview-expired` | the URL carries `cloudhal-preview` and the token is expired, forged, for another site, malformed, or previews are off | 410 | — | `noindex` |

- **Every state:** `cache-control: no-store`, `cloudflare-cdn-cache-control: no-store`, `content-type: text/html; charset=utf-8`, `x-cloudhal-state: <state>`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, and `Vary: Host` (added by `varyByHost` as for every response). Status responses do not pass through `withSecurityHeaders`, which would overwrite the referrer policy. `HEAD` gets the same headers without a body.
- **`no-store` is not optional.** RFC 9110 makes 410 heuristically cacheable and Cloudflare caches 404/410 for 3 minutes without explicit headers; a cached 410 or 503 would outlive the publish or the end of maintenance that fixes it (`cacheOnlySuccess` already enforces this for Astro responses; status pages set it themselves).
- **`noindex` only where nothing should be kept** (an amendment of #117, which put `noindex` on every state). Google's pause guidance says not to use `noindex` during a temporary closure, and it ignores the content of 5xx responses anyway. A site that was never published has nothing to keep; a preview URL must never be indexed. Maintenance, `unavailable` and `error` are temporary and stay without it.
- **`Retry-After` uses delay-seconds**, never an HTTP-date: the response is not cached, so the value is fresh, and clock skew between the edge and a crawler does not matter. A maintenance end in the past or within a minute gives `60`.
- **`preview-expired` changes behaviour on purpose:** an invalid preview token no longer falls back to the published page. The reviewer learns that the link is dead instead of reviewing the wrong version. `?cloudhal-preview=exit` and the dev preview cookie keep their behaviour.

#### 1.3 Design of the page

- **One self-contained document, ≤ 8 KB:** inline `<style>`, the system font stack, no scripts, no web fonts, no requests except the site's logo from its own `/media/…` URL after a first publish. Light and dark via `prefers-color-scheme`; `prefers-reduced-motion` irrelevant (no motion).
- **Its own CSP:** `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. The page sets it itself, so it is stricter than `SITE_CSP`. A theme's page (§1.7) gets `SITE_CSP`, since it may load the theme's own `/_astro/` stylesheet.
- **Layout:** a centered card with the site name (when §1.5 allows), one `<h1>`, the state's sentence, the owner's message (maintenance), "Back by {time}" when an end is known, the reference id (`error`), and a small "Built with Cloudhal" footer. Contrast meets WCAG 2.2 AA in both schemes (checked in the snapshot test with the same contrast helper Studio's design lint uses).
- **No link to Studio, the admin host or a login.** The public page must not advertise the admin URL (#117). Owners learn the state in Studio (§2.9) and reach the real site through bypass links (§2.4).
- **No stack traces, messages or ids except `cf-ray`.** The `error` page shows `Reference: <cf-ray>` so a visitor can quote it; the full error goes to `console.error` (Workers Logs) with the same id. On Node the id is a random 16-hex string logged with the error.

#### 1.4 Language and direction

- **Order:**
  1. the locale of the request's **host or path prefix**, as `localeRequest` (RFC-0033 §4) resolves it, when it is one of the site's locales. Host-mapped locales (`localization.domains`) are safe to use because every response already varies by host (#62);
  2. the site's `defaultLocale`;
  3. `en`.
- **No `Accept-Language`** (#117): it matches the default-English rule and avoids `Vary: Accept-Language` on edge-cached hosts. Before a site is known (`unavailable`, and `error` when the site could not be read) the page is English.
- **Catalog match:** the chosen site locale is looked up exactly, then by primary language subtag (`pt-PT` → `pt-BR`, `zh-HK` → `zh-…` if Studio has one), then English. `<html lang>` is the catalog's locale actually used, `dir` comes from the catalog's registry entry (`ar`, `fa`, `he` are `rtl`), and the owner's message gets its own `lang`/`dir` attributes when its locale differs. Logical CSS only (ADR-0033).
- **Dates:** "Back by 2 November, 11:00 (GMT+3)" is formatted with `@cloudhal/messages/format` `formatDate` in the site's `timeZone` (else UTC) and the page's locale. No Temporal on the site Worker (RFC-0008 §9.4).

#### 1.5 Strings and translation

- **Owner:** the renderer. `packages/astro-renderer/src/status-strings/en.ts` is the only hand-edited file (about 14 keys: a title and a sentence per state and page variant, `backBy`, `reference`, `builtWith`). Messages are ICU MF1 compiled to data at build time (ADR-0032); the Worker bundle carries all 19 languages (≈ 25 KB uncompressed), with no ICU parser at runtime.
- **Flow:** `scripts/i18n-exchange.ts` gains a second source, so `pnpm i18n:export` writes `.i18n/<locale>/status.json` beside Studio's files, and `pnpm i18n:import` generates `status-strings/<locale>.ts`. The `translate` skill drafts them; they stay "AI draft, awaiting review" exactly as Studio's (ADR-0034). The language list is Studio's `LOCALE_REGISTRY`, imported at build time, so a language added to Studio is offered here.
- **Tests** reuse Studio's catalog checks: same keys in every language, ICU syntax, plural categories, no hand edits.

#### 1.6 What site data a page may show

| State | Site data | Source |
|---|---|---|
| `not-published` | name; locales for §1.4 | the live site node. The name is set at `init` and is not draft content; the brand is unpublished, so no logo |
| `maintenance` | name, logo | the **published** snapshot's site node (a later unpublished rename or logo is not shown) |
| `preview-expired` | name, plus logo if published | published snapshot when there is one, else the live node's name |
| `unavailable` | none | — |
| `error` | name only, and only if already loaded for this request | no store read in the catch path: the store may be what failed |

A logo is used only when its `src` is a same-origin `/media/…` path (CSP `img-src 'self'`); an absolute external logo URL is dropped.

#### 1.7 Theme hook

```ts
// in a theme's src/theme.ts (optional; additive under the theme API stability rules)
import type { StatusPageHook } from "@cloudhal/astro-renderer/status-page";
export const statusPage: StatusPageHook = (state, ctx) =>
  state === "maintenance" ? ctx.defaultHtml({ css: myCss }) : undefined;

// @cloudhal/astro-renderer/status-page
export type StatusPageHook = (
  state: Exclude<SiteState, "error">,
  ctx: StatusContext,
) => string | undefined | Promise<string | undefined>;

export interface StatusContext extends StatusPageInput {
  readonly status: 503 | 410;
  readonly dir: "ltr" | "rtl";
  readonly strings: Readonly<Record<string, string>>;  // the built-in words, already in ctx.locale
  readonly messageHtml?: string;                       // the owner's message, escaped, line breaks as <br>
  readonly untilText?: string;                         // formatted end time
  defaultHtml(options?: { css?: string }): string;     // the built-in document with extra CSS
}
```

- **The theme returns a document, never a `Response`.** The renderer owns the status code, `Retry-After`, `no-store`, `x-robots-tag` and the CSP, so a theme cannot cache a 503 or index a preview.
- **`undefined` means the built-in page.** So does a throw, a result that is not a string, a string over 64 KB, or no answer within **50 ms** (a `Promise.race` with a timer); the failure is logged once per isolate and state.
- **Never for `error`.** The error page must not depend on code that may be the cause.
- **Loading:** the integration adds `virtual:cloudhal/theme-hooks`, which exports a lazy `() => import("<root>/src/theme.ts")` when that file exists (`themeModule` option, default `src/theme.ts`). The theme module is only evaluated when a status page is drawn, never on the normal path. A theme without the export, and every frozen theme copy (v0.3.10–v0.5.0 in the compat test), gets the built-in page.
- **Trust:** theme code is site code and runs with the site's privileges already; the hook only receives escaped text and published data. `ctx.message.text` is documented as untrusted plain text; themes use `messageHtml`.

#### 1.8 Where it is served

- **Site Worker (`cloudflare-entry.ts`):** a new step between host dispatch and `serveSite` decides the state (§2.5 has the order). The whole `route()` is wrapped in `try/catch` → `error`. A 5xx HTML response from Astro is replaced by the `error` page unless the theme marked it as its own (`x-cloudhal-error-page: theme`, set by a theme's `500.astro`; no starter has one today). Cloudflare-level failures (CPU limit, out of memory, exception 1101) cannot be caught by the Worker and keep Cloudflare's page.
- **`cloudhal dev`:** dev renders the working copy, drafts included (ADR-0009), so it never answers `not-published` or `maintenance` for real pages. Parity comes from the **same module** and a dev-only route served by a new `status-middleware` (`order: "pre"`, Node targets only): `/__cloudhal/status/<state>?locale=tr&page=coming-soon` draws each page with the theme hook, so a theme author sees and screenshots their override (`pnpm design:shots` can include it). When the local store has maintenance on, `cloudhal dev` prints one line saying the deployment will show the maintenance page.
- **Other Node targets and static builds** have no entry: the starter's plain 503 (`[...path].astro:117`) stays as the fallback there, and so do the feeds' plain 503s.
- **Multi-site:** `unknownHost()` (a hostname no allowed site holds) stays a plain 404 cached for 60 s: it belongs to no site, so there is nothing to brand, and the short cache keeps floods cheap. `site-routes.ts`'s `503 no site Worker for this site` is the admin Worker's internal purge forwarding, not a visitor page, and stays plain (#117 listed it as visitor-facing; it is not).
- **Playground (RFC-0036):** sessions render through `withRequestStore`; a session before its first publish gets `not-published` (already `private, no-store`). A future "session expired" page may reuse `unavailable`.
- **Media** keep their short plain answers (404/410/451). Feeds, sitemap, `llms.txt`, search JSON and comment endpoints stay plain or JSON (§2.5).

### 2. Maintenance mode

#### 2.1 Where the switch lives: a record outside the graph

**Decision:** one row per site in a new D1 table, typed by a new root contract `SiteMaintenance`. It is not a graph node, never in a snapshot, a bundle (RFC-0010) or a site archive (RFC-0039), and is not carried by `cloudhal push`/`pull`.

- **Not on the site node.** The site node is snapshotted and restored by rollback (`publishedSnapshotId` lives on it). A rollback during an incident must not lift maintenance, and turning maintenance on must not need a publish. This is RFC-0006 §3.3's and RFC-0007 §4.5's reason for analytics and comment settings.
- **A contract, unlike comment settings,** because the record crosses a deployment boundary: the admin Worker writes it, and the site Worker (deployed separately, possibly a different version) reads it on the public path. Both languages must agree on it, and Rust will take over the core.

```jsonc
// packages/core-contracts/schemas/site-maintenance.schema.json (new root; ROOT_SCHEMAS gains "site-maintenance")
{
  "title": "SiteMaintenance",
  "description": "A site's maintenance switch (RFC-0043) … not a graph node, never in a snapshot, a bundle or a site archive …",
  "type": "object", "additionalProperties": false,
  "required": ["schemaVersion", "siteId", "mode", "page", "rev", "updatedBy", "updatedAt"],
  "properties": {
    "schemaVersion": { "$ref": "common.schema.json#/$defs/SchemaVersion" },
    "siteId": { "$ref": "common.schema.json#/$defs/Id" },
    "mode": { "$ref": "#/$defs/MaintenanceMode" },
    "page": { "$ref": "#/$defs/MaintenancePage" },
    "message": { "$ref": "#/$defs/MaintenanceMessage" },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "updatedBy": { "$ref": "common.schema.json#/$defs/Actor" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "MaintenanceMode": {
      "oneOf": [
        { "title": "MaintenanceOff", "type": "object", "additionalProperties": false, "required": ["kind"],
          "properties": { "kind": { "type": "string", "enum": ["off"] } } },
        { "title": "MaintenanceOn", "type": "object", "additionalProperties": false, "required": ["kind", "since"],
          "properties": { "kind": { "type": "string", "enum": ["on"] },
                          "since": { "$ref": "common.schema.json#/$defs/Timestamp" },
                          "until": { "$ref": "common.schema.json#/$defs/Timestamp" } } },
        { "title": "MaintenanceWindow", "type": "object", "additionalProperties": false, "required": ["kind", "startsAt", "endsAt"],
          "properties": { "kind": { "type": "string", "enum": ["window"] },
                          "startsAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
                          "endsAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
                          "timeZone": { "$ref": "common.schema.json#/$defs/TimeZone" } } }
      ]
    },
    "MaintenancePage": { "type": "string", "enum": ["maintenance", "coming-soon"] },
    "MaintenanceMessage": {
      "type": "object",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1, "maxProperties": 50,
      "additionalProperties": { "$ref": "#/$defs/MaintenanceText" }
    },
    "MaintenanceText": {
      "type": "string", "minLength": 1, "maxLength": 280,
      "pattern": "^[^\\x00-\\x09\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"
    }
  }
}
```

- **Generator subset (AGENTS rule 2):** an inline `oneOf` with a one-value `kind` discriminator, no `default`, `additionalProperties: false` everywhere except the declared message map, cross-file refs only to `common.schema.json#/$defs/*`, `schemaVersion` on the root and `rev` because it is mutable (rule 3).
- **`off` is a variant, not a missing row,** so `rev` keeps counting across on/off and CAS works on the first write after "off" too. A missing row reads as `off`.
- **`page`** picks the wording: `maintenance` ("We'll be back soon") or `coming-soon` (a published site kept private until launch). Both are 503; §1.2's `noindex` rule does not change with it.
- **Instants only, plus a display zone.** RFC-0008 §9.1 keeps wall-clock time and zone for releases so a tzdata change never runs one early. A maintenance window is short (§2.6 caps it at 30 days, start at most 365 days ahead); Studio and the CLI convert the person's wall-clock input with the site zone once, and `timeZone` records the zone it was entered in, for display. A tzdata change between entry and the window moves it by the change, at most; the renderer, which compares instants with `Date.parse`, needs no zone code.
- **Checks in code (the schema cannot compare):** `endsAt > startsAt`; `until > since`; length ≤ 30 days; `startsAt` ≤ 365 days ahead; `until` and `endsAt` not in the past on write; message locales ⊆ the site's locales; a message only with `page` set (always true by schema). Error code `invalid_maintenance` (400).
- **Checked on this branch, then reverted:** with this exact schema registered (`schema-list.ts`, `validate.ts`, `lib.rs`, the Rust fixture test), `pnpm gen` generated TypeScript (`MaintenanceMode = MaintenanceOff | MaintenanceOn | MaintenanceWindow`) and Rust (`#[serde(tag = "kind", deny_unknown_fields)] pub enum MaintenanceMode { Off, On { .. }, Window { .. } }`). The core-contracts tests passed (545) and `cargo test -p cloudhal-schema` passed (20, `site_maintenance` included) with these fixtures:
  - `valid/site-maintenance/`: `off`, `on-until` (en and tr messages, a line break), `coming-soon-open-ended`, `window` (Istanbul zone, an Arabic message).
  - `invalid/site-maintenance/`: kind `paused`; `on` without `since`; a window without `endsAt`; `off` with `until`; page `password`; a tab in a message; a bidi override; 281 characters; key `English`; an empty message map; no `page`; an unknown `bypassCookie` field.

**Storage:** migration `0029_site_maintenance` (plain SQL): `site_maintenance(site_id TEXT PRIMARY KEY, doc TEXT NOT NULL, rev INTEGER NOT NULL, updated_at TEXT NOT NULL)`. Writes are one `batch()` (AGENTS rule 4): the CAS update guarded on `rev`, the audit row and the purge-queue row, each later statement guarded on the new `doc` hash. Site deletion (`site-delete.ts`) deletes the row.

**Evaluation** (`@cloudhal/core-ts/maintenance`, pure, Worker-safe, shared by the renderer, API, MCP, CLI and Studio):

```ts
export type MaintenanceEffect =
  | { state: "off"; next?: { startsAt: string } }               // a future window
  | { state: "on"; until?: string; page: "maintenance" | "coming-soon" }
  | { state: "ended"; endedAt: string };                         // a past window or `until`
export function maintenanceEffect(doc: SiteMaintenance | undefined, now: number): MaintenanceEffect;
export const STATUS_FEATURE_VERSION = 1;
```

`on` holds for `kind: "on"` while `now < until` (or always without `until`), and for `kind: "window"` while `startsAt ≤ now < endsAt`. **Auto-off is a comparison, not a job:** past its end the record reads as `ended`; no scheduler, write or approval is involved, and a stalled scheduler cannot keep a site down.

#### 2.2 Who may switch it

- **People:** `site:settings` (a person-only scope: Owner, Administrator). Editors cannot take the site down. REST, Studio and the CLI as a person.
- **Agents:** `set_maintenance` needs `site:write` and **always waits for a person** who holds `site:settings` (`approverScopes`, RFC-0038's pattern). Its call class is `person` (RFC-0008 §10.3): it waits in every mode, `auto` and local `bypass` included. This covers turning on, scheduling, changing the message and **turning off**: lifting a `coming-soon` early is an unannounced launch.
- **Reading:** `get_maintenance` and the API's `GET` need `site:read`. The state is public anyway (the page and the health endpoint show it).
- **Approvals** are ADR-0014 single-use requests; the arguments include the `rev` the agent read, so an approval cannot apply to a record that changed since (the write fails with `409 conflict`). One waiting request per identical call.
- **Audit** (in the write's batch): `site.maintenance.on`, `.schedule`, `.update` (message or page), `.off`, with the old and new `mode` and the actor (`onBehalfOf` the approver for agents). Bypass links: `site.maintenance.link` with the creator and expiry (§2.4). Entering and leaving a window are not writes and have no audit row; the Activity page derives "started"/"ended" from the record.

#### 2.3 What visitors, crawlers and machines get

| Path | During maintenance | Before the first publish (unchanged unless noted) |
|---|---|---|
| `/__cloudhal/purge`, `/__cloudhal/features` | as today (token) | as today |
| `/__cloudhal/health` (new, §2.8) | `200`, `state: "maintenance"` | `200`, `state: "not-published"` |
| a request with a valid preview or bypass link | the real site, `private, no-store` | as today (preview) |
| `/robots.txt` | **the theme's normal answer** (Google: a 503 robots.txt stops all crawling for 12 h) | theme's (disallow all) |
| `/media/…` | **served as usual** (the status page's logo; images in emails and on other sites; Webflow likewise keeps assets public) | as today |
| static assets (`/_astro/`, `/_cloudhal/`) | served (Workers static assets answer before the Worker) | same |
| `/.well-known/…` | passed to the theme (security.txt, verification files) | same |
| `/__cloudhal/e` (analytics beacon) | `204`, dropped | as today |
| comment endpoints | `503` JSON `{ "error": "maintenance" }`, `Retry-After` | as today |
| paths ending in `.xml`, `.txt`, `.json`, `.rss`, `.atom`, `.webmanifest` (feeds, sitemap, `llms.txt`, search JSON) | `statusPlain`: `503` plain text or JSON, `Retry-After`, `no-store` | the theme's plain 503 |
| every other `GET`/`HEAD` | the maintenance page (503) | the `not-published` page (503) |
| other methods | `503` plain text | as today |

- **The machine/page split is by path extension, not `Accept`,** so no `Vary: Accept` is needed and caches stay simple.
- **No owner allowlist in v1** (open question 3). Media are the one content path that stays up; their URLs are content-hashed (RFC-0004).

#### 2.4 Owner and team bypass: signed links, never cookies

**Decision:** a bypass is a **preview link of the published site**. The preview token (`preview-token.ts`) gains a third target, `"published"`, which the resolver serves as the published snapshot at the request's instant — gates applied, drafts hidden — with preview headers (`private, no-store`, `cloudflare-cdn-cache-control: no-store`, `noindex`, `x-cloudhal-mode: preview`). The entry's existing link rewriting keeps the token on every internal link and media URL, so the person navigates the whole site.

- **Why not a cookie on the site host:**
  - Workers Cache runs before the Worker and its key has no cookie, so a cookie cannot steer what the cache serves; RFC-0004 §7.3 chose URL tokens for previews for the same reason.
  - Studio's session lives on the admin host, so a site-host cookie would need a cross-host login handshake, a new credential to protect, and arguably consent handling.
  - A bypass response must never enter the cache. `private, no-store` on a no-cookie path keeps that a property of one response, not of a request header.
- **Why not a shared password (Shopify, Ghost, Webflow):** a credential form on the public site is a brute-force and phishing target, its cookie has the cache problem above, and Cloudhal already has signed links with expiry.
- **Who mints:** people and keys with `preview:create`, as for previews (Studio's "View site" button during maintenance; `preview_page` with `target: "published"` for agents; `cloudhal maintenance link`). TTL default 1 h, **max 24 h** (previews allow a week: a bypass exposes a site the owner hid on purpose). Audited.
- **Revocation:** none per link, as for previews; rotating `CLOUDHAL_PREVIEW_SECRET` revokes all. Bypass links stop mattering when maintenance ends.
- **Forgery:** HMAC-SHA-256 over `{ site, target, exp }` with the preview secret (≥ 32 bytes), checked with the site id. An invalid bypass link is `preview-expired` (410), never the real site and never silently the maintenance page, so the person knows to ask for a new one.

#### 2.5 Request order in the site Worker

```
route(request):
  1. /__cloudhal/purge, /__cloudhal/features            (token; unchanged)
  2. hostRedirect                                       (www → apex etc.; unchanged)
  3. siteDispatch.choose → unknown host: plain 404      (unchanged)
  4. no site → `unavailable`
  5. /__cloudhal/health                                 (§2.8)
  6. state = await siteState(siteId, request, now)      (pointer, preview/bypass verdict, maintenance; memoised)
       preview token present and invalid               → `preview-expired`
       valid preview or bypass                         → serveSite (no maintenance, no-store as today)
       maintenance on    → allowlist (§2.3) → serveSite | statusPlain | `maintenance`
       not published     → robots/media/static → serveSite; machine paths → serveSite (theme's plain 503); else `not-published`
  7. serveSite                                          (unchanged)
  all of it inside try/catch → `error`; then varyByHost
```

- **`siteState` lives in `runtime-workerd.ts`** next to the resolver, so the entry and Astro's `getSource` share one pointer read and one maintenance read per request, and one instant (RFC-0008 §7.1).
- **The maintenance record is memoised per isolate for 5 s** (a single-row PK read; the pointer's TTL is 2 s). The purge endpoint resets it, as it resets the pointer, but only in the isolate that receives the purge; the TTL bounds the others.
- **A read error serves the site** (fail open; logged; health reports `degraded`): a D1 hiccup must not take every site down, and most traffic is served from the cache anyway. **A row this Worker cannot parse or validate is treated as `on` without an end** (fail closed): it can only come from a newer writer, and the owner asked to hide the site.

#### 2.6 Scheduling, end times and `Retry-After`

- **Now:** `on` with an optional `until`. **Later:** `window` with `startsAt` and `endsAt`. Caps: a window ≤ 30 days, starting ≤ 365 days ahead; `until` ≤ 30 days ahead; `on` without `until` is allowed (a launch date may be unknown).
- **No RFC-0008 machinery.** Releases carry graph nodes only, never the site node or settings, and depend on a ticker; automations are agent tasks. A window is two instants compared at render time, like an `availability` gate.
- **Studio warns** when a window or an ongoing `on` passes 48 hours: Google asks for "a few days at most" of 503 and eventually drops URLs that keep returning server errors (open question 2).
- **`Retry-After`:** `ceil((end − now) / 1 s)`, at least 60; `3600` without an end (WordPress uses 600 for its 10-minute upgrades; an hour fits Cloudhal's longer manual windows).
- **The edge cache before a window:** published 200s get `cloudflare-cdn-cache-control: max-age` capped at the window's start, exactly like a gate (`edgeMaxAge(min(nextGate, startsAt))`, RFC-0008 §7.4), so cached pages expire as the window opens. If RFC-0008's assumption L4 (Workers Cache honours short `max-age`) fails, the same fallback applies: when a scheduler is configured, it enqueues the site tag into the purge queue at `startsAt`.

#### 2.7 Caching and purge

- **Turning on (or a window that starts now)** purges the site's tag (`cloudhal-site-<id>`, tags only on a multi-site Worker, RFC-0034 invariant 4), as a **takedown-priority** row of the shared purge queue (RFC-0007 §8.3; today the table is `comment_purge_queue`), sent at once, so it shares the 5-a-minute budget with publishes and comment takedowns. A **second purge is queued 15 s later**: another isolate may still hold `off` for up to 5 s (§2.5) and cache a page rendered just before it saw the change; the delay covers the memo TTL plus a render.
- **During maintenance nothing new is cached:** status responses are `no-store`, bypass and preview responses are `private, no-store`, and `cacheOnlySuccess` already refuses every non-200. Only the allowlisted `robots.txt` and media can be cached, and they are the same for everyone.
- **Turning off needs no purge:** nothing from the maintenance period was cached. The 5 s memo is the only delay. To shorten it in the isolate that answers next, every maintenance write also sends `POST /__cloudhal/purge` with a new body `{ "siteId", "reset": true }`, which resets that isolate's memos and purges nothing, so it costs no purge budget.
- **Host isolation:** every response, status pages included, carries `Vary: Host` (#62). Status pages include no host-derived text except the site name from the store, and the locale only from the site's own locales (§1.4), so a cached variant cannot poison another host, and nothing from the request is reflected.
- **Purge failure** (budget exhausted, 502): the write still succeeds; the API answers `purge: { state: "queued" }` and Studio shows "Cached pages may stay visible for up to a minute". The queue retries with backoff (RFC-0007 §8.3).

#### 2.8 Writer guard, handshake and health

- **`GET /__cloudhal/features`** answers `{ "gates": 2, "status": 1 }`. The API refuses every maintenance write with `409 status_unsupported` until the Worker that serves **that site** reports `status ≥ 1`. On a multi-site installation with attached Workers, that is `bindingFor(env, siteId)`, not always `SITE` (today's `features` request has no body, so `routedSite` sends it to `SITE`; the maintenance guard asks the site's own binding). Confirmations are memoised per admin isolate as for gates; on Node the renderer and the writer are one process (`STATUS_ENFORCED`).
- **Downgrades:** `cloudhal deploy` refuses to deploy a renderer without `status: 1` over a site with maintenance `on` or a future window, unless `--force-downgrade` (as for schedules). A `wrangler rollback` of the site Worker to a version before this RFC lifts maintenance silently; the deploy guide says so and the health endpoint shows it (`status` missing).
- **`GET /__cloudhal/health`** (public, no token, `no-store`, `noindex`, per host on a multi-site Worker):
  ```json
  { "ok": true, "state": "maintenance", "until": "2026-11-02T08:00:00Z", "status": 1 }
  ```
  `state` is `published`, `not-published` or `maintenance`. It reads only the memoised pointer and maintenance record, so it proves that the Worker runs and its store answers. `200` whenever the Worker can answer; `503` with `{ "ok": false }` when the store cannot be read; `degraded: true` when the maintenance read failed open. It never exposes snapshot ids, versions, hosts or messages.
- **A deep probe for deploy checks:** with `Authorization: Bearer <CLOUDHAL_PURGE_TOKEN>`, `?render=/path` renders that path internally **ignoring maintenance** (nothing returned but `{ "render": <status> }`, never cached; the `Authorization` header also makes Workers Cache bypass). A deploy during maintenance can then still prove that the new version renders.
- **Guidance for cloudhal.com's `scripts/post-deploy-check.mjs`** (a separate repository; changed in rollout step 7). The site check passes when `/__cloudhal/health` answers `200` with `ok: true`, and `/` answers `200`, or `503` with `x-cloudhal-state: maintenance` or `not-published`. It uses the deep probe when the token is available to the build. Only a failure of those checks rolls back. Uptime monitors should watch `/__cloudhal/health` and treat `state: "maintenance"` as planned; the docs give the Cloudflare and common-monitor settings.

#### 2.9 Surfaces

**REST** (`/api/sites/:siteId/…`, declared in `ROUTE_SCOPES`):

| Route | Scope | Notes |
|---|---|---|
| `GET maintenance` | `site:read` | `{ maintenance, effect, purge? }`; a missing row is `{ mode: { kind: "off" }, rev: 0 }` |
| `PUT maintenance` | `site:settings` | body: the record without `schemaVersion`, `siteId`, `updatedBy`, `updatedAt`; `rev` for CAS; `409 status_unsupported`, `409 conflict`, `400 invalid_maintenance` |
| `POST maintenance/link` | `preview:create` (people through their role) | `{ url, expiresAt }`; `ttlSeconds` 60–86,400 |

**MCP** (`packages/mcp-server/src/maintenance-tools.ts`):

| Tool | Scopes | Class | Notes |
|---|---|---|---|
| `get_maintenance` | `site:read` | `read` | record plus `effect` |
| `set_maintenance` | `site:write`; approver `site:settings` | `person` (`dryRun: true` → `read`) | args `{ mode: "on" \| "off" \| "window", until?, startsAt?, endsAt?, page?, message?, rev, dryRun? }`; the approval prompt states the effect ("example.com answers 503 to everyone from 09:00 to 11:00 Istanbul time; search engines are told to come back at 11:00; comments are closed") |
| `preview_page` | `preview:create` (unchanged) | unchanged | gains `target: "published"`; `render_page` uses it automatically while the site is in maintenance |

**CLI** (one handler and one help line each, `src/cli/commands-site.ts`):

```
cloudhal maintenance status [--remote] [--json]
cloudhal maintenance on [--until <time> | --for <duration>] [--coming-soon] [--message <text> [--locale <tag>]] [--remote]
cloudhal maintenance schedule --from <time> --until <time> [--coming-soon] [--message <text> [--locale <tag>]] [--remote]
cloudhal maintenance off [--remote]
cloudhal maintenance link [--ttl <duration>] [--path <p>] [--remote]
```

`<time>` is an RFC 3339 instant, or a wall-clock `2026-11-02T09:00` read in the site's zone; the CLI prints the instant it understood and, with `--remote`, the effect from the API. Without `--remote` it writes the local store, which only `cloudhal studio` shows; `cloudhal dev` prints the notice from §1.8.

**Studio** (`kumo-design` + `studio-ui`, DESIGN.md):
- **Site settings → "Maintenance" `SectionCard`** in its own module (the settings page is at the size ratchet):
  - a state line ("Off", "On until 11:00 (Istanbul)", "Scheduled 2 Nov 09:00–11:00");
  - "Turn on" (until: none, a duration, or a date-time in the site zone), "Schedule…", "Turn off";
  - wording (Maintenance / Coming soon);
  - a message per site locale (textarea with a 280-character count);
  - "Preview page": the built-in page drawn by the API from the same module, in a sandboxed `srcdoc` frame, with a note that the theme may restyle it;
  - "Open the site": mints a bypass link.
  Every write goes through a `ConfirmDialog` that states the effect, the purge and the 48-hour search warning.
- **A global `Banner` in `SiteShell`** while maintenance is on or a window is ahead: "Maintenance is on: visitors see the maintenance page until 11:00 (Istanbul)." with "View site" and (for `site:settings`) "Turn off". The shell's existing poll carries `effect`.
- **The overview** shows "Not published yet: visitors see a Coming soon page" with "Publish" instead of a link to the public page.
- **Strings** go in a lazy namespace `maintenance` (all languages; AI drafts through `translate`). Apart from the preview frame, no Studio bundle cost on first load.
- **Approvals** of `set_maintenance` show the dry-run prompt and the current and requested `mode`.

**Playground:** the maintenance routes and tools are blocked by the route guard (RFC-0036 §5) like analytics and comment settings. A two-hour session gains nothing from them, and they would add a takedown path to an anonymous surface.

#### 2.10 Custom message

- Plain text only, ≤ 280 characters per locale, line breaks allowed; no other control characters and no bidi overrides (schema pattern). No HTML, Markdown or links are accepted, and no URL is autolinked: a maintenance page is a phishing surface if it can carry links.
- Escaped on output (`&<>"'`); line breaks become `<br>`. RFC-0012's sanitizer is not involved, because no markup is ever accepted.
- **Locale choice:** the page's locale, else the site's default locale, else none. A message in a different language than the page's strings gets its own `lang`/`dir`.

### 3. Invariants

1. A status response is never stored by any cache: `no-store` on the browser and edge headers, every state.
2. During maintenance, no public response other than `robots.txt`, media, static assets and `/.well-known/` carries site content without a valid signed link; RFC-0008's route sweep test is extended to a maintenance clock and asserts it on every starter route.
3. A bypass or preview response is `private, no-store`, so it can never be served to someone else from the edge cache.
4. Maintenance state changes only through the `SiteMaintenance` record; no snapshot, rollback, publish, import or archive touches it.
5. An agent never changes maintenance without a person holding `site:settings`, in any mode.
6. A maintenance write is accepted only when the Worker that serves the site reports `status ≥ 1`.
7. The end of maintenance needs no write, job or approval.
8. Public status pages contain no admin URL, no request-derived text, no stack trace and no identifier except `cf-ray`.
9. The theme hook can change the document only; status, headers and CSP stay the renderer's, and a failing hook falls back to the built-in page.

### 4. Rollout (one reviewable PR each)

1. **Status pages:** `status-page.ts`, the English catalog, the entry's state step (`not-published`, `unavailable`, `error`, `preview-expired`), `/__cloudhal/health` with `published`/`not-published`, the theme hook and `virtual:cloudhal/theme-hooks`, the dev middleware and its preview route, tests (state × status × headers, locale order and RTL, CSP and no external requests, snapshot HTML, frozen themes v0.4.0/v0.5.0 get the page before their first publish, workerd harness). Changeset notes the `preview-expired` behaviour change.
2. **Status translations:** `scripts/i18n-exchange.ts` second source, `translate` drafts for 18 languages.
3. **Maintenance in the renderer:**
   - the contract, its fixtures and `pnpm gen`;
   - migration `0029`;
   - `@cloudhal/core-ts/maintenance`;
   - `siteState` with the 5 s memo, the allowlist, `statusPlain`;
   - bypass target `published`;
   - edge cap at `startsAt`;
   - `features` `status: 1`, health `maintenance` and the deep probe;
   - the route sweep at a maintenance clock.

   No writer yet, so nothing can turn it on.
4. **Writers:** store (`SqlMaintenanceStore`, CAS, audit, purge queue rows), API routes and the guard (with `bindingFor`), purge `reset`, the `cloudhal deploy` downgrade guard, the CLI. Verified on a **staging deployment with two hostnames** (the #62 lesson), never first on cloudhal.com: purge on toggle, nothing cached during maintenance, bypass not cached, `Vary: Host`.
5. **MCP:** `get_maintenance`, `set_maintenance`, `preview_page` `published`, `render_page` during maintenance, docs.
6. **Studio:** the card, the banner, the overview line, approvals; `design:shots` at 1440/390, `design:lint`, translations.
7. **Ops and docs:** `docs/guides/maintenance.md` (states, monitors, Google's limits); cloudhal.com's `post-deploy-check.mjs` change.

Step 3 ships before step 4, so no writer ever sets a switch a deployed site Worker ignores; the guard keeps it so across separate deploys.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Status pages in the theme (today's plain 503) | Theme controls everything | No data before the first publish; copied themes drift (#111) and the frozen v0.3–v0.5 themes would never get it | Renderer before Astro, optional hook |
| Theme hook returns a `Response` | Total freedom | A theme can cache a 503, index a preview, drop `Retry-After` | Document only; headers stay the renderer's |
| Maintenance as a site-node field | One place for settings; no new table or contract | Snapshotted: a rollback lifts or restores it; needs a publish to take effect | Separate record (RFC-0007 §4.5's reason) |
| Deploy-time switch (env var, `cloudhal.json`; WordPress's `.maintenance`) | No storage; no runtime read | A redeploy to switch; no Studio, no schedule, no per-site control on multi-site | Runtime record |
| Cloudflare Custom Error Rules or a WAF rule | Zero Worker code | Paid plans only; per zone, not per site or locale; Error Pages never apply to 503; no bypass link or Studio | Worker-owned |
| Bypass by cookie on the site host | Familiar; clean URLs | Workers Cache key has no cookie and runs before the Worker; cross-host login; a new credential | Signed links, as previews |
| Shared password page (Shopify, Ghost, Webflow) | Shareable with anyone | A credential form on the public site: brute force and phishing; the cookie problem above | Signed links with expiry; a "password" variant can come later if asked |
| Cache the maintenance page at the edge for a few seconds | Fewer Worker invocations in a flood | Served to bypass holders too (the cache answers before the Worker); outlives "off" | `no-store`; the page is ≈ 8 KB with no store read past the memo |
| Toggle through an RFC-0008 release or automation | Reuses scheduling, approvals and the calendar | Releases carry graph nodes only; depends on a ticker; a stalled scheduler keeps a site down | Render-time instants |
| A 200 placeholder page (Google's advice for long closures) | Keeps the domain "healthy" for long closures | Replaces indexed snippets with the placeholder; needs care with canonical and `noindex` | 503 in v1; open question 2 |
| Wall-clock time plus zone for windows (RFC-0008 §9.1) | tzdata-proof | Zone code on the site Worker, or a recompute job | Instants plus a display zone; windows are short |
| `Accept-Language` for the page | Visitor's language | `Vary: Accept-Language`; against the default-English rule | Host/path prefix → default → en |
| `noindex` on every state (#117) | Uniform | Google says not to use it during a pause; 5xx content is ignored anyway | Only `not-published` and `preview-expired` |
| Fail closed on any maintenance read error | Never shows a hidden site | A D1 hiccup takes every site down | Fail open on read errors; closed on unknown rows |
| Status page for unknown multi-site hosts | Consistent look | The host belongs to no site; the cached plain 404 keeps floods cheap | Keep `unknownHost()` |

## Compatibility & migration

- **Contracts:** one new root (`SiteMaintenance`), additive. No change to existing contracts; no `schemaVersion` bump (it stays `1`; the root starts at 1).
- **Data:** migration `0029_site_maintenance` creates an empty table. A missing row is `off`, so existing sites change only when someone turns maintenance on.
- **Behaviour changes on upgrade** (changeset for `@cloudhal/astro-renderer`):
  - an unpublished site shows the styled page instead of plain text (same 503);
  - an invalid preview link answers 410 instead of the published page;
  - Astro 5xx HTML becomes the `error` page;
  - `/__cloudhal/health` exists.
- **Themes:** no change needed. Old copies get every status page (the entry answers before Astro); their own plain 503s stay as the fallback on Node and static targets. The `statusPage` export is optional and additive.
- **Old site Workers:** they ignore maintenance and answer `features` without `status`; writers refuse (`status_unsupported`) until the site Worker is redeployed. Old Workers reject `published` bypass tokens as invalid and fall back to the published page, which is harmless because maintenance cannot be on there.
- **Old admin Workers:** a newer CLI or Studio gets `404` for the new routes and says the deployment needs an update.
- **Rollback:**
  - Turning maintenance off restores the site within the 5 s memo, with no purge.
  - Reverting the renderer below this RFC brings back plain-text pages and lifts maintenance; `cloudhal deploy` refuses that while maintenance is on unless forced, and the guide documents the `wrangler rollback` caveat.
  - The table can stay; nothing else reads it.

## Security & policy impact

- **No new scopes.** Switching needs `site:settings` (person-only); agents need `site:write`, plus a person with `site:settings` in every mode (`person` class); bypass links need `preview:create`; reading needs `site:read`. The playground blocks the feature.
- **No admin URL leak:** the status pages, health endpoint and headers name no admin host, Studio path or login (invariant 8). Errors show `cf-ray` only.
- **Bypass forgery:** HMAC-SHA-256 with the deployment's preview secret, bound to the site id, at most 24 h, checked in constant time by WebCrypto. Invalid links answer 410, never the site.
- **Cache poisoning and leaks:**
  - status responses are `no-store` (invariant 1);
  - bypass and preview responses are `private, no-store` (invariant 3);
  - `Vary: Host` is on everything;
  - no request text is reflected;
  - the locale comes only from the site's own locales;
  - two purges on toggle bound the window in which an isolate that has not seen the change can cache a page;
  - the route sweep test (invariant 2) guards the allowlist.
- **CSP:** the built-in page uses a `default-src 'none'` policy with inline style only and same-origin images; theme pages keep `SITE_CSP`.
- **Injection in messages:** plain text by schema (no control or bidi characters, 280 characters), escaped on output, never linked; per-locale `lang`/`dir` stop direction spoofing from bleeding into the page.
- **Abuse by agents:**
  - an agent cannot take a site down, extend, shorten or lift maintenance without a person (invariant 5);
  - requests are single-use and bound to `rev`, with one waiting request per identical call (ADR-0014);
  - everything is audited.

  A malicious approver is out of scope (they hold `site:settings`).
- **Denial of service:** the status path does one memoised PK read per isolate every 5 s and draws an ≈ 8 KB page. The health endpoint reads only the same memo. A flood during maintenance costs Worker invocations, like a flood on uncached pages today. Search, comments and analytics are closed or dropped during maintenance.
- **Theme hook:** theme code is site code already; the hook gets escaped text and published data and has a 50 ms and 64 KB budget. It never runs for `error`.
- **Tenant isolation:** one record per site; purges by site tag; multi-site health and pages are per host; the guard asks the site's own Worker.
- **Monitoring safety:** `/__cloudhal/health` separates "maintenance" from "down", so post-deploy checks and monitors do not roll back or page on a planned 503 (§2.8).

## Open questions (recommended defaults)

1. **`noindex` on maintenance, `unavailable` and `error`:** omit it, an amendment of #117 following Google's pause guidance; keep it on `not-published` and `preview-expired`. *Recommended.*
2. **Long closures:** no 200-placeholder mode in v1; Studio warns after 48 hours and the guide explains Google's advice. Revisit if owners ask for multi-week pre-launch on an already indexed domain. *Recommended.*
3. **Owner allowlisted paths** (`/legal/*`, a status page): not in v1. If asked, an optional `allowPaths` of at most 10 path prefixes, additive to the contract. *Recommended.*
4. **Media during maintenance:** served. The logo needs it, emails and other sites embed images, and URLs are content-hashed. *Recommended.*
5. **Feeds and sitemap during maintenance:** plain 503 with `Retry-After`, not the last published version. Feed readers retry, and a feed that keeps announcing new posts during a takedown is surprising. *Recommended.*
6. **Bypass link lifetime:** default 1 h, maximum 24 h. *Recommended.*
7. **Agents turning maintenance off:** also `person`, every mode. *Recommended.*
8. **"Built with Cloudhal" footer:** on in the built-in page; a theme hook can drop it with `defaultHtml({ css })` or its own document. No setting in v1. *Recommended.*
9. **Unreadable record:** a read error fails open (logged, `degraded` in health); an unknown or invalid row fails closed. *Recommended.*
10. **Caps:** a window ≤ 30 days, starting ≤ 365 days ahead; `until` ≤ 30 days ahead; open-ended `on` allowed. *Recommended.*
11. **Deep health probe** with the purge token: included (§2.8); cloudhal.com uses it when the build has the token. *Recommended.*
12. **Which preview-link failures answer 410:** all of them (expired, signature, other site, malformed, previews off). One answer for every failure tells a forger nothing and tells a reviewer enough. *Recommended.*
13. **`cloudhal dev` enforcing maintenance:** no; dev stays the author's live preview, and parity comes from the shared module and `/__cloudhal/status/<state>`. *Recommended.*
14. **Email or webhook notice when a window starts or ends:** not in v1; the Studio banner and the audit rows cover it. *Recommended.*
