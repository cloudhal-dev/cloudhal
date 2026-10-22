/**
 * Where an article lives on the site: its collection's permalink with the slug filled in
 * (RFC-0038, core-ts `entryPath`; `/<collection>/<slug>` while the site sets none). The site comes
 * from the shared `["site", siteId]` query; until it loads, paths use the default template.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { entryPath, type PermalinkSite } from "@cloudhal/core-ts/permalinks";
import { Text } from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { currentSiteId } from "./useMe.ts";

/** The site as `entryPath` reads it (undefined while loading). */
export function useSitePermalinks(siteId: string): PermalinkSite | undefined {
  return useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: siteId !== "",
  }).data;
}

/** An article's path in mono text; `siteId` defaults to the site the Studio URL is about. */
export function EntryPath({
  siteId = currentSiteId() ?? "",
  entry,
  truncate = false,
}: {
  siteId?: string;
  entry: Pick<ContentEntry, "collection" | "slug">;
  truncate?: boolean;
}) {
  const site = useSitePermalinks(siteId);
  return (
    <Text variant="mono-secondary" as="span" truncate={truncate}>
      {entryPath(site, entry)}
    </Text>
  );
}
