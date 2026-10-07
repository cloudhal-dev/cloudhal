# Cloudhal

**The open-source, agent-native site platform.** Agents build, edit and operate websites through a governed interface: every change is a snapshot, every snapshot has a diff and a preview, every publish is approved and reversible.

> Status: **pre-alpha, private development.** The first public release follows a 90-day plan that proves one loop end to end on a single blog starter: Intent → Agent → Safe Change → Preview → Publish → Rollback. Nothing here is deployable yet.

## What it is

- **Site Graph** — a site is a graph of typed nodes (Site, Page, Section, ContentEntry) with per-node revisions. Contracts are JSON Schema, generated into TypeScript and Rust ([`packages/core-contracts`](packages/core-contracts), [`crates/cloudhal-schema`](crates/cloudhal-schema)).
- **Safe change loop** — Intent → Agent → Snapshot → Diff → Preview → Approve → Publish → Rollback.
- **Policy-first** — humans and agents are the same kind of actor; the policy engine checks every tool call against scopes, not the skill's good intentions.
- **MCP-native** — the agent surface is a Model Context Protocol server (spec 2026-07-28), usable from Claude, Cursor, Codex or any MCP client.
- **Self-hostable, Cloudflare-ready** — runs offline on SQLite + filesystem; deploys to Cloudflare Workers/D1/R2 with the same storage interface.

## Quickstart (contributors, today)

```bash
git clone https://github.com/cloudhal-dev/cloudhal && cd cloudhal
pnpm install
pnpm check                      # biome + typecheck + vitest
cargo test --workspace          # Rust contract tests
pnpm gen                        # regenerate TS + Rust types from JSON Schema
```

No Cloudflare account is needed for anything in this repo. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

```
packages/core-contracts   JSON Schema source of truth, generated TypeScript + precompiled validators
packages/storage          SqlDriver/BlobStore interfaces; better-sqlite3, D1, fs, R2 adapters; migrations
packages/core-ts          Site Graph store: CAS, snapshots, diff, publish, rollback
crates/cloudhal-schema    generated Rust types + fixture tests
docs/adr                  architecture decision records
docs/rfcs                 design proposals (RFC-0001: Site Graph)
.agents/skills            skills for coding agents working on this repo
```

Planned: `packages/{astro-renderer,agent-runtime,mcp-server,cli,sdk-js,ui}`, `apps/{studio,site,demo-newsroom}`, `capabilities/`, `skills/official`, `starters/blog`.

## Open-core boundary

Open (Apache-2.0, this repo): core, graph, policy, CLI, Studio, Astro renderer, Cloudflare adapter, SDK, starters, official skills and capabilities.
Closed (Cloudhal Cloud): billing, multi-tenant control plane, managed registry service.

This boundary is a commitment, not a plan: code that is open stays open.

## License

Apache-2.0. "Cloudhal" is a trademark; see [TRADEMARK.md](TRADEMARK.md).
