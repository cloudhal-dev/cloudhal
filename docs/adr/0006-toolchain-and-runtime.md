# ADR-0006: Node-first toolchain and runtime; Bun supported, not primary
- Status: Accepted
- Date: 2026-10-07
- Sources: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json · https://pnpm.io/catalogs · https://turborepo.dev/docs/guides/tools/rust · https://biomejs.dev/internals/language-support/ · https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ · https://developers.cloudflare.com/workers/wrangler/install-and-update/ · https://bun.com/blog/bun-v1.4 · https://docs.astro.build/en/recipes/bun/

## Context
Cloudhal must run on Cloudflare (workerd) and self-hosted. Wrangler, miniflare and the Vite plugin are officially Node-only and have open Bun hangs; Bun 1.4 is a weeks-old Rust rewrite that mis-reports its Node ABI. Bun's genuine advantages are single-binary cross-compilation and a 42 MB alpine image for self-host.

## Decision
- Runtime: **Node 24 LTS** floor (`engines.node >= 24`), Node 26 in the CI matrix; switch primary to 26 after it enters LTS (2026-10-28).
- Package manager: **pnpm 12** with `catalog:` and `catalogMode: strict`; build scripts allow-listed via `allowBuilds`.
- Tasks: **Turborepo 2.11** (enable `experimentalCargoWorkspaces` when more crates exist). Lint/format: **Biome 2.5** only. Tests: **Vitest 5**. Types: **TypeScript 7.0** (`module: nodenext`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`). Releases: **Changesets 3**.
- Rust: stable toolchain, **edition 2024, resolver 3**, `[workspace.package]` inheritance, clippy `-D warnings`.
- **Bun** is a supported secondary runtime for `cloudhal serve` and pure packages: a `bun-sqlite` storage adapter and a Bun CI job; never for `cloudhal dev` (must spawn wrangler/workerd). No Bun-only APIs in shared code.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Bun-first | Fast installs, `--compile`, small images | Cloudflare toolchain unsupported, fresh rewrite, ABI mismatch, no comparable CMS does it | Risk concentrated exactly where Cloudhal is most Cloudflare-dependent |
| Nx / moon instead of Turborepo | Richer polyglot features | Heavier; moon's ecosystem is small | Revisit if the Rust side grows large |
| ESLint + Prettier | Familiar | Two tools, slower, TS 7 ecosystem still catching up | Biome covers TS/TSX/JSON/CSS in one binary |

## Consequences
- Positive: everything first-class; CI mirrors Cloudflare's own repos.
- Negative: single-binary self-host story is weaker on Node (SEA experimental) until Bun stabilizes.
- Risks: `.astro` type-checking waits for TS 7.1 (`astro check` as a separate CI step).

## Addendum (2026-10-22): Bun support not built
The Bun parts of the Decision were not built: there is no `bun-sqlite` storage adapter (the SQL adapters are `better-sqlite3`, `d1` and `do-sqlite` in `packages/storage/src/sql/`), no Bun CI job (`.github/workflows/ci.yml` runs Node only) and no `cloudhal serve` command (`cloudhal studio` serves the API and Studio locally; deployments run on Cloudflare Workers, [ADR-0012](0012-cloudflare-deployment.md)). Bun works as a package manager for site projects (`bunx cloudhal …`, see the [quickstart](../start/quickstart.md)). The rest of the Decision stands; current versions are in `AGENTS.md` ("Versions").
