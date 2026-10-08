# RFC-0004: Assets and the media library
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-08
- Related: RFC-0001 (open question "media assets as first-class nodes"), RFC-0002, ADR-0001, ADR-0002, ADR-0004, ADR-0009, ADR-0011, ADR-0012, ADR-0014, ADR-0015, ADR-0017
- Contracts on this branch: `asset.schema.json` and `ImageRef.assetId` (§2.1–2.2; generated and tested in both languages). §2.4 (`NodeRef.kind` gains `asset`) waits for the store change, as RFC-0002 §2.8 did.

## Summary
Media files become **Asset** graph nodes (`asset_`): typed (`image`, `video`, `audio`, `document`, `data`, `other`), identified by the **SHA-256** of their bytes, stored **once per site** under a content-addressed blob key, or **linked** to external storage such as Zenodo or Hugging Face. Pages, entries and terms point at assets **by id** (`ImageRef.assetId`, markdown `asset:<id>`), snapshots record them like every node, and a blob is deleted only when no live node and no snapshot references it. People upload through a ticketed REST stream and agents through `upload_asset` and an SSRF-hardened `fetch_asset_url`. The site Worker serves published assets from immutable, content-addressed URLs with responsive variants where Cloudflare can make them, and shows checksums with every download.

## Motivation
Today an image is a hand-typed URL. `ImageRef` is `{src, alt, width?, height?}` (`common.schema.json`), and Studio's cover-image, term-image and Image-section fields are text inputs (`apps/studio/src/components/Seo.tsx` `CoverImageCard`, `routes/PageEditorPage.tsx` L134–147). There is no upload endpoint, no library, and no record of what an image is, who added it, where it is used or under which license. The blob store (fs or R2) holds only snapshot bodies (`nodes/<hash>.json`, `store.ts` `createSnapshot`). Agents cannot add an image at all except by linking a URL somebody else hosts. The renderer emits a single `<img>` without `srcset` (`packages/astro-renderer/src/markdown.ts` `coverFigure`), and the starter uses Astro's passthrough image service.

Who is affected:
- **Editors** cannot work without a media library. The Ghost gap analysis ranks "uploads and media library" P0 and "responsive images" P1.
- **Agents** cannot illustrate what they write, and a hot-linked URL can change or vanish after approval. The approval then no longer matches what readers see.
- **Scholarly and data sites** need downloadable files with checksums, and links for files too large to host. The scholarly vertical's research decided that the media node carries a SHA-256 and supports external storage, and that large files are linked, not hosted.

Why now: it is the next P0 after taxonomy, and RFC-0002's explicit node-kind registry (`packages/core-ts/src/nodes.ts`) makes a new kind a contained change. Every later feature that shows a file depends on this node: figures, galleries, downloads, podcasts, dataset pages and term images.

## Proposal

### 1. Model
```
Site ──1:n──▶ Asset (sha256 unique per site; blob | external)
                ▲ assetId                         ▲ asset:<id>
  Page.seo.ogImage, Hero/Image sections   ContentEntry.body (markdown)
  ContentEntry.coverImage                 RichText sections (markdown)
  Term.image, Term labels[*].seo.ogImage  Term labels[*].description (markdown)

blob store:  media/<siteId>/<sha256>        (bytes; never overwritten with different bytes)
public URL:  /media/<sha256[0..16]>/<slug>.<ext>
```
- **An Asset is a site-scoped node** with `rev`, CAS and snapshots, like a term. Its metadata (alt text per locale, caption, credit, license, status) has its own history and diff. An approval prompt can name it ("+ image "Bosphorus at dawn", 482 KB").
- **The bytes are content-addressed.** The blob key is derived from the site and the SHA-256 and is never stored in the document. So the node does not care whether the deployment uses R2 or the filesystem, and `cloudhal push`/`pull` move it unchanged.
- **One asset per content per site.** Uploading bytes the site already has returns the existing asset (`existing: true`), so agent retries and duplicate drops are idempotent. Different alt text for one use goes on the reference (`ImageRef.alt`), not on a second asset.
- **References are by id**, as RFC-0002 did for terms. Renaming an asset's file slug, fixing its alt text or retiring it changes one node, never N pages. `ImageRef.src` stays required and the store fills it in, so readers that predate this RFC keep rendering (§2.2).
- **"Delete" and "the bytes disappear" are different events.** Deleting an Asset removes the node from the next snapshot. The blob stays while any snapshot references it, so rollback and preview of old versions keep working. Only a takedown (§4.6) removes bytes that a snapshot references.

### 2. Contracts
Everything stays inside the AGENTS.md subset: `oneOf` unions with inline variants and a single-value `kind` enum, no `default`, `additionalProperties: false` everywhere except the declared locale maps, and cross-file refs only to `common.schema.json#/$defs/*`. Both generators and both validators accept the shapes (§2.6).

