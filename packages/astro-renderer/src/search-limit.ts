/**
 * Site search's rate limit on the Site Worker (RFC-0019 §3, RFC-0029 §5): a token bucket per client
 * address, per isolate. A client holds up to `SEARCH_BUCKET` tokens, refilled at one a second; the
 * search page costs `SEARCH_COST.page`, a modal request `SEARCH_COST.json`. So a reader may load 30
 * result pages in a row, or type through a few queries in the modal (debounced), and a script
 * hammering either is held to 30 pages or 60 requests a minute. Addresses live in memory only and
 * are never logged or stored. Worker-safe.
 */

/** Tokens a client starts with and can hold. */
export const SEARCH_BUCKET = 60;
/** Tokens refilled per second. */
export const SEARCH_REFILL_PER_SECOND = 1;
/** What each kind of request costs. */
export const SEARCH_COST = { page: 2, json: 1 } as const;
/** Result pages a client may load in a burst (`SEARCH_BUCKET / SEARCH_COST.page`). */
export const SEARCH_RATE_LIMIT = SEARCH_BUCKET / SEARCH_COST.page;
/** Clients tracked per isolate; past this, the least recently seen are forgotten. */
const MAX_CLIENTS = 10_000;

export class SearchLimiter {
  readonly #capacity: number;
  readonly #refill: number;
  readonly #now: () => number;
  /** Insertion order is recency: a client's entry moves to the end on every request. */
  #buckets = new Map<string, { tokens: number; at: number }>();

  constructor(options: { capacity?: number; refillPerSecond?: number; now?: () => number } = {}) {
    this.#capacity = options.capacity ?? SEARCH_BUCKET;
    this.#refill = options.refillPerSecond ?? SEARCH_REFILL_PER_SECOND;
    this.#now = options.now ?? Date.now;
  }

  /**
   * Spends `cost` tokens of a client's bucket; returns the seconds to wait when it holds too few
   * (nothing is spent then), else 0. Without an address (local tools, tests) nothing is limited.
   */
  take(client: string | undefined, cost: number = SEARCH_COST.page): number {
    if (!client) return 0;
    const now = this.#now();
    const held = this.#buckets.get(client);
    const tokens = held
      ? Math.min(this.#capacity, held.tokens + ((now - held.at) / 1000) * this.#refill)
      : this.#capacity;
    this.#buckets.delete(client);
    const enough = tokens >= cost;
    this.#buckets.set(client, { tokens: enough ? tokens - cost : tokens, at: now });
    if (this.#buckets.size > MAX_CLIENTS) {
      const oldest = this.#buckets.keys().next().value;
      if (oldest !== undefined) this.#buckets.delete(oldest);
    }
    return enough ? 0 : Math.ceil((cost - tokens) / this.#refill);
  }
}

/** What a request to a search path costs, or undefined for any other path. */
export function searchCost(pathname: string): number | undefined {
  if (pathname === "/search" || pathname === "/search/") return SEARCH_COST.page;
  if (pathname === "/search.json") return SEARCH_COST.json;
  return undefined;
}

/** True for the search page's path (with or without a trailing slash) and the modal's endpoint. */
export function isSearchPath(pathname: string): boolean {
  return searchCost(pathname) !== undefined;
}
