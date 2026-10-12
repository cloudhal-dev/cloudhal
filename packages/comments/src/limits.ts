/**
 * Per-isolate limits and memos for the site Worker (RFC-0007 §6.5). Nothing here is stored and no
 * IP address is kept: clients are counted by HMAC(per-isolate random key, network) — an IPv6
 * address by its /64, like the D1 limits and the IP hash — and the counters are dropped every
 * window. Requests without an address the runtime vouches for share one separate bucket with
 * stricter limits, so they can neither pass as many clients nor use up real clients' allowance.
 *
 * | Limit | Default |
 * |---|---|
 * | Challenges per client | 20 a minute |
 * | Submissions per client | 3 a minute |
 * | Challenges / submissions, all clients without an address together | 5 / 1 a minute |
 * | Submissions per site | 30 a minute |
 *
 * The cross-isolate limits (stored comments per client, the daily cap, JavaScript-less posts,
 * pending per entry, reports) are indexed D1 reads in the pipeline; `DailyCount` memoises the daily
 * count for 30 s and increments it locally after each store.
 */
import { type HmacKey, hmac, toHex, utf8 } from "./crypto.ts";
import { clientNetwork, isClientAddress } from "./hashes.ts";
import { MINUTE_MS } from "./model.ts";

export const ISOLATE_LIMITS = {
  challengesPerClientPerMinute: 20,
  submissionsPerClientPerMinute: 3,
  submissionsPerSitePerMinute: 30,
  /** Every request without a client address, together (one shared, stricter bucket). */
  unknownChallengesPerMinute: 5,
  unknownSubmissionsPerMinute: 1,
} as const;

/** The isolate key of requests without a client address (an HMAC key is 24 hex characters). */
export const UNKNOWN_CLIENT_KEY = "unknown-client";

/** Stored-row limits read from D1 (§6.5). */
export const STORED_LIMITS = {
  commentsPerClientPerHour: 5,
  commentsPerClientPerDay: 20,
  /** One JavaScript-less post per client per 10 minutes. */
  noScriptWindowMs: 10 * MINUTE_MS,
  noScriptPerSitePerDay: 20,
  pendingPerEntry: 200,
  reportsPerClientPerHour: 5,
  reportsPerSitePerDay: 200,
} as const;

const MAX_KEYS = 20_000;

class WindowCounter {
  #window = -1;
  #counts = new Map<string, number>();
  readonly #windowMs: number;

  constructor(windowMs: number) {
    this.#windowMs = windowMs;
  }

