/** RFC-0040: the site's collection registry (declared, inferred from entries, and `posts`). */
import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import type { CollectionInfo } from "@cloudhal/core-ts/collections";
import { json, request } from "./http.ts";

export type { CollectionInfo };

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
  /** Undeclares a collection without entries (409 `collection_in_use` otherwise). */
  remove: (site: Pick<Site, "id" | "rev">, key: string) =>
    request<{ site: Site }>(`${base(site.id)}/${encodeURIComponent(key)}?rev=${site.rev}`, {
      method: "DELETE",
    }),
};