#### 2.1 `asset.schema.json` (new root)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/asset.schema.json",
  "title": "Asset",
  "description": "A media file of a site (image, video, audio, document, data) as a graph node: its bytes are identified by SHA-256 and stored once per site in the blob store under a content-addressed key, or kept elsewhere (`storage.kind: external`, e.g. a Zenodo or Hugging Face file). Pages, entries and terms refer to it by id (`ImageRef.assetId`, markdown `asset:<id>`). Snapshotted like every node, so a deleted asset's bytes stay while any snapshot references it (RFC-0004).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "kind",
    "mediaType",
    "bytes",
    "sha256",
    "slug",
    "storage",
    "status",
    "uploadedBy",
    "source",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": { "$ref": "common.schema.json#/$defs/SchemaVersion" },
    "id": { "$ref": "common.schema.json#/$defs/Id" },
    "siteId": { "$ref": "common.schema.json#/$defs/Id" },
    "kind": {
      "type": "string",
      "description": "What the file is, derived from the sniffed media type (never chosen by the client). `other` is allowed for external storage only.",
      "enum": ["image", "video", "audio", "document", "data", "other"]
    },
    "mediaType": {
      "type": "string",
      "description": "MIME type of the stored bytes as sniffed by the server (RFC 6838, lower case, no parameters), e.g. image/webp, text/csv. Served as Content-Type.",
      "pattern": "^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$",
      "maxLength": 255
    },
    "bytes": {
      "type": "integer",
      "description": "Size of the stored bytes. For external files: the size the source reports or the uploader declares.",
      "minimum": 0
    },
    "sha256": {
      "$ref": "#/$defs/Sha256",
      "description": "SHA-256 of the stored bytes (lower-case hex): the blob key, the public URL prefix, the ETag and the checksum shown with downloads. Unique per site. For external files see `storage.checksum`."
    },
    "originalSha256": {
      "$ref": "#/$defs/Sha256",
      "description": "SHA-256 of the bytes as uploaded, present only when the server changed them (image metadata stripping)."
    },
    "slug": {
      "$ref": "common.schema.json#/$defs/Slug",
      "description": "File name in the public URL, without extension: /media/<sha256[0..16]>/<slug>.<ext>. May change; the old URL then answers 301 to the new one."
    },
    "storage": { "$ref": "#/$defs/AssetStorage" },
    "image": { "$ref": "#/$defs/AssetImage" },
    "title": {
      "type": "object",
      "description": "Display title per locale (download lists, library search).",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 300 }
    },
    "alt": {
      "type": "object",
      "description": "Alternative text per locale. An `ImageRef.alt` that is not empty overrides it for one use.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 500 }
    },
    "decorative": {
      "type": "boolean",
      "description": "The image carries no information and renders with alt=\"\". Absent means false; the store never writes false."
    },
    "caption": {
      "type": "object",
      "description": "Caption per locale (plain text), the default for figures that show this asset.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 1000 }
    },
    "credit": {
      "type": "string",
      "description": "Who made it, as shown next to it (e.g. 'Photo: Ayşe Yılmaz').",
      "minLength": 1,
      "maxLength": 300
    },
    "license": { "$ref": "#/$defs/AssetLicense" },
    "status": {
      "type": "string",
      "description": "active: listed and pickable. retired: hidden from the library and pickers and cannot be newly referenced; existing references keep rendering.",
      "enum": ["active", "retired"]
    },
    "uploadedBy": { "$ref": "common.schema.json#/$defs/Actor" },
    "source": { "$ref": "#/$defs/AssetSource" },
    "rev": { "$ref": "common.schema.json#/$defs/Revision" },
    "createdAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "updatedAt": { "$ref": "common.schema.json#/$defs/Timestamp" },
    "metadata": { "$ref": "common.schema.json#/$defs/Metadata" }
  },
  "$defs": {
    "Sha256": {
      "type": "string",
      "description": "Lower-case hex SHA-256 digest.",
      "pattern": "^[0-9a-f]{64}$"
    },
    "HttpsUrl": {
      "type": "string",
      "description": "Absolute https URL without credentials, whitespace or backslashes.",
      "pattern": "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$",
      "maxLength": 2048
    },
    "AssetStorage": {
      "description": "Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).",
      "oneOf": [
        {
          "type": "object",
          "title": "BlobStorage",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "type": "string", "enum": ["blob"] }
          }
        },
        {
          "type": "object",
          "title": "ExternalStorage",
          "additionalProperties": false,
          "required": ["kind", "url", "checksum"],
          "properties": {
            "kind": { "type": "string", "enum": ["external"] },
            "url": {
              "$ref": "#/$defs/HttpsUrl",
              "description": "Direct download URL of the file."
            },
            "landingPage": {
              "$ref": "#/$defs/HttpsUrl",
              "description": "Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."
            },
            "checksum": {
              "type": "string",
              "description": "How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).",
              "enum": ["computed", "declared"]
            },
            "verifiedAt": {
              "$ref": "common.schema.json#/$defs/Timestamp",
              "description": "When the URL last produced bytes with this SHA-256 (checksum `computed`)."
            }
          }
        }
      ]
    },
    "AssetImage": {
      "type": "object",
      "description": "Intrinsic size and placeholders of an image. Present for every image stored as a blob.",
      "additionalProperties": false,
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "integer", "minimum": 1, "maximum": 100000 },
        "height": { "type": "integer", "minimum": 1, "maximum": 100000 },
        "animated": {
          "type": "boolean",
          "description": "Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."
        },
        "blurhash": {
          "type": "string",
          "description": "BlurHash of the image for themes that decode it client-side.",
          "pattern": "^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"
        },
        "lqip": {
          "type": "string",
          "description": "Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.",
          "pattern": "^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$",
          "maxLength": 4096
        }
      }
    },
    "AssetLicense": {
      "description": "Terms the asset may be reused under: an SPDX license expression or a license URL.",
      "oneOf": [
        {
          "type": "object",
          "title": "SpdxLicense",
          "additionalProperties": false,
          "required": ["kind", "id"],
          "properties": {
            "kind": { "type": "string", "enum": ["spdx"] },
            "id": {
              "type": "string",
              "description": "SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.",
              "pattern": "^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$",
              "maxLength": 200
            }
          }
        },
        {
          "type": "object",
          "title": "UrlLicense",
          "additionalProperties": false,
          "required": ["kind", "url"],
          "properties": {
            "kind": { "type": "string", "enum": ["url"] },
            "url": { "$ref": "#/$defs/HttpsUrl" },
            "name": { "type": "string", "minLength": 1, "maxLength": 200 }
          }
        }
      ]
    },
    "AssetSource": {
      "description": "How the asset came in. Immutable after create.",
      "oneOf": [
        {
          "type": "object",
          "title": "UploadSource",
          "description": "Bytes uploaded by a person (REST) or an agent (MCP upload_asset).",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "type": "string", "enum": ["upload"] },
            "filename": {
              "type": "string",
              "description": "Original file name as sent (never used as a storage key or served).",
              "pattern": "^[^/\\\\\\u0000-\\u001f\\u007f]+$",
              "minLength": 1,
              "maxLength": 255
            }
          }
        },
        {
          "type": "object",
          "title": "FetchSource",
          "description": "Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.",
          "additionalProperties": false,
          "required": ["kind", "url", "fetchedAt"],
          "properties": {
            "kind": { "type": "string", "enum": ["fetch"] },
            "url": { "$ref": "#/$defs/HttpsUrl" },
            "fetchedAt": { "$ref": "common.schema.json#/$defs/Timestamp" }
          }
        },
        {
          "type": "object",
          "title": "ImportSource",
          "description": "Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).",
          "additionalProperties": false,
          "required": ["kind", "from"],
          "properties": {
            "kind": { "type": "string", "enum": ["import"] },
            "from": {
              "type": "string",
              "description": "The reference it was imported from: a URL or a site path.",
              "minLength": 1,
              "maxLength": 2048
            },
            "importer": { "$ref": "common.schema.json#/$defs/Slug" }
          }
        },
        {
          "type": "object",
          "title": "LinkSource",
          "description": "An external file registered by URL without copying its bytes (storage.kind external).",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "type": "string", "enum": ["link"] }
          }
        }
      ]
    }
  }
}
```

Notes on the shape:
- **`kind` follows the sniffed `mediaType`** through one table in core-ts (§5.1). A client cannot label an HTML file as `data`. `other` exists only for external files (`.tar.gz` on Zenodo, `.safetensors` on Hugging Face).
- **`sha256` is required for every asset, including external ones**, because every download shows a checksum. For an external file, `storage.checksum` records whether the server or `cloudhal media verify` actually hashed the bytes (`computed`) or a person typed the value (`declared`, shown as "not verified").
- **`originalSha256`** exists because metadata stripping (§5.3) changes an image's bytes. A photographer can still match the stored file to the file they uploaded.
- **The blob variant of `storage` has no fields.** Its key `media/<siteId>/<sha256>` is derived, so no document can name a key such as `../other-site/…` (invalid fixture `blob-with-key`).
- **`source` is a tagged union of four kinds.** `upload`, `fetch` and `import` were in the brief. `link` is added for external files that are registered by URL without copying their bytes. `filename` is kept for search and is never used as a key or served.
- **Text is per locale** (`title`, `alt`, `caption`), like term labels. `credit` is a name and not translated. `license` is either an SPDX expression or a URL.
- **`uploadedBy` carries no sibling `description`.** A `$ref` with a sibling description makes json-schema-to-typescript emit a duplicate `Actor1` type (RFC-0002 §2.10).

#### 2.2 `common.schema.json` (diff)
```diff
     "ImageRef": {
       "type": "object",
-      "description": "Reference to a media asset. src may be a relative asset path or an absolute URL.",
+      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
       "additionalProperties": false,
       "required": ["src", "alt"],
       "properties": {
+        "assetId": {
+          "$ref": "#/$defs/Id",
+          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
+        },
         "src": { "type": "string", "minLength": 1, "maxLength": 2048 },
```
This is the only edit to `common.schema.json`, and it is additive.

`src` stays **required**. Making it optional would turn `ImageRef["src"]` into `string | undefined` in TypeScript and break every reader (`seo.ts`, `feeds.ts`, `markdown.ts`, Studio's `previewImageUrl`), the same trap RFC-0002 avoided with `tags`. Instead, the store canonicalises an ImageRef that has an `assetId` (invariant 8):
- `src` becomes the asset's media path, or its external URL;
- `width` and `height` become the asset's intrinsic size.

API and MCP inputs may therefore send `{assetId, alt}` without `src`, and the stored document always has one.

Because `ImageRef` is shared, one field covers every image slot without further schema changes:

| Slot | Path |
|---|---|
| Cover image | `ContentEntry.coverImage` |
| Page social image | `Page.seo.ogImage` |
| Hero and Image sections | `HeroSection.image`, `ImageSection.image` |
| Term image | `Term.image` |
| Archive social image | `Term.labels[locale].seo.ogImage` |

#### 2.3 Markdown references (no schema change)
Markdown bodies (`ContentEntry.body` with `format: "markdown"`, `RichTextSection.body`, `TermLabel.description`) refer to assets with the URL scheme `asset:<id>`:
```markdown
![](asset:asset_01HZX8K3Q9PH)                       ← image; alt from the asset
![Ferries at 06:40](asset:asset_01HZX8K3Q9PH "Kadıköy") ← alt and title for this use
[Hourly data (CSV)](asset:asset_01HZX8K3Q9DS)        ← download link with size and checksum
```
The renderer resolves these when it renders (§7.6), and the store extracts them for usage counts and guards (§4.4). Nothing in the body text changes when the asset's slug or alt text changes.

Pre-RFC renderers already handle the scheme safely: `safeHref` and `safeSrc` drop any unknown scheme, so an `asset:` image degrades to its alt text and an `asset:` link to its label. `html` bodies (people only) are trusted as-is and do not resolve `asset:`; they use the media URL.

#### 2.4 `snapshot.schema.json` (diff; lands with the store change)
```diff
-          "enum": ["site", "page", "contentEntry", "taxonomy", "term", "redirect"]
+          "enum": ["site", "page", "contentEntry", "taxonomy", "term", "redirect", "asset"]
```
This was tried on this branch. Both generators accept it, but the repository typecheck fails in three places, all of which are code that has to handle the new kind anyway:
- `packages/core-ts/src/nodes.ts` L33. The registry asserts `NodeKind` equals `NodeRef["kind"]`, so `NODE_KINDS`, `NodeTypes` and `NODE_SPEC` need an `asset` entry (schema `asset`, prefix `asset`, key `sha256`, `siteId`). That entry is the store change of rollout step 3.
- `apps/studio/src/lib/diff.ts` L16: `KIND_ORDER` needs `asset`. The order becomes site, taxonomy, term, asset, page, contentEntry, redirect, because assets are listed before the pages that show them.
- `apps/studio/src/components/SnapshotDiffDialog.tsx` L329: `diff.kinds.asset` in `en.ts` and `tr.ts`, and title resolution (the asset's title or slug in the default locale).

It also needs `packages/mcp-server/src/tools.ts` `describeChanges`. That compiles today, but would print raw ids. So the diff ships with step 3, exactly as RFC-0002 §2.8 did. Until then no snapshot can contain an asset, and nothing can create one.

#### 2.5 Unchanged
- `site.schema.json`: assets are found by kind and site, with no id list.
- `content-entry.schema.json` and `section.schema.json`: they gain `assetId` through `ImageRef`. No section kind is added here; `downloads` and `figure` sections are follow-ups (open question 11).
- `page.schema.json` and `term.schema.json`: same, through `ImageRef`.

#### 2.6 What the generators taught us
- **Optional locale maps** (`title`, `alt`, `caption`) become non-optional `HashMap<Locale, …>` fields with `serde(default, skip_serializing_if = "HashMap::is_empty")` in Rust. `minProperties: 1` keeps "absent" the only empty form, so every fixture round-trips (RFC-0002 §2.10, confirmed again).
- **A `oneOf` variant with only `kind`** (`BlobStorage`, `LinkSource`) becomes a unit variant of an internally tagged serde enum and `{kind: "blob"}` in TypeScript. Both round-trip.
- **`$defs` names are exported from the package root by first appearance** (`scripts/gen-ts.ts`). Generic object names could silently shadow a later contract's type of the same name, so the asset's object types are prefixed: `AssetImage` and `AssetLicense`, not `ImageInfo` and `License`. String aliases (`Sha256`, `HttpsUrl`) are only `string` in TypeScript and are local newtypes per module in Rust, so they are harmless.
- **A `$ref` to a string with a sibling `description`** is fine, as RFC-0002 found. json-schema-to-typescript uses the target's description for the JSDoc (`ImageRef.assetId` documents itself as an `Id`); typify keeps the sibling. Only object targets produce duplicate types.
- `bytes` (`minimum: 0`) becomes `u64` in Rust, so external files over 4 GiB work (fixture: a 7.3 GB CSV on Zenodo). Image sizes become `NonZeroU64`.
- Patterns are ECMAScript and accepted by Ajv (`u` flag) and `regress`: the https rule, the file-name rule with `\u0000-\u001f`, the BlurHash alphabet with escaped `[` and `]`, and the SPDX expression.
- Cross-field rules cannot be written in the subset (no `if/then`), so core-ts enforces them (§3): `kind` ↔ `mediaType`, `image` ⇔ blob image, `other` ⇒ external, and `link` source ⇔ external storage.

### 3. Invariants
1. **Content addressing.** A blob asset's bytes are at `media/<siteId>/<sha256>`, and SHA-256 of those bytes equals `sha256`. Bytes at a key are never replaced by different bytes.
2. **One asset per content.** `sha256` is unique among a site's asset nodes, and so is its 16-hex URL prefix.
3. **Stored before referenced.** A blob asset node exists only while its blob ledger row (§4.2) is `stored`. Its `bytes` and `mediaType` equal the ledger's, which is what the server measured and sniffed.
4. **Kind rules.** `kind` is the table value for `mediaType` (§5.1). `other` implies external storage. `image` is present if and only if `kind` is `image`; it is required for blob images and optional for external ones. `source.kind = link` if and only if storage is external and no bytes were copied.
5. **Immutable after create:** `sha256`, `originalSha256`, `bytes`, `mediaType`, `kind`, `storage.kind`, `source` and `uploadedBy`. One exception: a person may re-verify an external file, which may update `sha256`, `bytes`, `checksum` and `verifiedAt`.
6. **Retirement.** A `retired` asset cannot be newly referenced. References that a node already had survive edits of that node and keep rendering.
7. **References resolve.** Every `assetId` and every markdown `asset:<id>` in a node names an asset of the same site, and each node has at most 200 asset references. The `asset_refs` index (§4.2) equals the references in the current nodes.
8. **ImageRef canonical form.** With `assetId`, `src` is the asset's media path (blob) or URL (external), and `width`/`height` are its intrinsic size, as of the write.
9. **Deletion.** An asset with any row in `asset_refs` cannot be deleted (`in_use`, with the referencing nodes). Deleting removes the node; it never deletes bytes.
10. **Blob lifetime.** A blob is deleted only when the site has no asset node with its SHA-256, no snapshot references it, no upload holds a lease on it, and it is older than the grace period (24 h). The exception is takedown (invariant 11).
11. **Takedown.** A purged SHA-256 serves `410` (or `451` for legal reasons) from every snapshot, cannot be uploaded again to the site until a person lifts it, and is audited.
12. **Reserved paths.** No page path, entry path, archive base path or redirect `from` matches `^/media/[0-9a-f]{16}/`. `/media` and other paths under it remain usable.
13. **Canonical form.** `title`, `alt` and `caption` are never empty maps, and no locale has an empty text. `decorative` and `image.animated` are never `false`.
14. **Node kinds are exclusive.** No asset document is valid under another node schema, and the reverse (contracts test on this branch).
15. **Public only through publish.** Without a valid preview token, `/media/…` serves an asset only if it is in the published snapshot and its blob is not purged.

Where each invariant is enforced:

| # | Schema | core-ts / storage (batch-guarded) | API, MCP, policy, renderer |
|---|---|---|---|
| 1 | `Sha256` pattern; blob key not storable | the server hashes buffered bytes; streamed bytes go through `put(…, {sha256})`, which R2, fs and memory verify before anything is visible (§4.1) | – |
| 2 | – | uniqueness key `<sha256>`; the insert also guards `NOT EXISTS` on the 16-hex prefix | upload dedupe returns the existing asset |
| 3 | – | the node insert asserts `EXISTS (… media_blobs … state = 'stored')` in the same batch | – |
| 4, 5 | enums, `oneOf` shapes | create and update checks; `updateAsset` never writes immutable fields | input schemas expose only editable fields |
| 6, 7 | `Id` pattern | each node write: one guard counting referenced assets (active for new, any status for kept) + `asset_refs` rewrite in the same batch, keyed on the node's new hash (AGENTS.md rule 4) | `unknown_asset` / `retired_asset` with suggestions |
| 8 | `src` required | the store rewrites `src`/`width`/`height` | API and MCP accept `{assetId, alt}` |
| 9 | – | `DELETE … WHERE rev = ? AND NOT EXISTS (asset_refs …)`; zero changes → `in_use` or `conflict` | `delete_asset` is destructive (approval) |
| 10 | – | ledger state machine with leases (§4.5) | – |
| 11 | – | ledger `purged`; upload refuses purged hashes | people only (owner), audited; media route answers 410/451 |
| 12 | `Path` pattern | the page, entry, taxonomy and redirect writes refuse the shape (`reserved_path`) | – |
| 13 | `minProperties`, `minLength` | the store drops `false` and empty maps | – |
| 14 | mutual exclusivity (contracts test) | `sync` validates rows by their kind | – |
| 15 | – | – | site Worker media route (§7.1) |

### 4. Storage and store

#### 4.1 Blob keys and `BlobStore` changes
Media keys are `media/<siteId>/<sha256>`, next to the existing `nodes/<hash>.json`. Both segments come from validated patterns. No slug, file name or client string ever reaches a key.

The interface gains optional streaming, integrity checks and ranges. The change is additive: third-party adapters keep compiling, and media endpoints fall back to buffered `get`/`put` up to 25 MB when an adapter lacks the streaming methods.
```ts
export interface BlobPutOptions {
  readonly contentType?: string;
  /** Lower-case hex SHA-256 the data must have. On mismatch the adapter throws and stores nothing. */
  readonly sha256?: string;
}
export interface BlobMeta {
  readonly size: number;
  readonly contentType?: string;
  readonly sha256?: string;          // when the backend recorded one (R2 checksums)
}
export type BlobRange = { offset: number; length?: number } | { suffix: number };
export interface BlobStream {
  readonly body: ReadableStream<Uint8Array>;
  readonly size: number;             // whole object
  readonly range?: { offset: number; length: number };
  readonly contentType?: string;
}
export interface BlobStore {
  // get, head, put, delete, list — unchanged
  /** Streams exactly `size` bytes to `key`; verifies `sha256` before the object becomes visible. */
  putStream?(key: string, data: ReadableStream<Uint8Array>,
             options: BlobPutOptions & { size: number; sha256: string }): Promise<void>;
  getStream?(key: string, options?: { range?: BlobRange }): Promise<BlobStream | null>;
}
export function assertBlobKey(key: string): void;  // today's fs KEY_RE + segment rules, shared
```
- **R2.** `put(key, new FixedLengthStream(size) piped from data, { sha256, httpMetadata })`. R2 checks the checksum and rejects a mismatch, so nothing is stored under a wrong name. `get(key, { range })` provides ranges. The adapter calls `assertBlobKey`, which today only the fs adapter does.
- **fs.** Streams to `<root>/.tmp/<random>` while hashing (`node:crypto`), compares the hash, then `rename`s into place (atomic on one filesystem). It also adds a containment check that the resolved path stays under the root.
- **memory.** Buffers the data, hashes it and compares.
- **Conformance suite** (`describeBlobStoreConformance`):
  - a mismatched `sha256` stores nothing;
  - range and suffix reads;
  - `putStream` of a stream shorter than `size` fails;
  - keys with `..`, empty segments or `\` are refused by every adapter.

#### 4.2 Migration `0012_media`
```sql
CREATE TABLE media_blobs (                      -- one row per (site, content)
  site_id TEXT NOT NULL, sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL, media_type TEXT NOT NULL, original_sha256 TEXT,
  state TEXT NOT NULL,                          -- 'stored' | 'deleting' | 'purged'
  lease_until TEXT,                             -- an upload in flight holds the row
  purge_reason TEXT, purge_legal INTEGER, purged_by TEXT, purged_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, sha256));
CREATE INDEX media_blobs_original ON media_blobs (site_id, original_sha256);
CREATE TABLE snapshot_blobs (                   -- which content each snapshot references
  snapshot_id TEXT NOT NULL, site_id TEXT NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, sha256));
