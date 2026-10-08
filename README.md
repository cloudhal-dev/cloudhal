# Cloudhal

**The open-source, agent-native site platform.** Agents build, edit and operate websites through a governed interface: every change is a snapshot, every snapshot has a diff and a preview, every publish is approved and reversible.

> Status: **alpha, private until launch.** The loop works end to end on the blog starter — Intent → Agent → Safe Change → Preview → Approve → Publish → Rollback — offline and on Cloudflare. Cloudhal's own newsroom is written by an agent and published through it. Packages are not on npm yet; until they are, run the CLI from this repo (see *Contributors* below).

## What it is

- **Site Graph** — a site is a graph of typed nodes (Site, Page, Section, ContentEntry) with per-node revisions. Contracts are JSON Schema, generated into TypeScript and Rust ([`packages/core-contracts`](packages/core-contracts), [`crates/cloudhal-schema`](crates/cloudhal-schema)).
- **Safe change loop** — Intent → Agent → Snapshot → Diff → Preview → Approve → Publish → Rollback.
- **Policy-first** — humans and agents are the same kind of actor; the policy engine checks every tool call against scopes, not the skill's good intentions.
- **MCP-native** — the agent surface is a Model Context Protocol server (spec 2026-07-28), usable from Claude, Cursor, Codex or any MCP client.
- **Self-hostable, Cloudflare-ready** — runs offline on SQLite + filesystem; deploys to Cloudflare Workers/D1/R2 with the same storage interface.

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
packages/cli              cloudhal init / dev / snapshot / build / studio / mcp / deploy / domain / push / pull
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
docs/rfcs                 design proposals (RFC-0001: Site Graph)
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
