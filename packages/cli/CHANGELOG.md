# @cloudhal/cli

## 0.7.2

### Patch Changes

- 8526116: `cloudhal build --published` (RFC-0043 §1.10) builds the published snapshot only, never the latest snapshot or the drafts. When nothing is published yet, it writes the `not-published` status page as the whole output instead, in the site's default language: `index.html` and `404.html`, a `robots.txt` that disallows everything, a `_headers` file with `no-store` and `noindex`, and a `.cloudhal-status` marker. The Docker image's `site-build` now passes the flag, and the compose file's Caddyfile answers every path except `robots.txt` with that page, status 503 and `Retry-After: 3600` while the marker exists. The image also runs `site-build` once in the background when Studio starts, so a fresh self-hosted site no longer serves drafts before its first publish, and a volume upgraded from 0.7.1 or older switches on its first start. `cloudhal build` without the flag is unchanged.
- 6de8d67: Corrections to the machine-drafted translations of collections, typed fields, listings, the OAuth consent screen, Connected agents, the setup-link sign-up text and the site status pages (#112), in all 18 non-English languages. The fixes cover changed meaning, security wording that had softened, mixed terms and mixed register. Examples: Indonesian said "not yet verified" for a self-registered agent, Polish dropped "you" from the loopback warning, and Japanese and Korean lost "never" in "never beyond your role". Korean used a formal register in the new screens while the rest of Studio uses its polite-informal one. Nothing else changes, and the languages remain AI drafts awaiting review by people who speak them.
- 060a9c8: A self-hosted site rebuilds itself on publish (#150). With `CLOUDHAL_SITE_BUILD=on`, which is the Docker image's default, `cloudhal studio` runs the image's `site-build` in a child process after every publish: a publish in Studio or through MCP, an approval, a rollback, or a release that goes live (at its time or through "Publish now"). It also runs it once at start.
  
  - **One build per burst.** A burst of publishes builds once (3 seconds after the last one, at most a minute after the first).
  - **One build at a time.** Studio's builds, a cron `site-build` and a hand-started one share one lock.
  - **Failures keep the last good site.** A failed build keeps the previous site and is tried again on the next publish.
  - **Bounded.** A build has a deadline (`CLOUDHAL_SITE_BUILD_TIMEOUT`, 30 minutes by default). Stopping Studio during a build ends it within 5 seconds, with everything it started, and records it as stopped.
  
  Every build is recorded in the site's Activity as "Build public site", with its duration, snapshot and output on failure. The site's overview shows a new "Public site build" card with the same details, and what visitors see now from `/data/site/current.json`, which `site-build` writes after each swap, so builds from cron or by hand show there too. The failure's output is shown only to roles with `audit:read`. `CLOUDHAL_SITE_BUILD=off` turns both off for sites built elsewhere, and a plain `cloudhal studio` keeps it off. For other integrations, `ScheduledTickOptions.onReleasePublished` (core-ts) reports releases that went live, `ReleaseServiceOptions.onReleasePublished` (and the API's `SchedulesDeps.onReleasePublished`) reports a release published now, `openLocalStore` takes `onPublished`, and `GET /api/sites/:id/site-build` reports the queue, the last build and what is served.
- Updated dependencies [6de8d67]
- Updated dependencies [060a9c8]
  - @cloudhal/astro-renderer@0.7.2
  - @cloudhal/api@0.7.2
  - @cloudhal/core-ts@0.7.2
  - @cloudhal/mcp-server@0.7.2
  - @cloudhal/cloudflare@0.7.2
  - @cloudhal/comments@0.7.2
  - @cloudhal/agent-runtime@0.7.2
  - @cloudhal/analytics@0.7.2
  - @cloudhal/core-contracts@0.7.2
  - @cloudhal/schedules@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- 24fe76b: Security fixes from the CodeQL backlog on `main`.
  
  - **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
  - **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
  - **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
- Updated dependencies [24fe76b]
  - @cloudhal/core-ts@0.7.1
  - @cloudhal/api@0.7.1
  - @cloudhal/mcp-server@0.7.1
  - @cloudhal/cloudflare@0.7.1
  - @cloudhal/comments@0.7.1
  - @cloudhal/agent-runtime@0.7.1
  - @cloudhal/analytics@0.7.1
  - @cloudhal/core-contracts@0.7.1
  - @cloudhal/schedules@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Minor Changes

- 6057871: Remote MCP clients can now authorize with OAuth 2.1 against the deployment itself (RFC-0044 Phase 2, ADR-0045). Better Auth's `mcp()` and `jwt()` plugins run in the Studio's auth instance when the runtime has a stable public origin: the admin Worker uses its origin, `cloudhal studio` needs `--base-url` / `CLOUDHAL_BASE_URL` (it logs why OAuth is off otherwise), and `CLOUDHAL_MCP_OAUTH=off` turns it off. Access tokens are Ed25519 JWTs bound to `/mcp` for one hour, refresh tokens rotate with a 30-second reuse window, and each connection is approved on Studio's new consent screen (`/oauth/consent`), which narrows the requested scopes by the member's role and records an `agent_grants` row (migration `0031_oauth`). A token resolves to the same principal an agent key does; revoking a connection (`DELETE /api/agent-grants/:id`) or removing the member refuses it on its next call. The Better Auth family moves to 1.7.18. Client registration (CIMD, DCR) and the "Connected agents" screen follow in Phase 3.

### Patch Changes

- d363160: Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Document clients are fetched at most hourly per client, with budgets in Cloudhal's own counters that never lock out stored clients, a cap of 5,000 that evicts unused clients (the well-known clients' hosts are exempt), pruning after three hours unused, and a failed refetch that refuses the client; migration `0032_oauth_client_kind_index` indexes them. Redirect URIs must be https, loopback http (any port) or a native app's private-use scheme (`cursor`, `vscode`, reverse-domain, `CLOUDHAL_MCP_REDIRECT_SCHEMES`), and the client host list applies at every authorization. With DCR off, the clients it registered earlier cannot start new authorizations. The consent screen shows client names plain and short, a document client's host first, and marks self-registered clients as unverified. `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied, and the request is notified while it waits. `safeFetch` results carry the response headers.
- e6fe6eb: Studio shows "Connected agents" and how to connect an MCP client by URL (RFC-0044 Phase 3b). On `/agents`, each member sees the apps they connected through OAuth. A client is named as the consent screen named it: a metadata document's host first, a self-registered client as not verified, a name that looks like a well-known client with a warning. Each row shows what the connection can do in words, its mode and when it was last used, and has Disconnect, which uses the existing revoke. Administrators see every member's connections under **All keys**. "Connect an MCP client" gains a **Connect by URL** tab: the deployment's `/mcp` URL, steps for Claude, Claude Code, ChatGPT and Codex, Cursor, VS Code and the MCP Inspector, and a note where a client needs dynamic client registration that is off.
  
  `GET /api/agent-grants` now returns `client` (`kind`, a document client's `host`, `lookalike`) with the name sanitized, and with `?all=1` each owner's `role`. `/api/instance` reports `features.mcpOauthClients`: the `/mcp` resource, and whether metadata documents and dynamic registration are on. The new guide is `docs/guides/mcp-oauth.md`, and the MCP server README has an Authentication section.
- Updated dependencies [6057871]
- Updated dependencies [d363160]
- Updated dependencies [e6fe6eb]
  - @cloudhal/storage@0.7.0
  - @cloudhal/api@0.7.0
  - @cloudhal/cloudflare@0.7.0
  - @cloudhal/mcp-server@0.7.0
  - @cloudhal/core-ts@0.7.0
  - @cloudhal/agent-runtime@0.7.0
  - @cloudhal/analytics@0.7.0
  - @cloudhal/comments@0.7.0
  - @cloudhal/schedules@0.7.0
  - @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: Slug and name trims run in one linear pass instead of `/^-+|-+$/g` (CodeQL js/polynomial-redos, #168). This covers `slugify`, `foldName` and `slugifyFilename` in core-ts (the new `trimChar` is exported from `@cloudhal/core-ts/names`), heading ids in astro-renderer, and Studio's option, media and entry slugs. Results are unchanged. These trims were already linear in practice, because a run of other characters was collapsed to one `-` first. These inputs were quadratic and are linear now: analytics' `datasetName` on a long run of `_` inside a deployment name; json-render component keys in `fromJsonRender` (`./interop`); trailing whitespace in directive blocks and on comment lines; trailing `/` in request paths (the playground guard and route matching in api, analytics paths, the renderer's link localizing and redirect splats, the docs Worker). The new `trimEndChar` is exported from `@cloudhal/core-ts/names` too.
  
  Also in 0.6.3, with no changeset at the time (#161): Studio's "Not published" badges and its "unknown" scheduler state show their status dot again. They used a Badge variant without a dot colour and rendered no dot.
- c15218e: Second ReDoS sweep (#174). Input that made a regex backtrack is now handled in linear time; results are unchanged.
  
  - **Unauthenticated password-reset request.** `POST /api/password-reset/request` (and invite creation) checks the address length before anything else, and the address check no longer backtracks: `a@` followed by many dots used to cost seconds of CPU per request. Public token endpoints (`/api/password-reset/*`, invite acceptance) refuse a JSON body over 64 KiB with `413 payload_too_large`, whether or not it declares a `content-length`.
  - **core-ts.** Redirect path normalising and matching (on every site request): `normalisePath`, `joinTarget`, and `ancestorPaths`, which no longer lists ancestors that no redirect can match: those longer than a `from` may be (1024 code points) or holding `//`. Directive lines in search text keep their braces on one line, so a directive whose `{…}` spans a lone `\r` is no longer read as one. Search text built at publish time: fenced code, links, images and tags. SVG upload checks: CSS comments, `url(…)` references (about cubic on `url(` followed by spaces) and width/height lengths (new `css-scan.ts`).
  - **schedules.** The feed check's CDATA, element and `<enclosure>`/`<media:content>` url scans, and `urlPath`.
  - **agent-runtime.** SKILL.md frontmatter lines (a line of spaces was quadratic).
  - **Studio** (in `@cloudhal/cli`): the markdown body editor's trailing-newline trims.
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [c15218e]
  - @cloudhal/core-ts@0.6.5
  - @cloudhal/analytics@0.6.5
  - @cloudhal/comments@0.6.5
  - @cloudhal/agent-runtime@0.6.5
  - @cloudhal/api@0.6.5
  - @cloudhal/storage@0.6.5
  - @cloudhal/schedules@0.6.5
  - @cloudhal/cloudflare@0.6.5
  - @cloudhal/mcp-server@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- 471087a: **Security (self-hosting, #165).** In 0.6.3 a self-hosted `cloudhal studio` (the Docker image included) exposed to a network before its first sign-up could be claimed by whoever reached it first: the first account to sign up became the Owner, and nothing on the Node path asked for the setup token the Cloudflare deployment already requires. If you run 0.6.3 beyond `localhost`, upgrade and check that the Owner account is yours. In 0.6.4:
  
  - **A setup token for the first account.** While nobody has an account, `cloudhal studio` requires the one-time token from `CLOUDHAL_SETUP_TOKEN` (32 characters or more, letters, digits and `- . _ ~` only, e.g. `openssl rand -hex 32`; a shorter or other value stops the start) or, when that is unset, one it generates at start and prints as a `…/login#setup=<token>` link to its output (read it from the container's logs: `docker compose logs cloudhal`). Sign-up without the token is refused; once the Owner exists the link is no longer printed. An operator's own token is never printed.
  - **Sign-in from the address browsers actually use.** With `--host` beyond loopback and no `--base-url`, Better Auth refused every sign-up, sign-in and sign-out with `403 INVALID_ORIGIN` because only `http://localhost:<port>` was trusted. Without a public origin Studio now also trusts the origin each request was made to, as the API's own CSRF check does (on a loopback `--host` only when that origin is `localhost`, `127.0.0.1` or `[::1]`, so a DNS name rebound to the machine is not trusted); with `--base-url` set, that origin alone (plus `CLOUDHAL_TRUSTED_ORIGINS`) may sign in. `--base-url` is the origin browsers open Studio at: required behind a reverse proxy and recommended whenever `--host` is not loopback; a start without it beyond loopback prints a one-line warning.
  - **`--no-auth` stays on this machine.** It is refused unless `--host` is loopback (`127.0.0.1`, the default, or `::1`) and `--behind-proxy` is off.
  - **Rate limits count the real client.** The public token endpoints (invites, password resets) and Better Auth's own limits keyed on `X-Forwarded-For` / `CF-Connecting-IP` as the client sent them. `serveNode` now derives the client's address itself: the socket's, or with `trustProxy` the last `X-Forwarded-For` hop, which the proxy appended; the API (`ApiDeps.clientAddressHeader`) and Better Auth (`AuthOptions.clientAddressHeader`) read only that value on Node, while Workers keep `CF-Connecting-IP`. Sessions record that address too, and Better Auth's own limits (sign-in and sign-up: 3 per 10 s per address) now apply on Node as on Workers, stored in the project's SQLite; before they were on only under `NODE_ENV=production`.
  - Behind a trusted proxy, `forwardedUrl` takes the last value of `X-Forwarded-Proto` / `X-Forwarded-Host`, the one the proxy added, not the first, which a client can send.
  - `--base-url` is also the origin of invite and password-reset links (`ApiDeps.studioOrigin`).
  - Studio's setup banner no longer names only `cloudhal deploy`: it speaks of the setup link printed when Cloudhal started or was deployed (other languages are AI drafts awaiting review).
  - Studio's login page reads `#setup=<token>` without form decoding, so an operator's own token containing `+` (from `openssl rand -base64`, for a Cloudflare deployment too) is no longer turned into a space and refused.
  - **`--behind-proxy` needs `--base-url`.** `cloudhal studio` refuses to start with `--behind-proxy` / `CLOUDHAL_BEHIND_PROXY=1` and no `--base-url` / `CLOUDHAL_BASE_URL`. Behind a proxy the public origin is known, and as Better Auth's base URL it makes session cookies `Secure` (`__Secure-` prefix) on https and is the one origin sign-in accepts. In 0.6.3 that combination could not sign in at all, so no working setup breaks.
  - `--init-if-empty` stages the scaffold in `.cloudhal-init` inside the folder and moves it into place with `cloudhal.json` last, so a container stopped during its first start no longer crash-loops on "is not empty": the next start redoes the scaffold when the staged `cloudhal.json` is missing, cut off or names no site, and finishes it otherwise. A fresh ext4 volume whose only entry is `lost+found` counts as empty.
  - A bare `--host` means `0.0.0.0`, every IPv4 address; pass `--host ::` for IPv6 as well. The help says so.
  
  New in `@cloudhal/api`: `CLIENT_ADDRESS_HEADER`, `clientAddress` and `inboundRequest` in `@cloudhal/api/node`; `trustedOriginsWithOwn` (with `loopbackOnly`) and `AuthOptions.trustedOrigins` as a function in `@cloudhal/api/auth`; `createAuthFor` takes `setupToken`, `trustRequestOrigin` and `originCheck`. `studio()` returns `setup` (the link, while nobody has an account) and `warnings`.
- b073595: Status pages (RFC-0043 §1, #117). A site that cannot show its pages answers with one small, translated, self-contained page instead of plain text: `not-published` (503, `Retry-After: 3600`, `noindex`) before the first publish, `preview-expired` (410) for a preview link that does not verify, `unavailable` (503) for a Worker that serves no site, and `error` (500, with the `cf-ray` as a reference) when a render fails. The Site Worker answers them before Astro runs, every one `no-store` with its own CSP; `GET /__cloudhal/health` answers `{ "ok": true, "state": "published" | "not-published" }` in the admin's `/api/health` shape. The page is in the request's locale (host or path prefix, then the site default, then English) for every language Studio speaks, right to left where needed, through the same `pnpm i18n:export/import` flow as Studio's catalogs. A theme may restyle it with an optional `statusPage` export in `src/theme.ts` (`@cloudhal/astro-renderer/status-page`), which falls back to the built-in page on a throw, a slow answer or an oversized document and never runs for `error`; `cloudhal dev` draws each state at `/__cloudhal/status/<state>`. The blog starter's routes use `statusPage`/`statusPlain` as their own fallback. **Behaviour change:** an invalid or expired preview link now answers 410 instead of silently showing the published page.
- Updated dependencies [471087a]
  - @cloudhal/api@0.6.4
  - @cloudhal/cloudflare@0.6.4
  - @cloudhal/mcp-server@0.6.4
  - @cloudhal/agent-runtime@0.6.4
  - @cloudhal/analytics@0.6.4
  - @cloudhal/comments@0.6.4
  - @cloudhal/core-contracts@0.6.4
  - @cloudhal/core-ts@0.6.4
  - @cloudhal/schedules@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- 1dd79c2: Dependency updates from the November 2026 Dependabot sweep. `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.152.0 (its `createTestHarness` runs Miniflare 5.20261019.2-beta, and `wrangler deploy` uploads source maps by default since 4.150). The Studio shipped in `@cloudhal/cli` is built with Tiptap 3.32.0 and `@codemirror/language` 6.13.1. The Rust crate validates with jsonschema 0.60.2, and the monorepo lints and formats with Biome 2.6.2 (Markdown and YAML formatting stay off).
- 7dddd88: `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.158.0, and `@cloudhal/astro-renderer` uses `@astrojs/cloudflare` 14.4.4, which brings `@cloudflare/vite-plugin` 1.67 (its peer range is wrangler ^4.156.1, so the two move together). `@astrojs/cloudflare` 14.4 needs Astro 7.4, so projects move to Astro 7.4.7: the blog starter asks for it, and the `astro` peer range of `@cloudhal/astro-renderer` and `@cloudhal/cli` is now ^7.4.0 (was ^7.3.0). The blog starter asks for wrangler ^4.158.0.
- b347d4a: Self-hosting (#143): the official Docker image `ghcr.io/cloudhal-dev/cloudhal`, built from this release for linux/amd64 and linux/arm64 (tags `X.Y.Z`, `X.Y`, `latest`; `edge` nightly from `main`). One container runs `cloudhal studio` — Studio, the API and the MCP endpoint — with the project, its SQLite database and media on a `/data` volume; the first start on an empty volume scaffolds the project. `site-build` inside the container writes the public site as static HTML, which the compose file's optional Caddy serves with automatic TLS next to Studio. Guide: docs/guides/self-host.md.
- f6bb8cb: The Studio bundle shipped in `@cloudhal/cli` no longer contains seroval 1.6.8 (a transitive dependency of `@tanstack/react-router`), which GHSA-9wx9-5pv9-3349 and GHSA-f86p-h4j2-7qgj affect: the lockfile now resolves seroval 1.7.9 and seroval-plugins 1.7.8. In the same sweep the monorepo lockfiles move undici to 7.30.2 (an override for the 7.28.0 that Miniflare 4 pins; GHSA-2m5v-pch6-74hx, GHSA-4w7w-5xrc-9h26, GHSA-qrxm-fqhp-jwvm, GHSA-xjj6-f33q-929c, GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3, GHSA-4cwx-7wf7-3272 and the medium/low undici 7.x advisories patched in 7.29.0 to 7.30.1) and 8.12.4 (the same advisories on the 8.x line, through astro's unifont), rustls to 0.23.46 (GHSA-c8m5-c952-6cm4, GHSA-h2v8-394m-p7vv, GHSA-w44r-93j7-qv28, GHSA-vp88-798v-h67f), and, found by `cargo audit`, rustls-webpki to 0.103.16 (RUSTSEC-2026-0382), webpki-root-certs to 1.0.11 (RUSTSEC-2026-0383) and tokio to 1.54.1 (RUSTSEC-2026-0386, unsoundness). undici and rustls are development-time dependencies of this repository only; no published package depends on them.
- 28e9406: Self-hosting (#143): `cloudhal studio` can be reached from beyond the machine it runs on. `--host <addr>` (or `CLOUDHAL_HOST`) is the address it listens on (default `127.0.0.1`; `0.0.0.0` in a container), `--base-url <url>` (or `CLOUDHAL_BASE_URL`) the public origin behind a reverse proxy — Better Auth's `baseURL` (its session cookies are `Secure` for https), a trusted origin for the API's CSRF check, and the URL the command prints — and `--behind-proxy` (or `CLOUDHAL_BEHIND_PROXY=1`) makes the server take each request's scheme and host from the proxy's `X-Forwarded-Proto` / `X-Forwarded-Host` (`serveNode`'s new `trustProxy`, with `forwardedUrl` / `forwardedRequest` in `@cloudhal/api/node`); without the flag those headers are ignored, as before. `--init-if-empty` (or `CLOUDHAL_INIT=<starter>`, with `--starter`, `--name` / `CLOUDHAL_SITE_NAME`) creates the project the way `cloudhal init` does when the folder has no `cloudhal.json`, so a container starts on an empty volume; a folder with other files is refused, as `init` refuses it. `studio()` returns the bound `port` next to `url`. `cloudhal dev --host` now also takes an address (`--host [<addr>]`; alone it still means every interface).
- Updated dependencies [1dd79c2]
- Updated dependencies [7dddd88]
- Updated dependencies [bf20e64]
- Updated dependencies [28e9406]
  - @cloudhal/cloudflare@0.6.3
  - @cloudhal/api@0.6.3
  - @cloudhal/agent-runtime@0.6.3
  - @cloudhal/mcp-server@0.6.3
  - @cloudhal/analytics@0.6.3
  - @cloudhal/comments@0.6.3
  - @cloudhal/core-contracts@0.6.3
  - @cloudhal/core-ts@0.6.3
  - @cloudhal/schedules@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- 330b650: New `cloudhal export` (RFC-0039, #47) writes one site of the local project to a single `.cloudhal` file. The file is a gzipped tar holding the site's content graph (nodes, snapshots and the node bodies they reference, as NDJSON parts), its media files and its takedown ledger, with every file's SHA-256 listed in the manifest. The flags:
  
  - `--out <file>` names the file, and replaces a file already there once the new one is complete. By default the file is `<site-slug>-<YYYYMMDD>.cloudhal` in the current folder, dated by the newest timestamp among the rows it holds (deleting content alone does not move that date; the next edit or snapshot does). A file already at the default name is replaced only by the same archive; any other (a later edit the same day, other flags, a deletion) is left alone and the export asks for `--out`.
  - `--site <id>` exports another site listed in `cloudhal.json` `sites`. `--site`, `--no-media` and `--latest-only` are refused on every other command.
  - `--no-media` writes the graph only.
  - `--latest-only` keeps only the published and the latest snapshot, and only the media they and the current content need. It is refused while a field operation is unfinished (`cloudhal fields continue|revert`).
  
  A damaged or missing local media file stops the export (run `cloudhal media verify`); so do Ctrl-C and SIGTERM. Either way no file is written and an existing one is left as it was. Exporting an unchanged site again with the same CLI and Node version gives the same bytes. An archive never contains user accounts, sessions, roles, agent keys, comments, readers, analytics, the audit log, scheduled releases, automations, schedule runs, pending approvals, open edit suggestions, deployment secrets or webhook credentials, and the export prints this list. Its history does name who made each change (the user or agent of each snapshot, upload, block edit, review and takedown).
- 2c18a7c: New `cloudhal import <file> [--dry-run]` (RFC-0039, #47) reads a `.cloudhal` file written by `cloudhal export` into the local project, keeping the site's id.
  
  - It reads the file twice. First it verifies every file's size and SHA-256, every row and every node body (each must be the node its snapshot refs name), and checks the archive against the project. A damaged or edited file, invalid content, an archive of another site, a site whose nodes differ, or missing media is therefore refused before anything is written. Then it reads the file again, refusing it if it changed in between, copies the media the project lacks and imports the graph, keeping the archive's published snapshot as `cloudhal pull` does.
  - By default a bootstrap import. The archive's site must be `cloudhal.json`'s `siteId` or listed in `sites`, and the project must not hold it yet or hold exactly its nodes; missing snapshots, node bodies and media are added. A site whose nodes differ is refused; `--replace` replaces them (see its own note).
  - An archive written with `--no-media` imports only when the project already has its media.
  - Taken-down content stays down: the archive's takedowns are recorded and their bytes never written, a local copy of content the archive's ledger took down is deleted (the summary says how many), and an archive carrying content this project has taken down is refused.
  - `--dry-run` prints the manifest and what the import would add, change or remove (nodes by kind and title, snapshots, media to copy), writes nothing, and exits 1 when the import would be refused.
  - Ctrl-C and SIGTERM stop the import before the graph is written; media already copied stay in the blob store, unreferenced, and the next import reuses them. A storage failure while the graph is written says the import stopped partway; running it again completes it, search index included.
  - Opening an existing local store applies pending migrations, as every command does; a project without one gets none from a dry run or a refused import.
- 33ae911: `cloudhal import <file> --replace [--dry-run]` (RFC-0039 rollout step 4, #47) makes the local site's nodes the archive's, its published snapshot included, as `cloudhal pull --replace` does. `cloudhal push` still keeps a deployment's own published snapshot, so a local replace never moves production. Snapshots are only ever added.
  
  - When it changes a site the project already holds, the current graph is saved first as a snapshot labelled `before import <file>` and the result as `import <file>`; the summary prints `(undo: cloudhal import --revert <id>)`. A new or unchanged site gets no snapshot; a site the plan found unchanged is checked again just before the write, and refused if another process changed it meanwhile. A run that stopped after the first snapshot reuses it the next time.
  - The archive's nodes keep their revs, as with `pull --replace`. A Studio tab or agent still holding a node at the rev the archive gives it can save over it without a conflict, so the summary counts those nodes and says to reload open Studio tabs.
  - New `cloudhal import --revert <snapshot-id> [--dry-run]` brings the site back to a `before import` snapshot, its published snapshot included, saving the current graph first as `before revert import <file>`, so a revert can itself be reverted. Its revs only move forward: a node edited since comes back at the rev after its current one, so a stale editor gets a conflict. Studio's rollback only moves the published pointer to an earlier snapshot, which cannot undo a replace.
  - An archive of a site `cloudhal.json` does not list switches its `siteId`, and the old id's place in `sites`, to the archive's, editing only those values in the file (layout and other keys stay as written), once the import has landed. The old site stays in the local store, unlisted and untouched; writing the old id back by hand undoes the switch (`--revert` restores nodes only), and the summary names `cloudhal site delete` to remove the old site for good. A deployed project is warned that its deployment serves the old site, and that a deployment of the imported site is updated from the project that deployed it.
  - Refused before anything is written: open releases of the site (cancel them in Studio), an unfinished field operation, a hostname another local site serves (now a refusal `--dry-run` reports, for bootstrap imports too), and an archive site id `cloudhal.json` cannot name.
  - `--dry-run` shows the snapshots it would take, the published-snapshot change and the `cloudhal.json` change; it exits 0, or 1 when the import would be refused.
  - `--cancel-schedules` is now refused by every command but `cloudhal push`.
- 68cd5a1: Studio shows **Ended (collection rule)** beside the status of a published entry whose collection's expiry has passed (RFC-0042 §3.3, #113), in the collection list and in the entry editor's header. Until now such an entry looked plainly published while the site had already left it out of lists, or answered "not found". The badge explains itself on hover, from the keyboard and with a tap on touch screens. It names the date field, when the entry ended in the site's time zone, and what the site does: the page keeps its address but leaves lists, feeds, the sitemap and search, or the page answers "not found". Drafts, embargoed entries and entries whose own "Hide after" has passed get no badge (their own dates show in the editor's Schedule card). A translation reads its original's date only while the original is published, as the site does. The badge and its words load only for collections that have an expiry. Translations of the new words are AI drafts awaiting review.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [df8695e]
- Updated dependencies [f73d05a]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [77fa9e5]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/api@0.6.2
  - @cloudhal/cloudflare@0.6.2
  - @cloudhal/schedules@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/mcp-server@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/agent-runtime@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- 40dbfcb: Gaps an agent hit building a site through MCP:
  
  - **Section-only theme blocks in article bodies are refused.** A theme block type with `where: ["section"]` (say `link-cards`) has no component in an article, and drew "unknown component" there. `create_entry`/`update_entry` now refuse it inside a body ```` ```surface ```` fence (`invalid_surface`, with the component's path); primitives, built-in blocks and theme blocks that allow `body` stay. `get_catalog`'s "In article bodies" lists which blocks a body may use and which are page sections only.
  - **`list_entries` lists every collection by default**, not only `posts`: a site whose articles live in `blog` got `[]`. `where`/`orderBy` need the collection whose list fields they use; without one they are refused (`invalid_query` at `collection`) instead of ignored.
  - **`long-line` gives a text column one verdict.** It counted characters over a rounded line count, so how full a paragraph's last line was decided whether it passed, and identical paragraphs in one column disagreed. It now counts the characters on each rendered line, leaves each paragraph's last line out, and pools the paragraphs of one width and font: one example per column, with its width and how many paragraphs it holds.
  - **Blog starter:** a primary surface `Button` in an article body keeps its `on-brand` text; the body's link colour no longer applies to buttons (it failed contrast at 2.5:1 light, 1.3:1 dark).
- 4103a32: Studio on a playground (RFC-0036): the Build page no longer says "This deployment can't reach Workers AI". It says Build with AI is available in your own install, since the playground leaves AI out, and links to deploying Cloudhal. Translations of the new sentence are AI drafts awaiting review.
- 92c3867: Theme scripts work on deployed sites, and `render_page` says when they would not.
  
  - The `cloudhal()` integration no longer lets Astro inline a component's `<script>` (under 4 KB) into the page, where the Site Worker's `script-src 'self'` blocked it: script chunks always ship as files (`build.assetsInlineLimit`), other assets keep the project's own limit. A theme that set `vite.build.assetsInlineLimit` itself for this can drop it.
  - `cloudhal dev` sends the Site Worker's policy as `Content-Security-Policy-Report-Only` on pages without their own, so the browser console shows what a deploy would block without breaking Vite's dev client.
  - `render_page` and `cloudhal render` gain two checks: `surface-broken` (a body ```` ```surface ```` fence the preview cannot draw, or a component with an unknown block type or props that do not fit, named with the problem) and `script-blocked` (a script the page's CSP refused, inline or by URL; under `cloudhal dev`'s report-only policy, what a deploy would block).
- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
- Updated dependencies [92c3867]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/mcp-server@0.6.1
  - @cloudhal/api@0.6.1
  - @cloudhal/cloudflare@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/agent-runtime@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/core-contracts@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 5aced9a: Per-collection feeds (RFC-0042 step 6, ADR-0044). Each collection with a permalink prefix has an RSS feed at `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml` or the locale's domain): its newest listed entries, so expiry and time gates apply as in the site feed, with the same cache tag and edge-cache cap; `feed: false` answers 404. The `cloudhal()` integration serves it from a middleware on every target, only where the theme's own routes answered 404, so a theme's own route wins and old theme copies gain the feeds; static builds write them because `staticPaths().feeds` now lists every collection feed path for the starter's `[...path]/rss.xml` route. New theme API `collectionFeedLink(site, collection, origin, locale?)` (`./seo`, `./collection-feeds`) gives the `<link rel="alternate">`; the blog starter adds it on entry pages and on pages that list a collection. Previews now list `contentList` sections with `where`/`orderBy` through the same evaluator as the site (`renderSectionHtml`'s new optional `listing` argument, passed by `renderPagePreview`), so an entry without the field's value no longer shows under "upcoming". New guide: `docs/guides/structured-data.md`.
- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.
- 2e89658: Collections stage 3, step 5 (RFC-0042 §7 / ADR-0044): Studio.
  
  - **Collection settings** get three cards, each saved on its own: **Listing fields** (up to four fields, ordered; a field content lists still use names those pages), **Expiry** (a date or date-and-time field, "Leave lists" or "Hide the page" explained in words, a grace in minutes, and how many published entries are already past it; a site Worker that does not apply expiry yet says to deploy first) and **Structured data** (Event, Job posting, Product or Recipe; every property offers only the sources that fit it, required ones are marked, problems show while editing, and a chosen entry's JSON-LD is previewed with a link to Google's Rich Results Test).
  - **Create listing page** makes a draft page at the collection's address with a content list of it (upcoming first for a collection with a date listing field and an expiry) and opens it; when a page already lives there, the action opens that page.
  - **Collection lists** show listing fields as columns, filter by them and sort by number and date fields. Filters and sort live in the URL and ask the API by field, one page at a time.
  - **Page editor**: content list sections get conditions and an order by the collection's listing fields; refused conditions show on their row.
  - Words for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported`, the `preview_structured_data` tool and the expiry auto-publish check. Translations are AI drafts awaiting review.
  - `@cloudhal/api`: new read-only `GET /api/sites/:siteId/entries/:entryId/structured-data` (`content:read`), the REST twin of MCP's `preview_structured_data`: the preset document an entry's page emits, its issues and the preset's warnings.

### Patch Changes

- Updated dependencies [321e8be]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [2e89658]
- Updated dependencies [84c6d94]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/mcp-server@0.6.0
  - @cloudhal/cloudflare@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/api@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

- cc263c3: Typed custom fields, step 3 (RFC-0041 §6 / ADR-0043): field operations.
  
  - **`runFieldOperation` / `continueFieldOperation` / `revertFieldOperation` / `fieldOperationStatus`** in `@cloudhal/core-ts` run `rename_field`, `change_field_type`, `set_field_localized` and `remove_field`: a dry run (entries touched, values moved, converted, cleared, removed, unchanged and unconvertible, per locale, with samples), a `before …` snapshot whose id is the operation id, the new definition with its `migration` marker (phase A), entries rewritten in guarded batches of 200 that resume after an interruption (phase B), the marker dropped once nothing is pending (phase C) and an `after` snapshot. Only the draft graph changes. A type change follows a closed conversion table (`convertFieldValue`, exported from `@cloudhal/core-ts/fields`) and refuses values it cannot convert (`field_values_unconvertible`) unless `onInvalid: "clear"`. One operation per collection at a time (`operation_in_progress`). Reverting restores the earlier definition and the entries nobody edited since, and converts edited ones back.
  - **Readers stay consistent mid-run:** `resolveFields` converts values still in the old type, and a field being removed reads as gone; a person's entry write during an operation goes through the marker, so edits and the operation converge.
  - **Translations:** changing only non-localized field values of an original no longer marks its translations stale (their recorded source hash follows, in the same batch); operations keep fresh translations fresh.
  - **API:** `POST /api/sites/:id/collections/:key/fields/operations` (`dryRun`, `?continue=<id>`), `GET …/:operationId`, `POST …/:operationId/revert` (`site:settings` and `content:write`), and the same under `/api/admin` with the deployment token.
  - **CLI:** `cloudhal fields rename|retype|localize|remove|continue|revert [--dry-run] [--remote]`; the dry run also lists theme files that read the field directly.
- 92d3362: Typed custom fields, step 6 (RFC-0041 §9 / ADR-0043): renderer and themes. Additive only: `entry.fields` still means exactly what is stored, and themes copied before this release build and render as before (a frozen 0.4.0 theme joins the compat test).
  
  - **`GraphSource.entryFields(entry, options?)`** on live and snapshot sources (and `entryFields(source, entry, options?)` from `@cloudhal/astro-renderer/fields` for any source): an entry's typed fields as a theme draws them, by key in definition order. Values are resolved by the language rules (a translation's empty localized field reads the original's, `fromOriginal`; non-localized fields come from the translation group's original; language editions own their values), labelled in the page's language and made safe: rich text as HTML from the article body's markdown pipeline (raw HTML escaped, `safeHref` on links), URLs through `safeHref` (dropped when unsafe), images as `<img>` attributes with the asset's alt in the page's language, everything else as formatted text. Also `renderFields`, `hasShownFields`, and `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` re-exported.
  - **`formatFieldValue(value, def, { locale, defaultLocale?, timeZone?, words? })`** in `@cloudhal/core-ts/fields`: a value as plain text with `Intl` (numbers, dates that never shift a day, instants in their own zone, option labels as a list, yes/no words).
  - **`EntryFields.astro`** in `@cloudhal/astro-renderer/components`: a plain, unstyled `<dl class="ch-fields">` of the fields that have a value, with `data-field` / `data-type` hooks for themes; nothing at all when none has one.
  - **Blog starter:** articles of collections with fields show a "Details" list under the cover (English, Turkish and Japanese words). Entries of collections without definitions render byte for byte as before.
  - New guide: `docs/guides/fields.md` (defining fields in Studio, MCP, the API and the CLI; operations; languages; theme API; security).
- 05274d3: Typed custom fields, step 5 (RFC-0041 §7 / ADR-0043): Studio.
  
  - **Entry editor › Fields:** collections with field definitions get a "Fields" card in the entry editor (loaded only for them), one control per type — text, rich text (the body editor), number, yes/no, date, date and time in its own zone, link, image (the media picker) and choice (one or several). Labels and help follow the Studio language, required fields say "Needed to publish", and the API's issues show on their field. On a translation, shared (non-localized) fields are read-only with the original's value and a link to it; empty per-language fields show the original's value as their placeholder. Values save with the entry.
  - **Collection settings › Fields:** a builder to add fields (the key follows the label until saved), reorder them and edit labels, help, limits and options, saved together. Renaming, changing a type or the languages of a saved field, and removing one open a dialog that runs the dry run first (entries changed, values moved, converted or cleared, per language, examples, a note about themes), needs confirmation — and an explicit opt-in to clear values that cannot be converted — then runs the operation to the end and offers Revert. A running operation shows its progress and can be continued. Only people who may change site settings edit fields; others see them read-only.
  - Activity and Approvals name the collection and field tools, field operations that convert or remove values ask for confirmation before approval, and every field error code reads as a sentence in the Studio language. New words live in a lazy `fields` namespace (drafts in every language, awaiting review).

### Patch Changes

- 0ba1e01: Studio (RFC-0040 §4): a collection's settings get a Comments section (saved in the site's comment settings), the site overview lists recent content across every collection, and entries open at `/sites/<id>/collections/<collection>/<entry>` — the old `/articles/<entry>` links redirect there. The command palette goes to each collection.
- Updated dependencies [672b993]
- Updated dependencies [9d04a37]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/mcp-server@0.5.0
  - @cloudhal/api@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0
  - @cloudhal/cloudflare@0.5.0

## 0.4.0

### Minor Changes

- 7f88a5a: Studio: first-class collections (RFC-0040 step 3).
  - **Sidebar:** lists every collection of the site, declared ones and those that agents or imports filled. Each shows its name in Studio's language, its icon and its entry count, followed by **Collections**.
  - **Collections screen:** shows each collection's address, entry count and whether it is named. It has a **New collection** dialog with plural and singular name, key, icon and address, and the API checks the address for overlaps.
  - **Collection list:** each collection gets the Articles list (`/collections/<key>`, where `/articles` now redirects). Category and tag columns and filters appear only where those taxonomies apply.
  - **Collection settings:** names in every site language, icon, RSS feed, sitemap, default order, and which categories and tags apply.
  - **Editor:** its breadcrumb leads back to the entry's own collection.
  - **Elsewhere:** the comments queue, the language review options and the taxonomy dialog cover every collection.
  - **Translations:** new strings in all 19 languages; every language except English is an AI draft awaiting review.

### Patch Changes

- f755ce6: `render_page` on Node: a Chrome that hangs or crashes on a cold start is launched once more with a fresh profile instead of failing the render.
- f9062ce: Studio loads about 32 kB (gzip) less before the first screen: the notification panel's items, the agent-mode and elevation views and the taxonomy helpers now load when they are needed.
- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/api@0.4.0
  - @cloudhal/cloudflare@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- 6a39c6d: Fix: sites whose theme was copied from the starter before 0.3.11 rendered empty pages (200 with no body). Their `EntryList` calls the renderer's old one-argument `entryPath(entry)` (and `.map(entryPath)`), which became `entryPath(site, entry)` in 0.3.11. `entryPath` accepts the old call again (deprecated; it ignores collection permalinks — pass the site to get them).
- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/api@0.3.13
  - @cloudhal/cloudflare@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- c2b3f2e: Studio links to the live site: a "View site" button in the top bar (also in the site switcher and the ⌘K palette), "Live at" and "Last published" on the overview, "View live" and "Copy link" on published pages and articles, and the full address under the slug and path fields ("Live at" when the live snapshot serves it, "Will be at" until then). After a site publish the toast offers "View site" and "Copy link", as do rollback and approval toasts. Marking a page or article published now says it goes live with the next site publish, with a "Publish site" action, instead of "Page published".
- bc096b2: Studio shows changes that are not live yet: a badge beside Publish with the count ("2 changes", or "Not published" before the first publish) and a tooltip by kind ("3 changes aren't live yet · 2 articles and 1 page"). It comes from the new `GET /api/sites/:siteId/pending` (`site:read`): counts of what a publish would add, change and remove, by kind; adding or removing a page counts once. Studio refreshes it after every write to the site, on window focus and every 30 s.
- Updated dependencies [84d1fc3]
- Updated dependencies [bc096b2]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/api@0.3.12
  - @cloudhal/cloudflare@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/mcp-server@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/core-contracts@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 25b002c: Fewer D1 round trips per admin API request. The session is cached in a signed cookie for 60 seconds, so a session revoked elsewhere can stay usable that long (ADR-0010 addendum); membership and roles still apply at once. A member and their site roles load in one query. `get-session` is no longer rate limited, since the limiter's D1 read and write landed on every session check. Due comment purges are swept at most every 10 seconds per isolate instead of on every request.
- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.
- 2d0a257: Collection permalinks, step 2 (RFC-0038 §3–§4): changing a collection's permalink in a site update adds a prefix redirect from the old URL prefix to the new one, in every locale and in the same batch as the site update. A template may not overlap another collection, a taxonomy archive, a page or a reserved path (`path_conflict`/`reserved_path`), and pages and archives may not be created inside a configured prefix. The search index rewrites entry links on the next publish.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- 1d7998a: Studio's images load faster and stop re-downloading. Preview URLs carry the file's hash (`?v=`), so the browser keeps them for a day; without it the content route answers `private, no-cache` and a 304 through the ETag, instead of `no-store`. While an image loads, its tile shows the image's own colour and small blurred preview (computed at upload) instead of a spinner.
- bb15690: Studio switches screens faster: the signed-in session is kept between navigations (asked again after five minutes, on sign-out, on revoking sessions and on any 401) instead of being checked with the server on every click, and the pending screen shows after 150 ms instead of the router's one second, so a short wait no longer looks frozen.
- Updated dependencies [25b002c]
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
- Updated dependencies [1d7998a]
  - @cloudhal/api@0.3.11
  - @cloudhal/cloudflare@0.3.11
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- 46f59d5: The site Worker's responses carry `Vary: Host`, and redirect-host 301s never enter the edge cache (#62). Workers Cache keys by path, not hostname, so before this every host routed to one site Worker shared a cache entry per path: a `--redirect` host's 301 could be served on the site's own domain (a redirect loop), and the sites of a multi-site Worker could serve each other's cached pages.
- c2cd92e: `cloudhal deploy` retries its post-deploy calls (push check, primary domain) for up to 90 seconds while they get 401: a Workers Builds deploy makes a new deployment token, and the edge can answer from the previous admin Worker version for a few seconds. Such a build used to fail after both Workers had deployed.
- @cloudhal/api@0.3.10
  - @cloudhal/cloudflare@0.3.10
  - @cloudhal/mcp-server@0.3.10
  - @cloudhal/agent-runtime@0.3.10
  - @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-contracts@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- 348a00a: `cloudhal domain set <host> --redirect www.<host>`: hosts that answer with a 301 to the site's domain (path and query kept), routed to the site Worker as Custom Domains on the next deploy (#49). `cloudhal domain remove redirects` drops them.
- 304246e: `cloudhal domain set <host>` also makes the host the local site's primary domain, so canonical links, the sitemap and feeds use it before the first deploy (#48).
- 6f002de: `cloudhal snapshot --publish` makes no new snapshot when nothing changed since the live one; it says "nothing changed since <snapshot>" instead (#51).
- @cloudhal/api@0.3.9
  - @cloudhal/cloudflare@0.3.9
  - @cloudhal/mcp-server@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- f646b76: Blog starter: pages send their type pairing's font preloads as a `Link` header too, so a Cloudflare zone with Early Hints on starts loading the fonts with a 103 before the page arrives.
- da8fe6f: Blog starter: no more text jumping when the web fonts load. Font files move to `/fonts/v1/` and are cached for a year (`public/_headers`), so reloads draw text in its font from the first paint, and each web font gets a metric-matched fallback face (`font-fallbacks.css`), so a first visit swaps fonts without moving the text.
- da8fe6f: `render_page` and `cloudhal render` gain a `font-fallback` check: text set in a web font with no metric-matched fallback after it in its stack, which moves when the font loads.
- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
  - @cloudhal/api@0.3.8
  - @cloudhal/cloudflare@0.3.8
  - @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- 0d6b49d: `cloudhal deploy` no longer fails with "Invalid URL" after deploying a site with a custom domain from a fresh checkout (Workers Builds): wrangler lists the domain as `example.com (custom domain)`, and the note is now dropped before the address is used.
- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/api@0.3.7
  - @cloudhal/cloudflare@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/mcp-server@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- 950fb3d: Studio has a favicon: the Cloudhal mark.
- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/api@0.3.6
  - @cloudhal/cloudflare@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/mcp-server@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- 0a6ac44: Cloudhal packages are now published from GitHub Actions with npm trusted publishing and provenance: each version on npm links to the commit and workflow run that built it, and `npm audit signatures` verifies it.
- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/api@0.3.5
  - @cloudhal/cloudflare@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- 94ca22c: New projects exempt `@cloudhal/*` and `create-cloudhal` from pnpm's `minimumReleaseAge` in their `pnpm-workspace.yaml`, so pnpm installs a Cloudhal release on the day it ships instead of refusing it for a day.
- Updated dependencies [d6427d5]
- Updated dependencies [aae143f]
  - @cloudhal/api@0.3.4
  - @cloudhal/mcp-server@0.3.4
  - @cloudhal/cloudflare@0.3.4
  - @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- 54a524c: A `CLOUDHAL_DEPLOY_TOKEN` shorter than 32 characters no longer makes every `/api` request fail with 500. Only `/api/admin` is disabled (503 `deploy_token_invalid`): the error is logged once, `/api/health` reports `problems: ["deploy_token_invalid"]`, and sign-in and Studio keep working. The Workers Builds setup steps and the Deploy button guide now say not to edit `CLOUDHAL_DEPLOY_TOKEN`, because every build replaces it.
- Updated dependencies [54a524c]
  - @cloudhal/api@0.3.3
  - @cloudhal/cloudflare@0.3.3
  - @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/mcp-server@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- b2dfe81: The Deploy to Cloudflare button deploys the admin Worker under its own name. Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` to the Worker a build is connected to, and wrangler then deploys every config under that name, so the admin Worker overwrote the site Worker (the site's address served Studio). `cloudhal deploy` no longer passes `WRANGLER_CI_OVERRIDE_NAME` or `WRANGLER_CI_MATCH_TAG` to wrangler; it names each Worker itself.
- @cloudhal/agent-runtime@0.3.2
  - @cloudhal/analytics@0.3.2
  - @cloudhal/api@0.3.2
  - @cloudhal/cloudflare@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/mcp-server@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- 4a46df0: The CLI ships a freshly built Studio: 0.3.0 shipped one built before Studio's playground mode, so a playground opened at the sign-in page. On a playground, Studio's site sidebar also leaves out Analytics, Activity, Approvals, Agents and Schedules, and a `403 playground` answer reads as a feature that is off (no retries, no error states). `FetcherBlobStore` with `keys` never fetches another key: a static-assets binding with SPA fallback answers 200 for missing files.
- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/agent-runtime@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/api@0.3.1
  - @cloudhal/cloudflare@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/mcp-server@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- 346781b: Playground mode (RFC-0036): `createApi({ playground: { info } })` answers every request as the fixed `PLAYGROUND_PRINCIPAL` (an Editor with site settings and nothing installation-wide or upload-related), refuses blocked routes with `403 {error: "playground"}` through the pure `isBlockedInPlayground(method, path)` guard (also exported for the playground Worker), limits request bodies, and reports `features.playground` in `/api/instance`. Every declared route is either blocked or allowed, and a route on neither list is refused. Studio shows a session bar (time left, Reset, Deploy to Cloudflare) and leaves out team, agent and account screens on a playground.

### Patch Changes

- Updated dependencies [346781b]
- Updated dependencies [a28c22e]
- Updated dependencies [c70d3fa]
  - @cloudhal/api@0.3.0
  - @cloudhal/cloudflare@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/mcp-server@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- 6612f2c: `cloudhal deploy` runs in Cloudflare Workers Builds (`WORKERS_CI=1`), so a Deploy to Cloudflare button can set up a whole installation (docs/guides/deploy-button.md). Names come from the committed `wrangler.jsonc`, and a database id there is used without any D1 call. The starter site is seeded under `cloudhal.json`'s `siteId` when the checkout has none. Secrets stay on the Workers: only missing ones are generated, and the deployment token is new on every build. The setup link is never printed; the first build explains how the owner sets their own setup token. `seedStarterSite` takes an optional `siteId`.

### Patch Changes

- 01e3ccd: `cloudhal render` and the MCP `render_page` tool give a local Chrome 30 seconds to start instead of 10. A cold start on a busy machine or CI runner could exceed 10 seconds and fail with "Chrome did not start".
- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
- Updated dependencies [e4b1c83]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/mcp-server@0.2.0
  - @cloudhal/api@0.2.0
  - @cloudhal/cloudflare@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @cloudhal/api@0.1.1
  - @cloudhal/cloudflare@0.1.1
  - @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/mcp-server@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