CREATE INDEX snapshot_blobs_site_sha ON snapshot_blobs (site_id, sha256);
CREATE TABLE asset_refs (                       -- derived: live references, for usage and guards
  site_id TEXT NOT NULL, asset_id TEXT NOT NULL,
  node_id TEXT NOT NULL, node_kind TEXT NOT NULL, field TEXT NOT NULL,
  PRIMARY KEY (node_id, asset_id, field));
CREATE INDEX asset_refs_asset ON asset_refs (site_id, asset_id);
CREATE TABLE media_uploads (                    -- single-use upload tickets (§5.5)
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, actor_kind TEXT NOT NULL, actor_id TEXT NOT NULL,
  sha256 TEXT, bytes INTEGER NOT NULL, media_type TEXT NOT NULL, options TEXT NOT NULL,
  state TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX media_uploads_actor ON media_uploads (site_id, actor_id, state);
```
- Asset nodes need no storage change. `nodes.kind` is free text, and the uniqueness key `<sha256>` fits `(site_id, kind, key)`.
- `field` in `asset_refs` names the slot, for example `coverImage`, `seo.ogImage`, `sections.sec_01….image`, `body` or `labels.tr.description`. Studio then shows "cover image of …" rather than only a count.

#### 4.3 Store methods
```ts
// assets (the node)
createAsset(input: AssetCreate): Promise<{ asset: Asset; existing: boolean }>  // after the blob is stored (§5)
getAsset(id) · getAssetBySha256(siteId, sha256) · getAssetByPrefix(siteId, prefix16)
listAssets(siteId, q?: { kind?: Asset["kind"][]; status?: Asset["status"][]; query?: string;
                         unused?: boolean; missingAlt?: boolean; uploadedBy?: "human" | "agent";
                         cursor?: string; limit?: number })
updateAsset(a: Asset): Promise<Asset>          // title, alt, caption, credit, license, slug, decorative, image placeholders
retireAsset(a) · restoreAsset(a) · deleteAsset(a)   // delete: invariant 9
assetUsage(siteId, ids?): Promise<Map<string, { total: number; byKind: Record<string, number>; refs?: AssetRef[] }>>
verifyExternalAsset(a, result: { sha256: string; bytes: number }): Promise<Asset>   // invariant 5 exception

// blobs (ledger; no node change)
leaseBlob(siteId, sha256, until) · markBlobStored(siteId, meta) · blobState(siteId, sha256)
collectMediaGarbage(siteId, opts?: { graceHours?: number; limit?: number; dryRun?: boolean })
purgeBlob(siteId, sha256, by: Actor, reason: { text: string; legal: boolean })  // §4.6
liftPurge(siteId, sha256, by: Actor)
```
Snapshots stay a caller concern, as in RFC-0002 §4.2. An MCP tool takes one snapshot per call. REST writes by people take none; Studio snapshots on publish or on request.

#### 4.4 Reference tracking on node writes
- Every page, entry and term write extracts its asset references:
  - from ImageRef slots, at the paths in §2.2;
  - from markdown bodies, with the same tokenizer the renderer uses: marked's lexer, keeping link and image tokens whose href matches `^asset:(asset_[A-Za-z0-9]{6,32})$`. A regex over raw text is not used, because it would also count references inside code blocks.
- In the same `batch()` as the node's CAS write, it then:
  1. **Guards the references.** `(SELECT count(*) FROM nodes WHERE kind = 'asset' AND site_id = ? AND id IN (SELECT value FROM json_each(?)) AND (json_extract(body,'$.status') = 'active' OR id IN (SELECT value FROM json_each(?)))) = ?`. The first parameter is every referenced id. The second is the ids the node already referenced, which may be retired. One JSON parameter per list keeps the statement under D1's 100 bound parameters.
  2. **Rewrites the index.** `DELETE FROM asset_refs WHERE node_id = ?` and then `INSERT INTO asset_refs SELECT … FROM json_each(?)`. Both carry `EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)` on the node's **new** hash (AGENTS.md rule 4).
- Node deletes remove the node's `asset_refs` rows in the same batch.
- A concurrent `deleteAsset` and an entry write that adds a reference to it serialize in D1. Either the entry's guard fails (`unknown_asset`, a conflict to retry) or the delete finds a reference (`in_use`).
- Snapshots record content references: `createSnapshot` becomes one batch, the snapshot `INSERT` followed by `INSERT INTO snapshot_blobs SELECT ?, ?, value FROM json_each(?)`, where the parameter lists the SHA-256 of every blob asset in the snapshot.
- `migrate` back-fills `asset_refs` from current nodes. There is nothing to back-fill for snapshots, because no snapshot contains assets before this RFC.

#### 4.5 Garbage collection
Blobs can be orphaned when an upload is abandoned, or when an asset is deleted before any snapshot captured it. Snapshots are never deleted today, so a blob that any snapshot captured is never collected. Snapshot retention, with releases pinned for scholarly sites, is a separate RFC; it will cascade into `snapshot_blobs`.

`collectMediaGarbage` runs from a Cron trigger on the admin Worker, and on demand from `cloudhal media gc`. It is a three-step state machine per candidate. Each step is one statement, so no interactive transaction is needed:
1. `UPDATE media_blobs SET state = 'deleting' WHERE site_id = ? AND sha256 = ? AND state = 'stored' AND created_at < :grace AND (lease_until IS NULL OR lease_until < :now) AND NOT EXISTS (asset node with key = sha256) AND NOT EXISTS (snapshot_blobs …)`. It proceeds only if `changes = 1`.
2. `blobs.delete(media/<siteId>/<sha256>)`.
3. `DELETE FROM media_blobs WHERE site_id = ? AND sha256 = ? AND state = 'deleting'`.

The upload path takes a **lease** before it writes bytes: `INSERT … ON CONFLICT DO UPDATE SET lease_until = ? WHERE state = 'stored'`. A row in state `deleting` makes the upload answer `retry`, because the collection finishes in seconds. A row in state `purged` refuses the upload. The node insert then asserts `state = 'stored'` (invariant 3).
- The lease blocks step 1, and `deleting` blocks the lease.
- So a blob being collected is never handed to a new asset, and a freshly uploaded blob is never collected.
- A crash after step 1 leaves `deleting`. The next run resumes with steps 2 and 3, which are idempotent.

#### 4.6 Takedown (purge)
Snapshots are immutable, but bytes sometimes must go: a copyright notice, personal data, illegal content. `purgeBlob` is for people with the owner role, through REST and Studio, never MCP. It:
- records `state = 'purged'` with the reason, whether it is legal, the actor and the time;
- deletes the blob;
- retires the live asset node if one exists;
- purges the edge cache for the asset (§7.4);
- writes an audit row.

Snapshots keep the node metadata, so history stays explainable, but every snapshot's media URL then answers `410 Gone`, or `451 Unavailable For Legal Reasons` when `legal` is set. Renderers treat the asset as unresolved (§7.6). Re-uploading the same bytes is refused until `liftPurge`. This is the "tombstone" the scholarly research asked for: the metadata stays and the content goes. Browsers that cached the file under `immutable` may keep their copy; Studio says so in the purge dialog.

#### 4.7 Sync (`cloudhal push` / `pull`)
- Site bundles stay JSON and carry node bodies, as today. A new field, `bundle.media: { sha256, bytes, mediaType }[]`, lists every blob the bundle's asset nodes and snapshots reference.
- Bytes move separately, so a large file is never inside a JSON document:
  - `GET /api/admin/sites/:siteId/media/:sha256` streams the bytes;
  - `PUT /api/admin/sites/:siteId/media/:sha256` streams them in and is verified through `putStream`.
  Both use the deploy token.
- The CLI copies missing blobs first (checked with `HEAD`), then the bundle.
- `importSite` refuses a bundle whose blob assets reference content the target does not have (`missing_media`). It also validates asset rows against `asset.schema.json`, as it does for every kind (RFC-0002 invariant 15).
- Purged hashes travel as ledger rows, so a pull cannot resurrect taken-down bytes.

### 5. Upload paths

#### 5.1 Accepted types and limits
These are defaults. They are deployment configuration (`cloudhal.json` → `media`, mirrored into the admin Worker's environment) and not contracts. A deployment may lower any of them, and may raise the size caps up to its platform's request limit.

| `kind` | Media types (sniffed) | Upload cap | Notes |
|---|---|---|---|
| image | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif` | 20 MB | ≤ 12,000 px per side and ≤ 50 megapixels, checked from the header before any decoding; metadata stripped (§5.3) |
| image | `image/svg+xml` | 1 MB | people only in v1; strict validation, no sanitising (§5.4) |
| video | `video/mp4`, `video/webm` | 100 MB | streamed; Range-served |
| audio | `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav` | 100 MB | streamed; Range-served |
| document | `application/pdf` | 50 MB | |
| data | `text/csv`, `text/tab-separated-values`, `application/json`, `application/x-ndjson`, `application/vnd.apache.parquet` | 100 MB | text must be UTF-8 without NUL; served as an attachment |
| other | – | not uploadable | external storage only |

