import { Badge, Tooltip } from "@cloudhal/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { formatNumber, listOf, type TFunction, useI18n } from "../i18n/index.tsx";
import { api, onApiWrite, type PendingChanges } from "../lib/api.ts";

type NodeKind = keyof PendingChanges["byKind"];

export const pendingKey = (siteId: string) => ["pending", siteId] as const;

/** Writes that change nothing a publish would carry (draft renders, preview links). */
const NOT_CONTENT = /\/(preview|preview-fragment|preview-links)$/;

/**
 * What a publish would carry (`GET …/pending`), for the badge beside Publish. Every successful
 * write to this site through the API client invalidates it (`onApiWrite`), so saves, publishes,
 * rollbacks, approvals, media, menus, redirects, settings and taxonomy all refresh it without each
 * screen knowing; agents' changes show on the next window focus or after 30 s.
 */
export function usePendingChanges(siteId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const prefix = `/api/sites/${siteId}`;
    return onApiWrite((path) => {
      if ((path === prefix || path.startsWith(`${prefix}/`)) && !NOT_CONTENT.test(path))
        void qc.invalidateQueries({ queryKey: pendingKey(siteId) });
    });
  }, [qc, siteId]);
  return useQuery({
    queryKey: pendingKey(siteId),
    queryFn: () => api.sites.pending(siteId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/** "3 changes aren't live yet · 2 articles and 1 page" (or the never-published sentence). */
export function pendingText(t: TFunction, pending: PendingChanges): string {
  const kinds = listOf(
    (Object.entries(pending.byKind) as [NodeKind, number][]).map(([kind, count]) =>
      t("publishing.pendingKind", { kind, count }),
    ),
  );
  return pending.live
    ? t("publishing.pendingSummary", { count: pending.counts.total, kinds })
    : t("publishing.firstPublish", { kinds });
}

/**
 * The badge beside Publish (DESIGN.md §2d): the number of changes a publish would carry, or "Not
 * published" for a site that never went live, with the breakdown in its tooltip; phones show the
 * number only. Nothing when everything is live.
 */
export function PendingBadge({ pending }: { pending: PendingChanges | undefined }) {
  const { t, locale } = useI18n();
  if (!pending || (pending.live && pending.counts.total === 0)) return null;
  return (
    <Tooltip content={pendingText(t, pending)} side="bottom">
      <Badge variant="warning" appearance="dot">
        {/* The top bar is full on phones: the number alone, the words from `sm` up. */}
        <span className="sm:hidden">{formatNumber(locale, pending.counts.total)}</span>
        <span className="max-sm:hidden">
          {pending.live
            ? t("publishing.pending", { count: pending.counts.total })
            : t("publishing.notPublished")}
        </span>
      </Badge>
    </Tooltip>
  );
}
