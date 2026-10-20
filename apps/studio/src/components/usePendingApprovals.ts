import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, isNotEnabled } from "../lib/api.ts";
import {
  APPROVALS_POLL_MS,
  type PendingElevation,
  pendingElevationsByKey,
} from "../lib/approvals.ts";

/** Query key prefix for one site's approvals; invalidate it after a decision. */
export const approvalsKey = (siteId: string) => ["approvals", siteId] as const;

/** The query for one site's pending requests, shared by every surface that shows them. */
const pendingQuery = (siteId: string) => ({
  queryKey: [...approvalsKey(siteId), "pending"],
  queryFn: () => api.approvals.list(siteId, "pending"),
  retry: (count: number, error: unknown) => !isNotEnabled(error) && count < 1,
});

/**
 * The site's pending approvals, polled every 15 s while a component that uses it is mounted
 * (the site shell, so only while the site surface is open). A server without approvals answers
 * 404 once and is not polled again.
 */
export function usePendingApprovals(siteId: string, enabled = true) {
  return useQuery({
    ...pendingQuery(siteId),
    enabled,
    refetchInterval: (query) => (isNotEnabled(query.state.error) ? false : APPROVALS_POLL_MS),
  });
}

/**
 * Agents page (ADR-0016 addendum): which keys' agents are waiting for an elevation, by key id.
 * Requests are filed per site and keys are not, so this reads each site's pending list — the same
 * cached query the site surface polls — and only on servers that report `elevationRequests`. No
 * polling here; deciding a request invalidates these lists.
 */
export function usePendingElevations(): Map<string, PendingElevation> {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const enabled = instance.data?.features.elevationRequests === true;
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list, enabled });
  const siteIds = enabled ? (sites.data ?? []).map((s) => s.id) : [];
  // `combine` is structurally shared, so the map below changes only when a list does.
  const bySite = useQueries({
    queries: siteIds.map((id) => ({ ...pendingQuery(id), enabled })),
    combine: (results) => results.map((r, i) => ({ siteId: siteIds[i] ?? "", items: r.data })),
  });
  return useMemo(() => pendingElevationsByKey(bySite), [bySite]);
}
