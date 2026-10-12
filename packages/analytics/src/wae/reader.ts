/**
 * `WaeReader` (RFC-0006 §7.3, §7.7): answers the query model live from Workers Analytics Engine
 * through the admin Worker's `AnalyticsSQLBinding` — no API token. Results are cached 60 s per
 * isolate (plain values only), every uncached statement spends one unit of the daily query budget,
 * and binding errors are mapped: a retryable `AnalyticsSQLAPIError` is retried once after 250 ms,
 * then becomes `AnalyticsUnavailableError` (503); anything else is `AnalyticsQueryFailedError`
 * (502), whose message never names the dataset.
 */
import {
  AnalyticsBudgetExceededError,
  AnalyticsQueryFailedError,
  AnalyticsUnavailableError,
} from "../errors.ts";
import {
  type AnalyticsData,
  type AnalyticsQuery,
  type AnalyticsReader,
  type AnalyticsResult,
  fillSeries,
  num,
  parseBucket,
  type QueryBudget,
  queryKey,
  type RenderCrawlerRow,
  type RenderErrorRow,
  type RenderRedirectRow,
  VITALS_METRICS,
  vitalsMetric,
} from "../model.ts";
import { crawlerClass } from "../ua.ts";
import { type CompiledWaeQuery, compileWae, DIM_SLOT } from "./compile.ts";
import { BLOB, DOUBLE } from "./layout.ts";

/** Structurally `AnalyticsSQLBinding` from `@cloudflare/workers-types` (the admin Worker's binding). */
export interface WaeSqlBinding {
  query<T extends Record<string, unknown> = Record<string, unknown>>(request: {
    query: string;
    params?: readonly (string | number | boolean | null)[];
  }): Promise<{ data: T[]; rows?: number; statistics?: unknown }>;
}

type Row = Record<string, unknown>;

interface CacheEntry {
  readonly at: number;
  readonly value: AnalyticsResult;
}

/** The per-isolate cache shared by every `WaeReader` that does not bring its own. */
const ISOLATE_CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 500;

export interface WaeReaderOptions {
  /** `<deployment>_events`, `^[a-z0-9_]+$`. */
  readonly dataset: string;
  /** The daily budget; omit for the rollup job, whose reads are exempt (§7.7). */
  readonly budget?: QueryBudget;
  /** Result cache lifetime (default 60 s; 0 disables). */
  readonly cacheTtlMs?: number;
  /** Defaults to one map per isolate. */
  readonly cache?: Map<string, CacheEntry>;
  readonly now?: () => Date;
  /** Delay before the one retry of a retryable error (default 250 ms). */
  readonly retryDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Raw binding errors (may name the dataset; for logs only). */
  readonly onError?: (message: string, error?: unknown) => void;
}

function isRetryable(error: unknown): boolean {
  return (
    !!error && typeof error === "object" && (error as { retryable?: unknown }).retryable === true
  );
}

export class WaeReader implements AnalyticsReader {
  readonly kind = "wae" as const;
  readonly #binding: WaeSqlBinding;
  readonly #o: WaeReaderOptions;
  readonly #cache: Map<string, CacheEntry>;

  constructor(binding: WaeSqlBinding, options: WaeReaderOptions) {
    this.#binding = binding;
    this.#o = options;
    this.#cache = options.cache ?? ISOLATE_CACHE;
  }

