# @cloudhal/release-verify

## 0.10.1

No changes in this release.

## 0.10.0

### Patch Changes

- f41802b: `cloudhal deploy --release` installs the signed release of the CLI's own version instead of building the project (RFC-0046 §11b, #227).
  
  - **Trust lists.** On every run it fetches the signed key list and yank list from cloudhal.dev and verifies them against the pinned root. It never falls back to an older copy. It keeps a yank memory in `~/.cloudhal/release-trust.json`, so a rolled-back list, a replayed key list or a revoked yank key is refused.
  - **Before the root ceremony** no root is pinned, so the command refuses and names the ceremony.
  - **The release.** The release must be published (not a draft) and carry a bundle; `v0.8.0` and older have none. The CLI verifies it with `@cloudhal/release-verify`: the keys reduced by both lists, yanked versions refused, and every file checked against its digest.
  - **The attestation.** It checks the build-provenance attestation with `gh`. `--allow-single-factor` continues on the release key alone when `gh` is unavailable; a failed attestation is always refused.
  - **The project.** Its theme files must equal the CLI's own starter, unless `--discard-local-theme` is given. Its `cloudhal.json` build keys must match the starter's, a key the CLI does not know is refused, and the installed wrangler must be at least the bundle's.
  - **Refused projects.** Projects attached to another installation, multi-site projects and Workers Builds are refused.
  - **Deploying.** The verified files are extracted into a fresh `.cloudhal/deploy/release/<version>/`. Both Workers are then deployed with `no_bundle` wrangler configs that upload exactly those bytes.
  - **Offline and dry runs.** `--from <dir>` installs offline from the assets and both lists, and `--release --dry-run` stops before wrangler.
  
  The CLI now depends on `@cloudhal/release-verify`.
  
  `@cloudhal/release-verify` now typechecks under every consumer's lib settings: WebCrypto inputs are `ArrayBuffer`-backed views, and the gzip pipe is typed through explicitly. `@cloudhal/astro-renderer` names the Site Worker's single-site choice `singleSiteId`, so a test holds that `CLOUDHAL_SITE_ID` overrides the built id.
- 5baacb4: `PINNED_ROOTS` now pins the offline root `cloudhal-root-2026a` (Ed25519, from the owner's root ceremony on 2026-11-15). `verifyKeys` verifies the published `keys.json` with it by default. The first `keys.json` lists the release key `cloudhal-release-2026a` and the yank key `cloudhal-yank-2026a`, and is committed as `security/keys.json`. A CLI built with this version can run `cloudhal deploy --release` once cloudhal.dev serves the lists.
- 61825b8: Signed key and yank lists for release bundles (RFC-0046 §9, #226).
  
  `@cloudhal/core-contracts` gains the `release-keys` root (`keys.json`, signed by an offline root) and the `release-yank-list` root (`yanked.json`, signed by a yank key and expiring 30 days after it is issued).
  
  `@cloudhal/release-verify` gains:
  - `verifyKeys`, which checks a pinned root's signature and that the list is fresh (`expires` at most 13 months after `issuedAt`);
  - `verifyYanked`, which checks a signature by an active yank key that `keys.json` lists, and refuses a stale list with `stale-yank-list`;
  - `rememberYanks` and the `memory` option of `verifyKeys` and `verifyYanked`, for consumers that keep state: they refuse a rolled-back or pruned yank list, a replayed older `keys.json`, and a revoked or replaced yank key. A `keys.json` may list at most one active yank key;
  - `mergeTrust`, which only reduces trust in the pinned keys: it revokes, marks retiring, and narrows a key's validity window, and it never adds a key.
  
  `verifyRelease` now enforces each key's validity window. A statement's `createdAt` must lie within its key's `[notBefore, notAfter]`. After `notAfter`, a key verifies only while a fresh `keys.json` lists it as retiring; otherwise the release is refused with `key-expired`. `verifyRelease` also refuses a yanked version (`yanked`). `PINNED_KEYS` now carries each key's window.
- 3ffdf29: New package `@cloudhal/release-verify` (RFC-0046 §11a). It is the one verifier of Cloudhal release bundles, and it is Worker-safe.
  
  `verifyRelease` runs these checks in order, and refuses on the first failure:
  - the Ed25519 signature on `release-statement.json`, against the pinned release keys;
  - that the statement is for the version and channel you asked for;
  - both precompiled validators;
  - every digest and §7 limit;
  - the tarball, in two passes.
  
  The tarball is never held whole. The first pass checks its digest, and the second yields each entry only once it is verified. Unsafe entry paths (`..`, `.`, empty segments, backslashes, control characters, case-fold duplicates) are refused with `entry-path`. Every refusal carries a stable `code`.
  
  The package also exports:
  - `missingScopes`, which applies §3's rule that `workers-scripts.admin` covers `workers-scripts.edit`;
  - `releaseAssetUrls`;
  - `PINNED_KEYS`, which can only be reduced.
  
  The Node-only subpath `@cloudhal/release-verify/attestation` checks the GitHub build attestation with `gh` 2.68.0 or newer.
