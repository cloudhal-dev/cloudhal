# @cloudhal/release-verify

## 0.9.1

### Patch Changes

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
