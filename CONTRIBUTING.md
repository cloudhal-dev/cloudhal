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
- Regexes over input from outside (requests, agent or editor content, uploads, feeds) must not backtrack: prefer `indexOf` scanners and the linear trims in `@cloudhal/core-ts/names`, check lengths first, and test a rewrite against the old regex plus a 100k-character adversarial input (AGENTS.md rule 13).
- CI must be green: lint, size check, typecheck, tests (TS + Rust), contract drift.

## Releasing

All publishable packages (`@cloudhal/*` and `create-cloudhal`) share one version: a changesets "fixed" group. A release is one `vX.Y.Z` tag and one GitHub Release, published from CI by `.github/workflows/release.yml`. Once bundles are on, the release also carries the signed release bundle of the standard theme (RFC-0046), for anyone who deploys it without building:

1. **Changesets.** Every PR that changes a published package adds one (`pnpm changeset`). In 0.x, use `patch` for fixes and additive features, so `^0.x.y` ranges (the template, existing projects) pick them up; `minor` means a breaking change. A fix that makes the release a **security release** starts its changeset summary with exactly `**Security release.**`: the `plan` job finds it in the version's changelog entries and the bundle's manifest and statement then say `securityRelease: true` (RFC-0046; remote deployers highlight such a release, none installs it by itself). The release PR's changelog diff shows the marker to whoever merges it. A prerelease (`X.Y.Z-pre`) goes to npm's `next` dist-tag.
2. **Release PR.** On each push to `main`, the Changesets action opens or updates `chore(release): version packages` with the version bump and changelogs. GitHub does not run CI on PRs opened by Actions; the publish job runs the full checks instead. Merging it is the decision to release.
3. **Approval.** The merge starts the release jobs. With bundles on (below), `bundle-sign` first waits for the `release-signing` environment's approval, then `publish` waits for the `npm-publish` environment's approval (the maintainer, with 2FA). Approve each in the run's page on GitHub.
4. **Bundle, sign, publish** ([RFC-0046](docs/rfcs/0046-release-bundles.md)). GitHub Releases are immutable here: once a release is published nothing can be attached, so the order is fixed.
   - `bundle` (`.github/workflows/bundle-build.yml`, no secrets) builds the Studio and the standard `cloudhal init` starter from the release commit, runs `cloudhal deploy --dry-run`, and writes the release bundle with `node scripts/release-bundle.ts build`: `cloudhal-release-X.Y.Z.tar.gz`, `manifest.json` and the unsigned `release-statement.json`. It then attests the three files (build provenance) and keeps the Sigstore bundle as `cloudhal-release-X.Y.Z.sigstore.json`.
   - `bundle-sign` checks out nothing and installs nothing. It verifies the attestation (`gh attestation verify --signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml --source-ref refs/heads/main --source-digest <commit> --deny-self-hosted-runners`) and the statement's version, commit, `securityRelease` and digests, then signs the statement with the release key (`release-statement.sig`, raw Ed25519). The key id and public key it accepts are written in the job and must equal [`docs/security/release-signing-keys.md`](docs/security/release-signing-keys.md) (a test checks it).
   - `publish` runs `scripts/publish-ci.ts`: before it creates anything it verifies `release-statement.sig` with the release key pinned in `publish-ci.ts` (equal to `bundle-sign`'s, a test checks it) and the statement's digests, so a bundle changed after signing never reaches an immutable release. Then it tags `vX.Y.Z` on the release commit, creates a **draft** release, uploads the five assets and re-reads the draft (exact names and SHA-256 digests), checks the build, packs every package and installs the tarballs from scratch with npm (`scripts/smoke-pack.ts`), publishes exactly those tarballs with npm trusted publishing (OIDC, with provenance), re-checks the draft's assets once more, and only then publishes the release: Latest only for the highest stable version, a prerelease for `X.Y.Z-pre`. A draft asset that changed in between is re-uploaded while the release is still a draft; if that fails, nothing is published.
   - Check a release by hand with `node scripts/release-bundle.ts verify --dir <downloaded assets> --version X.Y.Z --public-key cloudhal-release-2026a=<public key>`, `gh release verify-asset` and `gh attestation verify` (the key document lists the commands).
5. **After the release.** Bring the rest along:
   - **cloudhal-template** (the Deploy to Cloudflare button): the workflow's `template` job (`.github/workflows/template-sync.yml`) opens `chore: Cloudhal X.Y.Z and the X.Y.Z starter theme` from `cloudhal/vX.Y.Z`, with `src/`, `public/`, `astro.config.mjs` and `tsconfig.json` from the published starter, `@cloudhal/*` at `^X.Y.Z` and a lockfile that installs exactly `X.Y.Z`. Merge it once its `cloudhal/template-check` status is green: the same run installs a copy of the synced template with `npm ci` and runs `cloudhal deploy --dry-run` with `WORKERS_CI=1`. To sync again, run Actions › Template sync › Run workflow. Without the `TEMPLATE_SYNC_APP_CLIENT_ID` variable and the `TEMPLATE_SYNC_APP_PRIVATE_KEY` secret (a GitHub App installed on cloudhal-template only, with Contents, Pull requests and Commit statuses write) the job only logs a notice. Then sync by hand from a checkout: clone cloudhal-template next to this repository, run `node scripts/template-sync.ts --template ../cloudhal-template --version X.Y.Z --summary pr-body.md` and then the same command with `--lock` in place of `--summary` (Node 24, no `pnpm install` needed), check a copy of the template (`npm ci`, then `WORKERS_CI=1 npx cloudhal deploy --dry-run`), commit on `cloudhal/vX.Y.Z`, push, open the PR with the title above and `pr-body.md` as its body, and post the `cloudhal/template-check` status on its head commit (`gh api -X POST repos/cloudhal-dev/cloudhal-template/statuses/<sha> -f state=success -f context=cloudhal/template-check -f description='npm ci and cloudhal deploy --dry-run (WORKERS_CI=1) passed, run by hand'`). Dependabot's `@cloudhal/*` PR on the template is no substitute: it moves dependencies only, no theme, and it fails to install whenever the starter's own pins moved with the release (0.6.3 moved astro to 7.4.7 for the `^7.4.0` peer range, so Dependabot's `^0.6.1` PR hit ERESOLVE); close it as superseded by the sync PR.
   - **cloudhal.com**: Dependabot opens the `@cloudhal/*` PR the next morning (06:00 Europe/Istanbul). A patch release merges itself after its check; a minor bump waits for a person.
   - **try.cloudhal.com** (`cloudhal-dev/try`): by hand. Bump its exact `@cloudhal/*` pins, then `pnpm install` and `pnpm run deploy`.
   - **The Docker image** (`ghcr.io/cloudhal-dev/cloudhal`, [self-host guide](docs/guides/self-host.md)): the workflow's `docker` job (`.github/workflows/docker.yml`) builds it from the npm release for linux/amd64 and linux/arm64 with an SBOM and provenance, pushes it under `sha-<short>` only, runs the smoke test on both architectures and Trivy against that digest, and only then tags it: `X.Y.Z` always, `X.Y` when the version is the highest patch of that minor among the `v*` tags, `latest` when it is the highest release of all. The image never carries a version of its own: one release, one version everywhere. To rebuild a version (a base-image fix) run Actions › Docker image › Run workflow with it (0.6.4 or later: older versions fail the smoke test's setup-token check); the same rule decides its tags, so a release finished by hand still gets `latest` and a backfill of an older patch moves nothing. `edge` is built nightly from `main`.

