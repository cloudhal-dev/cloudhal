---
"@cloudhal/core-contracts": patch
---

Two new contract roots for signed release bundles (RFC-0046), with golden fixtures and the matching Rust types (`ReleaseManifest`, `ReleaseStatement`):

- **`release-manifest`** (`cloudhal.release-manifest@1`): the manifest of a release bundle. It lists every built Worker module and static asset by size and SHA-256, with the binding templates, feature levels, migration range and rollback facts a remote deployer needs before it uploads anything. `signing.signature` is `release-statement.sig` for project releases; `manifest.sig` is a legacy form for development keys only.
- **`release-statement`** (`cloudhal.release-statement@1`): the small canonical document a release signs (Ed25519, at most 4096 bytes). It names the version, channel, commit and key id, and pins the SHA-256 and size of `manifest.json` and of the tarball.

Both roots reference `common.schema.json` only for `SchemaVersion` and `Timestamp`, so a deployer can keep an identical copy under its own `$id`. The package root exports only the release-specific types `ReleaseManifest`, `WorkerArtifact`, `BindingTemplate`, `ReleaseStatement` and `StatementAsset`. The local definitions of the two roots stay local: generic names such as `SiteId` or `Capability` mean something else in the rest of the contracts. A test pins their fingerprints. The release signing key and the steps for verifying a release by hand are in `docs/security/release-signing-keys.md`. Nothing changes for existing contracts.