  /** Counts one hit; true while the key is within `limit` in the current window. */
  hit(key: string, limit: number, nowMs: number): boolean {
    const w = Math.floor(nowMs / this.#windowMs);
    if (w !== this.#window) {
      this.#window = w;
      this.#counts = new Map();
    }
    if (this.#counts.size >= MAX_KEYS && !this.#counts.has(key)) return false;
    const n = (this.#counts.get(key) ?? 0) + 1;
    this.#counts.set(key, n);
    return n <= limit;
  }

  /** Milliseconds until the window ends. */
  retryAfterMs(nowMs: number): number {
    return this.#windowMs - (nowMs % this.#windowMs);
  }
}

export interface CommentLimiterOptions {
  readonly challengesPerMinute?: number;
  readonly submissionsPerMinute?: number;
  readonly sitePerMinute?: number;
  readonly unknownChallengesPerMinute?: number;
  readonly unknownSubmissionsPerMinute?: number;
  readonly now?: () => number;
}

/** The isolate's counters. One instance per isolate, shared by every request. */
export class CommentLimiter {
  readonly #now: () => number;
  readonly #challenges = new WindowCounter(MINUTE_MS);
  readonly #submissions = new WindowCounter(MINUTE_MS);
  readonly #site = new WindowCounter(MINUTE_MS);
  readonly #limits: Required<Omit<CommentLimiterOptions, "now">>;
  #key: Promise<HmacKey> | undefined;

  constructor(options: CommentLimiterOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#limits = {
      challengesPerMinute:
        options.challengesPerMinute ?? ISOLATE_LIMITS.challengesPerClientPerMinute,
      submissionsPerMinute:
        options.submissionsPerMinute ?? ISOLATE_LIMITS.submissionsPerClientPerMinute,
      sitePerMinute: options.sitePerMinute ?? ISOLATE_LIMITS.submissionsPerSitePerMinute,
      unknownChallengesPerMinute:
        options.unknownChallengesPerMinute ?? ISOLATE_LIMITS.unknownChallengesPerMinute,
      unknownSubmissionsPerMinute:
        options.unknownSubmissionsPerMinute ?? ISOLATE_LIMITS.unknownSubmissionsPerMinute,
    };
  }

  /**
   * HMAC(per-isolate key, client network): the isolate's client key; never stored. An IPv6
   * address counts by its /64, so rotating within one's own prefix gains nothing; a request
   * without an address gets `UNKNOWN_CLIENT_KEY`.
   */
  async clientKey(address: string): Promise<string> {
    if (!isClientAddress(address)) return UNKNOWN_CLIENT_KEY;
    this.#key ??= crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]) as Promise<HmacKey>;
    return toHex((await hmac(await this.#key, utf8(clientNetwork(address)))).slice(0, 12));
  }

  allowChallenge(clientKey: string): boolean {
    const limit =
      clientKey === UNKNOWN_CLIENT_KEY
        ? this.#limits.unknownChallengesPerMinute
        : this.#limits.challengesPerMinute;
    return this.#challenges.hit(clientKey, limit, this.#now());
  }

  allowSubmission(clientKey: string): boolean {
    const limit =
      clientKey === UNKNOWN_CLIENT_KEY
        ? this.#limits.unknownSubmissionsPerMinute
        : this.#limits.submissionsPerMinute;
    return this.#submissions.hit(clientKey, limit, this.#now());
  }

  allowSite(siteId: string): boolean {
    return this.#site.hit(siteId, this.#limits.sitePerMinute, this.#now());
  }

  /** Seconds a limited client should wait. */
  retryAfterS(): number {
    return Math.max(1, Math.ceil(this.#submissions.retryAfterMs(this.#now()) / 1000));
  }
}

export interface StoredToday {
  readonly total: number;
  readonly withoutScript: number;
}

/**
 * Today's stored submissions for a site, memoised `ttlMs` (30 s) per isolate and incremented
 * locally after each store, so the daily cap needs one indexed `COUNT` per isolate every 30 s.
 */
export class DailyCount {
  readonly #ttl: number;
  readonly #now: () => number;
  #memo = new Map<
    string,
    { day: string; at: number; value: Promise<StoredToday>; extra: StoredToday }
  >();

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttl = options.ttlMs ?? 30_000;
    this.#now = options.now ?? Date.now;
  }

  async get(siteId: string, day: string, load: () => Promise<StoredToday>): Promise<StoredToday> {
    const t = this.#now();
    let m = this.#memo.get(siteId);
    if (!m || m.day !== day || t - m.at >= this.#ttl) {
      const value = load();
      m = { day, at: t, value, extra: { total: 0, withoutScript: 0 } };
      this.#memo.set(siteId, m);
      value.catch(() => {
        if (this.#memo.get(siteId)?.value === value) this.#memo.delete(siteId);
      });
    }
    const base = await m.value;
    return {
      total: base.total + m.extra.total,
      withoutScript: base.withoutScript + m.extra.withoutScript,
    };
  }

  /** Counts one stored submission in the memo. */
  increment(siteId: string, withoutScript: boolean): void {
    const m = this.#memo.get(siteId);
    if (!m) return;
    m.extra = {
      total: m.extra.total + 1,
      withoutScript: m.extra.withoutScript + (withoutScript ? 1 : 0),
    };
  }
}

/**
 * A memo for a loader (the site's settings, 60 s per isolate). A failed load is not cached, so
 * the next request tries again; callers treat a failure as "off" (fail closed).
 */
export function memoize<T>(
  load: () => Promise<T>,
  options: { ttlMs?: number; now?: () => number } = {},
): (() => Promise<T>) & { reset(): void } {
  const ttl = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let memo: { at: number; value: Promise<T> } | undefined;
  const fn = () => {
    const t = now();
    if (!memo || t - memo.at >= ttl) {
      const value = load();
      memo = { at: t, value };
      value.catch(() => {
        if (memo?.value === value) memo = undefined;
      });
    }
    return memo.value;
  };
  return Object.assign(fn, {
    reset: () => {
      memo = undefined;
    },
  });
}
