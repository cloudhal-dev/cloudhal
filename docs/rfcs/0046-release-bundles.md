# RFC-0046: Signed release bundles

- Status: Proposed
- Author: Halil (Madraka), drafted with Claude · Date: 2026-11-12
- Related:
  - ADR-0001 / ADR-0008 (the contract pipeline, precompiled validators), ADR-0012 (the site and admin Workers), ADR-0013 (npm packaging: one version for the fixed group), ADR-0037 (`cloudhal.dev/schemas/v1` permanent URLs).
  - RFC-0008 (`schedulesLevel`, the downgrade guard), RFC-0034 (several site Workers), RFC-0042 / RFC-0043 (the `gates` and `status` feature levels).
  - Code read: `.github/workflows/release.yml` (job graph; npm's trusted-publisher entry names this file and the `npm-publish` environment), `scripts/publish-ci.ts` (today: npm publish, then `gh release create --verify-tag --latest`), `packages/cli/src/archive/` (RFC-0039's deterministic tar and fixed-header gzip), `packages/cli/src/commands/deploy/`, `packages/core-contracts/schemas/common.schema.json`.
  - Sources (checked 2026-11-11):
    - GitHub, [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): once published, a release's assets cannot be added, changed or deleted, and the tag of a deleted immutable release cannot be reused. This repository has immutable releases on; `v0.8.0` (the latest when this RFC was written) is immutable with no assets.
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
- **Why now.** Releases are immutable in this repository, and today's `publish-ci.ts` publishes the release at once. An asset cannot be added afterwards, so the order has to change before the first bundle ships; `v0.8.0` and older can never gain one, and the first bundled release is the next version.

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

