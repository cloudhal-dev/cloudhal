# Release signing keys

The public keys that sign Cloudhal release bundles ([RFC-0046](../rfcs/0046-release-bundles.md)). A key signs exactly one kind of file: a release's `release-statement.json`. The signature is the release asset `release-statement.sig`, a raw 64-byte Ed25519 signature over the exact bytes of the statement. The statement pins the SHA-256 and size of `manifest.json` and of `cloudhal-release-<version>.tar.gz`, and the manifest pins every part inside the tarball.

A consumer pins the keys below by key id, and must refuse a release whose `signing.keyId` it does not pin, whose key it treats as revoked, or whose signature does not verify. There is no soft-fail mode.

## Keys

| Key id | Algorithm | Public key (raw 32 bytes, base64) | Status | Since |
|---|---|---|---|---|
| `cloudhal-release-2026a` | Ed25519 | `7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=` | active | 2026-11-12 |

Other forms of `cloudhal-release-2026a`, for cross-checking:

- Raw public key, hex: `edacf7a4f738a13d0039f45c75f39965090ce970061e8da35c4743675a84551f`
- SHA-256 of the raw public key, hex: `da578ea6508924721c9343d29a94b598e4e3df9af0f5f37c6bcd0df6c9327dae`
- SPKI PEM:

  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEA7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=
  -----END PUBLIC KEY-----
  ```

Statuses:

- `active` signs new releases.
- `retiring` verifies existing releases and signs nothing new.
- `revoked` verifies nothing: a consumer refuses every release the key signed.

Releases are immutable and can never gain an asset, so a release signed by a revoked key can never be re-signed. The remedy is a new version signed by an active key. Later, the signed `keys.json` and yank list of RFC-0046 §9 will record that decision. Releases up to and including `v0.8.0` carry no bundle and no signature.

## Custody

- In GitHub, the private key exists only as the secret `RELEASE_SIGNING_KEY` (PKCS#8 PEM) of the GitHub environment `release-signing` in `cloudhal-dev/cloudhal`. The environment requires a reviewer and allows deployments from `main` only.
- Only one step of the `bundle-sign` job in `.github/workflows/release.yml` receives the secret. That job checks out no code and runs no package install. It signs only after two checks pass: `gh attestation verify` has checked the files against `bundle-build.yml`, and the statement's digests match the files. Before signing, it checks that the key it was given derives the public key above. The key id and public key are written inline in that job, and a repository test keeps them equal to this file.
- No other job, workflow or repository receives the key.
- Outside GitHub, the maintainer holds the key.
  - The copies are the PKCS#8 file the key was generated into, kept readable by its owner only, and the maintainer's backups.
  - No copy is ever in a repository, a chat, an issue or a cloud service.
  - Once the environment secret is set, and before the first signed release, the maintainer moves the generated file to offline storage. From then on, the environment secret and the offline backups are the only copies.
- Phase 2 (designed in RFC-0046, not built) moves the key into a KMS reached through GitHub OIDC, after which no person can export it.

## Rotation

1. Generate the new key pair offline. Name it `cloudhal-release-<year><letter>` (for example `cloudhal-release-2027a`).
2. Add a row for it to the table above with status `active` in a reviewed pull request, at least 30 days before its first use, so consumers can pin it in time. Until the signed `keys.json` of RFC-0046 §9 exists, this file is the announcement.
3. Replace the `RELEASE_SIGNING_KEY` secret of `release-signing`, update the inline key id and public key in the `bundle-sign` job (the test that keeps them equal to this file fails until both agree), and run the release workflow's dry run (`workflow_dispatch`, `dry_run: true`).
4. Set the old key's status to `retiring` in this file. Keep it pinned by consumers for as long as releases it signed are installed.
5. A compromised key goes straight to `revoked` here, with an advisory under [SECURITY.md](../../SECURITY.md), and the next release is signed with the new key.

## Verifying a release

[`@cloudhal/release-verify`](../../packages/release-verify/README.md) does all of the steps below in one call, on Node, Workers or a browser. Its `PINNED_KEYS` is kept equal to the table above, and its `./attestation` subpath runs step 3. To check by hand instead, follow these steps.

## Verifying a release by hand

Download the release's assets into an empty directory, for example with `gh release download v<version> --repo cloudhal-dev/cloudhal --dir <dir>`.

### 1. The Ed25519 statement (required)

With Node 24, from inside that directory (`node verify.mjs <version>`):

```js
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const version = process.argv[2];
const PINNED = { "cloudhal-release-2026a": "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=" };

const statementBytes = readFileSync("release-statement.json");
const sig = readFileSync("release-statement.sig");
if (statementBytes.length > 4096 || sig.length !== 64) throw new Error("wrong statement or signature size");
const statement = JSON.parse(statementBytes.toString("utf8"));
const raw = Buffer.from(PINNED[statement.signing.keyId] ?? "", "base64");
if (raw.length !== 32) throw new Error("key id not pinned");
// SPKI DER of an Ed25519 public key = this 12-byte prefix + the raw 32 bytes.
const key = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
  format: "der",
  type: "spki",
});
if (!verify(null, statementBytes, key, sig)) throw new Error("signature does not verify");
// Bind the statement to what you asked for (RFC-0046 §2, invariant 7): a validly signed older
// release served under this version's name must be refused.
if (statement.version !== version) throw new Error("statement is for another version");
if (statement.channel !== (version.includes("-") ? "next" : "stable")) throw new Error("wrong channel");

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const part of [statement.manifest, statement.tarball]) {
  if (sha256(part.name) !== part.sha256 || statSync(part.name).size !== part.bytes)
    throw new Error(`${part.name} does not match the statement`);
}
console.log(`ok: ${version} signed by ${statement.signing.keyId}, commit ${statement.commit}`);
```

Verify the exact downloaded bytes. Never parse and re-serialise the statement before verifying it. Then check that `manifest.json` names the same `version`, `channel`, `securityRelease`, `commit`, `createdAt` and `signing.keyId` as the statement, and that every entry of the tarball is listed in the manifest with its size and SHA-256 (RFC-0046 §2, steps 5 and 6).

### 2. GitHub's release record (recommended)

```sh
for f in cloudhal-release-<version>.tar.gz manifest.json release-statement.json release-statement.sig; do
  gh release verify-asset v<version> "$f" --repo cloudhal-dev/cloudhal
done
```

This shows that GitHub served these bytes as assets of the immutable release `v<version>`. It is not a trust factor on its own.

### 3. The build-provenance attestation (recommended; the second factor)

```sh
for f in cloudhal-release-<version>.tar.gz manifest.json release-statement.json; do
  gh attestation verify "$f" --repo cloudhal-dev/cloudhal \
    --signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml \
    --source-ref refs/heads/main --deny-self-hosted-runners
done
```

This shows that the files were built by this repository's `bundle-build.yml` on GitHub-hosted runners. Offline, pass `--bundle cloudhal-release-<version>.sigstore.json` (the attestation bundle attached to the release). Add `--source-digest <commit>` with the statement's `commit` to pin the exact commit.
