# ADR-0020: Assets are content-addressed nodes with SHA-256; uploads are SSRF-safe; scopes asset:upload / asset:manage
- Status: Accepted
- Date: 2026-10-08
- Related: RFC-0004 (the design), RFC-0001 (open question on media), ADR-0002 (BlobStore), ADR-0012 (R2, Workers Cache), ADR-0018 (roles and the asset scopes)
- Sources: Cloudflare R2 and Image Resizing (`/cdn-cgi/image`) docs, OWASP SSRF prevention, research `.internal/research/12b` (scholarly: checksums and external storage; private)

## Context
Images were URLs typed by hand. There was no upload, no library, and no way to serve responsive images. Scholarly and data sites (the third vertical) need checksums and external storage for large files.

## Decision
Adopt RFC-0004 with its recommended answers:
- **Asset nodes.** An **Asset node** (`asset_`) carries kind, sniffed media type, bytes, **SHA-256**, storage (blob or external), image metadata, per-locale title/alt/caption, credit, license, status, uploader and source.
- **Content addressing.** Bytes are content-addressed and deduplicated per site, under a derived key (`media/<siteId>/<sha256>`) that is never stored in the document.
- **References.** Content refers to assets by id: `ImageRef.assetId` and markdown `asset:<id>`. `src` is kept for back-compat.
- **Retention.** Snapshots record the blobs they use. GC uses leases and never removes bytes that a snapshot needs. A takedown answers 410/451.
- **Uploads.** People upload through a signed ticket and a streamed PUT. Agents use `upload_asset` (≤ 4 MB) and `fetch_asset_url` (≤ 25 MB). Fetching has full SSRF protection: https only, no IP literals or internal names, resolved-address checks and pinning, re-checked redirects, size and time caps, type agreement.
- **Sanitisation.** EXIF and GPS are stripped by default (people may opt out). SVG is validated and rejected rather than sanitised. Malware scanning is out of scope.
- **Serving.** Assets are served from `/media/<sha16>/<slug>.<ext>` with immutable caching, Range support and `.sha256` files. Responsive images go through `/cdn-cgi/image`, with an offline fallback; transformations are opt-in until verified on a real account.
- **Scopes (per ADR-0018).** `asset:upload` covers Contributor and above, for their own uploads. `asset:manage` covers Editor and above.
- **`auto` mode.** In `auto` mode, a new raster image that only rides along with its article goes out with that publish; every other asset change waits for a person.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Keep URLs, no asset nodes | No work | No library, no checksums, no responsive images, broken hotlinks | P0 gap |
| Multipart uploads through the Worker | Familiar | `formData()` buffers whole files in Worker memory | Streamed PUT with a signed ticket |
| Sanitise SVG | Accept more files | Sanitisers have a long bypass history | Validate-and-reject; serve sandboxed |
| Path-based blob keys | Readable | Duplicates, rename churn, path traversal surface | Content addressing |

## Consequences
- **Positive.** Uploads, a library, deduplication, safe agent fetching, checksums for data sites, and immutable caching.
- **Negative.** It needs GC with leases, image-metadata stripping without re-encoding, and an SSRF-safe fetcher on Workers and Node.
- **Risks.** SSRF bypasses (covered by tests over resolution and redirects), quota abuse (caps per call and per site), and takedown obligations (410/451 path).