- **100 MB** is the Workers request-body limit on the Free and Pro plans. Larger files are linked as external assets (§5.8), which matches the research decision that large files are linked, not hosted.
- **Rejected outright:** HTML, XHTML, XML other than SVG, JavaScript, executables, archives (zip, tar, 7z), Office formats with macros, and HEIC. HEIC gets the hint "convert to JPEG": browsers do not display it.
- **Per request:** at most 20 files per ticket request, one file per `PUT`, at most 50 open tickets per actor, and tickets expire after 15 minutes.
- **Per site:** a storage quota of 10 GB of stored blob bytes by default. A self-hosted deployment can set 0 for unlimited.

#### 5.2 Validation pipeline
Every upload path (REST, MCP and import) runs the same Worker-safe module, `@cloudhal/core-ts/media`. It is pure TypeScript with no native image library:
1. **Size.** `Content-Length` must equal the ticket's `bytes`. The count is enforced while streaming; the header is never trusted alone.
2. **Sniff** the first 4 KB with magic numbers in the style of WHATWG MIME sniffing:
   - JPEG `FF D8 FF`, PNG signature, `RIFF….WEBP`, an `ftyp` box with `avif`/`avis`, `GIF87a`/`GIF89a`;
   - `%PDF-` within the first 1,024 bytes;
   - an `ftyp` box with MP4/M4A brands, EBML `1A 45 DF A3`, `ID3` or an MPEG frame sync, `OggS`, `RIFF….WAVE`;
   - `PAR1` (and the `PAR1` trailer, checked at the end of the stream).
   Text formats must decode as UTF-8, contain no NUL, and must not match the HTML, XML or script patterns that browsers sniff (`<!DOCTYPE html`, `<html`, `<script`, `<svg`, `<?xml`, …). The **sniffed** type decides. A declared type or extension that disagrees is an error (`type_mismatch`, "this file is a PNG, not a JPEG"). It is never silently relabelled.
3. **Kind** comes from the table in §5.1.
4. **Type-specific checks.** Images get dimensions from the header and a decompression-bomb guard (§5.3); SVG gets the validator (§5.4). Data and text formats get only the sniff on their first bytes; they are not parsed in full. Profiling them is the later `profile_table`.
5. **Hash.** Buffered paths (images, SVG and all agent uploads) hash the final bytes. Streamed paths verify the client-declared SHA-256 through `putStream` (§4.1).
6. **Store.** Lease, put, mark the blob stored, then insert the node in one batch with the ledger guard. The guard covers invariants 2 and 3.

#### 5.3 Images: dimensions, metadata, placeholders
- **Dimensions** are read from the format header: JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X, the GIF logical screen, AVIF `ispe`. An image over the caps is refused before anything else is done. The server is authoritative; dimensions a client reports are ignored.
- **Metadata stripping: yes, by default, with an opt-out.** Phone photos carry GPS coordinates and device serial numbers. Publishing them is a privacy leak that editors rarely notice, so the default protects them. Stripping is a lossless container edit with no re-encoding:
  - **JPEG:** drop APP1 Exif and XMP, APP13 IPTC and COM. Keep APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe). Write back a minimal Exif segment holding **only the Orientation tag**, so rotated photos still display upright.
  - **PNG:** drop the `eXIf`, `tEXt`, `iTXt`, `zTXt` and `tIME` chunks. Keep `iCCP`, `sRGB`, `gAMA`, `cHRM` and `pHYs`.
  - **WebP:** drop the `EXIF` and `XMP ` chunks and clear the VP8X flags.
  - **AVIF:** v1 refuses an AVIF that carries Exif or XMP items and explains why. Rewriting `iinf`/`iloc` safely is deferred.
  - **GIF:** drop comment extensions.

  The result's hash becomes `sha256` and the upload's hash becomes `originalSha256`.
