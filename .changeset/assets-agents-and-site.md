---
"@cloudhal/agent-runtime": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
---

Assets and the media library for agents and the public site (RFC-0004 §6–§7).

- `@cloudhal/agent-runtime`: `asset:upload` joins the default agent scopes and the scopes every non-`plan` mode suggests; `checkAutoPublish` takes `ridingAssets` and reports the new code `media`.
- `@cloudhal/mcp-server`: eight tools — `list_assets`, `get_asset`, `upload_asset` (base64, ≤ 4 MB), `fetch_asset_url` (server-side, SSRF-safe, ≤ 25 MB), `update_asset`, `retire_asset`, `restore_asset` and the approval-gated `delete_asset`; `create_entry`/`update_entry` take `coverImage: { assetId, alt? }` and every input `ImageRef` may name an asset without `src`; publish prompts name media; the audit keeps an upload's size, not its bytes; `media` options (fetch transport, host lists, daily limits).
- `@cloudhal/api`: error statuses for the media codes; `GET|HEAD|PUT /api/admin/sites/:id/media/:sha256` for push/pull.
- `@cloudhal/astro-renderer`: the media route (`serveMedia`, `serveMediaRequest`): immutable, Range, ETag/Repr-Digest, `nosniff`, per-type CSP, 301/302/410/451, `.sha256` files; `media` (`imageAttributes` with an opt-in `/cdn-cgi/image` width ladder, ImageObject JSON-LD helpers); `asset:` in markdown; cover, Hero, Image-section and term images by `assetId`; Open Graph image size and type; RSS `media:content` details; dev middleware and static-build media copies; `cloudhal-media-`/`cloudhal-asset-` cache tags.
- `@cloudhal/cloudflare`: takedowns purge their asset at once; `fetch_asset_url` never reaches the admin Worker's own host.
- `@cloudhal/cli`: `cloudhal media import-urls|verify|gc`; push and pull move media bytes; `cloudhal mcp` and `cloudhal studio` fetch through the pinning Node transport.
