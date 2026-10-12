import {
  BreakdownMeters,
  LinkButton,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  type StatDelta,
  StatTile,
  StatTileGroup,
  Tabs,
  Text,
} from "@cloudhal/ui";
import { ChartLine, Hourglass, LockSimple, RocketLaunch } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense, useState } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { type AnalyticsFeature, api } from "../lib/api.ts";
import {
  type AnalyticsAvailability,
  analyticsAvailability,
  analyticsHref,
  channelRows,
  DEFAULT_READERS_RANGE,
  everPublished,
  hasNoReaders,
  READERS_RANGES,
  type ReadersRange,
  readersQuery,
  seriesPoints,
} from "../lib/readers.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { useGate, useMe } from "./useMe.ts";

// ECharts reaches only people who see a chart: the editors and the overview load
// `@cloudhal/ui/charts` on first render of a card that has numbers (RFC-0006 §10.4).
const ReadersSummary = lazy(() =>
  import("@cloudhal/ui/charts").then((m) => ({ default: m.ReadersSummary })),
);
const AnalyticsTimeseries = lazy(() =>
  import("@cloudhal/ui/charts").then((m) => ({ default: m.AnalyticsTimeseries })),
);

/** `/api/instance` → `features.analytics`, shared with every gated screen (`["instance"]`). */
function useAnalyticsFeature(): { feature: AnalyticsFeature | undefined; known: boolean } {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { feature: instance.data?.features.analytics, known: !instance.isPending };
}

/**
 * Whether the analytics cards appear and may ask the API: `null` while that is unknown or when
 * analytics are off (for the deployment or this site) — the card is left out; else the
 * availability and the gate. Contributors never call the analytics API (§10.2): the person's
 * abilities must be known first, and the site's status is read only when they may.
 */
function useAnalyticsCard(siteId: string): {
  availability: Exclude<AnalyticsAvailability, "off">;
  reason: string | undefined;
} | null {
  const { feature, known } = useAnalyticsFeature();
  const me = useMe();
  const gate = useGate("analytics.read");
  const availability = analyticsAvailability(feature);
  const status = useQuery({
    queryKey: ["analytics", siteId, "status"],
    queryFn: () => api.analytics.status(siteId),
    enabled: availability === "on" && me.data !== undefined && gate.allowed,
    staleTime: 60_000,
    retry: false,
  });
  if (!known || availability === "off" || me.data === undefined) return null;
  if (!gate.allowed) return { availability, reason: gate.reason };
  if (availability === "on") {
    // An unreadable status does not hide the card: the node query says what went wrong.
    if (status.isPending) return null;
    if (status.data?.settings.enabled === false) return null;
  }
  return { availability, reason: undefined };
}

function NotPermitted({ reason }: { reason: string | undefined }) {
  const t = useT();
  return (
    <SectionEmpty
      icon={<LockSimple size={32} className="text-kumo-inactive" />}
      title={t("readers.states.notPermitted")}
      description={reason}
    />
  );
}

function CantReadYet() {
  const t = useT();
  return (
    <SectionEmpty
      icon={<Hourglass size={32} className="text-kumo-inactive" />}
      title={t("readers.states.cantRead")}
      description={t("readers.states.cantReadHint")}
    />
  );
}

/** What a lazy chart shows while `@cloudhal/ui/charts` loads: the card's own loading lines. */
function ChartsLoading() {
  return (
    <div className="grid gap-3" aria-busy>
      <SkeletonLine minWidth={40} maxWidth={60} />
      <SkeletonLine minWidth={100} maxWidth={100} blockHeight={120} />
      <SkeletonLine minWidth={50} maxWidth={80} />
    </div>
  );
}

export interface ReadersCardProps {
  siteId: string;
  /** The article or page, as saved (not the draft being edited). */
  node: {
    id: string;
    status: string;
    publishedAt?: string | undefined;
    createdAt: string;
  };
  kind: "article" | "page";
}

/**
 * The editors' "Readers" card (RFC-0006 §10.2, DESIGN.md §2v): `SectionCard` with a segmented
 * 7 days | 30 days | All time `Tabs` around `ReadersSummary`. Left out when analytics are off;
 * the reason for Contributors; a quiet "can't read yet" without a reader; its own states for a
 * node never published and one without readers.
 */
