import { useQuery } from "@tanstack/react-query";
import { api, isNotEnabled } from "../lib/api.ts";
import { APPROVALS_POLL_MS } from "../lib/approvals.ts";

/** Query key prefix for one site's approvals; invalidate it after a decision. */
export const approvalsKey = (siteId: string) => ["approvals", siteId] as const;

/**
 * The site's pending approvals, polled every 15 s while a component that uses it is mounted
 * (the site shell, so only while the site surface is open). A server without approvals answers
 * 404 once and is not polled again.
 */
export function usePendingApprovals(siteId: string) {
  return useQuery({
    queryKey: [...approvalsKey(siteId), "pending"],
    queryFn: () => api.approvals.list(siteId, "pending"),
    refetchInterval: (query) => (isNotEnabled(query.state.error) ? false : APPROVALS_POLL_MS),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}
