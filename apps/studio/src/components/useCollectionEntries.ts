/**
 * A collection list's entries (RFC-0040 §4, RFC-0042 §4): the whole collection newest-updated first,
 * filtered by the category / tag facets — or, while the URL filters or sorts by list fields, one
 * server page at a time (`GET …/entries` with `where`, `orderBy`, `limit`, `cursor`) in the
 * server's order, with previous / next through the cursors seen so far.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listingsApi } from "../lib/api/listings.ts";
import { api } from "../lib/api.ts";
import type { ListingQuery } from "../lib/listing-query.ts";

/** Entries per server page (as the client-side pages). */
export const LISTING_PAGE_SIZE = 25;

export interface ServerPaging {
  page: number;
  perPage: number;
  total: number;
  setPage: (page: number) => void;
}

export function useCollectionEntries({
  siteId,
  collection,
  filter,
  listing,
  enabled,
}: {
  siteId: string;
  collection: string;
  filter: string | undefined;
  listing: ListingQuery;
  enabled: boolean;
}): {
  data: ContentEntry[] | undefined;
  isPending: boolean;
  error: unknown;
  server: ServerPaging | undefined;
} {
  const key = JSON.stringify([filter ?? null, listing.where, listing.orderBy ?? null]);
  // cursors[i] opens page i + 2; going back drops the last one.
  const [cursors, setCursors] = useState<string[]>([]);
  useEffect(() => setCursors([]), [key]);
  const cursor = cursors.at(-1);
  const plain = useQuery({
    queryKey: filter ? ["entries", siteId, collection, filter] : ["entries", siteId, collection],
    queryFn: () => api.entries.list(siteId, { collection, filter }),
    enabled: enabled && !listing.active,
  });
  const paged = useQuery({
    queryKey: ["entries", siteId, collection, "fields", key, cursor ?? ""],
    queryFn: () =>
      listingsApi.entries(siteId, {
        collection,
        filter,
        where: listing.where,
        orderBy: listing.orderBy,
        limit: LISTING_PAGE_SIZE,
        cursor,
      }),
    enabled: enabled && listing.active,
    placeholderData: keepPreviousData,
  });
  if (!listing.active) {
    const sorted = plain.data
      ? [...plain.data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : undefined;
    return { data: sorted, isPending: plain.isPending, error: plain.error, server: undefined };
  }
  const page = cursors.length + 1;
  return {
    data: paged.data?.entries,
    isPending: paged.isPending,
    error: paged.error,
    server: {
      page,
      perPage: LISTING_PAGE_SIZE,
      total: paged.data?.total ?? 0,
      setPage: (to) => {
        if (to < page) setCursors(cursors.slice(0, Math.max(0, to - 1)));
        else if (to === page + 1 && paged.data?.nextCursor)
          setCursors([...cursors, paged.data.nextCursor]);
      },
    },
  };
}
