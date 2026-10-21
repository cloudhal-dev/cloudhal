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
pnpm check                 # biome lint, size check, tsc, vitest
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
- Keep modules small and single-purpose: [`docs/engineering/code-structure.md`](docs/engineering/code-structure.md) sets file/function limits that `pnpm size:check` enforces with a shrink-only baseline.
- CI must be green: lint, size check, typecheck, tests (TS + Rust), contract drift.

## Releasing

All publishable packages (`@cloudhal/*` and `create-cloudhal`) share one version: a changesets "fixed" group. A release is one `vX.Y.Z` tag and one GitHub Release, published from CI by `.github/workflows/release.yml`:

1. **Changesets.** Every PR that changes a published package adds one (`pnpm changeset`). In 0.x, use `patch` for fixes and additive features, so `^0.x.y` ranges (the template, existing projects) pick them up; `minor` means a breaking change.
2. **Release PR.** On each push to `main`, the Changesets action opens or updates `chore(release): version packages` with the version bump and changelogs. GitHub does not run CI on PRs opened by Actions; the publish job runs the full checks instead. Merging it is the decision to release.
3. **Approval.** The merge starts the `publish` job, which waits for the `npm-publish` environment's approval (the maintainer, with 2FA). Approve it in the run's page on GitHub.
4. **Publish.** `scripts/publish-ci.ts` checks the build, packs every package and installs the tarballs from scratch with npm (`scripts/smoke-pack.ts`), publishes exactly those tarballs with npm trusted publishing (OIDC, with provenance), waits until npm serves all of them, then creates the `vX.Y.Z` tag and the GitHub Release from the changelogs.

**If something fails:** re-run the workflow (Actions › Release › Run workflow). The script skips packages npm already has and an existing tag or release, so a re-run finishes a half-done release. npm's trusted-publisher entry for each package names `release.yml` and the `npm-publish` environment: renaming either breaks publishing.

**Turning it off:** the repository variable `RELEASE_ENABLED` gates the workflow. Without it, release by hand: `pnpm changeset version` in a PR, merge, then `pnpm release` from an up-to-date `main` and push one `vX.Y.Z` tag.

## Where to start

Issues labelled `good first issue` and `help wanted` are curated for newcomers; most live in capabilities, starters and docs, which do not touch the core graph. Larger changes start as an RFC in `docs/rfcs/` (see [GOVERNANCE.md](GOVERNANCE.md)).

## Coding agents

If you are a coding agent (Claude Code, Codex, Cursor, …), read [`AGENTS.md`](AGENTS.md) first; repo-specific skills live in `.agents/skills/`.