- **Opt-out.** A person, never an agent, may pass `keepMetadata: true` per upload. Photographers need this for embedded copyright and IPTC credit. Studio reads the file before uploading and warns when it contains GPS: "This photo contains the place it was taken. Keep it?"
- **Animated** GIF and WebP (more than one frame) set `image.animated`. Animated images are never transformed (§7.5).
- **Placeholders.**
  - Workers cannot decode images, so Studio computes `blurhash` and a ≤ 32 px `lqip` in the browser (canvas) and sends them with the ticket. The server checks only their format and size against the schema patterns.
  - On Cloudflare with the Images binding, the server may compute `lqip` itself for agent and import uploads; this is optional.
  - Agent uploads otherwise have none. Placeholders are cosmetic; a wrong one cannot inject anything, because they are raster `data:` URLs.

#### 5.4 SVG: reject rather than sanitise
SVG can carry script (`<script>`, `on*` handlers, `javascript:` URLs, `<foreignObject>` HTML), and it is served from the site's own origin. Sanitising means rewriting XML with a DOM sanitizer such as DOMPurify, and Workers have no DOM. Sanitizer bypasses are also a recurring vulnerability class. So v1 **validates and rejects**:
- **Parsing:** a small streaming XML parser with no DTD or entity support. Any `<!DOCTYPE` or `<!ENTITY` is refused (XXE and billion laughs).
- **Elements:** only an allowlist of presentation elements: shapes, paths, text, gradients, patterns, `clipPath`, `mask`, `filter` primitives, `use` with `#fragment` only, `title`, `desc` and `metadata`.
- **Attributes:** an allowlist of presentation attributes. Nothing matching `on*`. `href` and `xlink:href` only as `#fragment` or a raster `data:` image. `style` without `url(` other than `#fragment`, without `@import`, and without `expression(`.
- On failure, the upload is refused with the list of offending elements and attributes: "remove 1 script element and 2 event handlers, then upload again".

Defence in depth: SVG responses carry `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox`, so even a file the validator missed cannot run script when someone opens its URL directly. In v1 only people may upload SVG (open question 2).

#### 5.5 People: REST upload tickets
Multipart form uploads are **not** used: `request.formData()` buffers the whole body in the Worker's 128 MB isolate. Uploads are instead a short, signed two-step exchange that streams the body:
```
POST /api/sites/:siteId/assets/uploads
  { files: [ { filename, bytes, mediaType, sha256?, keepMetadata?, image?: { blurhash?, lqip? },
               alt?, decorative?, title?, caption?, credit?, license? } ] }        (≤ 20)
→ { files: [ { existing: Asset } | { uploadId, url, method: "PUT", headers, expiresAt } ] }

PUT /api/sites/:siteId/assets/uploads/:uploadId?sig=…   (raw body, Content-Length = bytes)
→ 201 { asset: Asset, existing: false } | 200 { asset, existing: true } | 4xx { code, message }
```
- **Dedupe before upload.** Studio hashes the file in the browser with WebCrypto, which is affordable up to the 100 MB cap. A known hash, matching either `sha256` or `media_blobs.original_sha256`, returns the existing asset with no transfer: "Already in your library".
- **The ticket** is a `media_uploads` row plus an HMAC signature over `(uploadId, siteId, actorId, bytes, mediaType, sha256, exp)`, with the same construction as preview tokens. It is single use: the `PUT` flips `state` from `open` to `used` with a CAS. The `PUT` also requires the same session or API key, so a leaked URL alone is useless.
- **Images** are buffered (≤ 20 MB) for stripping. Other kinds stream to `putStream` with the declared `sha256`. A missing `sha256` for a streamed kind is refused at ticket time.
- **Progress:** Studio uses `XMLHttpRequest.upload.onprogress`, because fetch upload progress is not portable.
- **Signed direct-to-R2 URLs** (S3 presigning) are deferred. They need R2 S3 credentials as a deployment secret and CORS on the bucket, and the Worker path already reaches the 100 MB cap (open question 7).
- REST uploads by people take no snapshot (§4.3).

#### 5.6 Agents: `upload_asset` and `fetch_asset_url`
- **`upload_asset`**: `{ siteId, filename, data: base64, mediaType?, alt?, decorative?, title?, caption?, credit?, license? }`, at most **4 MB decoded**. That keeps a single MCP message reasonable. The handler decodes, runs §5.2 (buffered), and returns `{ asset, existing, url, usage: 0 }`.
- **`fetch_asset_url`**: `{ siteId, url, alt?, … }`. The **server** fetches the URL under the rules of §5.7, at most **25 MB**, then runs §5.2. Agents never hand the server a URL to store as an external file in v1 (open question 3).
- **Images need alt text.** For both tools, an image requires `alt` in the site's default locale or `decorative: true`; the tool input schema says so. An agent cannot add an image that a screen reader would announce as a file name.
- **Agent limits:** no SVG in v1, no `keepMetadata`, at most 100 assets and 500 MB per key per day by default (agent-layer precheck, audited as `deny`), and the site quota. Each successful call takes one `agentMutation` snapshot.

