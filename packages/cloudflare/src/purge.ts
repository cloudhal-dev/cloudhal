/**
 * Purging the site Worker's edge cache after a publish or rollback (ADR-0012, RFC-0002 §7).
 *
 * The admin Worker cannot purge the site Worker's cache itself (purges are scoped to the Worker
 * that cached), so it calls the site Worker's `POST /__cloudhal/purge` over the `SITE` service
 * binding. Which tags: `SiteGraphStore.planCachePurge`, from the diff between the snapshot that was
 * live and the new one — an edited article purges that article and the lists it appears on, not
 * the whole site. Everything is purged when the plan says so (first publish, diff unavailable or
 * too large) or when a tag purge fails.
 */
import type { CachePurgePlan, PublishChange } from "@cloudhal/core-ts";

/**
 * Tags per purge request: Cloudflare accepts at most 100 tags in one purge, and Workers Cache
 * always uses the Free-tier purge limits (5 requests per minute, bursts of 25):
 * https://developers.cloudflare.com/cache/how-to/purge-cache/#hostname-tag-prefix-url-and-purge-everything-limits
 * https://developers.cloudflare.com/workers/cache/purge/
 */
export const PURGE_TAGS_PER_REQUEST = 100;
/**
 * Requests one publish may spend on tag purges. Beyond that one "purge everything" request is
 * cheaper on the rate limit than many tag requests, so the plan falls back to it.
 */
export const PURGE_MAX_REQUESTS = 3;

/** `fetch` of the site Worker (the `SITE` service binding in production). */
export type SiteFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface PurgeSiteCacheOptions {
  readonly fetch: SiteFetch;
  /** The shared `CLOUDHAL_PURGE_TOKEN`. */
  readonly token: string;
  readonly store: {
    planCachePurge(
      change: PublishChange,
      options?: { maxTags?: number; maxReads?: number },
    ): Promise<CachePurgePlan>;
  };
  readonly change: PublishChange;
  readonly log?: (line: string) => void;
}

export interface PurgeSiteCacheResult {
  /** `tags`: only these tags were purged; `everything`: the whole cache; `none`: nothing changed. */
  readonly mode: "tags" | "everything" | "none";
  readonly tags: readonly string[];
  readonly requests: number;
  /** Why everything was purged, when it was. */
  readonly reason?: string;
}

const PURGE_URL = "https://site.internal/__cloudhal/purge";

const summary = (why: readonly string[]) =>
  why.length > 3 ? `${why.slice(0, 3).join("; ")}; +${why.length - 3} more` : why.join("; ");

/** Purges what a publish changed, in batches the site Worker and Cloudflare accept. */
export async function purgeSiteCache(o: PurgeSiteCacheOptions): Promise<PurgeSiteCacheResult> {
  const log = o.log ?? (() => {});
  const auth = { authorization: `Bearer ${o.token}` };
  let requests = 0;
  const everything = async (reason: string): Promise<PurgeSiteCacheResult> => {
    requests++;
    const res = await o.fetch(PURGE_URL, { method: "POST", headers: auth });
    log(`purge everything (${reason}): ${res.status} ${await res.text()}`);
    if (!res.ok) throw new Error(`purge everything failed: ${res.status}`);
    return { mode: "everything", tags: [], requests, reason };
  };

  const plan = await o.store.planCachePurge(o.change, {
    maxTags: PURGE_TAGS_PER_REQUEST * PURGE_MAX_REQUESTS,
  });
  if (plan.mode === "everything") return everything(plan.reason);
  if (plan.tags.length === 0) {
    log("purge: the new snapshot renders the same site; nothing to purge");
    return { mode: "none", tags: [], requests: 0 };
  }
  for (let i = 0; i < plan.tags.length; i += PURGE_TAGS_PER_REQUEST) {
    const batch = plan.tags.slice(i, i + PURGE_TAGS_PER_REQUEST);
    requests++;
    const res = await o.fetch(PURGE_URL, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ tags: batch }),
    });
    log(`purge ${batch.length} tag(s) (${summary(plan.why)}): ${res.status} ${await res.text()}`);
    // A partial tag purge would leave stale pages behind: purge everything instead.
    if (!res.ok) return everything(`tag purge failed with ${res.status}`);
  }
  return { mode: "tags", tags: plan.tags, requests };
}
