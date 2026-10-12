/**
 * The "Views · 30 days" column of the Articles and Pages lists (RFC-0006 §10.2, DESIGN.md §2v):
 * one cached `top/node` query for the site, shared by both lists, read per row. The column is
 * left out for people without `analytics.read` (no request), while analytics are unknown, off for
 * the deployment or the site, unreadable (`reader: "none"`), or when the query fails — the lists
 * do not depend on it.
 */
import { SkeletonLine, Table, Text, Tooltip } from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import {
  LIST_VIEWS_LIMIT,
  LIST_VIEWS_RANGE,
  type ListViews,
  listViews,
  viewsOf,
} from "../lib/list-views.ts";
import { useAnalyticsCard } from "./useAnalyticsCard.ts";

/** `undefined`: no column; `{ views: undefined }`: the column, still loading. */
export type ListViewsColumn = { views: ListViews | undefined } | undefined;

export function useListViews(siteId: string): ListViewsColumn {
  const card = useAnalyticsCard(siteId);
  const shown = card !== null && card.availability === "on" && card.reason === undefined;
  const top = useQuery({
    queryKey: ["analytics", siteId, "top", "node", LIST_VIEWS_RANGE, LIST_VIEWS_LIMIT],
    queryFn: () => api.analytics.top(siteId, "node", { range: LIST_VIEWS_RANGE }, LIST_VIEWS_LIMIT),
    enabled: shown,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const views = useMemo(() => (top.data ? listViews(top.data.data.rows) : undefined), [top.data]);
  if (!shown || top.isError) return undefined;
  return { views };
}

export function ListViewsHead() {
  const t = useT();
  return (
    <Table.Head className="text-right whitespace-nowrap">
      {t("readers.listColumn.title")}
    </Table.Head>
  );
}

export function ListViewsCell({ views, nodeId }: { views: ListViews | undefined; nodeId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  if (!views)
    return (
      <Table.Cell className="text-right">
        <SkeletonLine minWidth={40} maxWidth={40} />
      </Table.Cell>
    );
  const n = viewsOf(views, nodeId);
  return (
    <Table.Cell className="text-right whitespace-nowrap tabular-nums" data-testid="views-cell">
      {n === undefined ? (
        <Tooltip content={t("readers.listColumn.notTop", { count: views.ranked })}>
          <Text variant="secondary" as="span">
            <span aria-hidden>—</span>
            <span className="sr-only">
              {t("readers.listColumn.notTop", { count: views.ranked })}
            </span>
          </Text>
        </Tooltip>
      ) : (
        <Text as="span">{number.format(n)}</Text>
      )}
    </Table.Cell>
  );
}
