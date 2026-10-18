/**
 * Cloudflare AI Search as a site search provider (RFC-0029 §3, experimental). Semantic search: it
 * finds "rising prices" in an article about inflation. It is never the source of truth:
 *
 * - **Sync.** Every index update a publish, rollback, release or import makes (`SearchPlan`) is
 *   mirrored to an R2 bucket that is the AI Search instance's data source: one Markdown object per
 *   live node and locale at `sites/<siteId>/<nodeId>/<locale>.md`, with the custom metadata
 *   `locale` and `kind` (the instance declares both as text fields). AI Search indexes it on its
 *   own schedule.
 * - **Search.** One call, filtered to the site's folder range and the reader's locale and kinds.
 *   The chunks' nodes then pass `liveHits` against the FTS5 index (invariant 1), which matches the
 *   live snapshot: what AI Search indexed late or kept too long never reaches a reader, and the
 *   titles and links come from the index.
 * - **Hybrid.** `hybridProvider` merges it with FTS5 by reciprocal rank, so exact title matches stay
 *   on top and semantic matches fill in; when it fails, FTS5 answers alone.
 * - **Quota.** `monthlyLimit` calls per UTC month for the deployment (`search_quota`), by default
 *   the 1,000 semantic queries Cloudflare includes per account; past it, FTS5 alone until the
 *   month ends.
 *
 * The binding types are structural (no `@cloudflare/workers-types` here). Worker-safe.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { liveHits, type SearchPlan, searchState } from "./search.ts";
import {
  type SearchHit,
  type SearchResults,
  type SearchRow,
  searchKinds,
  searchPaging,
} from "./search-common.ts";
import { markedSnippet } from "./search-memory.ts";
import { fts5Provider, type SearchProvider, type SearchRequest } from "./search-provider.ts";

/** What the provider calls on an AI Search instance binding (`[[ai_search]]`). */
export interface AiSearchInstance {
  search(request: {
    query: string;
    ai_search_options?: {
      retrieval?: { max_num_results?: number; filters?: Record<string, unknown> };
    };
  }): Promise<{ chunks?: { score?: number; text?: string; item?: { key?: string } }[] }>;
}

/** What the provider calls on the R2 bucket AI Search reads. */
export interface SearchBucket {
  put(
    key: string,
    value: string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix: string; cursor?: string; include?: "customMetadata"[] }): Promise<{
    objects: { key: string; customMetadata?: Record<string, string> }[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export const AI_SEARCH_PROVIDER = "cloudflare-ai-search";
/** Chunks asked for per search: several chunks can belong to one node. */
const AI_SEARCH_CHUNKS = 50;
/** R2 deletes at most this many keys per call. */
const DELETE_MAX = 1000;

const siteFolder = (siteId: string) => `sites/${siteId}/`;
const objectKey = (siteId: string, row: Pick<SearchRow, "nodeId" | "locale">) =>
  `${siteFolder(siteId)}${row.nodeId}/${row.locale}.md`;
/** The node of an object key (`sites/<siteId>/<nodeId>/<locale>.md`). */
const nodeOf = (key: string | undefined) => key?.split("/")[2];

/** What AI Search reads for a row: the title as a heading, then the summary and the body. */
function objectText(row: SearchRow): string {
  return [`# ${row.title}`, row.context, row.summary, row.body].filter(Boolean).join("\n\n");
}

export interface AiSearchProviderOptions {
  instance: AiSearchInstance;
  bucket: SearchBucket;
  /** The FTS5 index's database: hits are checked against it. */
  sql: SqlDriver;
}

/** Every key under `prefix` (with custom metadata when `withMetadata`). */
async function listAll(bucket: SearchBucket, prefix: string, withMetadata = false) {
  const out: { key: string; customMetadata?: Record<string, string> }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {}),
      ...(withMetadata ? { include: ["customMetadata" as const] } : {}),
    });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function deleteKeys(bucket: SearchBucket, keys: readonly string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_MAX)
    await bucket.delete(keys.slice(i, i + DELETE_MAX));
}

