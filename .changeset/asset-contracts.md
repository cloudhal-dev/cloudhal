---
"@cloudhal/core-contracts": minor
---

RFC-0004 draft contracts: a new `Asset` root (`asset.schema.json`) for media files, identified by SHA-256 and stored as a content-addressed blob or linked externally (Zenodo, Hugging Face), with per-locale title, alt text and caption, credit, an SPDX or URL license, status and source. `ImageRef` gains an optional `assetId`; `src` stays required (the store writes the asset's media URL into it). `assertValid("asset", …)` and `ROOT_SCHEMAS` include the new root. `NodeRef.kind` does not include `asset` yet; it lands with the store change.
