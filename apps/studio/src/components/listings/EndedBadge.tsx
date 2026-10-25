import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import { ToggletipBadge } from "@cloudhal/ui";
import { CalendarX } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate, useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { zoneCity } from "../../lib/schedules.ts";
import { useNow } from "../useNow.ts";
import { endedByRule, gateZone, originalIdOf } from "./ended-rule.ts";

/**
 * The original a translation reads its non-localized date from: the newer of two caches. The
 * collection list's unpaged `["entries", siteId, collection]` is read without ever fetching it,
 * and only while it is not invalidated (while it loads, this waits rather than asking once per
 * row); the shared `["entry", siteId, group]` query, which the editor's Fields card uses and a
 * save writes, is asked for otherwise. So a list left stale by a save is never preferred to the
 * saved original, and the editor asks once.
 */
function useGateOriginal(siteId: string, entry: ContentEntry): ContentEntry | undefined {
  const qc = useQueryClient();
  const id = originalIdOf(entry);
  const listKey = ["entries", siteId, entry.collection];
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => api.entries.list(siteId, entry.collection),
    enabled: false,
  });
  const fresh = qc.getQueryState(listKey)?.isInvalidated === false;
  const listed = id === undefined || !fresh ? undefined : list.data?.find((e) => e.id === id);
  const one = useQuery({
    queryKey: ["entry", siteId, id],
    queryFn: () => api.entries.get(siteId, id as string),
    enabled: id !== undefined && !listed && list.fetchStatus === "idle",
  });
  if (id === undefined) return undefined;
  if (!listed) return one.data;
  return one.data && one.dataUpdatedAt >= list.dataUpdatedAt ? one.data : listed;
}

/**
 * "Ended (collection rule)" beside a published entry's status (RFC-0042 §3.3, DESIGN.md §2ah):
 * the entry's collection expiry has passed, so the site has left it out of lists (`unlist`) or
 * answers "not found" (`hide`) while it is still published. The toggletip names the date field,
 * the instant in the site's zone and what the site does. Computed from the saved site settings
 * and the saved entry (the editor passes `query.data`, never the unsaved draft), re-checked every
 * minute. Loaded with its `listings` words only for collections that have an expiry.
 */
export function EndedBadge({
  siteId,
  site,
  entry,
}: {
  siteId: string;
  site: Site;
  entry: ContentEntry;
}) {
  const { t, locale } = useI18n("listings");
  const now = useNow(60_000);
  const original = useGateOriginal(siteId, entry);
  const ended = endedByRule(site, entry, original, now);
  if (!ended) return null;
  const { gate, fieldKey, field } = ended;
  const zone = gateZone(site);
  const reason = t("listings.ended.reason", {
    action: gate.action,
    time: formatDate(locale, gate.at, { dateStyle: "long", timeStyle: "short", timeZone: zone }),
    zone: zoneCity(zone),
    field: field ? fieldLabel(field, locale, site.defaultLocale) : fieldKey,
  });
  // Kumo's Badge does not forward data attributes; the wrapper carries the action for tests.
  return (
    <span data-ended-rule={gate.action} className="inline-flex">
      <ToggletipBadge
        variant="secondary"
        icon={<CalendarX size={14} aria-hidden />}
        label={t("listings.ended.badge")}
        reason={reason}
      />
    </span>
  );
}