  #now(): Date {
    return this.#o.now?.() ?? new Date();
  }

  /** Runs one statement: budget, binding call, one retry, error mapping. */
  async #run(query: string): Promise<Row[]> {
    if (this.#o.budget && !(await this.#o.budget.take(this.#now())))
      throw new AnalyticsBudgetExceededError();
    const sleep = this.#o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.#binding.query<Row>({ query });
        return Array.isArray(res?.data) ? res.data : [];
      } catch (error) {
        this.#o.onError?.(`analytics SQL failed: ${(error as Error)?.message ?? error}`, error);
        if (!isRetryable(error)) throw new AnalyticsQueryFailedError(error);
        if (attempt >= 1)
          throw new AnalyticsUnavailableError(
            "Cloudflare's analytics service is busy; try again shortly",
            true,
            error,
          );
        await sleep(this.#o.retryDelayMs ?? 250);
      }
    }
  }

  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    const compiled = compileWae(q, { dataset: this.#o.dataset });
    const ttl = this.#o.cacheTtlMs ?? 60_000;
    const key = `${this.#o.dataset}\n${queryKey(q, compiled.range)}`;
    const now = this.#now().getTime();
    if (ttl > 0) {
      const hit = this.#cache.get(key);
      if (hit && now - hit.at < ttl) return structuredClone(hit.value) as AnalyticsResult<Q>;
    }
    const result = await this.#answer(q, compiled);
    if (ttl > 0) {
      if (this.#cache.size >= CACHE_MAX) {
        for (const [k, v] of this.#cache) if (now - v.at >= ttl) this.#cache.delete(k);
        if (this.#cache.size >= CACHE_MAX) {
          const oldest = this.#cache.keys().next().value;
          if (oldest !== undefined) this.#cache.delete(oldest);
        }
      }
      this.#cache.set(key, { at: now, value: structuredClone(result) });
    }
    return result as AnalyticsResult<Q>;
  }

  async #answer(q: AnalyticsQuery, c: CompiledWaeQuery): Promise<AnalyticsResult> {
    const rows = await this.#run(c.query);
    switch (q.kind) {
      case "summary": {
        const r = rows[0] ?? {};
        let visitors: number | null = null;
        if (num(r.hashed) > 0 && c.visitors) {
          const days = await this.#run(c.visitors);
          if (days.length > 0) visitors = days.reduce((n, d) => n + num(d.visitors), 0);
        }
        let renders: number | null = null;
        if (c.renders) renders = num((await this.#run(c.renders))[0]?.renders);
        return {
          data: { pageviews: num(r.pageviews), visits: num(r.visits), visitors, renders },
          source: "live",
          estimated: visitors !== null,
        };
      }
      case "series":
        return {
          data: {
            interval: q.interval,
            points: fillSeries(
              c.range,
              q.interval,
              rows.flatMap((r) => {
                const t = parseBucket(r.t);
                return t ? [{ t, pageviews: num(r.pageviews), visits: num(r.visits) }] : [];
              }),
            ),
          },
          source: "live",
          estimated: false,
        };
      case "top":
        return {
          data: {
            dimension: q.dimension,
            rows: rows.map((r) => ({
              key: String(r[DIM_SLOT[q.dimension]] ?? ""),
              pageviews: num(r.pageviews),
              visits: num(r.visits),
            })),
          },
          source: "live",
          estimated: false,
        };
      case "vitals": {
        const r = rows[0] ?? {};
        const metrics = VITALS_METRICS.map((metric) => {
          const samples = num(r[`${metric}_samples`]);
          const raw = r[`${metric}_p75`];
          let p75: number | null =
            raw === null || raw === undefined || Number.isNaN(Number(raw)) ? null : num(raw);
          if (p75 !== null && metric === "cls") p75 = p75 / 1000;
          return vitalsMetric(
            metric,
            p75,
            samples,
            num(r[`${metric}_good`]),
            num(r[`${metric}_poor`]),
          );
        });
        return { data: { metrics }, source: "live", estimated: true };
      }
      case "renders": {
        const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
        const orNull = (v: unknown) => (s(v) === "" ? null : s(v));
        let data: AnalyticsData<typeof q>;
        if (q.statuses === "errors")
          data = {
            report: "errors",
            rows: rows.map(
              (r): RenderErrorRow => ({
                path: s(r[`blob${BLOB.path}`]),
                status: num(r[`double${DOUBLE.status}`]),
                refPath: orNull(r[`blob${BLOB.refPath}`]),
                hits: num(r.hits),
                lastSeen: parseBucket(r.lastSeen) ?? null,
              }),
            ),
          };
        else if (q.statuses === "redirects")
          data = {
            report: "redirects",
            rows: rows.map(
              (r): RenderRedirectRow => ({
                path: s(r[`blob${BLOB.path}`]),
                status: num(r[`double${DOUBLE.status}`]),
                redirectTo: s(r[`blob${BLOB.redirectTo}`]),
                nodeId: orNull(r[`blob${BLOB.nodeId}`]),
                hits: num(r.hits),
              }),
            ),
          };
        else
          data = {
            report: "crawlers",
            rows: rows.map(
              (r): RenderCrawlerRow => ({
                crawler: s(r[`blob${BLOB.crawler}`]),
                class: crawlerClass(s(r[`blob${BLOB.crawler}`])),
                hits: num(r.hits),
              }),
            ),
          };
        return { data, source: "live", estimated: false };
      }
    }
  }
}

/** Empties the per-isolate cache (tests; the settings route after a change). */
export function clearWaeCache(): void {
  ISOLATE_CACHE.clear();
}
