/** RFC-0040: the site's collection registry (declared, inferred from entries, and `posts`). */
import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import type {
  FieldOperationResult,
  FieldOperationStatus,
  FieldRevertResult,
} from "@cloudhal/core-ts";
import type { CollectionInfo } from "@cloudhal/core-ts/collections";
import { json, request } from "./http.ts";

export type { CollectionInfo, FieldOperationResult, FieldOperationStatus, FieldRevertResult };

/** RFC-0041 §6: what Studio asks of a field operation (the API's body without `collection`). */
export type FieldOperationRequest =
  | { op: "rename_field"; from: string; to: string }
  | {
      op: "change_field_type";
      key: string;
      type: string;
      options?: unknown[];
      multiple?: boolean;
      onInvalid?: "clear";
    }
  | { op: "set_field_localized"; key: string; localized: boolean }
  | { op: "remove_field"; key: string };

const base = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}/collections`;

export const collectionsApi = {
  list: (siteId: string) => request<CollectionInfo[]>(base(siteId)),
  /** Declares `key` or replaces its settings (`site:settings`); `rev` is the site's. */
  save: (
    site: Pick<Site, "id" | "rev">,
    key: string,
    settings: CollectionSettings,
    dryRun = false,
  ) =>
    request<{ site: Site; dryRun: boolean }>(
      `${base(site.id)}/${encodeURIComponent(key)}${dryRun ? "?dryRun=1" : ""}`,
      { method: "PUT", ...json({ settings, rev: site.rev }) },
    ),
  /** RFC-0041 §6: runs a field operation (or only its dry run); `done: false` → `continueField`. */
  fieldOperation: (
    siteId: string,
    key: string,
    body: FieldOperationRequest & { dryRun?: boolean },
  ) =>
    request<FieldOperationResult>(`${base(siteId)}/${encodeURIComponent(key)}/fields/operations`, {
      method: "POST",
      ...json(body),
    }),
  /** Resumes an operation that answered `done: false` (or was interrupted). */
  continueField: (siteId: string, key: string, operationId: string) =>
    request<FieldOperationResult>(
      `${base(siteId)}/${encodeURIComponent(key)}/fields/operations?continue=${encodeURIComponent(operationId)}`,
      { method: "POST", ...json({}) },
    ),
  fieldStatus: (siteId: string, key: string, operationId: string) =>
    request<FieldOperationStatus>(
      `${base(siteId)}/${encodeURIComponent(key)}/fields/operations/${encodeURIComponent(operationId)}`,
    ),
  /** Restores the values before the operation; call again while `done: false`. */
  revertField: (siteId: string, key: string, operationId: string) =>
    request<FieldRevertResult>(
      `${base(siteId)}/${encodeURIComponent(key)}/fields/operations/${encodeURIComponent(operationId)}/revert`,
      { method: "POST", ...json({}) },
    ),
  /** Undeclares a collection without entries (409 `collection_in_use` otherwise). */
  remove: (site: Pick<Site, "id" | "rev">, key: string) =>
    request<{ site: Site }>(`${base(site.id)}/${encodeURIComponent(key)}?rev=${site.rev}`, {
      method: "DELETE",
    }),
};
