/**
 * Per-isolate abuse limits (RFC-0006 §5.5). Nothing is stored and no IP is kept: beacons are
 * counted per `HMAC(isolateKey, ip)` where the key is random per isolate, and the counters are
 * dropped every minute.
 */

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
  #key: Promise<CryptoKey> | undefined;
  #window = -1;
  #counts = new Map<string, number>();

  constructor(options: BeaconRateLimiterOptions = {}) {
    this.#perMinute = options.perMinute ?? 30;
    this.#now = options.now ?? Date.now;
  }

  #hmacKey(): Promise<CryptoKey> {
    this.#key ??= crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]) as Promise<CryptoKey>;
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
