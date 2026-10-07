# Contributing to Cloudhal

Thanks for considering a contribution. The goal of this document is that you can go from clone to a green test run in under 30 minutes, **without a Cloudflare account**.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS (26 also tested) | `.node-version` is set; use fnm/nvm/volta |
| pnpm | 12 (via Corepack) | `corepack enable && corepack prepare pnpm@12.10.1 --activate` |
| Rust | stable (1.85+) | `rustup` installs rustfmt + clippy per `rust-toolchain.toml` |
| cargo-typify | 0.8.0 | only if you change schemas: `cargo install cargo-typify --version 0.8.0 --locked` |

## Setup

```bash
pnpm install
pnpm check                 # biome lint, tsc, vitest
cargo test --workspace     # Rust fixture tests
```

Everything runs offline. `wrangler`/workerd are used only by packages that target Cloudflare and always in local mode.

## Changing contracts (JSON Schema)

Schemas in `packages/core-contracts/schemas/` are the single source of truth. After editing:

```bash
pnpm gen        # bundle → TypeScript → Rust
pnpm check && cargo test --workspace
```

Commit the regenerated files; CI fails on drift. Add a valid and an invalid fixture for anything new. Read [`docs/adr/0001-contract-pipeline.md`](docs/adr/0001-contract-pipeline.md) for the rules that keep both generators happy (inline `oneOf` variants, `kind` as single-value enum, no `default`, no cross-file `$ref` outside `common.schema.json`).

## Pull requests

- Branch from `main`; keep PRs focused and reviewable.
- **Conventional commits**: `feat(contracts): add Redirect node`, `fix(cli): …`, `docs: …`, `chore: …`.
- **DCO sign-off**: every commit needs `Signed-off-by:` — use `git commit -s`. This certifies the [Developer Certificate of Origin](https://developercertificate.org/); there is no CLA.
- Add a changeset (`pnpm changeset`) when a published package changes behaviour.
- CI must be green: lint, typecheck, tests (TS + Rust), contract drift.

## Where to start

Issues labelled `good first issue` and `help wanted` are curated for newcomers; most live in capabilities, starters and docs, which do not touch the core graph. Larger changes start as an RFC in `docs/rfcs/` (see [GOVERNANCE.md](GOVERNANCE.md)).

## Coding agents

If you are a coding agent (Claude Code, Codex, Cursor, …), read [`AGENTS.md`](AGENTS.md) first; repo-specific skills live in `.agents/skills/`.
