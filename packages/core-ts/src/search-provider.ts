/**
 * Search providers (RFC-0029 §1): what answers a reader's search. `fts5` (the index in the
 * project's SQLite or D1) is the default and the floor; `memory` searches rows a source holds
 * (`cloudhal dev`); other providers (Cloudflare AI Search, capabilities) implement the same
 * interface and are wrapped in `withFallback`, so a failing or slow one is answered by FTS5.
 *
 * Every provider keeps invariant 1: readers find only what is live, inside its time gates. Worker-safe.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { type SearchPlan, searchIndex } from "./search.ts";
import type { SearchOptions, SearchResults, SearchRow } from "./search-common.ts";
import { searchRows } from "./search-memory.ts";

/** A reader's search: the query, the site and the options every provider understands. */
export interface SearchRequest extends SearchOptions {
  siteId: string;
  query: string;
}

export interface SearchCapabilities {
  /** Finds by meaning, not only by words. */
  semantic: boolean;
  /** Answers with generated text (needs its own RFC before readers see it). */
  answer: boolean;
}

export interface SearchProvider {
  readonly id: string;
  readonly capabilities: SearchCapabilities;
  search(request: SearchRequest): Promise<SearchResults>;
  /**
   * Called after a publish, rollback, release or import made `plan.snapshotId` live, with what
   * changed. FTS5 is written in the publish batch itself and does not need it.
   */
  sync?(siteId: string, plan: SearchPlan): Promise<void>;
}

const KEYWORD: SearchCapabilities = { semantic: false, answer: false };

/** The FTS5 index (RFC-0019 §3): the default provider and every other one's fallback. */
export function fts5Provider(sql: SqlDriver): SearchProvider {
  return {
    id: "fts5",
    capabilities: KEYWORD,
    search: ({ siteId, query, ...options }) => searchIndex(sql, siteId, query, options),
  };
}

/** Rows held in memory (`cloudhal dev`): the same rules as the index, drafts as the source shows them. */
export function memoryProvider(
  rows: (siteId: string, locale: string) => Promise<readonly SearchRow[]> | readonly SearchRow[],
): SearchProvider {
  return {
    id: "memory",
    capabilities: KEYWORD,
    search: async ({ siteId, query, ...options }) =>
      searchRows(await rows(siteId, options.locale), query, options),
  };
}

/** How long a provider may take before its fallback answers (RFC-0029 §1, invariant 3). */
export const SEARCH_FALLBACK_MS = 1500;

/**
 * `primary`, answered by `fallback` when it throws or takes longer than `timeoutMs`. The reader
 * never sees the failure; `onError` hears about it. `sync` goes to both, and a primary's failure
 * there is reported, never thrown (the publish already happened).
 */
export function withFallback(
  primary: SearchProvider,
  fallback: SearchProvider,
  options: { timeoutMs?: number; onError?: (error: unknown) => void } = {},
): SearchProvider {
  const timeoutMs = options.timeoutMs ?? SEARCH_FALLBACK_MS;
  const report = (e: unknown) => options.onError?.(e);
  return {
    id: primary.id,
    capabilities: primary.capabilities,
    async search(request) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`search provider ${primary.id} took over ${timeoutMs} ms`)),
          timeoutMs,
        );
      });
      try {
        return await Promise.race([primary.search(request), late]);
      } catch (e) {
        report(e);
        return fallback.search(request);
      } finally {
        clearTimeout(timer);
      }
    },
    async sync(siteId, plan) {
      await fallback.sync?.(siteId, plan);
      try {
        await primary.sync?.(siteId, plan);
      } catch (e) {
        report(e);
      }
    },
  };
}
