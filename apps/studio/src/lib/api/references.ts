/**
 * RFC-0045 §5 (collections stage 4): the entry picker, the chosen targets' members and an entry's
 * referrers. Imported directly by the lazy field components, not through the `api` barrel, so the
 * shell never carries it (`LAZY_ONLY`).
 */
import type { PublishStatus } from "@cloudhal/core-contracts";
import { query, request } from "./http.ts";

/** An entry as the picker and the reference reads name it (`referenceCard` in core-ts). */
export interface ReferenceCard {
  /** Its translation group id: what a reference stores. */
  groupId: string;
  id: string;
  title: string;
  collection: string;
  status: PublishStatus;
  locale: string;
}

/** `GET …/entries/pick`: at most 20 cards in key order, never archived ones. */
export interface PickPage {
  entries: ReferenceCard[];
  /** Where to continue; absent once every allowed collection was read. */
  cursor?: string;
  /** The server's row budget ended before `limit` matches: ask again with `cursor`. */
  truncated?: true;
}

/** One entry that holds a reference to the group (`listReferrers` in core-ts). */
export interface Referrer extends ReferenceCard {
  /** The field path holding the value: `venue`, `speakers.person`. */
  field: string;
  /** Same-site members of the holder's group that show its value without holding it. */
  shownBy: ReferenceCard[];
}

export interface ReferrersPage {
  groupId: string;
  referrers: Referrer[];
  /** The next page's offset. */
  next?: number;
}

/** Why a published entry's reference will show nothing (`referenceIssues` in core-ts). */
export interface ReferenceIssue {
  entryId: string;
  /** The holder's title. */
  title: string;
  collection: string;
  locale: string;
  /** `fields/venue`, `fields/speakers/1/person`. */
  path: string;
  groupId: string;
  reason: "missing" | "hidden" | "locale";
}

/** The store's `entry_referenced` details: up to 20 published referrers and the total. */
export interface ReferencedDetails {
  group: string;
  referrers: { id: string; title: string; collection: string; field: string }[];
  total: number;
}

export const referencesApi = {
  pick: (
    siteId: string,
    q: { collections: readonly string[]; q: string; locale?: string; cursor?: string },
  ) =>
    request<PickPage>(
      `/api/sites/${siteId}/entries/pick${query({
        collections: q.collections.join(","),
        q: q.q,
        locale: q.locale,
        cursor: q.cursor,
      })}`,
    ),
  /** Each group's members in the site, any status; `[]` for a group with none left. */
  groups: (siteId: string, ids: readonly string[]) =>
    request<{ groups: Record<string, ReferenceCard[]> }>(
      `/api/sites/${siteId}/entries/groups${query({ ids: ids.join(",") })}`,
    ),
  /** What publishing the working copy now would show as nothing: the first 50 and the total. */
  issues: (siteId: string) =>
    request<{ total: number; issues: ReferenceIssue[] }>(
      `/api/sites/${siteId}/entries/reference-issues`,
    ),
  /** Asks the store whether `entry` can be deleted; throws its refusal (`entry_referenced`). */
  deleteCheck: (entry: { siteId: string; id: string; rev: number }) =>
    request<{ dryRun: true }>(
      `/api/sites/${entry.siteId}/entries/${entry.id}${query({ rev: entry.rev, dryRun: 1 })}`,
      { method: "DELETE" },
    ),
  /** The referrers of the entry's group, published holders first. */
  referrers: (siteId: string, entryId: string, page: { limit?: number; offset?: number } = {}) =>
    request<ReferrersPage>(
      `/api/sites/${siteId}/entries/${entryId}/references${query({
        limit: page.limit,
        offset: page.offset,
      })}`,
    ),
};