export function ReadersCard({ siteId, node, kind }: ReadersCardProps) {
  const t = useT();
  const { locale } = useI18n();
  const card = useAnalyticsCard(siteId);
  const [range, setRange] = useState<ReadersRange>(DEFAULT_READERS_RANGE);
  const published = everPublished(node);
  const readable = card !== null && card.reason === undefined && card.availability === "on";
  const { query, compare } = readersQuery(range, node.publishedAt ?? node.createdAt);
  const stats = useQuery({
    queryKey: ["analytics", siteId, "node", node.id, range],
    queryFn: () => api.analytics.node(siteId, node.id, query, compare),
    enabled: readable && published,
    staleTime: 60_000,
    retry: false,
  });
  if (card === null) return null;

  let body: ReactNode;
  if (card.reason !== undefined) body = <NotPermitted reason={card.reason} />;
  else if (card.availability === "unreadable") body = <CantReadYet />;
  else if (!published)
    body = (
      <SectionEmpty
        icon={<RocketLaunch size={32} className="text-kumo-inactive" />}
        title={t(`readers.states.neverPublished.${kind}`)}
        description={t("readers.states.neverPublishedHint")}
      />
    );
  else if (stats.isError)
    body = (
      <ErrorBanner
        error={stats.error}
        onRetry={() => void stats.refetch()}
        retrying={stats.isFetching}
      />
    );
  else {
    const data = stats.data?.data;
    const period = t(`readers.periods.${range}`);
    const total = data?.summary.pageviews ?? 0;
    const days = range === "7d" ? 7 : 30;
    const redirects =
      data && data.redirectHits > 0
        ? range === "all"
          ? t("readers.redirectsAll", {
              count: new Intl.NumberFormat(locale).format(data.redirectHits),
            })
          : t("readers.redirects", {
              count: new Intl.NumberFormat(locale).format(data.redirectHits),
              period,
            })
        : undefined;
    body = (
      <div className="grid min-w-0 gap-4">
        <Suspense fallback={<ChartsLoading />}>
          <ReadersSummary
            locale={locale}
            labels={{
              pageviews: t("readers.pageviews"),
              visits: t("readers.visits"),
              figures: t("readers.figures", { period }),
              chart: {
                description: t("readers.chart.description", {
                  period,
                  total: new Intl.NumberFormat(locale).format(total),
                }),
                timezone: t("readers.chart.timezone"),
                showTable: t("readers.chart.showTable"),
                showChart: t("readers.chart.showChart"),
                time: t("readers.chart.time"),
              },
              channels: t("readers.channelsLabel"),
              other: t("readers.other"),
              open: t("readers.open"),
              ...(compare
                ? {
                    describeDelta: (formatted: string, _delta: StatDelta) =>
                      t("readers.delta", { delta: formatted, days }),
                  }
                : {}),
            }}
            pageviews={{
              value: data?.summary.pageviews,
              previous: data?.summary.previous?.pageviews,
            }}
            visits={{ value: data?.summary.visits, previous: data?.summary.previous?.visits }}
            series={seriesPoints(data?.series)}
            channels={channelRows(data?.channels ?? [], (c) => t(`readers.channels.${c}`))}
            {...(redirects ? { redirects } : {})}
            href={analyticsHref(siteId, node.id)}
            loading={stats.isPending}
            empty={
              data && hasNoReaders(data) ? (
                <SectionEmpty
                  icon={<ChartLine size={32} className="text-kumo-inactive" />}
                  title={t("readers.states.noReaders")}
                  description={t("readers.states.noReadersHint")}
                />
              ) : undefined
            }
          />
        </Suspense>
        {stats.data?.partial && (
          <Text variant="secondary" size="sm">
            {t("readers.partial")}
          </Text>
        )}
      </div>
    );
  }

  return (
    <SectionCard
      id="readers"
      title={t("readers.title")}
      icon={<ChartLine size={16} />}
      actions={
        readable && published ? (
          <Tabs
            size="sm"
            value={range}
            onValueChange={(v) => setRange(v as ReadersRange)}
            aria-label={t("readers.range")}
            tabs={READERS_RANGES.map((r) => ({ value: r, label: t(`readers.ranges.${r}`) }))}
          />
        ) : undefined
      }
    >
      <div data-testid="readers-card">{body}</div>
    </SectionCard>
  );
}

/**
 * The site overview's "Last 7 days" card (RFC-0006 §10.1, DESIGN.md §2v): page views and visits
 * against the previous 7 days, a 120 px daily chart, the three most read pages and articles, and
 * a ghost "View analytics". The same rules as the Readers card: left out when off, the reason for
 * Contributors, "can't read yet" without a reader.
 */