#### 5.7 Server-side fetch: SSRF rules
`fetch_asset_url`, Studio's "From URL", `cloudhal media import-urls` and `cloudhal media verify` share one fetcher with two transports: Workers `fetch` and a Node `undici` Agent. Its rules:
1. **URL.** `https:` only, port 443 only, no userinfo, at most 2,048 characters. The host must be a DNS name; IP literals are refused in every notation, including decimal, octal, hex and IPv6 forms such as `https://2130706433/` and `https://[::1]/`.
2. **Blocked names:** `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, `metadata.google.internal`, and this deployment's own site, Studio and workers.dev hostnames. The last rule keeps the admin API and purge endpoint out of reach.
3. **Blocked addresses** (Node, and anywhere DNS is resolved by us). Resolve every A and AAAA record and refuse the request if **any** address is in a non-public range:
   - IPv4: `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16` (cloud metadata `169.254.169.254`), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`;
   - IPv6: `::/128`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`, `100::/64`, `fd00:ec2::254`;
   - addresses embedded in IPv4-mapped `::ffff:0:0/96` and NAT64 `64:ff9b::/96` are checked as IPv4.

   The connection is **pinned** to the vetted address through the Agent's `lookup` hook, so a DNS-rebinding answer between check and connect is never used. On Workers, outbound `fetch` runs from Cloudflare's network, which does not route to the operator's private networks, but rules 1, 2 and 4–7 apply unchanged, so the behaviour is the same everywhere.
4. **Redirects** use `redirect: "manual"`, and at most 3 are followed. Every hop is re-validated with rules 1–3 and must stay `https:`. If the site sets `media.fetch.allowHosts`, every hop's host must be on that list. This is how an owner restricts agents to known image hosts.
5. **Limits:** connect within 5 s, complete within 30 s, at most 25 MB counted while streaming (`Content-Length` is advisory), and status 200 only.
6. **Request hygiene:** `GET` with no cookies, no `Authorization` and no forwarded client headers, `User-Agent: Cloudhal-Fetch/1 (+https://cloudhal.dev/fetch)`, and an `Accept` header listing the allowed types.
7. **Content checks.** The response `Content-Type` must be in the allowlist and agree with the sniffed type. An HTML response is refused with "that URL is a web page; pass the address of the image itself". Errors never echo the response body.

The audit row records the requested URL, the final URL, the redirect count, the resolved address on Node, bytes and SHA-256.

#### 5.8 External files
People register an external file through Studio or REST: `POST /assets/external { url, landingPage?, sha256, bytes, mediaType, title?, license? }`.
- **Checksum.** It starts as `checksum: "declared"`. Hugging Face exposes SHA-256 for LFS files. Zenodo exposes MD5, so a person runs `cloudhal media verify <assetId>`, which streams the URL under §5.7 with no size cap, on the CLI host only, computes the SHA-256, and records `computed` and `verifiedAt`.
- **Kind.** `kind` comes from the declared `mediaType` through the same table, with `other` allowed.
- **No proxying.** The bytes never pass through the site. Renderers link the external URL directly, and the `/media/…` URL answers with a `302` to it, which gives a stable site URL (§7.1).
- **Policy.** Every external asset is "structure" for publishing (§6.3). Agents cannot create one in v1.

### 6. API, MCP and policy

#### 6.1 REST (people; agents use MCP)
| Route | Purpose |
|---|---|
| `GET /api/sites/:siteId/assets` | List: `?kind=&status=&q=&unused=&missingAlt=&uploadedBy=&cursor=` |
| `GET /assets/:id` | Asset, usage list, checksum |
| `GET /assets/:id/content` | Session-authenticated bytes for Studio's own previews, `no-store`. Studio cannot show draft assets through the public site |
| `POST /assets/uploads`, `PUT /assets/uploads/:id` | Upload (§5.5) |
| `POST /assets/fetch` | "From URL" (§5.7) |
| `POST /assets/external` | External file (§5.8) |
| `PUT /assets/:id` | Editable fields |
| `POST /assets/:id/{retire,restore,verify}` | Status changes and external re-verification |
| `DELETE /assets/:id` | Invariant 9 |
| `POST /assets/:id/purge`, `POST /media/:sha256/lift-purge` | Takedown; owner only |
| `POST /media/gc` | `{ dryRun }` |
| `POST /migrations/media-import-urls` | `{ dryRun, includeMarkdown }` and `/revert` |

Errors are `InvariantError` codes, mapped centrally as in RFC-0002: `unsupported_type`, `type_mismatch`, `too_large`, `too_many_pixels`, `svg_unsafe`, `metadata_unsupported`, `quota_exceeded`, `purged`, `in_use`, `unknown_asset`, `retired_asset`, `fetch_blocked`, `fetch_failed` and `retry`.

#### 6.2 MCP tools
| Tool | Scopes | Read-only | Approval | Notes |
|---|---|---|---|---|
| `list_assets` | content:read | yes | – | Filters as in REST; returns url, kind, size, sha256, alt per locale, status and usage counts. |
| `get_asset` | content:read | yes | – | Adds the usage list (`node`, `field`). |
| `upload_asset` | asset:upload | no | – (publish gates) | §5.6. Idempotent by content (`existing: true`). |
| `fetch_asset_url` | asset:upload | no | – (publish gates) | §5.6, §5.7. |
| `update_asset` | asset:upload (own uploads) / asset:manage (any) | no | – | Title, alt, caption, credit, license, slug, decorative. A slug change keeps old URLs working (§7.1). |
| `retire_asset` / `restore_asset` | asset:manage | no | – | Retiring never breaks a page (invariant 6). |
| `delete_asset` | asset:manage | no (destructive) | **yes** | Refused while in use; the error lists the uses. |

- `create_entry`, `update_entry`, `create_page`, `update_page` and the term tools accept `{assetId, alt?}` in every ImageRef slot. They report `unknown_asset` and `retired_asset` with suggestions taken from `list_assets` by alt text and title.
- Scopes follow accepted RFC-0005: `asset:upload` (upload, and edit one's own uploads; Contributor and above; part of the default agent-key scopes outside `plan`) and `asset:manage` (edit, retire, restore and delete any asset; Editor and above), which implies `asset:upload`. Purge, lifting a purge, GC and external links are not exposed over MCP.
- `describeChanges` and approval prompts name assets with their kind, size and title, quoted and truncated by the existing `quote()` rule, and list "+ image "Bosphorus at dawn" (JPEG, 3000×2000, 482 KB), used by "Ferries at dawn"". This happens at rollout step 3, with §2.4.

#### 6.3 Policy: when do agent uploads become public?
An uploaded asset is never public by itself. The media route serves it only from the published snapshot or with a preview token (invariant 15). **Publishing decides**, and the existing modes (ADR-0015) apply:
- `plan`: no uploads. `manual`: every upload asks a person, as every mutating call does. `edits`: uploads are free, and every publish waits for a person.
- `auto`: `checkAutoPublish` treats a pending `asset` as part of an **article change** only when all of the following hold:
  - it is **added** (not changed or removed);
  - it is `kind: image`, blob storage, raster (not SVG), and came from `upload` or `fetch`;
  - every `asset_refs` row pointing at it belongs to a `contentEntry` that is in the same publish.

  Anything else is `structure` and waits for a person: external files, documents, data, video, audio, metadata edits, retirements, deletions, and assets used by pages or terms. The check gets a new code, `media`, with the wording "it adds or changes media that is not part of an article change". Assets do not count toward `AUTO_PUBLISH_LIMIT`; their articles do.

  Rationale: an article with a new photo is the common case, and its risk sits in the article, which `auto` already accepts. Media that changes pages or offers downloads affects the whole site.
- **Audit.** Each upload, fetch, update, delete, purge and GC run writes one audit row, with `effect: { asset: { id, sha256, bytes, mediaType, source } }` in `input.effect`, which needs no migration (RFC-0002 notes). Fetch rows add the URL chain.

### 7. Serving and rendering

#### 7.1 The media route
The site Worker answers `GET`/`HEAD` on `^/media/([0-9a-f]{16})/([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]{1,8})(\.sha256)?$` before Astro routing. Anything else under `/media` falls through to the site's own routes (invariant 12).

1. **Find the asset.** Resolve the source as pages do: the published snapshot, or the preview target when a valid `cloudhal-preview` token is present. Find the asset by the 16-hex prefix in that snapshot's asset index, which `SnapshotSource` builds once per isolate. If the prefix is not found, answer 404.
2. **Purged** (`media_blobs` state) → 410, or 451 when legal.
3. **Slug or extension differs** from the asset's current one → `301` to the canonical URL. Renamed files therefore keep working. Old HTML in caches and feeds still points at the old slug.
4. **External storage** → `302` to `storage.url` with `Cache-Control: public, max-age=300`. An external asset with checksum `declared` gets `Cloudhal-Checksum: declared`.
5. **Blob** → `getStream(media/<siteId>/<sha256>, range)`. The response supports `Range` (`206`, `Accept-Ranges: bytes`) and conditional requests (`If-None-Match` against `"<sha256>"`).
6. **`.sha256` suffix** → `text/plain; charset=utf-8` with `<sha256>  <slug>.<ext>\n`, which is GNU `sha256sum -c` format.

The extension is derived from `mediaType` by a fixed table (`jpg`, `png`, `webp`, `avif`, `gif`, `svg`, `mp4`, `webm`, `mp3`, `m4a`, `ogg`, `wav`, `pdf`, `csv`, `tsv`, `json`, `jsonl`, `parquet`, and `bin` otherwise). It is never taken from the upload.

#### 7.2 Response headers (blob assets)
| Header | Value |
|---|---|
| `Content-Type` | `mediaType`, plus `; charset=utf-8` for text formats |
| `Content-Disposition` | `inline` for image, video, audio and PDF; `attachment; filename="<slug>.<ext>"` for data and other |
| `X-Content-Type-Options` | `nosniff` (always) |
| `Content-Security-Policy` | SVG: §5.4. Other types: `default-src 'none'`, except PDF, which gets none, because built-in PDF viewers refuse to render under `sandbox` (open question 4) |
| `ETag` | `"<sha256>"` |
| `Repr-Digest` | `sha-256=:<base64>:` (RFC 9530): clients can verify the download |
| `Cache-Control` (published) | `public, max-age=31536000, immutable`: the URL names the content |
| `Cloudflare-CDN-Cache-Control` | `public, max-age=31536000` |
| `Cache-Tag` | `cloudhal-media-<siteId>,cloudhal-asset-<assetId>` (not the site tag, §7.4) |
| Preview responses | `Cache-Control: private, no-store`, no `Cache-Tag` |

#### 7.3 Previews and drafts
Preview tokens keep the rules of ADR-0012 §3: signed, site-bound, expiring, `no-store`, and never cached.
- The media route accepts the same `cloudhal-preview` query parameter and serves from the token's target, either `live` nodes or a snapshot.
- The site Worker's HTMLRewriter, which already keeps the token on internal links, also rewrites `img[src]`, `img[srcset]`, `source[srcset]`, `video[src]`, `video[poster]`, `audio[src]` and `a[href^="/media/"]`.
- Previews never use image transformations: they emit the original URL without `srcset`. A transformed variant could otherwise be cached under a token-bearing source URL.
- Studio's own previews use the session-authenticated `GET /assets/:id/content`.

#### 7.4 Cache and purge
- **Media responses do not carry the site tag.** Purging pages therefore does not evict media.
- **Publish and rollback** change from `purgeEverything` to `{ tags: ["cloudhal-site-<siteId>", …asset tags] }`. The asset tags are those of assets that the old live snapshot has and the new one lacks, or whose slug or status changed, so stale `/media/` responses go too. The purge endpoint already accepts `{ tags }`, which is how pages and media are purged separately. `cloudhal-media-<siteId>` remains as a "purge all media" lever for operators.
- **Additions need no purge**, because 404s are `no-store` (RFC-0002 notes).
- **A takedown** purges `cloudhal-asset-<id>` immediately, without waiting for a publish.

#### 7.5 Responsive images
The renderer gains a pure function in `@cloudhal/astro-renderer/media`. Starters and section components call it, and it is the only place that knows about transformations:
```ts
export type ImageTransform = "cdn-cgi" | "none";
export function imageAttributes(
  asset: Asset, ref: ImageRef | undefined,
  o: { locale: string; defaultLocale: string; transform: ImageTransform; sizes: string;
       widths?: readonly number[]; quality?: number; priority?: boolean; preview?: boolean },
): { src: string; srcset?: string; sizes?: string; width: number; height: number; alt: string;
     loading: "lazy" | "eager"; decoding: "async"; fetchpriority?: "high"; style?: string };
```
- **`transform: "cdn-cgi"`** emits Cloudflare's URL-format transformations from the same zone: `srcset` entries `/cdn-cgi/image/width=<w>,fit=scale-down,format=auto,quality=<q>/media/<prefix>/<slug>.<ext> <w>w`.
  - The width ladder is fixed (`320, 640, 960, 1280, 1600, 1920, 2560`) and never exceeds the intrinsic width. A fixed ladder bounds both cache fragmentation and the number of unique transformations, which is how Cloudflare bills.
  - `src` is the 1280 variant, or the original when the image is smaller.
  - It requires Transformations enabled on the zone, so it is unavailable on `workers.dev` hostnames. The deployment config sets `media.transform`, and `cloudhal deploy` enables it only for a custom domain where the zone check passes. Verify the zone API and limits at implementation.
- **`transform: "none"`** (offline, static builds, self-host, previews, `workers.dev`) is a passthrough: the original URL without `srcset`. It still sets `width`, `height` and `alt`.
- **Never transformed:** SVG and animated images, or images narrower than 320 px.
- **Always:** `width`/`height` attributes, so the browser reserves space (no layout shift). The cover image keeps `fetchpriority="high"` and `loading="eager"` (today's `coverFigure`); all other images are `lazy`. An `lqip` becomes an inline `background-image` that the image covers, with no JavaScript. BlurHash is left to themes that want it.
- **`sizes`** comes from the component. Defaults: `(min-width: 48rem) 48rem, 100vw` in the article body, and `100vw` for heroes.
- **Format negotiation** (`format=auto`, AVIF/WebP) is the transformer's job. Without a transformer the original format is served.

#### 7.6 `asset:` in markdown: resolution and safety
`renderMarkdown(source, ctx?: { assets?: AssetResolver; locale; defaultLocale; transform })` stays synchronous. Callers first collect ids with the lexer (§4.4), load them from the source, and pass a resolver map. The rules:
1. **Syntax.** The trimmed href must match `^asset:(asset_[A-Za-z0-9]{6,32})$` exactly: lower-case scheme, no path, query or fragment, no whitespace. The autolink form `<asset:…>` goes through the link renderer under the same rule. Anything else under the scheme is treated as an unsafe URL, as `safeHref` treats it today.
2. **Output.** The URL is built from validated parts (prefix, slug, ext) or the asset's https URL, and is still passed through `escapeHtml`. Alt text, titles and captions are escaped like every attribute today. Nothing from the markdown is placed in the URL.
3. **Unresolved** (unknown id, not in this snapshot, or purged): an image renders its alt text and a link renders its label, exactly as an unsafe URL does today. The miss is logged once per render with the node id. A retired asset still resolves (invariant 6).
4. **By kind:**
   - **image** → `<img>` with §7.5 attributes. Alt comes from the markdown alt if not empty, else the asset's alt in the locale, else the default locale, else `""`.
   - **video** → `<video controls preload="metadata" src>`, and **audio** → `<audio controls preload="metadata" src>`. Each has the alt as `aria-label` and a fallback download link inside.
   - **document, data and other** in image syntax render as a download link.
   - **Links** to any asset → `<a href="/media/…" type="<mediaType>" download?>label</a>` plus `<small class="ch-asset-meta">CSV · 1.2 MB · <a href="….sha256">SHA-256</a></small>` for documents and data. `download` is set for `attachment` types.
5. `html` bodies are not scanned (§2.3).

#### 7.7 ImageRef resolution, captions and structured data
Renderers that know assets resolve `ImageRef.assetId` through the source and fall back to `src` when the asset is not in the snapshot. That cannot happen for valid data, but forward compatibility costs nothing.
- **Captions.** The Image section's `caption` wins, then the asset's `caption[locale]`. `credit` is shown after the caption.
- **Social images.** `og:image` and Twitter cards use the absolute media URL (the 1200-wide variant when transforming), with `og:image:width`, `og:image:height`, `og:image:type` and `og:image:alt`.
- **JSON-LD.** The `image` of `BlogPosting` becomes an `ImageObject` with `contentUrl`, `width`, `height`, `caption`, `creditText`, and `license` when set. SPDX ids map to `https://spdx.org/licenses/<id>.html`; Google reads `license` and `creditText` for image licence details. Download links in a `Dataset` page (scholarly starter, later) use `DataDownload` with `contentUrl`, `encodingFormat`, `contentSize` and `sha256`.
- **RSS.** `<media:content>` gets `type`, `fileSize`, `width` and `height`. Audio enclosures for podcasts are a later, additive feature.

#### 7.8 Static builds and local dev
- **`cloudhal build`** (static): the integration's `astro:build:done` copies every published blob asset to `dist/media/<prefix>/<slug>.<ext>` and its `.sha256` sidecar from the blob store.
  - It writes a `dist/_headers` block (`/media/*`: immutable cache, `nosniff`) for Cloudflare Workers/Pages static assets and Netlify.
  - External assets link directly.
  - Purged assets are not copied.
  - Transformations are `none`.
- **`cloudhal dev`** (live source): a dev middleware serves the media route from the fs blob store with `no-store`, drafts included, matching the live preview.

### 8. Studio (brief)
The implementation follows `kumo-design`, `studio-ui` and a new DESIGN.md section (§2q), with every string in `en.ts` and `tr.ts`.
- **Media library** (sidebar "Media", `routes/MediaPage.tsx`):
  - a grid of tiles (thumbnails through `ImagePreview size="thumb"`; a file-type icon, size and extension for other kinds), with a table view toggle;
  - search over title, alt, caption, file name and credit;
  - filters for kind, status, "Unused", "Missing alt text" and "Added by agents";
  - "Used in N places" on every tile.
- **Asset detail** (`routes/AssetPage.tsx`):
  - a preview, per-locale title, alt and caption (with a "Decorative" `Switch` for images), credit, and license (SPDX `Combobox` with common licences, or a URL);
  - usage, listing slot and node with links;
  - technical details: type, size, dimensions, SHA-256 with a copy button, "Download" and "Checksum file";
  - source: who added it, when, and from where;
  - actions: Retire/Restore, and Delete (enabled only when unused; destructive `LayerDialog` naming the file). Owners also get "Take down…" behind a `DangerZoneCard` with reason and "legal" fields, and the browser-cache caveat.
- **Picker** (`AssetPickerDialog`, `LayerDialog size="lg"`):
  - **Placement.** It replaces the URL inputs in `CoverImageCard` (article cover and term image) and in the page editor's Image and Hero sections.
  - **Tabs.** "Library" (search, filters fixed to images, recent first), "Upload" and "From URL" (server fetch, §5.7).
  - **The chosen asset** shows in the existing `ImagePreview`, with "Change", "Remove" and "Alt text for this use".
  - **Legacy URLs** remain under a `Collapsible` "Use an image address instead", so they stay editable. Editing the address clears `assetId`.
  - The markdown editor gets an "Insert media" button that writes `![…](asset:…)` or `[…](asset:…)`.
- **Upload:**
  - **Input.** Drag and drop onto the library or the picker, paste from the clipboard, or a file button.
  - **Progress.** A per-file progress row with cancel; at most 20 files at a time.
  - **Before upload.** Studio hashes each file for instant dedupe, measures it, and computes placeholders (§5.3).
  - **Alt text is required.** Images without alt text open an "Describe your images" step: an alt field per image in the default locale, or "Decorative". "Insert" stays disabled until each chosen image has one.
  - **Messages.** The GPS warning and the "Keep metadata" option for people; clear refusals from §6.1 codes ("SVG files can't contain scripts: remove 1 `<script>`…").
- **Snapshot diff and approvals:** the `asset` kind label, the asset title and a size delta.
- Studio previews draft assets through `GET /assets/:id/content`, never through the public site (§6.1).

### 9. Data and scholarly support
- **Checksums are shown and downloadable** everywhere a file is offered: the asset page, download links (§7.6), the `.sha256` sidecar, `Repr-Digest`, and later Croissant `FileObject.sha256` and Data Package `hash`.
- **External storage for large files** (§5.8). Declared checksums are labelled, and `cloudhal media verify` turns them into computed ones. The landing page (Zenodo record, Hugging Face dataset) is kept, so a dataset page can link both the file and its record.
- **A `data` kind ready for a Table Schema profile.** Data assets have canonical media types, UTF-8 validation for text formats, and attachment serving. A follow-up adds an optional, additive `Asset.tableSchema` (Frictionless Table Schema v2) and `Asset.profile` (row count, per-field statistics), written by `profile_table`.
- **Out of scope here, named as follow-ups:**
  - `profile_table` (infer a Table Schema and statistics from a data asset);
  - `check_dataset_drift` (compare a new upload with the documented schema and propose documentation edits);
  - `downloads` and `figure` section kinds;
  - release pinning of snapshots, and DOI deposit.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Plain URLs plus an upload endpoint that returns a URL, with no node | Smallest change | No metadata, usage, history, approval naming or license; deletion breaks pages silently; agents cannot list what exists | Fails "every change is snapshotted, diffable and reversible" |
| Per-reference metadata (Ghost's `feature_image_alt`/`_caption`) | No new kind | Alt, credit and license duplicated at every use; no library; no checksums | Only alt is truly per use, and `ImageRef.alt` keeps that |
| Media outside the graph (a `media` table, not snapshotted) | Simple CRUD | No rollback or diff; an agent's upload bypasses publish gating; push/pull needs a second sync protocol | Assets must go live with, and roll back with, the content that shows them |
| Path-addressed storage (`/uploads/2026/10/x.jpg`, WordPress) | Readable URLs | Overwrites change bytes under a cached URL; duplicates; collisions; path traversal through names | Content addressing gives immutable caching and dedupe; the slug keeps URLs readable |
| Deployment-wide dedupe (one blob for every site) | Fewer bytes | Leaks across tenants ("this file already exists"); a takedown on one site affects another; GC needs global reference counts | Per-site keys; storage is cheap next to isolation |
| Multipart form uploads | Familiar | `formData()` buffers the body in the Worker's 128 MB isolate | Ticket plus streamed `PUT` |
| Presigned direct-to-R2 uploads | No Worker in the data path; > 100 MB | Needs R2 S3 credentials as a secret, bucket CORS, and a separate finalize step that re-reads the object to sniff and hash it | Later, for > 100 MB (open question 7) |
| Sanitise SVG (DOMPurify) | Accepts more files | No DOM in Workers; a history of sanitizer bypasses; served from the site origin | Validate and reject, plus a CSP sandbox |
| Cloudflare Images as the store (upload into Images) | Variants managed for us | Second storage system, vendor lock, no fs or self-host path, separate billing per stored image | R2/fs originals with optional URL transformations |
| Variants generated at upload (WordPress sizes) | Works without a transformer | No image decoder in Workers; N times the storage; a fixed size list | Transformation at the edge, passthrough offline |
| Build-time `<picture>` (Astro assets) | Optimal output | Publishing is a pointer flip with no build (ADR-0012) | Runtime URLs |
| Asset as a `oneOf` per media kind at the root | Exact per-kind fields | Every common field repeated six times; a larger generated surface | One shape, cross-field rules in core-ts |
| Make `ImageRef.src` optional when `assetId` is set | Cleaner documents | `src` becomes `string \| undefined` for every reader | Keep `src` required and denormalised |

## Compatibility & migration
- **`schemaVersion` stays `1`.** Every change is additive: a new root, a new optional `ImageRef.assetId`, and later a new `NodeRef.kind` value (§2.4). Existing documents and fixtures stay valid, and the generated TypeScript and Rust types only gain members.
- **Readers older than this RFC:**
  - They reject documents that contain `assetId`, because `ImageRef` has `additionalProperties: false` and typify emits `deny_unknown_fields`. This is the same as every additive field so far.
  - So the upgrade order is contracts, then readers (renderer, sync, Studio), then writers. Old Studio builds keep `assetId` when saving, because `cleanImageRef` spreads the object.
  - If someone edits the URL field in an old Studio, the store restores the asset's URL. The edit is undone, but no data is lost.
  - Old renderers ignore unknown node kinds (`SnapshotSource.#load`) and drop `asset:` links safely (§2.3).
- **Storage.** Migration `0012_media` adds four tables and changes no existing one. Every write is a `batch()`; there are no interactive transactions (ADR-0002). The `BlobStore` additions are optional members.
- **Data migration `cloudhal media import-urls`** (optional, never automatic; also a one-time Studio banner "12 images are linked from other sites; copy them into your library?"):
  1. Take a `manual` snapshot labelled `before media-import`, with `cloudhal.migration = 0004-media` and phase `before`, like RFC-0002's tags migration.
  2. Collect ImageRefs without `assetId` from cover images, page and archive social images, Hero and Image sections and term images. With `--include-markdown`, also collect markdown images with absolute URLs.
  3. Resolve sources:
     - absolute **https** URLs go through §5.7, with the site's `allowHosts` and the CLI's repeated `--allow-host`;
     - **site paths** (`/images/x.jpg`) are read from the project's `public/` directory when run locally, with the path resolved and checked to stay inside that directory;
     - `http:` URLs, unreachable sources and refused types are skipped and reported. Nothing is guessed.
  4. Create assets with `source: import` and `importer: "import-urls"`, deduplicated by content. When the first reference's `alt` is not empty, it seeds the asset's default-locale alt.
  5. Rewrite nodes in batches of at most 200: `assetId` is set, `src` becomes the media URL, the ImageRef keeps its `alt`, and markdown `![alt](https://…)` becomes `![alt](asset:…)` only with `--include-markdown`. The rewrite is idempotent (it only touches ImageRefs without `assetId`), so a run can be resumed.
  6. Take a `manual` snapshot `media-import`. Nothing goes live until a person publishes, and imported assets are "structure" even in `auto`.

  Existing `ImageRef.src` URLs stay valid whether or not anyone runs this. The command also runs against a deployment (`--remote`), where the admin Worker does the fetching under the same rules.
- **Rollback.**
  - `cloudhal media import-urls --revert <migrationId>` restores ImageRefs and bodies from the before-snapshot for nodes whose hash is still the migrated one, and reports nodes edited since then, which it leaves alone. It then deletes migration-created assets that are now unreferenced, and GC reclaims their blobs after the grace period.
  - A code downgrade below this RFC requires removing `assetId`s first (the revert, or `cloudhal media detach`, which keeps `src`). Older binaries would otherwise reject the documents.
  - Published snapshots are immutable and keep rendering their `src` fallbacks.
- **Rollout:**
  1. Contracts (this branch).
  2. Storage: `BlobStore` integrity, streams and key checks for every adapter; migration 0012; conformance tests on fs, memory and R2 (Miniflare).
  3. Store: the `asset` kind in the registry together with §2.4, Studio diff labels and `describeChanges`; asset CRUD, reference guards, `snapshot_blobs`, GC, takedown and sync media; behavioural suite on SQLite and D1.
  4. `@cloudhal/core-ts/media`: sniffing, image headers, metadata stripping, the SVG validator, and the SSRF fetcher with Workers and Node transports, with fixture files including malicious ones.
  5. REST routes, MCP tools, the `auto` rule and audit.
  6. Renderer and starter: media route, headers, previews, `imageAttributes`, `asset:` markdown, JSON-LD and RSS, static build copy, dev middleware, cache tags and publish purge by tags.
  7. Studio: library, detail, picker, upload, DESIGN.md §2q.
  8. `cloudhal media import-urls`/`verify`/`gc`, and starter seed images as assets.
- **Acceptance:**
  - behavioural tests prove invariants 1–15 on both backends, including:
    - a concurrent `deleteAsset` against an entry write that adds a reference;
    - GC racing an upload of the same bytes (the lease);
    - a purge followed by a rollback (still 410);
  - an article plus its new photo goes live in `auto`, and a new PDF waits;
  - an SVG with `<script>`, a PNG labelled as JPEG and a 60-megapixel PNG are refused;
  - `fetch_asset_url` refuses `https://127.0.0.1.nip.io/`, a redirect to `169.254.169.254`, and a host whose second A record is private;
  - published media responses are `immutable` and survive a page publish;
  - a renamed slug answers 301.

## Security & policy impact
- **Tenant isolation.**
  - Blob keys, ledger rows, references and quotas are per site, and every query is keyed by `site_id`.
  - Asset ids are opaque handles re-authorised per call (ADR-0004).
  - The media route resolves only through the site's own snapshot, so a guessed SHA-256 from another site never maps to a key.
  - There is no cross-site dedupe, so "already exists" leaks nothing across tenants.
- **Path traversal.**
  - Keys are `media/<Id>/<64 hex>`, built only from validated values; the document cannot carry a key (schema).
  - Every adapter validates keys (`assertBlobKey`), and fs adds a root containment check.
  - File names and slugs never reach storage.
  - The import command confines site paths to `public/`.
- **Content-type confusion.** The sniffed type is authoritative, active content types are refused, and every response carries `nosniff`. Data is served as an attachment and SVG under a CSP sandbox (§5.2, §5.4, §7.2).
- **SSRF.** These are §5.7's rules: https only, no IP literals or internal names, every resolved address checked and the connection pinned, redirects re-validated (at most 3), size and time caps, content-type agreement, and an optional per-site host allowlist. Agents can fetch only through this path.
- **Privacy.**
  - EXIF and GPS are stripped by default (§5.3), with the opt-out for people only.
  - Original file names and uploaders are kept in the node (they are visible to agents and in snapshots) but are never served.
  - Takedown removes bytes even from history (§4.6).
- **Resource exhaustion.**
  - Caps per type, per request, per agent per day and per site.
  - Images: header-based pixel caps before any work; no decoding on the server.
  - SVG: no entities.
  - Streams count bytes, and each `Content-Length` is checked against the ticket.
  - GC reclaims abandoned uploads.
- **Injection through metadata.** Alt text, captions, titles and credits are agent-controllable text. They are escaped in HTML, serialised in JSON-LD, and quoted and truncated in approval prompts. Placeholders are raster `data:` URLs only (schema).
- **Approvals and scopes.** Scopes per RFC-0005: `asset:upload` and `asset:manage`. Uploads become public only through publish, under the `auto` rule of §6.3. Deletes are approval-gated. External files, SVG, purge and GC are for people only.
- **Malware: out of scope.** Cloudhal does not scan uploads. The type allowlist excludes executables, archives and macro formats, and data is served as an attachment, which narrows the risk without removing it. Operators who need scanning can attach a scanner to R2 event notifications. An `onAssetStored(site, asset)` hook is the planned extension point, not part of this RFC.
- **Open redirects.** The `302` for external assets goes only to the asset's stored https URL, which only people can set in v1, and only for assets in the published or previewed snapshot.

## Open questions
1. **Agent uploads and `auto` mode.** Should a new raster image used only by an article in the same publish ride along with the article (this draft), or should every asset change wait for a person?
   **Recommendation:** ride along, as drafted in §6.3. It is the main reason an agent uploads at all, and the image adds no URL change, structure or download beyond the article it belongs to. Everything else waits.
2. **SVG for agents.** Allow agents to upload SVG through the same validator?
   **Recommendation:** no, not in v1. SVG is the only accepted format that is also a document. Reconsider after the validator has run on real files for a release.
3. **External files from agents.** Should agents register external links (for example, a Hugging Face file for a dataset page)?
   **Recommendation:** not in v1. The `/media` `302` makes them look first-party. Later they could be allowed as `proposed`-style assets that only a person can activate, mirroring RFC-0002's `propose_term`.
4. **PDFs: inline or attachment?**
   **Recommendation:** `inline` with `nosniff` and no CSP sandbox. Built-in viewers isolate PDF script, and readers expect to view papers in the browser. Revisit if a viewer issue appears.
5. **Dedupe scope.** Per site (this draft) or per deployment?
   **Recommendation:** per site, for isolation and takedown semantics (Alternatives).
6. **Upload cap.** Is 100 MB per file right?
   **Recommendation:** yes as the default. It is the Free/Pro Workers limit. Business and Enterprise deployments may raise it in config. External storage covers the rest.
7. **Direct-to-R2 presigned uploads** for files over 100 MB?
   **Recommendation:** later, only when a real site needs to host such files. It needs R2 S3 credentials as a deployment secret, which ADR-0012 avoided so far.
8. **Metadata opt-out granularity.** One `keepMetadata` switch, or keep the rest but always strip GPS?
   **Recommendation:** one switch, people only, with the explicit GPS warning. Fewer knobs, and the person decides knowingly.
9. **Snapshot retention and GC of snapshotted blobs.**
   **Recommendation:** keep every snapshot (and therefore every snapshotted blob) until a retention RFC. That RFC must pin release snapshots (scholarly "cite this version") and cascade into `snapshot_blobs`. Takedown covers the cases that cannot wait.
10. **Replace an asset everywhere** (a new version of a photo or dataset, the same references)?
    **Recommendation:** yes, later, as a governed operation like RFC-0002's merge: one batch that re-points references from A to B in every node, one snapshot, approval-gated. Content addressing makes in-place replacement impossible on purpose.
11. **`downloads` and `figure` section kinds** now?
    **Recommendation:** no. They belong to the scholarly starter RFC (figure numbering, captions, Table Schema previews). Markdown `asset:` links cover downloads with checksums meanwhile.
12. **A dedicated `media:write` scope?**
    **Resolved by RFC-0005 (accepted):** yes — `asset:upload` (Contributor and above, own uploads) and `asset:manage` (Editor and above). Publishing still gates exposure.
13. **Image transformations by default** on custom domains?
    **Recommendation:** opt-in (`media.transform: "cdn-cgi"`) until the zone check and billing are verified on a real account. Starters render correctly either way.
14. **AVIF metadata.** Refuse AVIF with Exif or XMP (this draft), or strip it?
    **Recommendation:** refuse in v1 with a clear message; implement ISOBMFF item removal when a user hits it. Phones produce HEIC or JPEG, not AVIF, so this is rare.
15. **Folders or collections in the library?**
    **Recommendation:** no folders. Search, filters and usage cover it, and a later step can let RFC-0002 taxonomies apply to assets (by `collections`) instead of inventing a second hierarchy.
16. **MD5 for repositories.** Zenodo publishes MD5 checksums. Should an Asset also carry `md5` to match a record without re-hashing?
    **Recommendation:** later, as an optional additive `checksums: { md5? }`. SHA-256 stays the identity, and `cloudhal media verify` bridges the gap now.
