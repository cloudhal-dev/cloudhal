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
pnpm check                 # biome lint, size check, generated-file checks, typecheck, vitest
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
- A PR that changes what the renderer gives themes freezes the last released starter in the same PR: copy it under `packages/cli/test/fixtures/theme-v<last release>/` and add that version to `FROZEN` in `packages/cli/test/old-theme-compat.test.ts` (see `theme-v0.5.0/README.md` there), so the release that ships the change is already tested against the theme existing sites have.
- Keep modules small and single-purpose: [`docs/engineering/code-structure.md`](docs/engineering/code-structure.md) sets file/function limits that `pnpm size:check` enforces with a shrink-only baseline.
- CI must be green: lint, size check, typecheck, tests (TS + Rust), contract drift.

## Releasing

All publishable packages (`@cloudhal/*` and `create-cloudhal`) share one version: a changesets "fixed" group. A release is one `vX.Y.Z` tag and one GitHub Release, published from CI by `.github/workflows/release.yml`:

1. **Changesets.** Every PR that changes a published package adds one (`pnpm changeset`). In 0.x, use `patch` for fixes and additive features, so `^0.x.y` ranges (the template, existing projects) pick them up; `minor` means a breaking change.
2. **Release PR.** On each push to `main`, the Changesets action opens or updates `chore(release): version packages` with the version bump and changelogs. GitHub does not run CI on PRs opened by Actions; the publish job runs the full checks instead. Merging it is the decision to release.
3. **Approval.** The merge starts the `publish` job, which waits for the `npm-publish` environment's approval (the maintainer, with 2FA). Approve it in the run's page on GitHub.
4. **Publish.** `scripts/publish-ci.ts` checks the build, packs every package and installs the tarballs from scratch with npm (`scripts/smoke-pack.ts`), publishes exactly those tarballs with npm trusted publishing (OIDC, with provenance), waits until npm serves all of them, then creates the `vX.Y.Z` tag and the GitHub Release from the changelogs.
5. **After the release.** Bring the rest along:
   - **cloudhal-template** (the Deploy to Cloudflare button): the workflow's `template` job (`.github/workflows/template-sync.yml`) opens `chore: Cloudhal X.Y.Z and the X.Y.Z starter theme` from `cloudhal/vX.Y.Z`, with `src/`, `public/`, `astro.config.mjs` and `tsconfig.json` from the published starter, `@cloudhal/*` at `^X.Y.Z` and a lockfile that installs exactly `X.Y.Z`. Merge it once its `cloudhal/template-check` status is green: the same run installs a copy of the synced template with `npm ci` and runs `cloudhal deploy --dry-run` with `WORKERS_CI=1`. To sync again, run Actions › Template sync › Run workflow. Without the `TEMPLATE_SYNC_APP_CLIENT_ID` variable and the `TEMPLATE_SYNC_APP_PRIVATE_KEY` secret (a GitHub App installed on cloudhal-template only, with Contents, Pull requests and Commit statuses write) the job only logs a notice. Then sync by hand from a checkout: clone cloudhal-template next to this repository, run `node scripts/template-sync.ts --template ../cloudhal-template --version X.Y.Z --summary pr-body.md` and then the same command with `--lock` in place of `--summary` (Node 24, no `pnpm install` needed), check a copy of the template (`npm ci`, then `WORKERS_CI=1 npx cloudhal deploy --dry-run`), commit on `cloudhal/vX.Y.Z`, push, open the PR with the title above and `pr-body.md` as its body, and post the `cloudhal/template-check` status on its head commit (`gh api -X POST repos/cloudhal-dev/cloudhal-template/statuses/<sha> -f state=success -f context=cloudhal/template-check -f description='npm ci and cloudhal deploy --dry-run (WORKERS_CI=1) passed, run by hand'`). Dependabot's `@cloudhal/*` PR on the template is no substitute: it moves dependencies only, no theme, and it fails to install whenever the starter's own pins moved with the release (0.6.3 moved astro to 7.4.7 for the `^7.4.0` peer range, so Dependabot's `^0.6.1` PR hit ERESOLVE); close it as superseded by the sync PR.
   - **cloudhal.com**: Dependabot opens the `@cloudhal/*` PR the next morning (06:00 Europe/Istanbul). A patch release merges itself after its check; a minor bump waits for a person.
   - **try.cloudhal.com** (`cloudhal-dev/try`): by hand. Bump its exact `@cloudhal/*` pins, then `pnpm install` and `pnpm run deploy`.
   - **The Docker image** (`ghcr.io/cloudhal-dev/cloudhal`, [self-host guide](docs/guides/self-host.md)): the workflow's `docker` job (`.github/workflows/docker.yml`) builds it from the npm release and pushes `X.Y.Z`, `X.Y` and `latest` for linux/amd64 and linux/arm64, with an SBOM, provenance and a smoke test. The image never carries a version of its own: one release, one version everywhere. To rebuild a version (a base-image fix) run Actions › Docker image › Run workflow with it; that re-tags `X.Y.Z` and `X.Y` and leaves `latest` alone. `edge` is built nightly from `main`.

**If something fails:** use **Re-run failed jobs** on the failed run. The script skips packages npm already has and an existing tag or release, so it finishes a half-done release. A new run (Actions › Release › Run workflow) does not: once npm has every package, `plan` skips `publish`, so a missing tag or GitHub Release stays missing. To redo only the template PR, run Actions › Template sync › Run workflow. npm's trusted-publisher entry for each package names `release.yml` and the `npm-publish` environment: renaming either breaks publishing.

**Turning it off:** the repository variable `RELEASE_ENABLED` gates the workflow. Without it, release by hand: `pnpm changeset version` in a PR, merge, then `pnpm release` from an up-to-date `main` and push one `vX.Y.Z` tag. Nothing then opens the cloudhal-template PR: run Actions › Template sync › Run workflow with `X.Y.Z` (it needs the GitHub App, not `RELEASE_ENABLED`), and bring cloudhal.com and try.cloudhal.com along as in step 5.

## Where to start

Issues labelled `good first issue` and `help wanted` are curated for newcomers; most live in capabilities, starters and docs, which do not touch the core graph. Larger changes start as an RFC in `docs/rfcs/` (see [GOVERNANCE.md](GOVERNANCE.md)).

## Coding agents

If you are a coding agent (Claude Code, Codex, Cursor, …), read [`AGENTS.md`](AGENTS.md) first; repo-specific skills live in `.agents/skills/`.