**If something fails:** use **Re-run failed jobs** on the failed run. `publish-ci.ts` looks at what already exists and resumes from the first step that is not done: it skips packages npm already has, reuses the tag (it refuses one that points at another commit) and the draft, uploads only missing or wrong assets, and publishes the draft. A new run (Actions › Release › Run workflow) does not: once npm has every package, `plan` skips `publish`, so a release left as a draft stays a draft until a failed run is re-run. Two rules come from immutability: a published release that lacks an asset or carries a different one is refused, and the fix is a new version; and `v0.8.0` and older can never gain a bundle. To redo only the template PR, run Actions › Template sync › Run workflow. npm's trusted-publisher entry for each package names `release.yml` and the `npm-publish` environment: renaming either breaks publishing. Consumers verify the attestation against `bundle-build.yml` by its path: renaming that file breaks them.

**Dry run** (required before the first signed release and after any change to `release.yml`, `bundle-build.yml`, `publish-ci.ts` or the builder): Actions › Release › Run workflow with **dry_run** checked. It builds and attests the bundle, signs it in `bundle-sign` with a throwaway key generated in memory (key id `dryrun-<run id>`, so the release key is not used), creates the draft `vX.Y.Z-dryrun.<run number>` on the commit without pushing a tag, checks the signature with the throwaway key's public half (bundle-sign's job output), uploads and re-checks the assets, runs `npm publish --dry-run` for every package, and deletes the draft. npm asks the registry even in a dry run and refuses a version it already has, which `main` almost always holds, so for those packages the dry run adds `--force`; with `--dry-run` npm never uploads (checked against npm 12.2.2). A version npm lacks keeps npm's own checks. The draft is deleted when a step fails too, and the `publish` job's last step (`if: always()`) deletes any draft with this run's dry-run tag left by a cancelled or timed-out job. If even that did not run (the job was cancelled before it got there), delete the draft by hand: Releases › the `vX.Y.Z-dryrun.<n>` draft › Delete, or `gh release delete vX.Y.Z-dryrun.<n> --yes`; a dry-run draft has no tag and is never published, so nothing else needs undoing. It opens no Changesets PR, no template PR and no Docker image. Both environments still ask for approval.

**Turning bundles on** (the maintainer, once):
1. Create the environment `release-signing`: a required reviewer, deployments from `main` only.
2. Add the environment secret `RELEASE_SIGNING_KEY`: the PKCS#8 PEM of the active key in `docs/security/release-signing-keys.md`. Then move the local copy of the key to offline storage, as the key document's Custody section says.
3. Run the dry run above and check that it ends with the draft deleted.
4. Set the repository variable `RELEASE_BUNDLES` to `true`. The next release carries a bundle; a `next` prerelease is the safest first one.

With `RELEASE_BUNDLES` unset, the release runs the same order (tag, draft, npm, publish) with no assets, and both checks require that the draft has none. Turning it off again is the rollback: nothing in an installed site depends on a bundle.

**Turning it off:** the repository variable `RELEASE_ENABLED` gates the workflow (a dry run runs without it). Without it, release by hand: `pnpm changeset version` in a PR, merge, then `pnpm release` from an up-to-date `main` and push one `vX.Y.Z` tag. Nothing then opens the cloudhal-template PR: run Actions › Template sync › Run workflow with `X.Y.Z` (it needs the GitHub App, not `RELEASE_ENABLED`), and bring cloudhal.com and try.cloudhal.com along as in step 5.

## Where to start

Issues labelled `good first issue` and `help wanted` are curated for newcomers; most live in capabilities, starters and docs, which do not touch the core graph. Larger changes start as an RFC in `docs/rfcs/` (see [GOVERNANCE.md](GOVERNANCE.md)).

## Coding agents

If you are a coding agent (Claude Code, Codex, Cursor, …), read [`AGENTS.md`](AGENTS.md) first; repo-specific skills live in `.agents/skills/`.
