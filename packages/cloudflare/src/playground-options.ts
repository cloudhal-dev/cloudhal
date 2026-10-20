/** Options, limits and bindings of the playground Worker (RFC-0036 §1, §7). */
import type { SiteGraphStore } from "@cloudhal/core-ts";

/** A Workers Rate Limiting binding (`ratelimits` in wrangler config). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface PlaygroundEnv {
  /** The `PlaygroundSite` Durable Object class (`new_sqlite_classes`). */
  PLAYGROUND: DurableObjectNamespace;
  /** Static files: the landing page, Studio and the site's own assets, demo media. */
  ASSETS: Fetcher;
  /** Signs session cookies; at least 32 characters. Without it the Worker serves only the landing page. */
  PLAYGROUND_SECRET?: string;
  /** `"false"` is the kill switch: the landing page only; open sessions expire on their own. */
  PLAYGROUND_ENABLED?: string;
  /** New sessions per UTC day; past it the kill-switch page shows until midnight UTC. */
  PLAYGROUND_DAILY_SESSIONS?: string;
  /** New sessions per IP (key `CF-Connecting-IP`). */
  SESSION_LIMIT?: RateLimitBinding;
  /** Writes per session. */
  WRITE_LIMIT?: RateLimitBinding;
  /** Turnstile, asked for only after a session-rate-limit hit. */
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
}

export interface PlaygroundLimits {
  /** A session's data lives this long after its last request… */
  idleMinutes: number;
  /** …and never longer than this after it was created. */
  maxMinutes: number;
  /** `ctx.storage.sql.databaseSize` past which writes get 507. */
  maxDatabaseBytes: number;
  /** The session's own blobs (node bodies, bundle shards). */
  maxBlobBytes: number;
  /** One blob. */
  maxObjectBytes: number;
  /** Nodes a session may hold; creating past it gets 507. */
  maxNodes: number;
  /** The API's body limit (one entry or section). */
  maxBodyBytes: number;
  /** Any request body, checked in the Worker before forwarding. */
  maxRequestBytes: number;
}

export const DEFAULT_PLAYGROUND_LIMITS: PlaygroundLimits = {
  idleMinutes: 60,
  maxMinutes: 120,
  maxDatabaseBytes: 20 * 1024 * 1024,
  maxBlobBytes: 8 * 1024 * 1024,
  maxObjectBytes: 1024 * 1024,
  maxNodes: 500,
  maxBodyBytes: 200_000,
  maxRequestBytes: 1024 * 1024,
};

/** What renders a session's site: the Astro handler, run inside `withRequestStore`. */
export type PlaygroundRender = (
  request: Request,
  scope: { store: SiteGraphStore; siteId: string; env: unknown; ctx: ExecutionContext },
) => Promise<Response>;

export interface PlaygroundOptions {
  /** Fills a new session's store (starter site plus the demo pack); returns the site shown. */
  seed(store: SiteGraphStore): Promise<{ siteId: string }>;
  /** Renders `/s/<session>/…` (the path without the prefix). Without it those paths are 404. */
  render?: PlaygroundRender;
  /** Where "Deploy to Cloudflare" leads. */
  deployUrl: string;
  /** The landing page among the static files. Default `/landing/`. */
  landingPath?: string;
  /** Demo media under this prefix of the static files, read-only beneath each session's blobs. */
  demoMedia?: { prefix: string; keys?: readonly string[] };
  limits?: Partial<PlaygroundLimits>;
}

/** Header the Worker sets (and strips from clients) with the verified session ID. */
export const SESSION_HEADER = "x-cloudhal-playground-session";
export const RESET_PATH = "/_playground/reset";
export const SESSION_PATH = "/_playground/session";
/** Where a session's site renders: `/s/<session>/…`. */
export const SITE_PREFIX = "/s/";