/** The keys a plan removes before writing its rows (whole site, kinds, or nodes). */
async function staleKeys(bucket: SearchBucket, siteId: string, plan: SearchPlan) {
  const folder = siteFolder(siteId);
  if (plan.full) return (await listAll(bucket, folder)).map((o) => o.key);
  const kinds = new Set<string>(plan.removeKinds ?? []);
  const byKind =
    kinds.size > 0
      ? (await listAll(bucket, folder, true))
          .filter((o) => kinds.has(o.customMetadata?.kind ?? ""))
          .map((o) => o.key)
      : [];
  const byNode: string[] = [];
  for (const id of new Set(plan.remove))
    byNode.push(...(await listAll(bucket, `${folder}${id}/`)).map((o) => o.key));
  return [...new Set([...byKind, ...byNode])];
}

/** The AI Search provider alone (semantic); `hybridProvider` puts FTS5 next to it. */
export function cloudflareAiSearchProvider(options: AiSearchProviderOptions): SearchProvider {
  const { instance, bucket, sql } = options;
  return {
    id: AI_SEARCH_PROVIDER,
    capabilities: { semantic: true, answer: false },
    async sync(siteId, plan) {
      await deleteKeys(bucket, await staleKeys(bucket, siteId, plan));
      for (const row of plan.rows)
        await bucket.put(objectKey(siteId, row), objectText(row), {
          httpMetadata: { contentType: "text/markdown; charset=utf-8" },
          customMetadata: { locale: row.locale, kind: row.kind },
        });
    },
    async search(request) {
      const { perPage, page } = searchPaging(request);
      const q = request.query.trim();
      const state = await searchState(sql, request.siteId);
      const stale = request.snapshotId !== undefined && state?.snapshotId !== request.snapshotId;
      const empty: SearchResults = {
        query: q,
        hits: [],
        total: 0,
        page,
        pages: 0,
        perPage,
        stale,
        provider: AI_SEARCH_PROVIDER,
      };
      if (!q) return empty;
      const kinds = searchKinds(request.kinds);
      const folder = siteFolder(request.siteId);
      const answer = await instance.search({
        query: q,
        ai_search_options: {
          retrieval: {
            max_num_results: AI_SEARCH_CHUNKS,
            filters: {
              folder: { $gte: folder, $lt: `${folder.slice(0, -1)}0` },
              locale: request.locale,
              ...(kinds.length < 4 ? { kind: { $in: kinds } } : {}),
            },
          },
        },
      });
      // Best chunk first; one hit per node, with the text of its best chunk.
      const best = new Map<string, string>();
      for (const chunk of [...(answer.chunks ?? [])].sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0),
      )) {
        const node = nodeOf(chunk.item?.key);
        if (node && !best.has(node)) best.set(node, chunk.text ?? "");
      }
      const live = await liveHits(sql, request.siteId, [...best.keys()], request);
      const hits: SearchHit[] = [...best.entries()].flatMap(([node, text]) => {
        const hit = live.get(node);
        return hit ? [{ ...hit, snippet: markedSnippet(text.replace(/^#.*\n+/, ""), q) }] : [];
      });
      const pages = Math.ceil(hits.length / perPage);
      return {
        ...empty,
        hits: hits.slice((page - 1) * perPage, page * perPage),
        total: hits.length,
        pages,
      };
    },
  };
}

/** Reciprocal-rank constant: how much the top ranks of each list count over the rest. */
const RRF_K = 60;

/**
 * FTS5 and a semantic provider merged by reciprocal rank (RFC-0029 §3 "Hybrid"). Both are asked for
 * the first `page × perPage` hits; a node both find adds both ranks. FTS5's snippet wins (it marks
 * the reader's words in the indexed text). When the semantic side fails, FTS5 answers alone and
 * `onError` hears why; past `allow` (the budget), the semantic side is not asked at all.
 */
export function hybridProvider(
  keyword: SearchProvider,
  semantic: SearchProvider,
  options: {
    allow?: (request: SearchRequest) => Promise<boolean>;
    onError?: (error: unknown) => void;
  } = {},
): SearchProvider {
  return {
    id: "hybrid",
    capabilities: semantic.capabilities,
    async sync(siteId, plan) {
      await keyword.sync?.(siteId, plan);
      await semantic.sync?.(siteId, plan);
    },
    async search(request) {
      const { perPage, page } = searchPaging(request);
      const want = Math.min(50, page * perPage);
      const ask = { ...request, page: 1, perPage: want };
      const allowed = options.allow ? await options.allow(request) : true;
      const [words, meaning] = await Promise.all([
        keyword.search(ask),
        allowed
          ? semantic.search(ask).catch((e: unknown) => {
              options.onError?.(e);
              return undefined;
            })
          : Promise.resolve(undefined),
      ]);
      // Beyond what both were asked for, or without the semantic side, FTS5 pages on its own.
      if (!meaning || page * perPage > want)
        return page === 1 && want === perPage ? words : keyword.search(request);
      const score = new Map<string, { hit: SearchHit; score: number }>();
      const add = (hits: readonly SearchHit[]) =>
        hits.forEach((hit, rank) => {
          const seen = score.get(hit.nodeId);
          score.set(hit.nodeId, {
            hit: seen?.hit ?? hit,
            score: (seen?.score ?? 0) + 1 / (RRF_K + rank + 1),
          });
        });
      add(words.hits);
      add(meaning.hits);
      const merged = [...score.values()].sort((a, b) => b.score - a.score).map((x) => x.hit);
      const onlySemantic = merged.filter(
        (h) => !words.hits.some((w) => w.nodeId === h.nodeId),
      ).length;
      const total = words.total + onlySemantic;
      return {
        query: words.query,
        hits: merged.slice((page - 1) * perPage, page * perPage),
        total,
        page,
        pages: Math.ceil(total / perPage),
        perPage,
        stale: words.stale,
        provider: "hybrid",
      };
    },
  };
}

/**
 * Counts one semantic call for the deployment in the UTC month of `now`; false once the month's
 * calls pass `limit`. Cloudflare's quota is per account and month (1,000 semantic queries
 * included), so the count is too, across every site of the deployment. A call is counted either
 * way, so the count says how often readers asked.
 */
export async function takeSearchCall(
  sql: SqlDriver,
  options: { now: number; limit: number },
): Promise<boolean> {
  const period = new Date(options.now).toISOString().slice(0, 7);
  const row = await sql.get<{ calls: number }>(
    `INSERT INTO search_quota (period, calls) VALUES (?, 1)
ON CONFLICT (period) DO UPDATE SET calls = calls + 1 RETURNING calls`,
    [period],
  );
  return (row?.calls ?? 1) <= options.limit;
}

/** What a Worker's environment carries for the provider (both Workers get the same). */
export interface AiSearchEnv {
  /** `cloudflare-ai-search` turns it on; anything else (or nothing) keeps FTS5 alone. */
  CLOUDHAL_SEARCH_PROVIDER?: string;
  /** Semantic calls per UTC month for the deployment (default `AI_SEARCH_MONTHLY_LIMIT`). */
  CLOUDHAL_SEARCH_MONTHLY_LIMIT?: string;
  AI_SEARCH?: AiSearchInstance;
  SEARCH_BUCKET?: SearchBucket;
}

/**
 * The semantic queries Cloudflare AI Search includes per account and month (checked 2026-10-18,
 * billing from 2026-11-01): the default keeps a deployment inside the free allowance, so neither
 * Workers Free nor the $5 Workers Paid plan pays for search. Large sites raise it in
 * `cloudhal.json` (`search.monthlyLimit`).
 */
export const AI_SEARCH_MONTHLY_LIMIT = 1000;

/**
 * The store's provider from a Worker's environment: FTS5 merged with AI Search when the deployment
 * turns it on and both bindings are there, else undefined (the store keeps FTS5 alone).
 */
export function searchProviderFromEnv(
  env: AiSearchEnv,
  sql: SqlDriver,
  options: { onError?: (error: unknown) => void } = {},
): SearchProvider | undefined {
  if (env.CLOUDHAL_SEARCH_PROVIDER !== AI_SEARCH_PROVIDER || !env.AI_SEARCH || !env.SEARCH_BUCKET)
    return undefined;
  const set = Number(env.CLOUDHAL_SEARCH_MONTHLY_LIMIT ?? AI_SEARCH_MONTHLY_LIMIT);
  const limit = Number.isInteger(set) && set >= 0 ? set : AI_SEARCH_MONTHLY_LIMIT;
  return hybridProvider(
    fts5Provider(sql),
    cloudflareAiSearchProvider({ instance: env.AI_SEARCH, bucket: env.SEARCH_BUCKET, sql }),
    {
      allow: (r) => takeSearchCall(sql, { now: r.now, limit }),
      ...(options.onError ? { onError: options.onError } : {}),
    },
  );
}
