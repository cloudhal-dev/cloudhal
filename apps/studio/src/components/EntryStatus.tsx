/**
 * An entry's status badge, followed by "Ended (collection rule)" when its collection's expiry has
 * passed (RFC-0042 §3.3, DESIGN.md §2ah): in the collection list and the entry editor's header.
 * The site comes from the shared `["site", siteId]` query. Only a collection with an expiry loads
 * the badge's chunk and its `listings` words; every other collection shows the status alone.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { withMessages } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { Status } from "./Status.tsx";

const EndedBadge = lazy(() =>
  withMessages(import("./listings/EndedBadge.tsx"), ["listings"]).then((m) => ({
    default: m.EndedBadge,
  })),
);

/**
 * `entry` gives the status word (the editor's draft); `saved` (the saved entry, `entry` by
 * default) decides the collection rule, so a half-typed date does not flip the badge.
 */
export function EntryStatus({
  siteId,
  entry,
  saved = entry,
}: {
  siteId: string;
  entry: ContentEntry;
  saved?: ContentEntry | undefined;
}) {
  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: siteId !== "",
  }).data;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Status status={entry.status} />
      {site?.collections?.[saved.collection]?.expiry && (
        <Suspense fallback={null}>
          <EndedBadge siteId={siteId} site={site} entry={saved} />
        </Suspense>
      )}
    </span>
  );
}
