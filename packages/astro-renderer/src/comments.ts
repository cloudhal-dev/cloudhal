/**
 * Reader comments on the site (RFC-0007 §6, rollout step 4), shared by the Cloudflare Site Worker
 * entry and the Node middleware (`cloudhal dev`, Node self-host). Worker-safe: no Node module.
 *
 * `SiteComments` holds one site's per-isolate state — the derived keys, the isolate rate limits,
 * today's stored count, the replay cache, the memoised settings and published pointer — and answers
 * the three endpoints before Astro, never cached:
 *
 * - `GET /__cloudhal/comments/challenge?node=…&for=comment|report` — a signed proof-of-work
 *   challenge (`no-store`, no write);
 * - `POST /__cloudhal/comments` — a comment or reply (form posts get `303` to a fragment of the
 *   entry's cached page, JSON posts a JSON answer);
 * - `POST /__cloudhal/comments/report` — a report (DSA Art. 16).
 *
 * Everything else is `@cloudhal/comments`' pipeline (`handleCommentSubmission`, …): this module
 * only wires it. The entry is resolved in the **published** snapshot (a draft's id is `404`), the
 * client address is the one the runtime vouches for (`CF-Connecting-IP` on Cloudflare, the socket
 * address on Node; never another header), `site_id` is the Worker's own. Without a usable comments
 * key (`CLOUDHAL_COMMENTS_KEY`, ≥ 32 characters) the endpoints answer `404`: comments are off.
 */
import {
  type CommentKeys,
  CommentLimiter,
  challengeResponse,
  clientNetwork,
  DailyCount,
  deriveCommentKeys,
  handleChallengeRequest,
  handleCommentSubmission,
  handleReportSubmission,
  hmacRaw,
  MIN_SECRET_LENGTH,
  memoize,
  type PipelineDeps,
  type PublishedEntry,
  ReplayCache,
  submissionResponse,
  type TurnstileResult,
  toHex,
  utf8,
} from "@cloudhal/comments";
import type { SqlCommentStore } from "@cloudhal/comments/sql";
import type { Site } from "@cloudhal/core-contracts";
import { entryPath } from "./routing.ts";
import type { GraphSource } from "./source.ts";

export const COMMENTS_PATH = "/__cloudhal/comments";
export const COMMENTS_REPORT_PATH = "/__cloudhal/comments/report";
export const COMMENTS_CHALLENGE_PATH = "/__cloudhal/comments/challenge";
/** The name of the owner's Turnstile secret in `comment_secrets` (RFC-0007 §7.6, §12). */
export const TURNSTILE_SECRET_NAME = "turnstile-secret";
export const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Settings and the published pointer are re-read at most this often per isolate (§6.2). */
export const COMMENTS_MEMO_MS = 60_000;

/** Whether a path is one of the comment endpoints. */
export const isCommentsPath = (pathname: string): boolean =>
  pathname === COMMENTS_PATH ||
  pathname === COMMENTS_REPORT_PATH ||
  pathname === COMMENTS_CHALLENGE_PATH;

/** Whether a deployment secret can carry the comment keys (else comments are off). */
export const usableCommentsKey = (secret: string | undefined): secret is string =>
  typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;

/** A Workers Rate Limiting binding (`limit({ key })`), optional (`comments.rateLimit`). */
export interface CommentsRateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SiteCommentsOptions {
  readonly siteId: string;
  /** `CLOUDHAL_COMMENTS_KEY`. Absent or too short: comments are off (no crash). */
  readonly secret: string | undefined;
  /** The deployment switch (`comments.available`; the integration built the module). */
  readonly available: boolean;
  /** The comment store (D1 on Cloudflare, the local SQLite store on Node). */
  readonly store: () => Promise<SqlCommentStore>;
  /** The site row as stored now (published pointer, domains). */
  readonly site: () => Promise<Site | undefined>;
  /** The source of a snapshot (cached by the caller; snapshots are immutable). */
  readonly snapshot: (id: string) => Promise<GraphSource>;
  /** Hosts the site answers on besides `Site.domains` (`CLOUDHAL_SITE_HOSTS`). */
  readonly hosts?: readonly string[];
  /** Also accept the request's own host (`*.workers.dev` on Cloudflare; every host on Node). */
  readonly acceptRequestHost?: (host: string) => boolean;
  /** The optional cross-isolate limiter, keyed by an HMAC under the comments key (never the IP). */
  readonly rateLimit?: CommentsRateLimit | undefined;
  /** For Turnstile's `siteverify` (tests replace it). */
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly onError?: (message: string, error?: unknown) => void;
}

const notFound = () =>
  Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * Per-isolate comment state of one site. Create one per isolate (module scope) and `reset()` it on
 * a purge (a settings change purges, so the next request re-reads them).
 */
export class SiteComments {
  readonly #o: SiteCommentsOptions;
  readonly #now: () => Date;
  readonly #limiter = new CommentLimiter();
  readonly #daily = new DailyCount();
  readonly #replay = new ReplayCache();
  readonly #settings: ReturnType<typeof memoize<Awaited<ReturnType<SqlCommentStore["settings"]>>>>;
  readonly #site: ReturnType<typeof memoize<Site | undefined>>;
  #keys: Promise<CommentKeys> | undefined;

