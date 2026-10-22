import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

/**
 * Query keys of the taxonomy data, so every screen shares (and invalidates) the same cache. They
 * live apart from `Taxonomy.tsx` so the shell (the sidebar's count, Publish's invalidation) does
 * not load the taxonomy model and its badges.
 */
export const taxonomyKeys = {
  taxonomies: (siteId: string) => ["taxonomies", siteId] as const,
  terms: (siteId: string) => ["terms", siteId] as const,
  redirects: (siteId: string) => ["redirects", siteId] as const,
};

/**
 * Proposed terms waiting for a person (RFC-0002 §8), for the sidebar's badge: the same two queries
 * `useTaxonomyData` reads, so they share its cache.
 */
export function useProposedTermsCount(siteId: string): number {
  const taxonomies = useQuery({
    queryKey: taxonomyKeys.taxonomies(siteId),
    queryFn: () => api.taxonomies.list(siteId),
  });
  const terms = useQuery({
    queryKey: taxonomyKeys.terms(siteId),
    queryFn: () => api.terms.list(siteId),
    enabled: (taxonomies.data?.length ?? 0) > 0,
  });
  return (terms.data ?? []).filter((i) => i.term.status === "proposed").length;
}
