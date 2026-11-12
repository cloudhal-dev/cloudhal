# RFC-0046: Signed release bundles

- Status: Proposed
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-12
- Related:
  - ADR-0001 / ADR-0008 (the contract pipeline, precompiled validators), ADR-0012 (the site and admin Workers), ADR-0013 (npm packaging: one version for the fixed group), ADR-0037 (`cloudhal.dev/schemas/v1` permanent URLs).
  - RFC-0008 (`schedulesLevel`, the downgrade guard), RFC-0034 (several site Workers), RFC-0042 / RFC-0043 (the `gates` and `status` feature levels).
  - Code read: `.github/workflows/release.yml` (job graph; npm's trusted-publisher entry names this file and the `npm-publish` environment), `scripts/publish-ci.ts` (today: npm publish, then `gh release create --verify-tag --latest`), `packages/cli/src/archive/` (RFC-0039's deterministic tar and fixed-header gzip), `packages/cli/src/commands/deploy/`, `packages/core-contracts/schemas/common.schema.json`.
  - Sources (checked 2026-11-11):
    - GitHub, [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): once published, a release's assets cannot be added, changed or deleted, and the tag of a deleted immutable release cannot be reused. This repository has immutable releases on; `v0.7.3` is immutable with no assets.
    - GitHub, [artifact attestations with reusable workflows](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-and-reusable-workflows-to-achieve-slsa-v1-build-level-3): the build steps move into a reusable workflow, which must also produce the attestation; `gh attestation verify --signer-workflow` checks it.
    - AWS KMS [`Sign`](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html): a `RAW` message is at most 4096 bytes (pure Ed25519 signs the message itself).
    - WebCrypto Ed25519 `verify`; Workers `DecompressionStream` (gzip and deflate, no zstd); Workers static assets (20,000 files and 25 MiB per file per Worker).
    - The WordPress update-signing history (`wp-admin/includes/file.php`): a single trusted key that lapsed in 2021 with soft-fail verification as the default, the failure mode this design avoids.

## Summary

Every Cloudhal version `vX.Y.Z` gains a **release bundle**: the built site and admin Worker modules and static assets of the standard theme in one deterministic tarball, a `manifest.json` (`cloudhal.release-manifest@1`) describing every part by size and SHA-256 together with the facts a deployer needs before uploading anything, and a small canonical `release-statement.json` (`cloudhal.release-statement@1`) that pins the manifest and the tarball and is the only file the project key signs. The bundle is built and attested in one reusable workflow that holds no secret, signed in a separate job only after that attestation verifies, and attached to a **draft** GitHub Release before npm publish, so the release is complete and immutable from the moment anyone can see it. Anyone (a CLI user, a CI job, a hosting provider, a remote deployer) can install or update the standard theme by downloading, verifying and uploading known-good bytes, with no toolchain and no trust in anyone but the project.

## Motivation

- **Deploy without a toolchain.** `cloudhal deploy` needs Node, wrangler and an Astro build. A prebuilt, verifiable bundle lets any remote deployer install or update the standard theme by uploading known-good artifacts, and gives every one of them the same bytes.
- **One checkable answer to "what exactly is X.Y.Z".** Per-file hashes under a project signature make a release a fact a user or a reviewer can check, instead of N different customer-side builds of the same version.
- **Safe updates, downgrades and rollbacks.** The downgrade guard (RFC-0008) and the maintenance guard need the target version's feature levels and migration range, and a code rollback is safe only when the target's migrations are compatible with the previous code and no Durable Object class changed. Today those facts come from the running code; the manifest states them before anything is uploaded.
- **Why now.** Releases are immutable in this repository, and today's `publish-ci.ts` publishes the release at once. An asset cannot be added afterwards, so the order has to change before the first bundle ships; `v0.7.3` can never gain one, and the first bundled release is the next version.

## Proposal

### 1. Assets of a release

A release carries exactly these assets, all attached before it is published:

| Asset | Content |
|---|---|
| `cloudhal-release-<v>.tar.gz` | `site/modules/…`, `site/assets/…`, `admin/modules/…`, `admin/assets/…`, optional `starter/<file>`; gzip, because Workers decompress gzip with `DecompressionStream` and have no zstd decompressor |
| `manifest.json` | `cloudhal.release-manifest@1`, canonical JSON |
| `release-statement.json` | `cloudhal.release-statement@1`, canonical JSON, at most 4096 bytes |
| `release-statement.sig` | the raw 64-byte Ed25519 signature over the exact bytes of `release-statement.json` |
| `cloudhal-release-<v>.sigstore.json` | the Sigstore bundle of the build-provenance attestation over the first three files |

The manifest's `signing` is `{ "keyId": "<id>", "algorithm": "Ed25519", "signature": "release-statement.sig" }`. The enum also admits `"manifest.sig"`, a detached signature over the manifest bytes: that legacy form exists for development keys a consumer operates itself, and a consumer must never accept it for a project key. Project releases never carry `manifest.sig`.

Canonical JSON, for both documents: object keys sorted recursively by UTF-16 code unit, arrays in order, 2-space indent, a trailing `\n`, UTF-8. A consumer verifies the bytes it downloaded and never re-serialises them before verifying.

### 2. The statement

New root `packages/core-contracts/schemas/release-statement.schema.json` (`$id` `https://cloudhal.dev/schemas/v1/release-statement.schema.json`):

```jsonc
{
  "schemaVersion": 1,
  "format": "cloudhal.release-statement@1",
  "version": "0.8.0",                         // $defs/CloudhalVersion, the manifest's pattern
  "channel": "stable",                        // "stable" | "next"
  "securityRelease": false,
  "commit": "<40 hex>",                       // the release commit, which the tag names
  "createdAt": "2026-11-12T08:00:00Z",        // common Timestamp
  "signing": { "keyId": "cloudhal-release-2026a", "algorithm": "Ed25519", "signature": "release-statement.sig" },
  "manifest": { "name": "manifest.json", "sha256": "<64 hex>", "bytes": 48213 },
  "tarball":  { "name": "cloudhal-release-0.8.0.tar.gz", "sha256": "<64 hex>", "bytes": 7340032 }
}
```

Every field is required and `additionalProperties` is `false` throughout. `keyId` matches `^[a-z0-9][a-z0-9-]{2,63}$`, `name` matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, `bytes` is 1 to 104,857,600. The root references `common.schema.json` only for `SchemaVersion` and `Timestamp` and copies `CloudhalVersion` and `Sha256Hex` byte for byte from the manifest, so it stays portable: another repository can hold an identical copy under its own `$id`.

Invariants the schema cannot express, enforced by the producer and by every consumer:

1. `manifest.name` is `manifest.json` and `tarball.name` is `cloudhal-release-<version>.tar.gz`.
2. `manifest.bytes` is at most 1,900,000.
3. `channel` is `next` exactly when `version` has a prerelease suffix (§6).
4. The statement's `signing.keyId` equals the manifest's `signing.keyId`.
5. The statement's `version`, `channel`, `securityRelease`, `commit` and `createdAt` equal the manifest's.
6. The serialised statement is at most 4096 bytes. That is the AWS KMS `RAW` limit for pure Ed25519, so moving the key into a KMS later changes no format.
7. **The statement is for the release the consumer asked for.** `version` equals the version the consumer requested, which is the version of the tag `v<version>` it downloaded the assets from. `channel` equals the channel the consumer asked for; a consumer that asked for no channel uses the channel that invariant 3 derives from the requested version. Only the consumer can check this invariant, because nothing inside a release knows what was requested. Without it, a validly signed older release served under a newer version's name or URL would pass every other check. For example, a vulnerable `0.7.9` bundle placed where `0.8.0` is expected is a rollback attack.

Verification by a consumer, in order, with no soft-fail anywhere:

1. Read `release-statement.json` (refuse above 4096 bytes) and `release-statement.sig` (exactly 64 bytes).
2. Verify Ed25519 over the exact statement bytes with the consumer's pinned public key for `signing.keyId`. An unknown, revoked or expired key is a refusal.
3. Bind the statement to the request (invariant 7). Refuse unless `version` equals the requested version and `channel` equals the requested channel.
4. Validate the statement with the precompiled `release-statement` validator and check invariants 1 to 3 and 6.
5. Read `manifest.json`; its size and SHA-256 must equal `statement.manifest`. Validate it with the precompiled `release-manifest` validator, check invariants 4 and 5, and refuse when `planVersion` exceeds what the deployer supports.
6. Stream the tarball. Its size and SHA-256 must equal `statement.tarball`, and every entry must be listed in the manifest with its size and SHA-256. Accept the release only when every part verifies.

