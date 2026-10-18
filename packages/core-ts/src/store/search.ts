/**
 * The store's site search (RFC-0019 §3, RFC-0029 §1): plans the index update a publish, rollback,
 * release or import makes, rebuilds it on demand, and answers readers through the site's provider
 * (FTS5 unless the store was given another, which then falls back to FTS5).
 */
import type { SqlDriver } from "@cloudhal/storage";
import { nodeHash } from "../hash.ts";
import {
  planSearch,
  type SearchOptions,
  type SearchPlan,
  type SearchResults,
  searchState,
  searchStatements,
} from "../search.ts";
import { fts5Provider, type SearchProvider, withFallback } from "../search-provider.ts";
import type { SiteGraphStore } from "../store.ts";

export class SearchEngine {
  readonly #sql: SqlDriver;
  readonly #graph: SiteGraphStore;
  readonly #stamp: () => string;
  readonly #onError: (error: unknown) => void;
  /** Answers readers: FTS5, or the store's provider with FTS5 behind it. */
  readonly provider: SearchProvider;

  constructor(options: {
    sql: SqlDriver;
    graph: SiteGraphStore;
    stamp: () => string;
    onError: (error: unknown) => void;
    provider?: SearchProvider | undefined;
  }) {
    this.#sql = options.sql;
    this.#graph = options.graph;
    this.#stamp = options.stamp;
    this.#onError = options.onError;
    const fts5 = fts5Provider(options.sql);
    this.provider = options.provider
      ? withFallback(options.provider, fts5, { onError: options.onError })
      : fts5;
  }

  /**
   * The plan that brings the index to `snapshotId`, from the snapshot it reflects now (only
   * changed nodes) or from scratch. Undefined when it cannot be planned (the publish goes ahead;
   * the index stays where it was and pages say it is updating).
   */
  async plan(
    siteId: string,
    snapshotId: string,
    options: { full?: boolean } = {},
  ): Promise<SearchPlan | undefined> {
    try {
      const target = await this.#graph.getSnapshot(snapshotId);
      if (!target) return undefined;
      const state = options.full ? undefined : await searchState(this.#sql, siteId);
      if (state?.snapshotId === snapshotId) return undefined;
      const base = state ? await this.#graph.getSnapshot(state.snapshotId) : undefined;
      return await planSearch({ target, base, read: (ref) => this.#graph.readSnapshotNode(ref) });
    } catch (e) {
      this.#onError(e);
      return undefined;
    }
  }

  /** Tells the provider what a publish wrote (FTS5 already has it from the batch). */
  async synced(siteId: string, plan: SearchPlan | undefined): Promise<void> {
    if (!plan || !this.provider.sync) return;
    try {
      await this.provider.sync(siteId, plan);
    } catch (e) {
      this.#onError(e);
    }
  }

  /** Brings the index to the site's live snapshot (`full`: from scratch). */
  async refresh(siteId: string, options: { full?: boolean } = {}): Promise<void> {
    const site = await this.#graph.getSite(siteId);
    if (!site?.publishedSnapshotId) return;
    const plan = await this.plan(siteId, site.publishedSnapshotId, options);
    if (!plan) return;
    await this.#sql.batch(
      searchStatements(plan, { siteId, hash: await nodeHash(site) }, this.#stamp()),
    );
    await this.synced(siteId, plan);
  }

  status(siteId: string): Promise<{ snapshotId: string; entries: number } | undefined> {
    return searchState(this.#sql, siteId);
  }

  search(siteId: string, query: string, options: SearchOptions): Promise<SearchResults> {
    return this.provider.search({ siteId, query, ...options });
  }
}