Scopes (amended 2026-11-14, #225):

- `requiredScopes` and `optionalScopes` name Cloudflare OAuth scope ids. A deployer asks for every required scope and may ask for optional ones.
- Installing a release creates the site and admin Workers. Since Cloudflare's granular Worker roles (changelog 2026-09-15), only Workers Admin (`workers-scripts.admin`) can create a Worker. Workers Editor (`workers-scripts.edit`) can only change existing ones. Bundles from the next release on therefore require `workers-scripts.admin`.
- Manifests up to and including `v0.9.0` name `workers-scripts.edit`. Releases are immutable, so these manifests keep it.
- A consumer that compares a grant with `requiredScopes` treats `workers-scripts.admin` as covering `workers-scripts.edit`. A consumer that builds a grant from an older manifest asks for `workers-scripts.admin` in its place, because a grant with only `workers-scripts.edit` cannot install a release: the asset upload for a new Worker answers 403.
- This is the only implied scope. Every other id is compared exactly.

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

- `cloudhal deploy --release <v>`: the CLI installs the standard theme from a verified bundle instead of building it (designed in §11b). Until then the CLI's bytes differ from the bundle's; what is shared is the manifest contract and its guards.
- Runtime configuration of the standard theme: values baked into its build today (theme settings, block types, installation names, site ids) move to bindings and `CLOUDHAL_CONFIG` vars, so one bundle serves every installation of the standard theme. Custom themes keep building with `cloudhal deploy`. Until then the bundle is the standard `cloudhal init` starter.
- A WebCrypto reference verifier package (designed in §11a), KMS custody, an SBOM, and an independent rebuild check once two builds of one tag are byte-identical.

### 11. Addendum (2026-11-14, #227): the shared verifier and `cloudhal deploy --release`

§2 says what every consumer checks. This section designs the two consumer tools that §10 left for later: one published verifier that hosts, tools and the CLI share, and the CLI's install from a verified bundle. The verifier can ship on its own. `deploy --release` depends on #226 (§11b, *Revocation*).

#### 11a. `@cloudhal/release-verify`

A new published package, `packages/release-verify`. It is the reference implementation of §2's six steps and of §7's limits, and there is no second implementation in the repository: `scripts/release-bundle/verify.ts` and the CLI both call it.

- **Runtimes.** The root entry runs on Workers, Node 24 and browsers.
  - It uses WebCrypto Ed25519 (`crypto.subtle.verify`) and `DecompressionStream("gzip")`.
  - It needs an incremental SHA-256, because WebCrypto's `digest` cannot stream. It uses Workers' native `crypto.DigestStream` where that exists, and otherwise `sha256` from `@noble/hashes`.
  - `@noble/hashes` is pinned exactly, and only its SHA-2 module is imported. It is independently audited and has no dependencies.
  - A home-grown SHA-256 would be small, but it would be new cryptographic code in the one package whose job is to be trusted.
  - Tests check both paths against the NIST SHA-256 vectors and against `node:crypto` on random inputs.
- **Validators and runtime dependencies.** Rule 6 forbids compiling schemas at runtime.
  - `pnpm gen` writes precompiled standalone validators for exactly `release-manifest` and `release-statement` into `src/generated/`, and the drift check covers them.
  - Ajv's standalone output imports `ajv/dist/runtime/equal`, `ajv/dist/runtime/ucs2length` and the `date-time` format from `ajv-formats`. So the package's runtime dependencies are `@noble/hashes`, `ajv` and `ajv-formats`, pinned through the catalog at core-contracts' versions. Nothing in the package constructs `Ajv`. A test fails when a generated validator imports anything outside those three runtime modules.
  - The package does not depend on `@cloudhal/core-contracts`, so a Worker deployer does not pull in every validator.
- **Keys.** `PINNED_KEYS` is the table of `docs/security/release-signing-keys.md` as `{ keyId: { publicKey, status } }`, and a repository test keeps the two equal.
  - It is frozen into each published version. It cannot learn about a revocation by itself; §11b says how the CLI does.
  - A caller may only reduce trust. `revoked: string[]` withdraws key ids, and once #226 lands, a verified `keys.json` feeds the same reduce-only path.
  - A caller that trusts a key outside the table passes a whole `keys` map, which is a reviewed change on its side.
  - A `revoked` key is refused. `PINNED_KEYS` carries no `notAfter` yet, so the package refuses no key for its age until #226 decides what an expiry date means (§11c).
- **Entry paths.** Every path in the manifest's module and asset listings, and every tar entry name, is checked before any byte of that entry is used. Paths that break any of these rules are refused with `entry-path`:
  - no empty segment;
  - no `.` or `..` segment;
  - no backslash;
  - no control character (U+0000 to U+001F, U+007F);
  - no leading `/`, except the asset form `/<path>` that §3 defines;
  - at most 512 bytes;
  - no two paths in one Worker's modules, or in its assets, may be equal after Unicode case folding.

  The check is a single pass over the characters with `split("/")`, not a regular expression, so it is linear in the path's length (AGENTS.md rule 13). The manifest's listings are checked in step 5, before the tarball is read.
- **API.** Every byte the consumer downloaded goes in. Nothing is re-serialised.

  ```ts
  const release = await verifyRelease({
    request: { version: "0.10.0" },          // channel: derived from the version unless given (invariant 7)
    statement, signature, manifest,           // Uint8Array, exactly as downloaded
    tarball: () => stream,                    // a factory: read twice, see below
    planVersion: 1,                           // the highest planVersion the caller supports
  });
  for await (const entry of release.entries()) { /* { worker, kind, path, type?, bytes }: verified */ }
  ```

  `verifyRelease` runs steps 1 to 5. It then reads the tarball once to check its size and SHA-256 against the statement, so a tarball that does not match is refused before anything is extracted.

  `entries()` reads the tarball a second time. It yields an entry only after its path passes the checks above and its size and SHA-256 equal its manifest listing. A module entry carries its `type` from the manifest. It throws on an entry the manifest does not list, on anything outside §7's tar format, and, at the end, on a listed entry that never came.

  A consumer may upload verified entries while it iterates. It must not activate a deployment until the iteration has finished without an error. This keeps a Worker deployer within memory: the tarball is at most 100 MiB and is never held whole.
- **Errors.** A `ReleaseVerifyError` carries a stable `code`, which is public API. There is no option that turns a refusal into a warning. The codes:
  - `statement-too-large`, `signature-size`, `key-unknown`, `key-revoked`, `signature-invalid`;
  - `wrong-version`, `wrong-channel`, `statement-invalid`;
  - `manifest-mismatch`, `manifest-invalid`, `statement-manifest-mismatch` (invariants 4 and 5), `plan-version-unsupported`;
  - `tarball-mismatch`, `tar-format`, `entry-path`, `entry-unlisted`, `entry-mismatch`, `entry-missing`, `limit-exceeded`.
- **Helpers.**
  - `missingScopes(manifest, granted)` compares scope ids exactly, with the one exception §3 defines: `workers-scripts.admin` covers `workers-scripts.edit`.
  - `releaseAssetUrls(version)` gives the five download URLs of §1, Sigstore bundle included, under `https://github.com/cloudhal-dev/cloudhal/releases/download/v<version>/`. Downloading is discovery only, never a trust factor.
- **The second factor.** The subpath `@cloudhal/release-verify/attestation` is Node-only. It reports `verified`, `failed` or `unavailable`.
  - It first probes `gh`. The result is `unavailable`, and nothing is verified, when any of these hold:
    - `gh` is missing;
    - `gh --version` reports a version below **2.68.0**, the first release with `--source-ref` and `--source-digest` (Ubuntu 24.04 ships 2.45, which has no `gh attestation` at all);
    - `gh attestation verify --help` does not list every flag below;
    - `gh auth status` does not exit 0.

    The message names the required version.
  - It then runs, for each of `cloudhal-release-<v>.tar.gz`, `manifest.json` and `release-statement.json`:

    ```
    gh attestation verify <file> --repo cloudhal-dev/cloudhal \
      --signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml \
      --source-ref refs/heads/main --source-digest <statement.commit> \
      --deny-self-hosted-runners [--bundle cloudhal-release-<v>.sigstore.json]
    ```

    `--bundle` is passed when the release's Sigstore bundle is at hand, which it is for every bundled release.
  - Any non-zero exit, a signal, or no exit within 60 seconds is `failed`. It is never `unavailable`.
- **Tests.**
  - **Real fixtures.** The real `v0.9.0` statement, signature and manifest are committed, about 250 KB of signed, immutable data. Tests check that they verify with the pinned key, and that a flipped byte in each file is refused. They also cover a wrong key, a revoked key, and a request for another version or channel.
  - **No real tarball in git.** The tarball (7.2 MB) is not committed: it would be by far the largest file in the repository.
  - **Opt-in full test.** One test checks the real tarball. It runs only when `CLOUDHAL_RELEASE_ASSETS` names a directory holding the downloaded assets. Ordinary test runs skip it and never need the network. A separate CI job fills the directory with `gh release download v0.9.0` and runs only that test.
  - **Synthetic bundle.** Everything that needs a tampered but validly signed bundle uses a small synthetic bundle, signed with a throwaway key that tests pass as `keys`. Editing the real manifest would only ever reach `manifest-mismatch`. The synthetic bundle covers:
    - a manifest whose `version` differs from the statement's (invariant 5);
    - an unlisted, missing or changed entry;
    - every `entry-path` rule;
    - a tarball that does not match the statement;
    - `planVersion` above what the caller supports;
    - every limit in §7.
- **Versioning and publication.**
  - The package joins the fixed version group: `.changeset/config.json` `fixed` and ADR-0013.
  - npm trusted publishing can only be configured on a package that already exists, and a version published by hand carries no provenance. `planPublish` would also skip that version from then on. So the **owner's step** is to publish a placeholder: `0.0.0-placeholder.0`, with only a README and `--tag placeholder`, then `npm deprecate` it. Next, add the trusted-publisher entry (`release.yml`, the `npm-publish` environment).
  - The first real version then comes from `release.yml` with `--provenance`, like every other package in the group.

#### 11b. `cloudhal deploy --release`

Today `cloudhal deploy` builds the site with Astro and the admin Worker with wrangler's bundler. With `--release`, it downloads the release's five assets and verifies them. It then extracts the verified entries and deploys those bytes. Everything else stays as it is: provisioning, secrets, the downgrade guard, settings, the scheduler fallback, the first push and the cache purge.

- **Which version.** `--release` deploys the CLI's own version and takes no other. The CLI's starter, its config generator and its downgrade guard then match the bundle exactly. To install another version, run that version of the CLI (`npx @cloudhal/cli@<v> deploy --release`). `next` prereleases work the same way.
- **No bundle, no deploy.** The CLI refuses with `release-unavailable` when `v<version>` has no published release, when the release is still a draft (publish-ci's window between attaching assets and publishing), or when it has no bundle assets (`RELEASE_BUNDLES` off, or `v0.8.0` and older). The message says to run `cloudhal deploy` without `--release`. It never falls back to building.
- **Revocation.** `PINNED_KEYS` is frozen into each published CLI. A stolen key would therefore stay trusted by every CLI already published, and `--release` sends older versions through exactly those CLIs. So **`deploy --release` ships only after #226's signed `keys.json` exists.**
  - On every `--release`, the CLI fetches `keys.json` from its stable URL, falling back to the release asset. It verifies it with the root key the CLI pins, checks its `expires`, and applies it reduce-only.
  - A `keys.json` that cannot be fetched, does not verify, or has expired is a refusal. There is no override.
  - `--from <dir>` needs `keys.json` in that directory too. The same rules apply, plus a freshness limit (§11c, point 7).
  - The verifier package itself can ship before #226. Its callers pass the keys they trust.
- **Order.**
  1. Steps 1 to 5 of §2, with the keys reduced by `keys.json`.
  2. The tarball digest.
  3. The attestation.
  4. Extraction.
  5. Wrangler.

  Nothing is written outside `.cloudhal/deploy/` and nothing is uploaded before step 3 succeeds.
- **The second factor.** The CLI refuses when the attestation is `failed`. When it is `unavailable`, the CLI also refuses by default and says how to install and sign in to `gh`. `--allow-single-factor` continues on the release key alone, and the CLI prints a line saying so. The flag is never implied, including in CI and non-interactive runs.
- **Extraction.** Into a fresh directory, `.cloudhal/deploy/release/<version>/`, which is removed first and created empty.
  - Every target is `path.resolve`d and refused unless it lies inside that directory.
  - Files are created with exclusive create (`wx`), so a duplicate fails.
  - Only verified entries are written, so the directory holds exactly the manifest's listings and no stale files.
  - `_headers` is written from the manifest's inline text.
- **How the bytes are deployed.**
  - The deploy generates the same wrangler configs as today, with `main` set to the extracted main module and `no_bundle: true`.
  - Each module type comes from the manifest. The config lists one `rules` entry per module type, whose globs are that type's exact module paths, so wrangler uploads exactly the listed modules, unchanged.
  - `assets.directory` is the extracted assets directory.
  - A deployer that calls the Workers API directly is not needed for the CLI. Hosts that cannot run wrangler use the verifier and their own uploader.
- **What `--release` means.** `--release` installs the official standard theme of this CLI's version into the project's Cloudflare account. It does not build the project. The site and admin code come entirely from the bundle, and the project contributes only its content (the first push), its config and its secrets.

  §10 still applies: the bundle bakes in its build inputs. In `v0.9.0` the manifest's `theme.blockTypes`, `settingsSha256`, `designSha256` and `skills` are placeholders: an empty list and the SHA-256 of the empty string. Consumers ignore those fields, and no check reads them.
- **The theme check.** Before downloading the tarball, the CLI compares the project with **this CLI version's own starter**, the template it ships and `cloudhal init` copies, which is the starter the bundle was built from (§4 step 3). The comparison covers:
  - every file under `src/` and `public/`;
  - the root build inputs the starter has: `astro.config.mjs`, and `tsconfig.json` (Astro reads its `paths`, and the transform reads its `compilerOptions`);
  - root build inputs the starter does not have, which must not exist:
    - a `skills/` directory. `resolveSkillsDir` prefers it, and the admin build bakes it in.
    - `jsconfig.json`.
    - any PostCSS config Vite loads: `postcss.config.{js,cjs,mjs,ts,cts,mts}`, `.postcssrc`, `.postcssrc.{json,yaml,yml,js,cjs,mjs,ts,cts,mts}`, and a `postcss` key in `package.json`. Vite searches for these upward, so the CLI does too.
      - It checks every directory from the project root up to and including Vite's workspace root. That is the nearest directory with a `pnpm-workspace.yaml` or `lerna.json`, a `package.json` with `workspaces`, or a `deno.json`/`deno.jsonc` with `workspace`.
      - Without one, it stops at the project root: Vite falls back to the nearest `package.json`, which is the project's own.
      - This is Vite 8.3.5's own rule (`resolvePostcssConfig` with `stopDir` from `searchForWorkspaceRoot`). `cloudhal init` supports projects inside an existing workspace, so a monorepo's root PostCSS config would otherwise apply to a local deploy and be dropped silently by `--release`.

  The list was checked against the installed Astro 7.4.7 and Vite 8.3.5.
  - Astro passes `configFile: false` to Vite (`create-vite.js`), so a `vite.config.*` is never loaded and is not compared.
  - The PostCSS names are the search places of the `postcss-load-config` 6.0.1 that Vite bundles.
  - `.env*` files are not compared. Vite loads them, but only code that reads a variable can bake it in, and the code is the starter's, which reads no `import.meta.env`.
  - The list is rechecked on every Astro or Vite major upgrade, and the code PR adds that step to the upgrade notes next to the list.

  Files are compared byte for byte after CRLF is normalised to LF, so a Windows checkout of an unmodified starter passes. A file the starter has that the project lacks is a difference, and so is a file the project has that the starter lacks.

  Three operating-system metadata files are skipped wherever they appear under the compared paths: `.DS_Store`, `Thumbs.db` and `desktop.ini`. They are matched by exact basename, with no patterns, and the starter never contains them. A Finder visit to `public/` must not teach anyone to reach for the flag.

  Paths are compared as normalised relative paths, with no pattern over paths or contents. Nothing outside these paths is compared, so `README`, `.gitignore`, lockfiles and `wrangler.jsonc` never matter.

  On any difference, the CLI refuses. It lists the differing files (the first 20, then a count) and names the two ways forward: `cloudhal deploy` without `--release`, which builds the project as it is, or `--discard-local-theme`.
- **`--discard-local-theme`.** The flag deploys the official theme anyway. The CLI then lists every file that is not deployed (changed, added or missing relative to the starter) before it uploads. The flag is never implied, including in CI and non-interactive runs. It discards nothing on disk: the project's files stay as they are.
- **Older projects.** A project whose starter files come from an older version differs from this CLI's starter wherever the starter changed between the two versions, even if nobody edited it. Such a project needs `--discard-local-theme` to upgrade or roll back with `--release`. A future `cloudhal starter sync` would bring the local starter files to the CLI's version; it is named here and is out of scope.
- **Config build keys.** Separately from the theme check, the CLI refuses when `cloudhal.json` sets a key the table below marks `build` to a value other than this version's starter's. `--discard-local-theme` does not cover this. The config is the project's own, so the user changes the key or deploys without `--release`. A `cloudhal.json` key this CLI does not know is refused the same way.
  - **The table.** It lives in one exported table next to `readProjectConfig`. Every key and every sub-key that a reader uses has an explicit class. There is no fallback class: a key the table does not class is a drift-test failure, and it is never assumed. The classes:
    - `deploy`: the key becomes a binding, a var or a resource, and no build reads it.
      - `domains`, `mail`, `ai`, `render`, `observability`, `placement`, `schedules`.
      - `search`, which feeds only `searchDeploymentOf`.
      - `comments.rateLimit`, which feeds only `commentsRateLimitDeployment`.
      - `analytics.queryBudget`, `analytics.rawRetentionDays` and `analytics.rateLimit`.
    - `runtime`: a build reads the key, but the deployed Worker overrides it.
      - `siteId`: the Site Worker's `CLOUDHAL_SITE_ID`/`CLOUDHAL_SITE_IDS` vars override the baked id.
      - `dataDir`: the `cloudflare` target never reads it. The baked value is the CI build's absolute path.
      - `analytics.enabled`, `analytics.uniqueVisitors` and `analytics.vitalsOneIn`: the Site Worker reads its vars instead.
      - `analytics.dev`: only `cloudhal dev` reads it.
    - `build`: a build reads the key and nothing overrides it.
      - `comments.available`.
      - `media.transform`, unless the manifest's `features.mediaTransformVar` is true; then it is `runtime`.
    - `refused`: `sites` and `installation`. The other refusals below handle them.
  - **Drift guards.** These test the builds themselves, not config generation.
    - **Every key is classed.** The table's type is mapped over `ProjectConfig`, plus `media`, which only `astro.config.mjs` reads. Objects with mixed classes (`analytics`, `comments`, `media`) map over their sub-keys, so `tsc` fails on a key or sub-key that has no class. A test also checks:
      - that every key in `config.ts`'s `OWN_KEYS` is a table key;
      - that every sub-key the `cloudhal()` integration's option types declare for `media`, `analytics` and `comments` is classed.
    - **Site.** A repository test scans `starters/blog/astro.config.mjs` for every `project.<key>` it reads. It fails unless every such key is in the table. For `media`, `analytics` and `comments`, which the file passes to the integration whole, the sub-key check above applies. The theme check guarantees that a project deployed with `--release` carries this exact file. Two further tests hold the `runtime` overrides:
      - a Site Worker test serves a site whose id differs from the baked one, through `CLOUDHAL_SITE_ID`;
      - an astro-renderer test shows that the `cloudflare` target ignores `dataDir`. If it does not, the integration stops emitting `dataDir` for that target.
    - **Admin.** A test runs `prepareAdminWorker` twice, with different `mail`, `ai`, `browser`, `observability`, `placement`, `domains.studio` and `siteId`. The generated entry, the skills module and the theme-design module must be byte-identical; only the wrangler config may differ. The code the admin build bakes in reads only files (block types, theme settings, `src/DESIGN.md`, skills), and the theme check covers those files.
- **Other refusals.** The CLI also refuses when the project is attached to another installation (RFC-0034 `installation`), serves several sites (`sites`), or runs in Workers Builds.
- **Wrangler.** `--release` needs a wrangler at least as new as the one the bundle was built with (`manifest.toolchain.wrangler`), because the generated configs use its asset and module settings. The CLI reads the version of the wrangler it will run, resolved the way `deploy` resolves it today, from that wrangler's own `package.json`. An older wrangler is refused, and the refusal names the required version. The starter only declares a range (`wrangler ^4.158.0`), so the check trusts the installed version, never the range.
- **Tests for the check.**
  - An unmodified starter passes, also with CRLF line endings.
  - Each of these is refused, naming the file:
    - an edited `src/` file;
    - an added `public/` file;
    - a starter file deleted;
    - an edited `astro.config.mjs`;
    - an added `skills/x/SKILL.md`.
  - `--discard-local-theme` turns each of those refusals into a deploy that lists the files not deployed.
  - `comments.available: false` is refused with and without the flag. So is `media.transform` while `features.mediaTransformVar` is false.
  - Each of these is refused, naming it:
    - an edited `tsconfig.json`;
    - an added `postcss.config.mjs` or `.postcssrc.json`;
    - a project inside a pnpm workspace whose root has a `postcss.config.cjs`;
    - a `postcss` key in the `package.json` of a directory between the project and that workspace root;
    - a `postcss` key in `package.json`;
    - an added `jsconfig.json`.
  - A `public/fonts/v1/.DS_Store`, a `Thumbs.db` or a `desktop.ini` under `src/` passes, and so do a `vite.config.ts` and a `.env`.
  - A `postcss.config.cjs` above the workspace root, or above a standalone project, passes, because Vite never reads it.
  - A project with `search` set, or with `comments.rateLimit` set, passes the config check.
  - Edits to `README.md`, `.gitignore` or `wrangler.jsonc` pass.
  - A starter from the previous version's tag is refused without the flag and passes with it, which covers the upgrade and rollback rule.
  - A wrangler older than `manifest.toolchain.wrangler` is refused.
- **Migrations.** These need nothing new. The admin Worker applies D1 migrations itself, as it does after every deploy, and `manifest.levels.schedules` feeds the existing downgrade guard.
- **Offline and dry runs.**
  - `--from <dir>` takes the five assets and `keys.json` from a directory, for offline machines. The same verification runs on them.
  - `--release --dry-run` downloads, verifies, extracts and writes the configs, then stops before wrangler. It needs no Cloudflare account.

#### 11c. Open points for this addendum

1. Which incremental SHA-256 runs outside Workers: `@noble/hashes`, or our own of about 120 lines? **[default: `@noble/hashes`, audited and zero-dependency, pinned exactly. Workers use the native `crypto.DigestStream`]**
2. Should `--release` accept another version than the CLI's own? **[default: no, until §10's runtime configuration lands]**
3. When `gh` is unavailable, does the CLI refuse? **[default: yes. `--allow-single-factor` continues on the release key alone, with a line saying so. A failed attestation is always a refusal]**
4. Where does the full-tarball test run? **[default: opt-in through `CLOUDHAL_RELEASE_ASSETS`, in its own CI job that downloads `v0.9.0`. The 7.2 MB tarball is never committed]**
5. What does a key's `notAfter` mean for releases it has already signed? This is #226's decision 6. Until it is settled, the verifier has no `key-expired` code, and `PINNED_KEYS` carries no dates. **[default: #226's answer]**
6. Should a later release record real `theme` and `skills` values in the manifest, so a host can compare a project without the CLI's starter? **[default: not part of this change. Consumers ignore the placeholders]**
7. With `--from`, an old `keys.json` replays a key list from before a revocation. **[default: `--from` refuses a `keys.json` whose signed `issuedAt` is more than 30 days old, and the remaining window is documented. This needs #226's format to carry `issuedAt`. Online runs always fetch the current list]**

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
- **Releases:** `v0.8.0` and older have no bundle and never will (immutable); a consumer treats them as unbundled. The first bundled version is the next one.
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
