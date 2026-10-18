/**
 * `cloudhal.json` `search` (RFC-0029 §3): the deployment's search provider. Absent, FTS5 alone.
 *
 * ```json
 * "search": { "provider": "cloudflare-ai-search", "instance": "newsroom-search", "monthlyLimit": 1000 }
 * ```
 *
 * - `instance`: the AI Search instance (it must exist before the deploy, its data source the R2
 *   bucket below, with the text custom metadata fields `locale` and `kind`).
 * - `bucket`: the R2 bucket the deployment mirrors published content into (default
 *   `<name>-search`; `cloudhal deploy` creates it).
 * - `monthlyLimit`: semantic calls per UTC month for the whole deployment, then FTS5 alone until
 *   the month ends. Default 1000: the semantic queries Cloudflare includes per account and month,
 *   so Workers Free and the $5 Workers Paid plan pay nothing for search. Large sites raise it;
 *   deployments sharing one Cloudflare account share the 1,000 and should split it.
 */
export interface SearchConfig {
  readonly provider: "cloudflare-ai-search";
  readonly instance: string;
  readonly bucket?: string;
  readonly monthlyLimit?: number;
}

/** AI Search instance and R2 bucket names: lower-case letters, digits and hyphens. */
const RESOURCE_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Leniently parsed: without a known provider and a valid instance name, nothing (FTS5 alone). */
export function parseSearchConfig(input: unknown): SearchConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  if (o.provider !== "cloudflare-ai-search") return undefined;
  if (typeof o.instance !== "string" || !RESOURCE_NAME.test(o.instance)) return undefined;
  return {
    provider: "cloudflare-ai-search",
    instance: o.instance,
    ...(typeof o.bucket === "string" && RESOURCE_NAME.test(o.bucket) ? { bucket: o.bucket } : {}),
    ...(Number.isInteger(o.monthlyLimit) && (o.monthlyLimit as number) >= 0
      ? { monthlyLimit: o.monthlyLimit as number }
      : {}),
  };
}
