# Cloudhal

**The open-source, agent-native site platform.** Agents build, edit and operate websites through a governed interface: every change is a snapshot, every snapshot has a diff and a preview, every publish is approved and reversible.

Blogs and newsrooms first; documentation sites and research or data documentation next. They share the same governed layer, because the more an audience relies on what an agent wrote, the more each change needs an owner, an approval and a way back.

> Status: **alpha, private until launch.** The loop works end to end on the blog starter — Intent → Agent → Safe Change → Preview → Approve → Publish → Rollback — offline and on Cloudflare. Cloudhal's own newsroom is written by an agent and published through it. Packages are not on npm yet; until they are, run the CLI from this repo (see *Contributors* below).

## What it is

- **Site Graph** — a site is a graph of typed nodes (Site, Page, Section, ContentEntry) with per-node revisions. Contracts are JSON Schema, generated into TypeScript and Rust ([`packages/core-contracts`](packages/core-contracts), [`crates/cloudhal-schema`](crates/cloudhal-schema)).
- **Safe change loop** — Intent → Agent → Snapshot → Diff → Preview → Approve → Publish → Rollback.
- **Policy-first** — humans and agents are the same kind of actor; the policy engine checks every tool call against scopes, not the skill's good intentions.
- **MCP-native** — the agent surface is a Model Context Protocol server (spec 2026-07-28), usable from Claude, Cursor, Codex or any MCP client.
- **Self-hostable, Cloudflare-ready** — runs offline on SQLite + filesystem; deploys to Cloudflare Workers/D1/R2 with the same storage interface.
- **Analytics without cookies** — page views, sources, countries, devices and Core Web Vitals from one first-party script, in Studio, in each article's editor and for agents (read-only MCP tools). No personal data by default; see the [privacy guide for site owners](docs/guides/analytics-privacy.md).
- **Reader comments, moderated** — first-party comments on articles: a plain form that works without JavaScript, a cookie-less proof of work instead of a CAPTCHA (Cloudflare Turnstile optional), every guest comment held for a person, agents that label and hide but never approve, erasure and DSA reports built in. Comments live in your database, outside snapshots. Off for each site until you turn them on; see the [guide for site owners](docs/guides/comments.md).

## Five minutes: create → ask an agent → preview → publish → your domain

Once the packages are on npm:

```bash
npm create cloudhal@latest my-site && cd my-site
npx cloudhal dev                                          # local site with drafts visible
claude mcp add cloudhal -- npx cloudhal mcp --mode edits  # connect your agent (any MCP client works)
```

Ask your agent: *"Write a launch post about our new product, show me a preview, then publish it."* It writes through 20 semantic MCP tools. Every change is snapshotted. It previews, and the publish waits for your approval.

```bash
npx cloudhal deploy                         # Cloudflare Workers + D1 + R2 with your wrangler login
npx cloudhal domain set news.example.com    # your own domain (zone in the same account)
npx cloudhal deploy
```

New projects count visits from the first deploy: cookie-less, first-party, read by Studio through Cloudflare bindings without an API token. Switch it off per site in Studio or for the deployment with `"analytics": { "enabled": false }` in `cloudhal.json`; existing deployments are asked once on their next deploy. Requirements (wrangler ≥ 4.145, an hourly cron trigger), Workers Free and Paid limits and the `cloudhal analytics` commands are in the [CLI README](packages/cli/README.md#site-analytics-rfc-0006); what is collected is in the [privacy guide](docs/guides/analytics-privacy.md).

Reader comments are available on every deployment and off for every site until you turn them on in Studio. The first deploy in a terminal asks where the database should live; `--jurisdiction eu` keeps it in the EU (also in CI), and that choice cannot be changed later. Setup, moderation, agents, spam protection, privacy and a ready-made privacy paragraph are in the [comments guide](docs/guides/comments.md).

The first deploy prints a one-time link for the owner account. In Studio you create keys for remote agents and choose each key's **mode**. Approvals wait in Studio, and every agent call is in the activity log.

| Mode | What the agent does on its own |
|---|---|
| Plan | read and preview only |
| Manual | nothing; every change waits for you |
| Edits | content edits; publish, rollback and delete wait (default) |
| Auto | also small article-only publishes |

An agent can ask for a more autonomous mode for a while. You grant it in Studio, possibly shorter, and it ends by itself.

## Contributors (today)

```bash
git clone https://github.com/cloudhal-dev/cloudhal && cd cloudhal
pnpm install
pnpm check                      # biome + typecheck + vitest (incl. an init→dev→build e2e)
cargo test --workspace          # Rust contract tests
node packages/cli/bin/cloudhal.ts init examples/my-site --name "My Site"
cd examples/my-site && pnpm install && node ../../packages/cli/bin/cloudhal.ts dev      # site preview
node ../../packages/cli/bin/cloudhal.ts studio                                           # Studio + API on :8787
```

No Cloudflare account is needed for anything in this repo. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

```
packages/core-contracts   JSON Schema source of truth, generated TypeScript + precompiled validators
packages/storage          SqlDriver/BlobStore interfaces; better-sqlite3, D1, fs, R2 adapters; migrations
packages/core-ts          Site Graph store: CAS, snapshots, diff, publish, rollback
packages/astro-renderer   Astro 7 integration, live/snapshot data sources, section components
packages/analytics        cookie-less site analytics: beacon handler, WAE and SQLite stores, rollups
packages/comments         reader comments (RFC-0007): rules, proof of work, submission pipeline, SQLite/D1 store
packages/cli              cloudhal init / dev / snapshot / build / studio / mcp / deploy / domain / push / pull / analytics / comments
packages/api              Hono HTTP API + Better Auth + /mcp endpoint + agent API keys (Node and Workers)
packages/agent-runtime    policy engine, skill loader, audit log (SDK-free)
packages/mcp-server       MCP server: 20 semantic tools, approval gate, agent modes, skills as resources; stdio + HTTP
packages/cloudflare       admin Worker (Studio + API + auth + MCP on D1/R2); site Worker entry lives in astro-renderer
packages/ui               Kumo re-export + Cloudhal blocks
apps/studio               Studio admin UI (Vite + React SPA, en/tr)
starters/blog             the first starter: routes, layout, theme map
skills/official           site-bootstrap, safe-edit, publish-article, rollback (Agent Skills spec)
crates/cloudhal-schema    generated Rust types + fixture tests
docs/adr                  architecture decision records
docs/design               DESIGN.md — the binding admin design system (Kumo)
docs/guides               guides for site owners (analytics and privacy, reader comments)
docs/rfcs                 design proposals (RFC-0001: Site Graph)
docs/security             threat model
.agents/skills            skills for coding agents working on this repo
apps/demo-newsroom        Cloudhal's own newsroom, published by an agent through Cloudhal (dogfooding)
packages/create-cloudhal  npm create cloudhal
```

Planned: `packages/sdk-js`, `capabilities/`.

## Open-core boundary

Open (Apache-2.0, this repo): core, graph, policy, CLI, Studio, Astro renderer, Cloudflare adapter, SDK, starters, official skills and capabilities.
Closed (Cloudhal Cloud): billing, multi-tenant control plane, managed registry service.

This boundary is a commitment, not a plan: code that is open stays open.

## License

Apache-2.0. "Cloudhal" is a trademark; see [TRADEMARK.md](TRADEMARK.md).
