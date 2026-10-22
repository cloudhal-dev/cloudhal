# Architecture Decision Records

One file per decision, numbered, immutable once accepted (write a new ADR to supersede). Template:

```markdown
# ADR-NNNN: Title
- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD
- Related: RFC-…, ADR-…
- Sources: primary links the decision was verified against
## Context
## Decision
## Alternatives considered
| Alternative | Pros | Cons | Why not |
## Consequences (positive / negative / risks)
```

| # | Title |
|---|---|
| [0001](0001-contract-pipeline.md) | JSON Schema is the contract source; TS and Rust are generated |
| [0002](0002-storage-interface.md) | Thin SQL/blob driver interface, batch-only, two backends |
| [0003](0003-studio-architecture.md) | Studio is a Vite React SPA on Kumo; Astro only renders sites |
| [0004](0004-mcp-server.md) | Stateless MCP server (spec 2026-07-28), layered approval |
| [0005](0005-skills-format.md) | Skills follow the Agent Skills spec; Cloudhal data in metadata |
| [0006](0006-toolchain-and-runtime.md) | Node-first toolchain and runtime (the planned Bun support was not built; addendum) |
| [0007](0007-license-and-community.md) | Apache-2.0 open core, DCO, Contributor Covenant 3.0 |
| [0008](0008-runtime-validation-and-d1-testing.md) | Precompiled schema validators; D1 tested through Miniflare |
| [0009](0009-renderer-sources-and-local-dev.md) | Renderer: live in dev, snapshot in builds; starters own routes |
| [0010](0010-auth-better-auth.md) | Better Auth for identity, tenants and MCP authorization |
| [0011](0011-agent-layer.md) | Agent layer: SDK-free policy/audit/skills, MCP wrapper, MRTR approval + token fallback, API keys |
| [0012](0012-cloudflare-deployment.md) | Cloudflare: site + admin Workers, pointer-flip publishing, Workers Cache, signed previews |
| [0013](0013-npm-packaging.md) | npm packaging: sources in the repo, dist in tarballs; CLI ships Studio/starters/skills; create-cloudhal |
| [0014](0014-out-of-band-approvals.md) | Approvals in Studio: single use, bound to the call and the content state; no agent self-approval |
| [0015](0015-agent-modes.md) | Agent modes: plan, manual, edits, auto (low-risk publishes), bypass (local only) |
| [0016](0016-time-boxed-elevation.md) | Time-boxed elevation: a more autonomous mode until a set time, computed per call, audited |
| [0017](0017-taxonomy-and-redirects.md) | Taxonomy and redirects are graph nodes; terms referenced by id; governed rename/merge with automatic 301s (RFC-0002) |
| [0018](0018-roles-and-invites.md) | Staff roles are scope sets; agent keys never exceed their creator; approvals follow roles; invites are one-time links (RFC-0005) |
| [0019](0019-navigation-menus.md) | Menus are Menu nodes with a tree of id-referenced items; agent edits always approved (RFC-0003) |
| [0020](0020-assets-and-media.md) | Assets are content-addressed nodes with SHA-256; SSRF-safe agent fetch; asset:upload / asset:manage (RFC-0004) |
| [0021](0021-site-analytics.md) | Site analytics: first-party cookie-less script, Workers Analytics Engine via bindings (no token), D1 rollups, `analytics:read` (RFC-0006) |
| [0022](0022-reader-comments.md) | Reader comments: guest comments held for moderation, D1 outside the graph, first-party proof of work, agents label and hide while people approve (RFC-0007) |
| [0023](0023-schedules.md) | Schedules: content releases pinned to exact versions, render-time time gates, one every-minute tick (cron or DO alarm), deterministic jobs plus MCP agent tasks (RFC-0008) |
| [0024](0024-snapshot-bundles.md) | Snapshot bundles: the site Worker loads a published snapshot from 256-node shard objects, written at publish and read-through; per-node blobs stay the source of truth (RFC-0010) |
| [0025](0025-email-delivery.md) | Email delivery: one `MailSender` on the Cloudflare Email Service binding, locked to one sender; emailed invites and self-service password reset (RFC-0011) |
| [0026](0026-html-body-sanitizer.md) | HTML bodies are sanitized at render time: parse5 (spec-compliant, Worker-safe), a fixed allowlist, our own serializer; stored content unchanged (RFC-0012) |
| [0027](0027-observability-and-placement.md) | `cloudhal.json` `observability` (log sampling, opt-in traces) and `placement: "smart"` for the admin Worker; query strings always redacted from logs and traces (RFC-0013) |
| [0028](0028-body-blocks-and-operations.md) | Bodies stay markdown under profile v1 with a store-maintained block index (`profile`, `blocks`); agents edit by block with `get_body`/`edit_body` (apply, rebase, propose); diffs and proposals by block (RFC-0014) |
| [0029](0029-ai-commands-and-model-choice.md) | In-editor AI on Cloudflare Workers AI (binding on Workers, REST from Node, optional AI Gateway); the model is chosen per site; `ai:invoke` person-only, daily cap, audited without text (RFC-0016) |
| [0030](0030-block-registry.md) | One block registry for page sections (`component` kind) and bodies (markdown directives); props in a JSON Schema subset checked by an `eval`-free interpreter that also drives Studio forms; global English type names (RFC-0015) |
| [0031](0031-theme-and-ui-generator.md) | A generator that writes data only: theme settings in `Site.theme.config` (declared by the theme, props subset, contrast rules), plans applied as drafts or proposed, Studio panels as validated Kumo catalog trees with allowlisted components, scoped read-only data and actions through the policy engine (RFC-0017) |
| [0032](0032-icu-messages.md) | Studio messages are an ICU MessageFormat 1 subset (plural, select, selectordinal, number), compiled to data at build time by `@cloudhal/messages` (no parser shipped, no `eval`); parameter types generated from English (RFC-0032) |
| [0033](0033-rtl-layout.md) | Right-to-left Studio — logical properties (codemod + design-lint rule), `DirectionProvider` and `<html dir>` from the locale registry, a `DirectionalIcon` block, a generated Kumo patch until upstream ships logical properties |
| [0034](0034-translation-platform.md) | Translation workflow — the repo stays the source of truth, nested ICU JSON export/import with the checks on every import, Weblate self-hosted (Tolgee as the alternative), AI drafts by an agent skill uploaded as needing review |
| [0035](0035-multilingual-publishing.md) | Published content in several languages: one node per locale in translation groups (source rev/hash, method, provenance, review), structure keeps per-locale maps, locale in the URL with generated `hreflang`, linked landing-page layouts, agents draft behind glossary/checks/score while people review and unreviewed machine text is labelled, Site = publication (RFC-0033) |
| [0036](0036-multi-site-installations.md) | Multi-site installations: one Studio, D1 and R2 manage many isolated sites (per-site roles, export and delete), created empty or as editions, served by hostname through `site_hosts` with per-Worker allow-lists, one theme per site Worker and several site Workers per installation (RFC-0034) |
| [0037](0037-domain-strategy.md) | Domain strategy: `cloudhal.com` is marketing, a future hosted control plane and the playground; `cloudhal.dev` is docs, schemas, registry and the open-source home; customer sites never run on either (they deploy into the customer's own Cloudflare account), so no third domain or PSL entry |
| [0038](0038-public-playground.md) | Public playground: one SQLite Durable Object per visitor holding store, API and renderer; `@cloudhal/storage/do-sqlite` and SQL/layered/fetcher blob stores; a deny-list guard in the Worker and the API with a route-walk test and a fixed Editor principal; 60-minute TTL with a 2-hour cap; private, uncached session pages (RFC-0036) |
| [0039](0039-cloudhal-dev-docs-site.md) | cloudhal.dev: Starlight in `apps/docs` over the repo's `docs/`, generated reference, a link contract checked in CI (301s, permanent `/schemas/v1`, `/e/<code>` pages from one error-code registry), docs for agents (`.md` per page, `Accept: text/markdown`, `llms.txt`, a standalone read-only docs MCP at `cloudhal.dev/mcp`, none in `cloudhal mcp` (amended)); all ADRs and RFCs published (RFC-0037) |
| [0040](0040-collection-permalinks.md) | Collection permalinks: `Site.collections.<key>.permalink` (default `/<collection>/{slug}`, v1 a fixed prefix plus `{slug}`), a closed token set, `entryPath`/`entryAt` in core-ts, redirects derived from the change, collisions refused at write (RFC-0038) |
| [0041](0041-site-archives.md) | Site archives: `cloudhal export`/`import`, a deterministic `.cloudhal` tar of NDJSON parts and media with per-file SHA-256, ids kept, bootstrap/`--replace` (snapshot first)/`--dry-run`, graph only and no built-in encryption (RFC-0039) |
