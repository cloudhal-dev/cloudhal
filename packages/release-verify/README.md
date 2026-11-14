# @cloudhal/release-verify

Verifies a [Cloudhal](https://cloudhal.dev) release bundle before you deploy it. It follows [RFC-0046](https://github.com/cloudhal-dev/cloudhal/blob/main/docs/rfcs/0046-release-bundles.md) §2, §7 and §11a: hosts, tools and the `cloudhal` CLI share this one verifier. It runs on Workers, Node 24 and browsers.

```ts
import { releaseAssetUrls, verifyRelease } from "@cloudhal/release-verify";

const release = await verifyRelease({
  request: { version: "0.9.0" },             // what you asked for: a signed older release is refused
  statement, signature, manifest,            // the exact downloaded bytes (Uint8Array)
  tarball: () => fetchTarballStream(),       // opened twice: digest first, then entries
  planVersion: 1,                            // the highest plan version your deployer supports
});
for await (const entry of release.entries()) {
  // { worker, kind, path, type?, bytes }: verified against the signed manifest
}
// Activate the deployment only after the loop has finished without an error.
```

## What it checks

1. **Sizes.** The statement is at most 4096 bytes, and the signature is exactly 64.
2. **Signature.** Ed25519 over the exact statement bytes, with a trusted key for `signing.keyId`.
3. **Request.** The statement is for the requested version and channel.
4. **Statement.** Its schema, through the precompiled validator, plus RFC-0046 §2 invariants 1 to 3 and 6.
5. **Manifest.**
   - Its size and SHA-256 equal the statement's.
   - Its schema and invariants 4 and 5.
   - The `release-statement.sig` signature form.
   - `planVersion`.
   - Every listed path, and §7's limits.
6. **Tarball.** Its size and SHA-256 equal the statement's.

Then `entries()` re-reads the tarball. It refuses:
- an entry the manifest does not list, or one whose size or SHA-256 differs from its listing;
- a missing entry;
- anything outside §7's tar format;
- an unsafe path: `..`, `.`, an empty segment, a backslash, a control character, more than 512 bytes, or two paths that collide after case folding.

There is no soft-fail mode. Every refusal is a `ReleaseVerifyError` with a stable `code` (`ERROR_CODES`).

## Keys

`PINNED_KEYS` holds the keys of [docs/security/release-signing-keys.md](https://github.com/cloudhal-dev/cloudhal/blob/main/docs/security/release-signing-keys.md) as they were when this version was published. It cannot learn about later revocations by itself.

You can only reduce trust: pass `revoked: ["<keyId>"]` to withdraw a key. Passing your own `keys` map replaces the table, so treat that as a reviewed change.

## The second factor

The Node-only subpath `@cloudhal/release-verify/attestation` checks the GitHub build-provenance attestation of the tarball, the manifest and the statement. It needs `gh` 2.68.0 or newer, signed in. It returns `verified` or `failed`, or `unavailable` when `gh` is missing, too old, or signed out.

```ts
import { verifyAttestation } from "@cloudhal/release-verify/attestation";
const r = await verifyAttestation({ dir, version: "0.9.0", commit: release.statement.commit });
```

## Scopes

`missingScopes(manifest, granted)` compares Cloudflare scope ids exactly, with one exception: `workers-scripts.admin` covers `workers-scripts.edit`, which manifests up to v0.9.0 name (RFC-0046 §3).
