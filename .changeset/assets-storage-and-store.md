---
"@cloudhal/core-contracts": minor
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
---

Assets and the media library, storage and store (RFC-0004 §2.4, §3–§5).

- `@cloudhal/core-contracts`: `NodeRef.kind` gains `asset`.
- `@cloudhal/storage`: `BlobStore` gains optional `putStream`/`getStream` (ranges and suffixes) and a `sha256` put option that every adapter verifies before anything is visible (R2 checksums, fs temp file + rename, memory hash); `assertBlobKey` is called by every adapter and the fs adapter checks containment. Migration `0013_media` adds `media_blobs`, `snapshot_blobs`, `asset_refs` and `media_uploads`.
- `@cloudhal/core-ts`: the `asset` node kind; `ingestAsset` (buffered: sniff, strip, hash, dedupe per site, lease → verified put → stored → guarded insert) and `ingestAssetStream` (declared SHA-256, then sniffed); `createAsset`, `getAsset`, `getAssetBySha256`, `getAssetByPrefix`, `getAssets`, `listAssets`, `updateAsset`, `retireAsset`, `restoreAsset`, `deleteAsset` (refused while in use), `assetUsage`, `verifyExternalAsset`, the ledger (`leaseBlob`, `markBlobStored`, `blobState`), `collectMediaGarbage`, `purgeBlob`/`liftPurge`, `ridingAssets` and `importMediaUrls`/`revertMediaImport`. Page, entry and term writes canonicalise `ImageRef`s with `assetId`, refuse unknown and newly retired assets and keep `asset_refs` in the same batch; snapshots record their blobs; `/media/<16 hex>/` paths are reserved; sync carries media lists and takedowns. New subpaths: `@cloudhal/core-ts/media` (Worker-safe type table, sniffing, image headers and lossless metadata stripping, SVG validator, `inspectUpload`, SSRF-safe `safeFetch` with a Workers transport, reference extraction) and `@cloudhal/core-ts/media-node` (the pinning Node transport). `planCachePurge` purges a changed asset's media URLs and what shows it; `cache-tags` gains `cloudhal-media-` and `cloudhal-asset-` tags.
