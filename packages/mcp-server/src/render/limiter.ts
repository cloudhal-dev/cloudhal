/** Render budgets: per key per minute and per site per day, in memory. */

/** Per key per minute and per site per day, in memory (each Worker isolate counts on its own). */
export class RenderLimiter {
  readonly #perKeyPerMinute: number;
  readonly #perSitePerDay: number;
  readonly #keys = new Map<string, number[]>();
  readonly #sites = new Map<string, { day: string; count: number }>();
  constructor(limits: { perKeyPerMinute?: number; perSitePerDay?: number } = {}) {
    this.#perKeyPerMinute = limits.perKeyPerMinute ?? 10;
    this.#perSitePerDay = limits.perSitePerDay ?? 200;
  }
  /** Counts one render, or says why not. */
  take(key: string, site: string, now: Date): string | undefined {
    const t = now.getTime();
    const recent = (this.#keys.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= this.#perKeyPerMinute)
      return `at most ${this.#perKeyPerMinute} renders a minute per key; try again in a minute`;
    const day = now.toISOString().slice(0, 10);
    const used = this.#sites.get(site);
    const count = used?.day === day ? used.count : 0;
    if (count >= this.#perSitePerDay)
      return `at most ${this.#perSitePerDay} renders a day per site; use preview_page until tomorrow (UTC)`;
    recent.push(t);
    this.#keys.set(key, recent);
    this.#sites.set(site, { day, count: count + 1 });
    return undefined;
  }
}
