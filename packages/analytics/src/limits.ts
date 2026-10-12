/**
 * Per-isolate abuse limits (RFC-0006 §5.5). Nothing is stored and no IP is kept: beacons are
 * counted per `HMAC(isolateKey, ip)` where the key is random per isolate, and the counters are
 * dropped every minute.
 */

/** The HMAC key type, spelled so it resolves with Node's and with Workers' type libraries alike. */
type HmacKey = Parameters<typeof crypto.subtle.sign>[1];

const MINUTE_MS = 60_000;
const MAX_KEYS = 20_000;

export interface BeaconRateLimiterOptions {
  /** Page views and vitals each, per client per minute (default 30). */
  readonly perMinute?: number;
  readonly now?: () => number;
}

/** 30 page views and 30 vitals per client per minute; above that, beacons are dropped. */
export class BeaconRateLimiter {
  readonly #perMinute: number;
  readonly #now: () => number;
  #key: Promise<HmacKey> | undefined;
  #window = -1;
  #counts = new Map<string, number>();

  constructor(options: BeaconRateLimiterOptions = {}) {
    this.#perMinute = options.perMinute ?? 30;
    this.#now = options.now ?? Date.now;
  }

  #hmacKey(): Promise<HmacKey> {
    this.#key ??= crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]) as Promise<HmacKey>;
    return this.#key;
  }

  /** True when this beacon is within the allowance. */
  async allow(ip: string, kind: "pageview" | "vitals"): Promise<boolean> {
    const window = Math.floor(this.#now() / MINUTE_MS);
    if (window !== this.#window) {
      this.#window = window;
      this.#counts = new Map();
    }
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", await this.#hmacKey(), new TextEncoder().encode(ip)),
    );
    let id = kind;
    for (let i = 0; i < 12; i++) id += (mac[i] ?? 0).toString(16).padStart(2, "0");
    const n = (this.#counts.get(id) ?? 0) + 1;
    if (this.#counts.size >= MAX_KEYS && !this.#counts.has(id)) return false;
    this.#counts.set(id, n);
    return n <= this.#perMinute;
  }
}

export interface RenderSampleDecision {
  /** Write this render event. */
  readonly record: boolean;
  /** `sampleOneIn` for the event when it is written. */
  readonly sampleOneIn: number;
}

/**
 * Render events: up to `perMinute` (120) a minute per isolate are all written; past that one in 10
 * is written, and past ten times that one in 100, each with its `sampleOneIn` so counts stay right.
 */
export class RenderEventSampler {
  readonly #perMinute: number;
  readonly #now: () => number;
  #window = -1;
  #seen = 0;

  constructor(options: { perMinute?: number; now?: () => number } = {}) {
    this.#perMinute = options.perMinute ?? 120;
    this.#now = options.now ?? Date.now;
  }

  next(): RenderSampleDecision {
    const window = Math.floor(this.#now() / MINUTE_MS);
    if (window !== this.#window) {
      this.#window = window;
      this.#seen = 0;
    }
    this.#seen++;
    const n = this.#seen;
    if (n <= this.#perMinute) return { record: true, sampleOneIn: 1 };
    const k = n <= this.#perMinute * 10 ? 10 : 100;
    return { record: (n - this.#perMinute) % k === 0, sampleOneIn: k };
  }
}

/** Structurally `RateLimit` from `@cloudflare/workers-types` (a Workers Rate Limiting binding). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Label of the key derivation: the binding's key never uses the deployment secret as such. */
const SHARED_KEY_LABEL = "cloudhal analytics rate limit v1";

export interface SharedBeaconRateLimiterOptions {
  /**
   * A deployment secret every isolate of the site Worker has (the Site Worker passes its purge
   * token, at least 16 characters). The HMAC key is derived from it, so a client gets the same key
   * in every isolate, and the key reveals nothing about the IP to anyone without the secret.
   */
  readonly secret: string;
  /** Binding errors (the beacon is then allowed: the per-isolate limits still apply). */
  readonly onError?: (message: string, error?: unknown) => void;
}

/**
 * The optional cross-isolate limit (RFC-0006 §5.5, `analytics.rateLimit`): a Workers Rate Limiting
 * binding keyed by `HMAC(derive(secret), ip)`, truncated to 128 bits. `BeaconRateLimiter`'s key is
 * random per isolate, which would make a shared counter useless; this key is the same in every
 * isolate, so the binding's counter spans them (Cloudflare keeps it per location, eventually
 * consistent). The IP is never stored or sent: only the hash reaches the binding, whose counters
 * live for its period. Page views and vitals share one allowance (`simple.limit` per 60 s).
 *
 * Fails open: a binding error, a missing IP or a missing secret allow the beacon, because this
 * limit is defence in depth on top of the per-isolate one.
 */
export class SharedBeaconRateLimiter {
  readonly #binding: RateLimitBinding;
  readonly #o: SharedBeaconRateLimiterOptions;
  #key: Promise<HmacKey> | undefined;

  constructor(binding: RateLimitBinding, options: SharedBeaconRateLimiterOptions) {
    this.#binding = binding;
    this.#o = options;
  }

  #hmacKey(): Promise<HmacKey> {
    this.#key ??= (async () => {
      const enc = new TextEncoder();
      const hmac = { name: "HMAC", hash: "SHA-256" };
      const root = await crypto.subtle.importKey("raw", enc.encode(this.#o.secret), hmac, false, [
        "sign",
      ]);
      const derived = await crypto.subtle.sign("HMAC", root, enc.encode(SHARED_KEY_LABEL));
      return (await crypto.subtle.importKey("raw", derived, hmac, false, ["sign"])) as HmacKey;
    })();
    return this.#key;
  }

  /** The binding's key for a client: 32 hex characters, the same in every isolate. */
  async keyFor(ip: string): Promise<string> {
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", await this.#hmacKey(), new TextEncoder().encode(ip)),
    );
    let key = "";
    for (let i = 0; i < 16; i++) key += (mac[i] ?? 0).toString(16).padStart(2, "0");
    return key;
  }

  /** True when this beacon is within the shared allowance (or the binding cannot tell). */
  async allow(ip: string): Promise<boolean> {
    if (!ip || this.#o.secret.length < 16) return true;
    try {
      const outcome = await this.#binding.limit({ key: await this.keyFor(ip) });
      return outcome?.success !== false;
    } catch (error) {
      this.#o.onError?.("analytics rate limit binding failed", error);
      return true;
    }
  }
}