Two further checks use standard tools:

- `gh release verify-asset` shows that GitHub served these bytes for this immutable release. It is not a trust factor.
- `gh attestation verify --signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml` shows that the bytes came from this repository's build workflow on this commit. It is factor 2 of §9.

A consumer whose tooling can verify the attestation should do so, and should refuse when the attestation fails. A consumer that cannot verify it has only one factor and relies on the release key alone (§9). A Worker-based deployer that cannot run `gh` or a Sigstore verifier is one example.

### 3. The manifest

Root `release-manifest.schema.json` (`$id` `https://cloudhal.dev/schemas/v1/release-manifest.schema.json`), unchanged in shape from the draft that preceded this RFC except `signing.signature`:

```diff
     "signature": {
       "type": "string",
-      "enum": ["manifest.sig"]
+      "enum": ["manifest.sig", "release-statement.sig"]
     }
```

It holds `version`, `channel`, `securityRelease`, `commit`, `createdAt`, `contracts`, `levels` (`schedules`, `gates`, …), `migrations` (`first`, `last`, `count`, `names`, `compatibleWithPrevious`), `durableObjects` (`bindings`, `lifecycleChange`), `runtime` (compatibility date and flags), `toolchain`, `theme`, `skills`, `workers.site` and `workers.admin` (`mainModule`, `modules[]` with `path`/`type`/`bytes`/`sha256`, `assets` with `count`/`bytes`/`files[]` with a precomputed `assetHash`, inline `headers`), `bindingTemplates`, `requiredScopes`/`optionalScopes`, `requiredCapabilities`/`optionalCapabilities`, `starter`, `features` (a declared map of booleans: the named flags are required and unknown flags are allowed, so an older deployer ignores a new flag), `planVersion` and `signing`.

Provenance fields:

- `commit` is the release commit, which is also the commit the tag names.
- `createdAt` is that commit's committer time, in whole seconds (`Z`). It is also every tar entry's mtime, so two builds of one commit write the same metadata.
- `toolchain` is `{ node, producer: "cloudhal-release-bundle", cli, astro, wrangler, starter: "blog" }`, each value at most 64 characters.
- `compatibleWithPrevious` defaults to `true` in the producer until a release process field says otherwise (open question 3).

### 4. Build and attest in one reusable workflow

`.github/workflows/bundle-build.yml` is a reusable workflow (`workflow_call`, inputs `version`, `dry_run` and `security_release`). It holds **no secret**; its job has `contents: read`, `id-token: write` and `attestations: write` and nothing else. It:

1. checks out the release commit without persisted credentials;
2. runs `pnpm install --frozen-lockfile`, builds the packages and the Studio;
3. creates the standard starter with `cloudhal init` and runs `cloudhal deploy --dry-run` in it, which produces the same build output a user's deploy would;
4. runs `scripts/release-bundle.ts build`, which writes the tarball, `manifest.json` and the **unsigned** `release-statement.json`, validates both documents, self-verifies the output and refuses a part that contains a value from the project's generated deploy secrets;
5. runs `actions/attest-build-provenance` over the three files and saves the Sigstore bundle as `cloudhal-release-<v>.sigstore.json`;
6. uploads the four files as a short-lived workflow artifact.

This is described accurately as **L3-style isolation of the signing key, with build provenance produced by the building workflow**. The project does not claim a SLSA build level for it until the build platform's own third-party requirements are assessed.

### 5. Sign only after verifying

A `bundle-sign` job runs in the protected environment `release-signing` (a required reviewer, deployments from `main` only), with `contents: read`, `attestations: read` and `actions: read`. It checks out nothing and runs no `pnpm`, `npm` or `npx` and no repository build code; the checks and the signer are short inline scripts in the workflow file. It:

1. downloads the unsigned artifact;
2. runs `gh attestation verify <file> --repo cloudhal-dev/cloudhal --signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml --source-ref refs/heads/main --source-digest $GITHUB_SHA --deny-self-hosted-runners` for each of the three files;
3. checks that the statement's `version` equals the planned version, its `commit` equals `$GITHUB_SHA`, its key id equals the active key, and its `manifest`/`tarball` digests and sizes equal the downloaded files;
4. signs. The private key (PKCS#8 PEM) is exposed only to this one step's environment. The step reads it once into a `KeyObject` and removes it from the environment. It then checks that the derived public key equals the pinned public key. The active key id and its raw public key are written inline in the `bundle-sign` job, because the job checks out nothing and cannot read a document. A repository test keeps them equal to `docs/security/release-signing-keys.md`. The step then signs, verifies its own signature, and writes `release-statement.sig`. Errors are fixed strings; the key is never echoed and the shell never traces;
5. uploads the five files as the signed artifact.

Phase 1 custody is that environment secret (`RELEASE_SIGNING_KEY`), readable only by this job. Phase 2 moves the key into a KMS reached through GitHub OIDC; the statement already fits its message limit (§2, invariant 6), so nothing a consumer reads changes.

### 6. Publication on immutable releases

The `publish` job keeps its name, its workflow file and its `npm-publish` environment (npm trusted publishing names them). Before any tag, draft or upload exists, `scripts/publish-ci.ts` verifies `release-statement.sig` over the exact statement bytes with the pinned project key (in a dry run, with the throwaway key's public half that `bundle-sign` outputs), and checks that the statement is for the planned version, its channel and the checked-out commit and pins the local manifest and tarball. It then runs, and resumes from the first incomplete step:

1. **Tag** `v<v>` on the statement's commit. An existing tag must already point at it, or the run refuses.
2. **Draft**: `gh release create v<v> --draft --verify-tag [--prerelease]`. A draft is never marked Latest.
3. **Attach and re-check**: upload the five assets while the release is a draft, then re-read the draft and require exactly the expected names, each with a digest equal to the local SHA-256.
4. **npm publish** of the fixed group, as today (trusted publishing, provenance).
5. **Re-check before publishing**: immediately before publishing the release, re-read the draft and repeat step 3's check of exact names and digests. Anyone with write access to the repository can replace a draft asset while npm publish runs. Publishing swapped bytes would make the version permanently bundle-broken: consumers refuse them, and immutability then forbids a repair. On a mismatch the run refuses to publish, re-uploads the expected assets while the release is still a draft, and checks again.
6. **Publish the release**: `--draft=false`, with `--latest` only for the highest stable version, otherwise `--prerelease --latest=false`.

A published release never gains or changes an asset. If a published release lacks an asset, the run refuses and the fix is a new version. A draft with a wrong digest is re-uploaded at step 3 or 5, since it is still a draft. With bundles switched off (repository variable `RELEASE_BUNDLES` not `true`) the same order runs with no assets, and steps 3 and 5 require that the draft has none.

**Release facts the plan decides.** A changeset whose summary starts with exactly `**Security release.**` makes the version a security release: the `plan` job reads the marker from the version's changelog entries and passes it to `bundle-build.yml` (`security_release`), the manifest and the statement then carry `securityRelease: true`, and `bundle-sign` refuses a statement whose `securityRelease` is not the planned value. A consumer may highlight such a release; none installs it by itself. A prerelease publishes to npm's `next` dist-tag (npm 12 refuses a prerelease without `--tag`).

**Channel rule:** `vX.Y.Z-<pre>` ⇔ `channel: "next"` ⇔ a GitHub prerelease, never Latest; `vX.Y.Z` ⇔ `stable`.

**Mandatory dry run** before the first signed release and after any change to the workflows: a `workflow_dispatch` with `dry_run: true` runs `bundle` and `bundle-sign` with a throwaway key generated in memory (key id `dryrun-<run id>`), creates a draft on `v<v>-dryrun.<n>` with `--target <commit>` (a draft creates no tag, so no tag is pushed), uploads and re-checks the assets, runs `npm publish --dry-run` (with `--force` for a version npm already has: npm 12 refuses `--dry-run` over a published version without it, and never uploads in a dry run), and deletes the draft unpublished.

### 7. Normative limits

| Item | Limit |
|---|---|
| `manifest.json` | ≤ 1,900,000 bytes |
| `release-statement.json` | ≤ 4096 bytes |
| tarball | ≤ 100 MiB (104,857,600 bytes) |
| one part (module, asset or starter file) | ≤ 64 MiB; a static asset ≤ 25 MiB |
| static assets per Worker | ≤ 20,000 |
| tar entries | ≤ 30,000 |

Tar format: ustar with PAX `path` records for long names; regular files only (no links, devices or directories); mode `0644`, uid and gid `0`, empty user and group names, mtime = `createdAt`; entries sorted by path; no entry the manifest does not list. Gzip with a fixed header (mtime `0`, OS byte `255`, no file name). A consumer refuses anything outside these limits before it uploads a byte.

### 8. Invariants

1. A published release and its bundle are immutable; a fix is a new version.
2. Every byte a deployer uploads is covered by the signed statement, through the manifest's per-part hashes.
3. The project key signs only `release-statement.json`, only in `bundle-sign`, only after the attestation and the digests verify.
4. Verification hard-fails for every consumer. No consumer may offer a soft-fail switch or install an unverified bundle. Verification includes binding the statement to the request (§2, invariant 7): a validly signed statement for a version or channel other than the one requested is a refusal.
5. `compatibleWithPrevious: false` or `durableObjects.lifecycleChange: true` means "do not roll code back past this release".
6. Bundles are never installed automatically by the project's tools; `securityRelease` is a highlight, not an auto-update.
7. Every version ships to everyone at the same moment: there is no early-access channel and no audience-restricted asset.

### 9. Keys and trust (hooks designed here, built later)

- **Two factors for a consumer that verifies both.** Factor 1 is the Ed25519 statement. Factor 2 is the `bundle-build.yml` attestation, verified by the consumer's own tooling.
  - For a consumer that verifies both, the two factors together defeat theft of the release key alone.
  - A consumer that verifies only the Ed25519 statement relies on the release key alone. A deployer running inside a Worker, without `gh` or a Sigstore verifier, is one example. A stolen key is enough against such a consumer until the key is revoked; §2 asks every consumer whose tooling can verify the attestation to do so.
  - Neither factor defeats a malicious commit on `main` or a compromised build dependency, because both factors then cover bad bytes. Required reviewers on `main`, the frozen lockfile, and the consumer's own soak, backup and rollback guards cover those cases.
- **Rollback and freeze.** Binding the statement to the request (§2, invariant 7) refuses an older signed release served under a newer name. It cannot tell a consumer that a newer version exists, or that the version it holds is withdrawn. The expiring yank list below covers that case once it is built. Until then, a consumer learns about versions from the release feed, which it uses for discovery only and never as a trust factor.
- **Key list** `keys.json` (designed, not built): entries `{ keyId, publicKey, role: "release" | "yank", notBefore, notAfter, status: "active" | "retiring" | "revoked" }`, signed by an offline root key held by two people (a hardware key plus a sealed backup), about one year of validity, published at a stable URL and as a release asset. Two release keys overlap at every rotation. The sign job will refuse when the active key's `notAfter` is under 90 days away. A consumer may use `keys.json` only to reduce trust (act on `revoked` or an expired `notAfter`); adding a key to a consumer stays a reviewed change on the consumer's side.
- **Yank list** `yanked.json` (designed, not built): signed by the dedicated `yank` key from `keys.json`, not the release key, so a stolen release key cannot un-yank; it carries `expires`, and a stale list alerts and never blocks verification of other versions. Installed copies keep running.
- Until `keys.json` exists, the pinned keys are the ones in `docs/security/release-signing-keys.md`, and a rotation is announced there before its first use.

### 10. Later phases (in scope, not in this change)

- `cloudhal deploy --release <v>`: the CLI installs the standard theme from a verified bundle instead of building it. Until then the CLI's bytes differ from the bundle's; what is shared is the manifest contract and its guards.
- Runtime configuration of the standard theme: values baked into its build today (theme settings, block types, installation names, site ids) move to bindings and `CLOUDHAL_CONFIG` vars, so one bundle serves every installation of the standard theme. Custom themes keep building with `cloudhal deploy`. Until then the bundle is the standard `cloudhal init` starter.
- A zero-dependency WebCrypto reference verifier package, KMS custody, an SBOM, and an independent rebuild check once two builds of one tag are byte-identical.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Users always build (status quo) | No new artifacts | Full toolchain on every deploy; N builds of one version are N different artifacts with nothing to verify | Prebuilt bundles for the standard theme |
| A host builds and signs its own bundles | The host controls timing | Every host becomes its own trust root and a second long-lived key that can push code; a second full dependency install outside the project; users must trust a vendor, not the project | The project builds and signs once, for everyone |
| Customer-side builds (deploy button, Workers Builds) | No project infrastructure | No update path for existing copies; nothing comparable to verify | Kept as the do-it-yourself channel, not as an update path |
| Keyless Sigstore only | No long-lived key | Verification needs the Sigstore trust root and ECDSA tooling, heavy for a Worker; ties every consumer to one transparency service | Ed25519 statement as the portable root; the attestation as the second factor |
| `manifest.sig` over the manifest only | Simpler; one signed file | The signed file can approach 1.9 MB, above a KMS `RAW` message, so moving the key later changes the format | The small statement now, with no dual-format period for project keys |
| Sign in the publish job | One job fewer | That job runs `pnpm install` with scripts and holds npm's OIDC token | A separate `bundle-sign` job with no install |
| Publish the release, then attach assets | Today's order | Impossible with immutable releases | Draft, attach, npm, publish |
| zstd tarballs | Smaller | No Worker-side decompressor | gzip |

## Compatibility & migration

- **Contracts:** two new `core-contracts` roots, `release-manifest` and `release-statement`, both `schemaVersion: 1`, with golden fixtures and the Rust round trip (`ReleaseManifest`, `ReleaseStatement`). No existing contract changes; the content `release` root (RFC-0008) is unrelated.
- **npm users:** nothing changes. Packages are published as today, after the bundle is attached.
- **Releases:** `v0.7.3` and older have no bundle and never will (immutable); a consumer treats them as unbundled. The first bundled version is the next one.
- **Rollout:** (1) the contracts and this RFC; (2) the builder, `bundle-build.yml`, `bundle-sign`, the reordered `publish-ci.ts` and the dry run, merged with `RELEASE_BUNDLES` off; (3) the maintainer creates `release-signing` and its secret, runs the dry run and turns `RELEASE_BUNDLES` on; (4) the first bundle ships, preferably on a `next` prerelease.
- **Rollback:** set `RELEASE_BUNDLES` off. Releases go on without assets in the same order; nothing in an installation depends on a bundle.

## Security & policy impact

- No new scopes and no runtime change in any Worker.
- **New secret:** the release key, in the `release-signing` environment only (required reviewer, `main` only), exposed to one step of one job that runs no repository code. The npm job never sees it; the build job holds no secret at all.
- **Residual risks:**
  - a compromised `release-signing` environment together with a compromised build (both factors);
  - a compromised `release-signing` environment alone, against a consumer that verifies only the Ed25519 statement;
  - a malicious commit on `main`;
  - a compromised build dependency.

  §9 lists what covers them. Consumers pin key ids and can withdraw trust in one at once.
- Bundles contain no secrets; per-installation secrets are generated at deploy time, and the builder refuses a part that contains a generated deploy secret.
- The public key, its status and the hand-verification steps are in `docs/security/release-signing-keys.md`.

## Open questions

1. Is the Astro and wrangler output byte-stable across two CI runs of one tag? The independent rebuild check waits for the answer.
2. Where does `keys.json` live: a `cloudhal.dev/.well-known/` URL, release assets only, or both? **[default: both]**
3. What is the source of truth for `compatibleWithPrevious` (a changeset field, a migration annotation)? **[default: `true` unless a release sets it]**
4. Should every `next` prerelease ship a bundle? **[default: yes]**
5. Is the inline `_headers` text in the manifest acceptable, or should it be a signed part? **[default: inline]**
