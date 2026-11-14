# Release signing keys

The public keys that sign Cloudhal release bundles ([RFC-0046](../rfcs/0046-release-bundles.md)). A key signs exactly one kind of file: a release's `release-statement.json`. The signature is the release asset `release-statement.sig`, a raw 64-byte Ed25519 signature over the exact bytes of the statement. The statement pins the SHA-256 and size of `manifest.json` and of `cloudhal-release-<version>.tar.gz`, and the manifest pins every part inside the tarball.

A consumer pins the keys below by key id, and must refuse a release whose `signing.keyId` it does not pin, whose key it treats as revoked, or whose signature does not verify. There is no soft-fail mode.

## Keys

| Key id | Algorithm | Public key (raw 32 bytes, base64) | Status | Since | Not after |
|---|---|---|---|---|---|
| `cloudhal-release-2026a` | Ed25519 | `7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=` | active | 2026-11-12 | 2027-11-12 |

Other forms of `cloudhal-release-2026a`, for cross-checking:

- Raw public key, hex: `edacf7a4f738a13d0039f45c75f39965090ce970061e8da35c4743675a84551f`
- SHA-256 of the raw public key, hex: `da578ea6508924721c9343d29a94b598e4e3df9af0f5f37c6bcd0df6c9327dae`
- SPKI PEM:

  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEA7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=
  -----END PUBLIC KEY-----
  ```

A release key signs a statement only while its window lasts: the statement's `createdAt` must lie within `[since, not after]`. `bundle-sign` enforces this, and it refuses to sign once the not-after date is less than 90 days away. Every consumer checks it too. The 90 days are the rotation window.

Statuses:

- `active` signs new releases.
- `retiring` signs nothing new. It verifies releases created inside its window, and after its not-after date it does so only while a fresh, root-signed `keys.json` lists it as `retiring`.
- `revoked` verifies nothing: a consumer refuses every release the key signed.

**Expiry.** With pinned keys only, and no `keys.json`, a consumer refuses a key past its not-after date (`key-expired`). A stolen key could backdate a statement's `createdAt`. The answer to that is revocation, not the date.

Releases are immutable and can never gain an asset, so a release signed by a revoked key can never be re-signed. The remedy is a new version signed by an active key. Releases up to and including `v0.8.0` carry no bundle and no signature.

## Root keys

The root signs only `keys.json`, at the yearly rotation or in an emergency (RFC-0046 §9). `@cloudhal/release-verify` pins the root's public key as `PINNED_ROOTS`, and a test keeps it equal to this table.

| Key id | Algorithm | Public key (raw 32 bytes, base64) | Since |
|---|---|---|---|

None yet. The owner's root ceremony adds the first row (see *First-time setup* below).

**Custody.**
- The root is generated offline by `node scripts/release-keys.ts root-init`. The private key is only ever written encrypted with a passphrase, and the script never prints it.
- There is one holder for now, with two sealed copies (the encrypted file plus its passphrase) kept in separate places. A YubiKey with firmware 5.7 or later, which can hold Ed25519, is an option.
- A second holder is added when there is a second maintainer.
- The root is never a GitHub secret.

## The yank key and the two lists

- **The yank key.** `cloudhal-yank-2026a` has role `yank` in `keys.json`. It signs only `yanked.json`.
  - It lives as the secret `RELEASE_YANK_KEY` of the GitHub environment `release-yank`, whose branch policy allows `main` only.
  - It can only reduce trust: it yanks versions and revokes release key ids, and it can never add or re-enable a key.
  - A stolen yank key can yank good versions and revoke good keys (denial of service).
    - It can also *undo* yanks and revocations for stateless consumers, such as a Worker deployer, by signing a fresh list without them.
    - Consumers that keep state, such as the CLI, refuse such a list: they remember every entry and the highest serial they have seen. They also remember the newest `keys.json` and every revoked or replaced yank key, so an older `keys.json` replayed with a list from the stolen key is refused too.
  - **One active yank key at a time.** `keys.json` lists at most one yank key as `active`, and `sign-keys` refuses two. Rotate the yank key by replacing it in one `keys.json` (old key `revoked` or removed, new key `active`), never by overlapping.
    - The recovery is a root-signed `keys.json` that revokes the stolen key and lists a new one. That is also why every emergency revocation is recorded in `keys.json` within days (*Revocation*, step 2).
- **`keys.json`** (`cloudhal.release-keys@1`, signed by the root in `keys.json.sig`).
  - It lists every release and yank key with its window and status.
  - It carries signed `issuedAt` and `expires`, at most 13 months apart, and the root re-signs it at every rotation.
  - Its source is `security/keys.json`, with `security/keys.json.sig`.
- **`yanked.json`** (`cloudhal.release-yank-list@1`, signed by the yank key in `yanked.json.sig`).
  - It lists yanked versions and revoked release key ids.
  - It expires exactly 30 days after `issuedAt`, and carries a signed `serial`, one higher at every signing. A weekly workflow in `release-yank` re-signs it from `security/yank-list.json`, which is append-only.
  - The CLI remembers the highest serial it has seen and refuses a lower one, which would be a rolled-back list. A stateless consumer, such as a Worker, cannot detect a rollback inside the 30 days.
  - A stale `yanked.json` blocks `cloudhal deploy --release` only; installed sites keep running.
- **Where they live.** `https://cloudhal.dev/.well-known/cloudhal/keys.json` and `.../yanked.json`, each with its `.sig`. Every GitHub release also attaches the copies current when it was made. The signatures make the location trust-free.
- **How consumers use them.** Online consumers fetch both on every run and refuse when a fetch or a check fails. They use both only to reduce trust in the keys they pin (`mergeTrust`).

