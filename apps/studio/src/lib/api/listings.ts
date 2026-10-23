/**
 * RFC-0042 (collections stage 3): the entry list by list fields (`where`, `orderBy`, `limit`,
 * `cursor`) and the structured-data preview. Imported directly by the lazy listing screens and
 * cards, not through the `api` barrel, so the shell never carries it (`LAZY_ONLY`).
 */
import type {
  ContentEntry,
  FieldCondition,
  FieldOrder,
  PublishStatus,
} from "@cloudhal/core-contracts";
import type { StructuredDataIssue } from "@cloudhal/core-ts/structured-data";
import { query, request } from "./http.ts";

export interface EntryFieldQuery {
  collection: string;
  /** RFC-0002 term filter (category / tag facets), ANDed with `where`. */
  filter?: string | undefined;
  where?: readonly FieldCondition[] | undefined;
  orderBy?: FieldOrder | undefined;
  status?: readonly PublishStatus[] | undefined;
  /** 1–100 entries per page. */
  limit: number;
  /** The previous page's `nextCursor`. */
  cursor?: string | undefined;
}

/** One page of `GET …/entries` with `limit`. */
export interface EntryPage {
  entries: ContentEntry[];
  total: number;
  nextCursor?: string;
}

/** `GET …/entries/:id/structured-data` (MCP's `preview_structured_data`). */
export interface StructuredDataPreview {
  preset: string | null;
  origin: string;
  document: object | null;
  issues: StructuredDataIssue[];
}

export const listingsApi = {
  /** A page of the collection's entries filtered and ordered by its list fields (422 `invalid_query`). */
  entries: (siteId: string, q: EntryFieldQuery) =>
    request<EntryPage>(
      `/api/sites/${siteId}/entries${query({
        collection: q.collection,
        filter: q.filter,
        where: q.where?.length ? JSON.stringify(q.where) : undefined,
        orderBy: q.orderBy ? JSON.stringify(q.orderBy) : undefined,
        status: q.status?.join(","),
        limit: q.limit,
        cursor: q.cursor,
      })}`,
    ),
  structuredData: (siteId: string, entryId: string) =>
    request<StructuredDataPreview>(
      `/api/sites/${siteId}/entries/${encodeURIComponent(entryId)}/structured-data`,
    ),
};
