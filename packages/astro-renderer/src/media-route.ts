/**
 * The media route (RFC-0004 §7.1–§7.3): `GET`/`HEAD /media/<sha16>/<slug>.<ext>[.sha256]`, answered
 * before page routing by the site Worker (and by the dev middleware). Pure over its dependencies, so
 * Workers, Node and tests share it. Worker-safe.
 *
 * 1. The asset is found by its URL prefix in the source being served: the published snapshot, or
 *    the preview target behind a valid token (invariant 15). Unknown → 404.
 * 2. Taken-down content answers 410 (451 when legal) from every snapshot (invariant 11).
 * 3. A slug or extension that is not the asset's current one → 301 to the canonical URL.
 * 4. External files → 302 to their https URL.
 * 5. Blob content streams with Range (206), conditional requests (`If-None-Match` on the SHA-256),
 *    `nosniff`, a type-specific CSP, `Repr-Digest`, and immutable caching when published.
 * 6. `.sha256` → `<sha256>  <slug>.<ext>` (GNU `sha256sum -c` format).
 */
import type { Asset } from "@cloudhal/core-contracts";
import {
  MEDIA_ROUTE,
  MEDIA_TYPES,
  mediaExtension,
  mediaPath,
  servedContentType,
} from "@cloudhal/core-ts/media";
import { type BlobRange, type BlobStore, resolveBlobRange } from "@cloudhal/storage";
import { assetCacheTag, mediaCacheTag } from "./cache-tags.ts";

export interface MediaRouteDeps {
  readonly siteId: string;
  /** `published`: immutable, edge-cached, tagged. `preview` and `dev`: `private, no-store`. */
  readonly mode: "published" | "preview" | "dev";
  /** The asset behind a URL prefix in the source being served. */
  assetByPrefix(prefix16: string): Promise<Asset | undefined>;
  /** The content's ledger row (`purged` → 410/451). */
  blobState(
    sha256: string,
  ): Promise<{ state: string; purge?: { legal: boolean } | undefined } | undefined>;
  readonly blobs: BlobStore;
  /** Query string kept on redirects (`?cloudhal-preview=…`). */
  readonly keepQuery?: string | undefined;
}

export interface MediaRouteMatch {
  readonly prefix: string;
  readonly slug: string;
  readonly ext: string;
  readonly checksum: boolean;
}

export function matchMediaRoute(pathname: string): MediaRouteMatch | undefined {
  const m = MEDIA_ROUTE.exec(pathname);
  if (!m) return undefined;
  return {
    prefix: m[1] as string,
    slug: m[2] as string,
    ext: m[3] as string,
    checksum: m[4] !== undefined,
  };
}

const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
const DEFAULT_CSP = "default-src 'none'";

function hexToBase64(hex: string): string {
  let bin = "";
  for (let i = 0; i < hex.length; i += 2)
    bin += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin);
}

/** One `bytes=` range (RFC 9110 §14.1.2); several ranges, or garbage, are ignored (full body). */
export function parseRangeHeader(header: string | null): BlobRange | undefined {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m) return undefined;
  const [, a, b] = m;
  if (a === "" && b === "") return undefined;
  if (a === "") return { suffix: Number(b) };
  const offset = Number(a);
  if (b === "") return { offset };
  const end = Number(b);
  if (end < offset) return undefined;
  return { offset, length: end - offset + 1 };
}

function cacheHeaders(deps: MediaRouteDeps, asset: Asset | undefined): Record<string, string> {
  if (deps.mode !== "published") return { "cache-control": "private, no-store" };
  return {
    "cache-control": "public, max-age=31536000, immutable",
    "cloudflare-cdn-cache-control": "public, max-age=31536000",
    // Not the site tag: publishing pages never evicts media (§7.4).
    "cache-tag": [mediaCacheTag(deps.siteId), ...(asset ? [assetCacheTag(asset.id)] : [])].join(
      ",",
    ),
  };
}

function plain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "cloudflare-cdn-cache-control": "no-store",
      ...extra,
    },
  });
}

/**
 * Answers a media request, or returns `undefined` when the path is not a media URL (it falls
 * through to the site's own routes: `/media` and other paths under it stay usable, invariant 12).
 */
