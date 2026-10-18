import type { SiteSearchHit, SiteSearchKind, SiteSearchResult } from "@cloudhal/core-ts";
import { query, request } from "./http.ts";

export type { SiteSearchHit, SiteSearchKind, SiteSearchResult };

/** RFC-0029 §7: the command palette's search over the site's own nodes, drafts included. */
export const searchApi = {
  site: (siteId: string, q: string, options: { kinds?: SiteSearchKind[]; limit?: number } = {}) =>
    request<SiteSearchResult>(
      `/api/sites/${siteId}/search${query({ q, kinds: options.kinds?.join(","), limit: options.limit })}`,
    ),
};