  constructor(options: SiteCommentsOptions) {
    this.#o = options;
    this.#now = options.now ?? (() => new Date());
    const now = () => this.#now().getTime();
    this.#settings = memoize(async () => (await options.store()).settings(options.siteId), {
      ttlMs: COMMENTS_MEMO_MS,
      now,
    });
    this.#site = memoize(() => options.site(), { ttlMs: COMMENTS_MEMO_MS, now });
  }

  /** Comments can be answered at all: the deployment has them and a usable key. */
  get available(): boolean {
    return this.#o.available && usableCommentsKey(this.#o.secret);
  }

  /** Forget the memoised settings and pointer (after a purge). */
  reset(): void {
    this.#settings.reset();
    this.#site.reset();
  }

  #deriveKeys(): Promise<CommentKeys> {
    this.#keys ??= deriveCommentKeys(this.#o.secret as string);
    this.#keys.catch(() => {
      this.#keys = undefined;
    });
    return this.#keys;
  }

  /** The published entry with this id (`null` for drafts, other sites and unknown ids). */
  async #resolveEntry(nodeId: string): Promise<PublishedEntry | null> {
    const site = await this.#site();
    if (!site?.publishedSnapshotId) return null;
    const source = await this.#o.snapshot(site.publishedSnapshotId);
    const entry = await source.entryById?.(nodeId);
    if (entry?.status !== "published" || entry.siteId !== this.#o.siteId) return null;
    return {
      nodeId: entry.id,
      collection: entry.collection,
      path: entryPath(entry),
      publishedAt: entry.publishedAt ?? null,
    };
  }

  async #hosts(requestHost: string): Promise<string[]> {
    let site: Site | undefined;
    try {
      site = await this.#site();
    } catch (error) {
      this.#o.onError?.("comments: reading the site failed", error);
    }
    const hosts = [
      ...(site?.domains ?? []).map((d) => d.hostname.toLowerCase()),
      ...(this.#o.hosts ?? []).map((h) => h.toLowerCase()),
    ];
    const host = requestHost.toLowerCase();
    if (this.#o.acceptRequestHost?.(host.replace(/:\d+$/, ""))) hosts.push(host);
    return hosts;
  }

  async #deps(request: Request, clientAddress: string): Promise<PipelineDeps> {
    const keys = await this.#deriveKeys();
    const store = await this.#o.store();
    const siteId = this.#o.siteId;
    const secret = this.#o.secret as string;
    const binding = this.#o.rateLimit;
    const doFetch = this.#o.fetch ?? fetch;
    return {
      siteId,
      available: this.available,
      hosts: await this.#hosts(request.headers.get("host") ?? new URL(request.url).host),
      clientAddress,
      keys,
      now: this.#now,
      settings: () => this.#settings(),
      resolveEntry: (nodeId) => this.#resolveEntry(nodeId),
      store,
      limiter: this.#limiter,
      daily: this.#daily,
      replay: this.#replay,
      ...(binding
        ? {
            // the isolate's client key differs per isolate; the binding needs one key per client
            // across isolates: an HMAC of the client's network under the deployment secret
            rateLimit: async () => {
              const mac = await hmacRaw(
                utf8(secret),
                `cloudhal/comments/rl/v1\n${clientNetwork(clientAddress)}`,
              );
              return (await binding.limit({ key: toHex(mac.slice(0, 16)) })).success;
            },
          }
        : {}),
      turnstile: async ({ token, remoteip, idempotencyKey }): Promise<TurnstileResult> => {
        const turnstileSecret = await store.readSecret(siteId, TURNSTILE_SECRET_NAME, keys);
        if (!turnstileSecret) throw new Error("no Turnstile secret is stored for this site");
        const body = new FormData();
        body.set("secret", turnstileSecret);
        body.set("response", token);
        body.set("remoteip", remoteip);
        body.set("idempotency_key", idempotencyKey);
        const res = await doFetch(TURNSTILE_SITEVERIFY, { method: "POST", body });
        if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
        const answer = (await res.json()) as Record<string, unknown>;
        return {
          success: answer.success === true,
          ...(typeof answer.hostname === "string" ? { hostname: answer.hostname } : {}),
          ...(typeof answer.action === "string" ? { action: answer.action } : {}),
        };
      },
    };
  }

  /**
   * Answers a comment endpoint, or `undefined` for any other path. `clientAddress` is the address
   * the runtime vouches for (Cloudflare's `CF-Connecting-IP`, Node's socket address); request
   * headers are never trusted for it. Every answer is `no-store`.
   */
  async handle(
    request: Request,
    extra: { clientAddress?: string | undefined } = {},
  ): Promise<Response | undefined> {
    const path = new URL(request.url).pathname;
    if (!isCommentsPath(path)) return undefined;
    if (!this.available) return notFound();
    try {
      // Without an address every client shares one bucket: stricter, never looser.
      const deps = await this.#deps(request, extra.clientAddress?.trim() || "unknown");
      if (path === COMMENTS_CHALLENGE_PATH)
        return challengeResponse(await handleChallengeRequest(request, deps));
      if (path === COMMENTS_REPORT_PATH)
        return submissionResponse(await handleReportSubmission(request, deps), {
          pendingFragment: "comment-reported",
        });
      return submissionResponse(await handleCommentSubmission(request, deps));
    } catch (error) {
      this.#o.onError?.("comments: request failed", error);
      return Response.json(
        { error: "try_again" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }
}
