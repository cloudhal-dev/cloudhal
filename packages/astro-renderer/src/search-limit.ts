/**
 * The search page's rate limit on the Site Worker (RFC-0019 §3): `SEARCH_RATE_LIMIT` searches per
 * minute per client address, counted per isolate in fixed one-minute windows (the comments
 * limiter's fallback pattern). Addresses live in memory only for the current window and are
 * never logged or stored. Worker-safe.
 */

/** Searches per client and minute. */
export const SEARCH_RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
/** Clients tracked per isolate; past this, the oldest window's clients are forgotten. */
const MAX_CLIENTS = 10_000;

export class SearchLimiter {
  readonly #limit: number;
  readonly #now: () => number;
  #window = -1;
  #counts = new Map<string, number>();

  constructor(options: { limit?: number; now?: () => number } = {}) {
    this.#limit = options.limit ?? SEARCH_RATE_LIMIT;
    this.#now = options.now ?? Date.now;
  }

  /**
   * Counts a search; returns the seconds to wait when the client is over the limit, else 0.
   * Without an address (local tools, tests) nothing is limited.
   */
  take(client: string | undefined): number {
    if (!client) return 0;
    const now = this.#now();
    const window = Math.floor(now / WINDOW_MS);
    if (window !== this.#window || this.#counts.size >= MAX_CLIENTS) {
      this.#window = window;
      this.#counts = new Map();
    }
    const used = (this.#counts.get(client) ?? 0) + 1;
    this.#counts.set(client, used);
    return used > this.#limit ? Math.ceil(((window + 1) * WINDOW_MS - now) / 1000) : 0;
  }
}

/** True for the search page's path (with or without a trailing slash). */
export function isSearchPath(pathname: string): boolean {
  return pathname === "/search" || pathname === "/search/";
}
