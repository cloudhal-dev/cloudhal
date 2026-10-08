/**
 * Per-request source selection for a deployed site (Cloudflare Worker or a Node server):
 *
 * - **Published** (default): the site's `publishedSnapshotId` pointer decides what renders, so
 *   publish and rollback are pointer flips — no rebuild, no redeploy. Snapshots are immutable,
 *   so their sources are cached per isolate; the pointer itself is re-read after `pointerTtlMs`.
 * - **Preview**: a signed token (`?cloudhal-preview=<token>`, then a cookie) shows drafts (`live`)
 *   or any snapshot. Tokens are minted by the admin API (`mintPreviewToken`). `?cloudhal-preview=exit`
 *   leaves preview mode.
 */
import type { Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, verifyPreviewToken } from "@cloudhal/core-ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

export const PREVIEW_PARAM = "cloudhal-preview";
export const PREVIEW_COOKIE = "cloudhal_preview";

export type Resolution =
  | {
      kind: "published";
      source: SnapshotSource;
      snapshotId: string;
      previewError?: string;
      /** Clears a stale or exited preview cookie. */
      setCookie?: string;
    }
  | {
      kind: "preview";
      source: GraphSource;
      target: "live" | { snapshot: string };
      /** Set when the token arrived in the URL: persist it for the rest of the session. */
      setCookie?: string;
    }
  | { kind: "unpublished"; previewError?: string; setCookie?: string };

export interface SiteResolverOptions {
  store: SiteGraphStore;
  siteId: string;
  /** HMAC secret shared with the admin API; without it preview links are ignored. */
  previewSecret?: string | undefined;
  /** How long the published pointer is trusted before re-reading it. Default 2000 ms. */
  pointerTtlMs?: number | undefined;
  /**
   * Persist a preview token from the URL in an HttpOnly cookie (default true). Disable it behind
   * an edge cache that does not vary on cookies; carry the token in links instead.
   */
  previewCookie?: boolean | undefined;
  /** Snapshot sources kept per isolate (they are immutable). Default 8. */
  snapshotCacheSize?: number | undefined;
  now?: () => number;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export class SiteResolver {
  readonly #o: {
    store: SiteGraphStore;
    siteId: string;
    pointerTtlMs: number;
    snapshotCacheSize: number;
    previewCookie: boolean;
    now: () => number;
    previewSecret?: string;
  };
  #pointer: { site: Site; at: number } | undefined;
  readonly #snapshots = new Map<string, Promise<SnapshotSource>>();

  constructor(options: SiteResolverOptions) {
    this.#o = {
      store: options.store,
      siteId: options.siteId,
      pointerTtlMs: options.pointerTtlMs ?? 2000,
      snapshotCacheSize: options.snapshotCacheSize ?? 8,
      previewCookie: options.previewCookie ?? true,
      now: options.now ?? Date.now,
      ...(options.previewSecret ? { previewSecret: options.previewSecret } : {}),
    };
  }

  /** The store sources read from (the media route needs its blobs and ledger). */
  get store(): SiteGraphStore {
    return this.#o.store;
  }

  /** Forget the cached pointer (e.g. after a publish handled in the same isolate). */
  invalidate(): void {
    this.#pointer = undefined;
  }

  async site(): Promise<Site> {
    const now = this.#o.now();
    if (!this.#pointer || now - this.#pointer.at > this.#o.pointerTtlMs) {
      const site = await this.#o.store.getSite(this.#o.siteId);
      if (!site) throw new Error(`site ${this.#o.siteId} not found`);
      this.#pointer = { site, at: now };
    }
    return this.#pointer.site;
  }

  snapshot(id: string): Promise<SnapshotSource> {
    let entry = this.#snapshots.get(id);
    if (entry) {
      // refresh LRU position
      this.#snapshots.delete(id);
      this.#snapshots.set(id, entry);
      return entry;
    }
    entry = SnapshotSource.open(this.#o.store, id);
    entry.catch(() => this.#snapshots.delete(id));
    this.#snapshots.set(id, entry);
    while (this.#snapshots.size > this.#o.snapshotCacheSize) {
      const oldest = this.#snapshots.keys().next().value as string;
      this.#snapshots.delete(oldest);
    }
    return entry;
  }

  async resolve(request: Request): Promise<Resolution> {
    const url = new URL(request.url);
    const fromUrl = url.searchParams.get(PREVIEW_PARAM);
    const secure = url.protocol === "https:";
    const cookie = (value: string, maxAge: number) =>
      `${PREVIEW_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

    let previewError: string | undefined;
    let clearCookie: string | undefined;
    if (fromUrl === "exit") {
      clearCookie = cookie("", 0);
    } else {
      const token =
        fromUrl ??
        (this.#o.previewCookie
          ? readCookie(request.headers.get("cookie"), PREVIEW_COOKIE)
          : undefined);
      if (token && this.#o.previewSecret) {
        try {
          const claims = await verifyPreviewToken(
            this.#o.previewSecret,
            token,
            this.#o.siteId,
            this.#o.now(),
          );
          const source =
            claims.target === "live"
              ? new LiveSource(this.#o.store, this.#o.siteId, { includeDrafts: true })
              : await this.snapshot(claims.target.snapshot);
          if (source instanceof SnapshotSource && source.snapshot.siteId !== this.#o.siteId)
            throw new Error("snapshot belongs to another site");
          const maxAge = Math.max(0, claims.exp - Math.floor(this.#o.now() / 1000));
          return {
            kind: "preview",
            source,
            target: claims.target,
            ...(fromUrl && this.#o.previewCookie ? { setCookie: cookie(token, maxAge) } : {}),
          };
        } catch (e) {
          previewError = e instanceof Error ? e.message : String(e);
          if (!fromUrl) clearCookie = cookie("", 0);
        }
      } else if (token) {
        previewError = "preview is not enabled on this deployment";
      }
    }

    const site = await this.site();
    if (!site.publishedSnapshotId)
      return {
        kind: "unpublished",
        ...(previewError ? { previewError } : {}),
        ...(clearCookie ? { setCookie: clearCookie } : {}),
      };
    const source = await this.snapshot(site.publishedSnapshotId);
    const published: Resolution = {
      kind: "published",
      source,
      snapshotId: site.publishedSnapshotId,
      ...(previewError ? { previewError } : {}),
    };
    // Leaving preview: the cookie must be cleared on a published response too.
    return clearCookie ? { ...published, setCookie: clearCookie } : published;
  }
}