export async function serveMediaRequest(
  request: Request,
  deps: MediaRouteDeps,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = matchMediaRoute(url.pathname);
  if (!match) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD")
    return plain(405, "method not allowed", { allow: "GET, HEAD" });
  const asset = await deps.assetByPrefix(match.prefix);
  if (!asset) return plain(404, "not found");
  const head = request.method === "HEAD";
  const canonical = mediaPath(asset);
  const ext = mediaExtension(asset.mediaType);
  if (asset.storage.kind === "blob") {
    const state = await deps.blobState(asset.sha256);
    if (state?.state === "purged")
      return state.purge?.legal
        ? plain(451, "unavailable for legal reasons")
        : plain(410, "this file was removed");
  }
  if (match.slug !== asset.slug || match.ext !== ext) {
    const query = deps.keepQuery ? `?${deps.keepQuery}` : "";
    return new Response(null, {
      status: 301,
      headers: {
        location: `${canonical}${match.checksum ? ".sha256" : ""}${query}`,
        "cache-control": "no-store",
      },
    });
  }
  if (asset.storage.kind === "external") {
    return new Response(null, {
      status: 302,
      headers: {
        location: asset.storage.url,
        "cache-control": deps.mode === "published" ? "public, max-age=300" : "private, no-store",
        ...(asset.storage.checksum === "declared" ? { "cloudhal-checksum": "declared" } : {}),
      },
    });
  }
  const etag = `"${asset.sha256}"`;
  const common: Record<string, string> = {
    etag,
    "x-content-type-options": "nosniff",
    ...cacheHeaders(deps, asset),
  };
  if (match.checksum) {
    const body = `${asset.sha256}  ${asset.slug}.${ext}\n`;
    return new Response(head ? null : body, {
      status: 200,
      headers: {
        ...common,
        etag: `"${asset.sha256}.sha256"`,
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(new TextEncoder().encode(body).byteLength),
      },
    });
  }
  const info = MEDIA_TYPES[asset.mediaType];
  const headers: Record<string, string> = {
    ...common,
    "content-type": servedContentType(asset.mediaType),
    "content-disposition":
      info?.disposition === "inline" ? "inline" : `attachment; filename="${asset.slug}.${ext}"`,
    "accept-ranges": "bytes",
    "repr-digest": `sha-256=:${hexToBase64(asset.sha256)}:`,
  };
  // Built-in PDF viewers refuse to render under `sandbox` (answer 4); everything else is inert.
  if (asset.mediaType === "image/svg+xml") headers["content-security-policy"] = SVG_CSP;
  else if (asset.mediaType !== "application/pdf") headers["content-security-policy"] = DEFAULT_CSP;
  const inm = request.headers.get("if-none-match");
  if (inm?.split(",").some((t) => t.trim().replace(/^W\//, "") === etag))
    return new Response(null, { status: 304, headers: common });
  const key = `media/${deps.siteId}/${asset.sha256}`;
  const rangeHeader = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  const range = !ifRange || ifRange === etag ? parseRangeHeader(rangeHeader) : undefined;
  if (range) {
    const resolved = resolveBlobRange(range, asset.bytes);
    if (!resolved)
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${asset.bytes}`, "cache-control": "no-store" },
      });
    const stream = deps.blobs.getStream
      ? await deps.blobs.getStream(key, { range: resolved })
      : undefined;
    let body: BodyInit | null;
    if (stream) body = stream.body;
    else {
      const all = await deps.blobs.get(key);
      if (!all) return plain(404, "not found");
      body = all.slice(resolved.offset, resolved.offset + resolved.length);
    }
    if (head && stream) await stream.body.cancel();
    return new Response(head ? null : body, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${resolved.offset}-${resolved.offset + resolved.length - 1}/${asset.bytes}`,
        "content-length": String(resolved.length),
        // Partial bodies never enter the edge cache under the whole file's URL.
        ...(deps.mode === "published" ? { "cloudflare-cdn-cache-control": "no-store" } : {}),
      },
    });
  }
  if (head) {
    if (!(await deps.blobs.head(key))) return plain(404, "not found");
    return new Response(null, {
      status: 200,
      headers: { ...headers, "content-length": String(asset.bytes) },
    });
  }
  const stream = deps.blobs.getStream ? await deps.blobs.getStream(key) : undefined;
  let body: BodyInit;
  if (stream) body = stream.body;
  else {
    const all = await deps.blobs.get(key);
    if (!all) return plain(404, "not found");
    body = all;
  }
  return new Response(body, {
    status: 200,
    headers: { ...headers, "content-length": String(asset.bytes) },
  });
}