## Custody of the release key

- In GitHub, the private key exists only as the secret `RELEASE_SIGNING_KEY` (PKCS#8 PEM) of the GitHub environment `release-signing` in `cloudhal-dev/cloudhal`. The environment requires a reviewer and allows deployments from `main` only.
- Only one step of the `bundle-sign` job in `.github/workflows/release.yml` receives the secret. That job checks out no code and runs no package install. It signs only after two checks pass: `gh attestation verify` has checked the files against `bundle-build.yml`, and the statement's digests match the files. Before signing, it checks that the key it was given derives the public key above. The key id, public key and window are written inline in that job, and a repository test keeps them equal to this file.
- No other job, workflow or repository receives the key.
- Outside GitHub, the maintainer holds the key.
  - The copies are the PKCS#8 file the key was generated into, kept readable by its owner only, and the maintainer's backups.
  - No copy is ever in a repository, a chat, an issue or a cloud service.
  - Once the environment secret is set, and before the first signed release, the maintainer moves the generated file to offline storage. From then on, the environment secret and the offline backups are the only copies.
- KMS custody is deferred to phase 3 ("Release signing: KMS-backed signer (RFC-0046 §9 phase 3)"). It is triggered by a second maintainer, or by any exposure of this secret.

## First-time setup (the owner's ceremony)

This runs once, offline where it says so. Nobody else generates or holds these keys.

1. **Root.** On an offline machine, run `node scripts/release-keys.ts root-init --key-id cloudhal-root-2026a --out <dir>`. It asks for a passphrase twice, then writes `<dir>/cloudhal-root-2026a.key.enc` (encrypted PKCS#8) and `<dir>/cloudhal-root-2026a.pub.json`. Seal two copies of the encrypted file and the passphrase, in separate places.
2. **Pin the root.** Add its public key to the *Root keys* table above and to `PINNED_ROOTS` in `packages/release-verify/src/trust.ts`, in one reviewed pull request.
3. **Yank key.** Run `node scripts/release-keys.ts yank-init --key-id cloudhal-yank-2026a --out <dir>`. It writes `<dir>/cloudhal-yank-2026a.pem` (mode 0600, never printed) and `<dir>/cloudhal-yank-2026a.pub.json`.
4. **Environment.** In the repository settings, create the environment `release-yank`, with deployment branches `main` only and no required reviewer. Set its secret: `gh secret set RELEASE_YANK_KEY --env release-yank < <dir>/cloudhal-yank-2026a.pem`. Then move the `.pem` file to offline storage.
5. **First `keys.json`.** List `cloudhal-release-2026a` and `cloudhal-yank-2026a` in `security/keys.source.json`, then run `node scripts/release-keys.ts sign-keys --root-key <dir>/cloudhal-root-2026a.key.enc --root-pub <dir>/cloudhal-root-2026a.pub.json`. It writes `security/keys.json` and `security/keys.json.sig`, after verifying the exact signed bytes as a consumer would.
6. **Publish the key list.** Commit `security/keys.json`, `security/keys.json.sig` and `security/keys.source.json` in a reviewed pull request. The yank list needs it on `main` (the workflow reads `security/keys.json`).
7. **Protect the `yank-list` branch** (arrives with the second #226 PR). Add a ruleset for the branch `yank-list`: block force pushes, restrict deletions, and restrict updates with GitHub Actions as the only bypass.
8. **First `yanked.json`** (arrives with the second #226 PR). Run the *Yank list* workflow once by hand with `first_run` checked. After that it runs weekly.
9. **Deploy cloudhal.dev once** (arrives with the second #226 PR). Run `pnpm --filter @cloudhal/docs run deploy`, so that `/.well-known/cloudhal/` serves both lists.

## Rotation (yearly)

1. **Start in time.** Start no later than 120 days before the active release key's not-after date: for `cloudhal-release-2026a`, by 2027-07-15. `bundle-sign` refuses once fewer than 90 days remain.
2. **New key.** Generate the new release key offline and name it `cloudhal-release-<year><letter>` (`cloudhal-release-2027a`).
3. **Announce it.** In one reviewed pull request:
   - add it to `security/keys.source.json` as `active`, and set the old key to `retiring`;
   - re-sign with `sign-keys`, using the root;
   - add its row to the *Keys* table above, and add it to `PINNED_KEYS` in `packages/release-verify/src/keys.ts`;
   - set the old key's row to `retiring`.

   Consumers pin new keys only through a release of their own, so this happens well before the key's first use.
4. **Switch.** Replace the `RELEASE_SIGNING_KEY` secret of `release-signing`, update the inline key id, public key and window in the `bundle-sign` job (a test keeps them equal to this file), and run the release workflow's dry run (`workflow_dispatch`, `dry_run: true`).
5. **Re-sign yearly.** Re-sign `keys.json` at least once a year, even without a new key, because it expires within 13 months.

## Revocation (emergency)

1. **Revoke at once with the yank key.** Add `{ keyId, revokedAt, reason }` to `revokedKeys` in `security/yank-list.json`, in a reviewed pull request, then run the *Yank list* workflow by hand. Within minutes every online consumer refuses the key. This does not need the offline root.
2. **Make it permanent with the root, within days.** Set the key to `revoked` in `security/keys.source.json`, re-sign `keys.json` with the root, publish it, and mark the key's row `revoked` above. Until then, the revocation rests on the yank key alone, which a stateless consumer would lose if the yank key were also stolen.
3. **Tell people.** Publish an advisory under [SECURITY.md](../../SECURITY.md).
4. **Recover.** Rotate to a new release key (*Rotation*, steps 2 to 4) and release a new version signed by it.
5. **A stolen yank key.** It can deny service, and for stateless consumers it can undo yanks and revocations. Revoke it in `keys.json` with the root, generate a new yank key (`yank-init`), list it as the only `active` yank key in the same `keys.json`, and replace `RELEASE_YANK_KEY`. The new key's first list carries every yank and revocation that still matters. Consumers with memory start a new memory with the new key.

## Yanking a version

1. **List it.** Add `{ version, yankedAt, reason }` to `versions` in `security/yank-list.json`, in a reviewed pull request. The list is append-only: an entry is never removed, and `sign-yanked` refuses a list that drops an entry of the currently published one.
2. **Re-sign.** Run the *Yank list* workflow by hand. From then on `cloudhal deploy --release` and every other consumer refuse that version. Installed copies keep running.
3. **Fix forward.** Release a fixed version. A yank is never undone.

## Verifying a release

[`@cloudhal/release-verify`](../../packages/release-verify/README.md) can do two of the steps below for you:

- **Step 1:** `verifyRelease` checks the statement, its signature and every digest, including each entry of the tarball, on Node, Workers or in a browser. Its `PINNED_KEYS` is kept equal to the table above.
- **Step 3:** the attestation is a separate call. On Node, `verifyAttestation` (in `@cloudhal/release-verify/attestation`) runs `gh attestation verify` for you.

Step 2, `gh release verify-asset`, stays manual. To check by hand instead, follow these steps.

## Verifying a release by hand

Download the release's assets into an empty directory, for example with `gh release download v<version> --repo cloudhal-dev/cloudhal --dir <dir>`.

### 1. The statement, the key lists and every part (required)

Use `@cloudhal/release-verify`, the verifier every consumer shares. In an empty directory, run `npm install @cloudhal/release-verify`. Then run this with Node 24 from the directory holding the assets (`node verify.mjs <version>`):

```js
import { createReadStream, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import {
  mergeTrust, PINNED_KEYS, TRUST_BASE_URL, verifyKeys, verifyRelease, verifyYanked,
} from "@cloudhal/release-verify";

const version = process.argv[2];
const get = async (name) => {
  const res = await fetch(TRUST_BASE_URL + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`); // never fall back to an old copy
  return new Uint8Array(await res.arrayBuffer());
};
// The root-signed key list and the yank list: fresh, verified, and used only to reduce trust.
const keys = await verifyKeys({ document: await get("keys.json"), signature: await get("keys.json.sig") });
const yanked = await verifyYanked({
  document: await get("yanked.json"), signature: await get("yanked.json.sig"), keys,
});
const release = await verifyRelease({
  // Invariant 7: refuse a validly signed older release, or another channel, served under this name.
  request: { version, channel: version.includes("-") ? "next" : "stable" },
  statement: readFileSync("release-statement.json"),
  signature: readFileSync("release-statement.sig"),
  manifest: readFileSync("manifest.json"),
  tarball: () => Readable.toWeb(createReadStream(`cloudhal-release-${version}.tar.gz`)),
  planVersion: 1,
  keys: mergeTrust(PINNED_KEYS, { keys, yanked }), // revocations, retiring keys, windows
  yanked,                                      // a yanked version is refused
});
let parts = 0;
for await (const _ of release.entries()) parts++;  // every tar entry against the manifest
console.log(`ok: ${version} signed by ${release.statement.signing.keyId}, commit ${release.statement.commit}, ${parts} parts`);
```

This checks:
- the sizes, the Ed25519 signature over the exact bytes (never parsed and re-serialised first), and that the statement is for the version and channel you asked for;
- that the key was valid when the release was created (`createdAt` in its window), and is still trusted today;
- that the version is not yanked and the key not revoked;
- both schemas, the manifest's binding to the statement, and every entry of the tarball.

Before the first `keys.json` is published (the root ceremony), drop the `keys` and `yanked` lines and pass `keys: PINNED_KEYS`. The window and expiry are still checked, but yanks and revocations are not.

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