export function OverviewAnalyticsCard({ siteId }: { siteId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const card = useAnalyticsCard(siteId);
  const readable = card !== null && card.reason === undefined && card.availability === "on";
  const q = { range: "7d" as const };
  const summary = useQuery({
    queryKey: ["analytics", siteId, "summary", "7d", "compare"],
    queryFn: () => api.analytics.summary(siteId, q, true),
    enabled: readable,
    staleTime: 60_000,
    retry: false,
  });
  const series = useQuery({
    queryKey: ["analytics", siteId, "series", "7d", "day"],
    queryFn: () => api.analytics.series(siteId, q, "day"),
    enabled: readable,
    staleTime: 60_000,
    retry: false,
  });
  const top = useQuery({
    queryKey: ["analytics", siteId, "top", "node", "7d", 3],
    queryFn: () => api.analytics.top(siteId, "node", q, 3),
    enabled: readable,
    staleTime: 60_000,
    retry: false,
  });
  if (card === null) return null;

  const error = summary.error ?? series.error ?? top.error;
  const loading = summary.isPending || series.isPending || top.isPending;
  const s = summary.data?.data;
  const period = t("readers.periods.7d");
  let body: ReactNode;
  if (card.reason !== undefined) body = <NotPermitted reason={card.reason} />;
  else if (card.availability === "unreadable") body = <CantReadYet />;
  else if (error)
    body = (
      <ErrorBanner
        error={error}
        onRetry={() => {
          void summary.refetch();
          void series.refetch();
          void top.refetch();
        }}
        retrying={summary.isFetching || series.isFetching || top.isFetching}
      />
    );
  else if (!loading && (s?.pageviews ?? 0) === 0)
    body = (
      <SectionEmpty
        icon={<ChartLine size={32} className="text-kumo-inactive" />}
        title={t("readers.overview.noVisits")}
        description={t("readers.overview.noVisitsHint")}
      />
    );
  else {
    const describeDelta = (formatted: string) => t("readers.delta", { delta: formatted, days: 7 });
    const rows = (top.data?.data.rows ?? [])
      .filter((r) => r.key !== "(other)")
      .map((r) => ({
        id: r.key,
        label:
          r.node?.exists === false
            ? t("readers.overview.gone")
            : (r.node?.title ?? r.node?.path ?? t("readers.overview.untitled")),
        value: r.pageviews,
      }));
    body = (
      <div className="grid min-w-0 gap-5">
        <StatTileGroup label={t("readers.overview.figures")} density="compact">
          <StatTile
            label={t("readers.pageviews")}
            value={s?.pageviews}
            previous={s?.previous?.pageviews ?? null}
            locale={locale}
            loading={loading}
            describeDelta={describeDelta}
          />
          <StatTile
            label={t("readers.visits")}
            value={s?.visits}
            previous={s?.previous?.visits ?? null}
            locale={locale}
            loading={loading}
            describeDelta={describeDelta}
          />
        </StatTileGroup>
        <Suspense fallback={<SkeletonLine minWidth={100} maxWidth={100} blockHeight={120} />}>
          <AnalyticsTimeseries
            series={[
              {
                id: "pageviews",
                name: t("readers.pageviews"),
                points: seriesPoints(series.data?.data),
              },
            ]}
            granularity="day"
            height={120}
            compact
            locale={locale}
            labels={{
              description: t("readers.chart.description", {
                period,
                total: new Intl.NumberFormat(locale).format(s?.pageviews ?? 0),
              }),
              timezone: t("readers.chart.timezone"),
              showTable: t("readers.chart.showTable"),
              showChart: t("readers.chart.showChart"),
              time: t("readers.chart.time"),
            }}
            loading={loading}
          />
        </Suspense>
        <div className="grid min-w-0 gap-3">
          <Text variant="secondary" size="sm" as="h3">
            {t("readers.overview.mostRead")}
          </Text>
          <BreakdownMeters
            rows={rows}
            locale={locale}
            limit={3}
            total={s?.pageviews ?? 0}
            showOther={false}
            otherLabel={t("readers.other")}
            label={t("readers.overview.topContent")}
            loading={loading}
          />
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      id="analytics-overview"
      title={t("readers.overview.title")}
      icon={<ChartLine size={16} />}
      actions={
        readable ? (
          <LinkButton href={analyticsHref(siteId)} variant="ghost" size="sm">
            {t("readers.overview.view")}
          </LinkButton>
        ) : undefined
      }
    >
      <div data-testid="analytics-overview">{body}</div>
    </SectionCard>
  );
}
