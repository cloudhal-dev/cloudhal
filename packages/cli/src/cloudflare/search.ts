/**
 * The search provider's part of both Workers' configs (RFC-0029 §3): the AI Search instance
 * binding (`AI_SEARCH`), the R2 bucket it reads (`SEARCH_BUCKET`, also written by publishes on the
 * admin Worker) and the vars the runtime reads (`searchProviderFromEnv` in `@cloudhal/core-ts`).
 */
import type { SearchConfig } from "../config-search.ts";

export interface SearchDeployment {
  readonly instance: string;
  readonly bucket: string;
  readonly dailyLimit: number;
}

export const AI_SEARCH_BINDING = "AI_SEARCH";
export const SEARCH_BUCKET_BINDING = "SEARCH_BUCKET";
const DEFAULT_DAILY_LIMIT = 1000;

/** The deployment's search resources, or undefined for FTS5 alone. */
export function searchDeploymentOf(
  search: SearchConfig | undefined,
  name: string,
): SearchDeployment | undefined {
  if (!search) return undefined;
  return {
    instance: search.instance,
    bucket: search.bucket ?? `${name}-search`,
    dailyLimit: search.dailyLimit ?? DEFAULT_DAILY_LIMIT,
  };
}

/** The extra R2 bucket (next to `BLOBS`). */
export const searchBuckets = (s: SearchDeployment | undefined) =>
  s ? [{ binding: SEARCH_BUCKET_BINDING, bucket_name: s.bucket }] : [];

/** The instance binding (wrangler `ai_search`; the instance must exist at deploy time). */
export const searchBinding = (s: SearchDeployment | undefined) =>
  s ? { ai_search: [{ binding: AI_SEARCH_BINDING, instance_name: s.instance }] } : {};

/** The vars `searchProviderFromEnv` reads. */
export const searchVars = (s: SearchDeployment | undefined) =>
  s
    ? {
        CLOUDHAL_SEARCH_PROVIDER: "cloudflare-ai-search",
        CLOUDHAL_SEARCH_DAILY_LIMIT: String(s.dailyLimit),
      }
    : {};
