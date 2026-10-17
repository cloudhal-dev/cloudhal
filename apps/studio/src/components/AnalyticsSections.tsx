/**
 * The cards of the Analytics screen (RFC-0006 §10.1, DESIGN.md §2v). Each card asks for its own
 * report, keyed by the range and filter, so it loads, fails and retries on its own and the
 * screen's refresh button refetches all of them (`analyticsKeys.all`). Only the lazy Analytics
 * route imports this file: it is where `@cloudhal/ui/charts` (ECharts) and the country shapes are
 * loaded.
 */
import {
  type AnalyticsRange,
  Badge,
  BreakdownMeters,
  type BreakdownRow,
  BreakdownTable,
  Button,
  InsetPanel,
  LayerDialog,
  Link,
  LinkButton,
  type MapGeoJson,
  Meter,
  Pagination,
  previousAnalyticsRange,
  type ResolvedAnalyticsRange,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  StatTile,
  StatTileGroup,
  Table,
  Tabs,
  Text,
  Tooltip,
  WORKERS_FREE_DAILY_REQUESTS,
} from "@cloudhal/ui";
import { AnalyticsTimeseries, CountryMap } from "@cloudhal/ui/charts";
import {
  ArrowRight,
  ArrowsClockwise,
  ChartLine,
  Cpu,
  DesktopTower,
  DownloadSimple,
  FileText,
  Gauge,
  GlobeHemisphereWest,
  Info,
  Robot,
  ShieldCheck,
  Signpost,
  WarningCircle,
} from "@phosphor-icons/react";
import { type QueryFunction, type QueryKey, useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import countriesUrl from "../assets/geo/countries-110m.json?url";
import { numberFormat, useT } from "../i18n/index.tsx";
import {
  type AnalyticsFilter,
  CORE_VITALS,
  type CoreVital,
  editorHref,
  filterParam,
  formatVital,
  goodShare,
  rangeKey,
  rangeQuery,
  type VitalRating,
  vitalRating,
} from "../lib/analytics.ts";
import {
  type AnalyticsEnvelope,
  type AnalyticsRenders,
  type AnalyticsStatus,
  type AnalyticsSummary,
  type AnalyticsTopRow,
  type AnalyticsVitalsMetric,
  api,
  isNotEnabled,
} from "../lib/api.ts";
import { servedPaths } from "../lib/redirects.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import { type AnalyticsText, analyticsKeys, ChannelIcon, isRetryable } from "./Analytics.tsx";
import { RedirectDialog } from "./RedirectDialog.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { SettingRow } from "./Settings.tsx";
import { TableSkeleton } from "./TableSkeleton.tsx";
import { taxonomyKeys, useTaxonomyData } from "./Taxonomy.tsx";
import { useGate } from "./useMe.ts";

/** What every card reads for: the site, the range (and its UTC days), the filter, polling. */
export interface AnalyticsScope {
  siteId: string;
  range: AnalyticsRange;
  resolved: ResolvedAnalyticsRange;
  filter: AnalyticsFilter | undefined;
  compare: boolean;
  /** "Today" refetches every 60 s while the tab is visible (§10.1); nothing else polls. */
  poll: number | false;
  /** "Sep 10 – Oct 9, 2026": for chart descriptions and the dialog. */
  rangeLabel: string;
  text: AnalyticsText;
}

const DAY_MS = 86_400_000;

/** One analytics report for the scope; the key ends with the range and the filter. */
export function useReport<T>(
  scope: AnalyticsScope,
  parts: readonly unknown[],
  fn: QueryFunction<T>,
  enabled = true,
) {
  const key: QueryKey = [
    ...analyticsKeys.all(scope.siteId),
    ...parts,
    rangeKey(scope.range),
    scope.filter ? filterParam(scope.filter) : null,
  ];
  return useQuery({
    queryKey: key,
    queryFn: fn,
    enabled,
    staleTime: 30_000,
    refetchInterval: scope.poll,
    retry: (count, error) => !isNotEnabled(error) && count < (isRetryable(error) ? 2 : 1),
  });
}

export function useSummary(scope: AnalyticsScope, enabled = true) {
  return useReport(
    scope,
    ["summary", scope.compare],
    () => api.analytics.summary(scope.siteId, rangeQuery(scope.range, scope.filter), scope.compare),
    enabled,
  );
}

/** A card whose report failed: says so where the content would be, with "Try again". */
function CardError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const t = useT("analytics");
  return (
    <SectionEmpty
      icon={<WarningCircle size={32} className="text-kumo-inactive" />}
      title={t("analytics.errors.card")}
      contents={
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          {t("analytics.errors.retry")}
        </Button>
      }
    />
  );
}

/** A muted note with an icon aligned to its first line. */
export function NoteLine({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="flex h-lh shrink-0 items-center text-kumo-subtle" aria-hidden>
        {icon ?? <Info size={16} />}
      </span>
      <Text variant="secondary" size="sm">
        {children}
      </Text>
    </div>
  );
}

const sortByValue = (rows: BreakdownRow[]) =>
  [...rows].sort((a, b) => Number(!!a.other) - Number(!!b.other) || b.value - a.value);

// ---- Traffic ------------------------------------------------------------------------------------

/** "Traffic": key figures with deltas and sparklines, then page views and visits over time. */
export function TrafficCard({
  scope,
  summary,
  uniqueVisitors,
}: {
  scope: AnalyticsScope;
  summary: ReturnType<typeof useSummary>;
  /** The site counts unique visitors now (the tile also shows when the period has any). */
  uniqueVisitors: boolean;
}) {
  const { t, fmt, locale, chart, describeDelta } = scope.text;
  const q = rangeQuery(scope.range, scope.filter);
  const series = useReport(scope, ["series"], () => api.analytics.series(scope.siteId, q));
  const previousRange = previousAnalyticsRange(scope.resolved);
  const previous = useReport(
    scope,
    ["series", "previous", previousRange.from],
    () =>
      api.analytics.series(scope.siteId, {
        ...previousRange,
        ...(scope.filter ? { filter: filterParam(scope.filter) } : {}),
      }),
    scope.compare,
  );
  const perVisitFormat = useMemo(
    () => numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
    [locale],
  );
  const s = summary.data?.data;
  const points = series.data?.data.points ?? [];
  const granularity = series.data?.data.interval ?? scope.resolved.granularity;
  const shift = scope.resolved.days * DAY_MS;
  const views = points.map((p) => [Date.parse(p.t), p.pageviews] as const);
  const visits = points.map((p) => [Date.parse(p.t), p.visits] as const);
  const prev = scope.compare
    ? (previous.data?.data.points ?? []).map((p) => [Date.parse(p.t) + shift, p.pageviews] as const)
    : [];
  const perVisit = points.map((p) => (p.visits > 0 ? p.pageviews / p.visits : 0));
  const showVisitors = uniqueVisitors || (s?.visitors ?? null) !== null;
  const prevTotals = scope.compare ? s?.previous : undefined;
  const loading = summary.isPending;
  const pvLabel = t("analytics.metrics.pageviews");
  const description = s
    ? t("analytics.traffic.chartDescription", {
        pageviews: fmt.number(s.pageviews),
        visits: fmt.number(s.visits),
        range: scope.rangeLabel,
      })
    : t("analytics.traffic.title");
  const notes = [
    summary.data?.partial ? t("analytics.traffic.partial") : "",
    summary.data?.estimated ? t("analytics.traffic.estimated") : "",
  ].filter(Boolean);
  return (
    <SectionCard
      id="traffic"
      title={t("analytics.traffic.title")}
      icon={<ChartLine size={16} />}
      actions={
        <LinkButton
          href={api.analytics.exportUrl(scope.siteId, rangeQuery(scope.range))}
          external
          variant="ghost"
          size="sm"
          icon={DownloadSimple}
        >
          {t("analytics.traffic.export")}
        </LinkButton>
      }
    >
      <StatTileGroup label={t("analytics.traffic.figures", { range: scope.rangeLabel })}>
        <StatTile
          label={pvLabel}
          value={s?.pageviews}
          previous={prevTotals?.pageviews ?? null}
          locale={locale}
          loading={loading}
          describeDelta={describeDelta}
          sparkline={views.map(([, v]) => v)}
          emptyLabel={t("analytics.noData")}
        />
        <StatTile
          label={t("analytics.metrics.visits")}
          value={s?.visits}
          previous={prevTotals?.visits ?? null}
          locale={locale}
          loading={loading}
          describeDelta={describeDelta}
          hint={t("analytics.metrics.visitsHint")}
          hintLabel={t("analytics.metrics.aboutVisits")}
          sparkline={visits.map(([, v]) => v)}
          emptyLabel={t("analytics.noData")}
        />
        {showVisitors && (
          <StatTile
            label={t("analytics.metrics.visitors")}
            value={s?.visitors}
            previous={prevTotals?.visitors ?? null}
            locale={locale}
            loading={loading}
            describeDelta={describeDelta}
            hint={t("analytics.metrics.visitorsHint")}
            hintLabel={t("analytics.metrics.aboutVisitors")}
            emptyLabel={t("analytics.noData")}
          />
        )}
        <StatTile
          label={t("analytics.metrics.viewsPerVisit")}
          value={s?.viewsPerVisit}
          previous={
            prevTotals && prevTotals.visits > 0 ? prevTotals.pageviews / prevTotals.visits : null
          }
          format={(v) => perVisitFormat.format(v)}
          locale={locale}
          loading={loading}
          describeDelta={describeDelta}
          sparkline={perVisit}
          emptyLabel={t("analytics.noData")}
        />
      </StatTileGroup>
      {series.isError ? (
        <CardError onRetry={() => void series.refetch()} retrying={series.isFetching} />
      ) : (
        <AnalyticsTimeseries
          series={[
            { id: "pageviews", name: pvLabel, points: views, ...(s ? { total: s.pageviews } : {}) },
            {
              id: "visits",
              name: t("analytics.metrics.visits"),
              points: visits,
              ...(s ? { total: s.visits } : {}),
            },
            ...(prev.length > 0
              ? [
                  {
                    id: "previous",
                    name: t("analytics.metrics.previousPageviews"),
                    points: prev,
                    ...(prevTotals ? { total: prevTotals.pageviews } : {}),
                  },
                ]
              : []),
          ]}
          granularity={granularity}
          locale={locale}
          labels={chart(description)}
          loading={series.isPending}
          height={280}
        />
      )}
      {notes.length > 0 && <NoteLine>{notes.join(" ")}</NoteLine>}
    </SectionCard>
  );
}

// ---- Top content --------------------------------------------------------------------------------

function nodeRows(scope: AnalyticsScope, rows: readonly AnalyticsTopRow[]): BreakdownRow[] {
  const { t } = scope.text;
  return rows.map((row) => {
    if (row.key === "(other)")
      return { id: row.key, label: t("analytics.other"), value: row.pageviews, other: true };
    const node = row.node;
    const href = node ? editorHref(scope.siteId, node) : undefined;
    const gone = node ? !node.exists : false;
    return {
      id: row.key,
      label: gone ? t("analytics.content.gone") : (node?.title ?? row.key),
      ...(node?.path ? { detail: node.path } : gone ? { detail: row.key } : {}),
      ...(href ? { href } : {}),
      badge: node?.kind ? (
        <Badge variant="outline">{t(`analytics.content.kinds.${node.kind}`)}</Badge>
      ) : undefined,
      value: row.pageviews,
      secondary: row.visits,
      muted: gone,
    };
  });
}

/** "Top content": the first ten pages, articles and archives; "Show all" lists up to 100. */
export function TopContentCard({ scope, total }: { scope: AnalyticsScope; total?: number }) {
  const { t, locale, breakdown } = scope.text;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const q = rangeQuery(scope.range, scope.filter);
  const top = useReport(scope, ["top", "node", 10], () =>
    api.analytics.top(scope.siteId, "node", q, 10),
  );
  const all = useReport(
    scope,
    ["top", "node", 100],
    () => api.analytics.top(scope.siteId, "node", q, 100),
    open,
  );
  const labels = breakdown(t("analytics.columns.content"), t("analytics.metrics.pageviews"), {
    secondary: t("analytics.metrics.visits"),
    caption: t("analytics.content.caption", { range: scope.rangeLabel }),
  });
  const rows = nodeRows(scope, top.data?.data.rows ?? []);
  const allRows = nodeRows(
    scope,
    (all.data?.data.rows ?? []).filter((r) => r.key !== "(other)"),
  );
  const perPage = 20;
  const empty = (
    <SectionEmpty
      icon={<FileText size={32} className="text-kumo-inactive" />}
      title={t("analytics.content.empty")}
    />
  );
  return (
    <SectionCard
      id="top-content"
      title={t("analytics.content.title")}
      icon={<FileText size={16} />}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPage(1);
            setOpen(true);
          }}
          disabled={rows.length === 0}
        >
          {t("analytics.content.showAll")}
        </Button>
      }
      flush
    >
      {top.isError ? (
        <CardError onRetry={() => void top.refetch()} retrying={top.isFetching} />
      ) : (
        <BreakdownTable
          rows={rows}
          labels={labels}
          locale={locale}
          limit={10}
          {...(total !== undefined ? { total } : {})}
          loading={top.isPending}
          empty={empty}
        />
      )}
      <LayerDialog.Root open={open} onOpenChange={setOpen}>
        <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
          <LayerDialog.Title>{t("analytics.content.title")}</LayerDialog.Title>
          <LayerDialog.Description>{scope.rangeLabel}</LayerDialog.Description>
          <LayerDialog.Body>
            <div className="grid min-w-0 gap-4" data-testid="top-content-all">
              <BreakdownTable
                rows={allRows.slice((page - 1) * perPage, page * perPage)}
                labels={labels}
                locale={locale}
                {...(total !== undefined ? { total } : {})}
                showOther={false}
                loading={all.isPending}
                loadingRows={8}
                empty={empty}
              />
              {allRows.length > perPage && (
                <Pagination
                  page={page}
                  perPage={perPage}
                  totalCount={allRows.length}
                  setPage={setPage}
                />
              )}
            </div>
          </LayerDialog.Body>
        </LayerDialog.Content>
      </LayerDialog.Root>
    </SectionCard>
  );
}

// ---- Sources ------------------------------------------------------------------------------------

type SourceTab = "channels" | "referrers" | "campaigns";
type CampaignTab = "utmCampaign" | "utmSource" | "utmMedium";

/** "Sources": channels, referrer hosts (never linked) and UTM campaigns, by visits. */
export function SourcesCard({
  scope,
  totalVisits,
}: {
  scope: AnalyticsScope;
  totalVisits?: number;
}) {
  const { t, locale, breakdown, channel } = scope.text;
  const [tab, setTab] = useState<SourceTab>("channels");
  const [campaign, setCampaign] = useState<CampaignTab>("utmCampaign");
  const dimension = tab === "channels" ? "channel" : tab === "referrers" ? "refHost" : campaign;
  const q = rangeQuery(scope.range, scope.filter);
  const top = useReport(scope, ["top", dimension, 10], () =>
    api.analytics.top(scope.siteId, dimension, q, 10),
  );
  const rows: BreakdownRow[] = sortByValue(
    (top.data?.data.rows ?? [])
      // A referrer list holds direct visits in its "(other)": leave it out rather than mislabel it.
      .filter((r) => r.visits > 0 && !(tab === "referrers" && r.key === "(other)"))
      .map((r) =>
        r.key === "(other)"
          ? { id: r.key, label: t("analytics.other"), value: r.visits, other: true }
          : tab === "channels"
            ? {
                id: r.key,
                label: channel(r.key),
                icon: <ChannelIcon channel={r.key} />,
                value: r.visits,
              }
            : { id: r.key, label: r.key, value: r.visits },
      ),
  );
  const item =
    tab === "channels"
      ? t("analytics.columns.channel")
      : tab === "referrers"
        ? t("analytics.columns.referrer")
        : t(`analytics.sources.campaigns.${campaign}`);
  return (
    <SectionCard
      id="sources"
      title={t("analytics.sources.title")}
      icon={<ArrowRight size={16} />}
      actions={
        <Tabs
          variant="segmented"
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as SourceTab)}
          tabs={(["channels", "referrers", "campaigns"] as const).map((v) => ({
            value: v,
            label: t(`analytics.sources.tabs.${v}`),
          }))}
        />
      }
      flush
    >
      {tab === "campaigns" && (
        <div className="flex flex-wrap items-center gap-3 border-kumo-hairline border-b px-5 py-3">
          <Tabs
            variant="segmented"
            size="sm"
            value={campaign}
            onValueChange={(v) => setCampaign(v as CampaignTab)}
            tabs={(["utmCampaign", "utmSource", "utmMedium"] as const).map((v) => ({
              value: v,
              label: t(`analytics.sources.campaigns.${v}`),
            }))}
          />
        </div>
      )}
      {top.isError ? (
        <CardError onRetry={() => void top.refetch()} retrying={top.isFetching} />
      ) : (
        <BreakdownTable
          key={dimension}
          rows={rows}
          labels={breakdown(item, t("analytics.metrics.visits"), {
            caption: t("analytics.sources.caption", { range: scope.rangeLabel }),
          })}
          locale={locale}
          limit={10}
          {...(tab === "channels" && totalVisits !== undefined ? { total: totalVisits } : {})}
          loading={top.isPending}
          empty={
            <SectionEmpty
              icon={<ArrowRight size={32} className="text-kumo-inactive" />}
              title={t(`analytics.sources.empty.${tab}`)}
              {...(tab === "campaigns"
                ? { description: t("analytics.sources.campaignsHint") }
                : {})}
            />
          }
        />
      )}
      {tab === "referrers" && rows.length > 0 && (
        <div className="border-kumo-hairline border-t px-5 py-3">
          <NoteLine>{t("analytics.sources.referrersNote")}</NoteLine>
        </div>
      )}
    </SectionCard>
  );
}

// ---- Errors and redirects -----------------------------------------------------------------------

function statusVariant(status: number): "warning" | "secondary" | "error" | "info" {
  if (status === 404) return "warning";
  if (status === 410 || status === 451) return "secondary";
  return status >= 500 ? "error" : "info";
}

/** Where a same-site path is edited: pages by path, published articles by `/<collection>/<slug>`. */
function useEditorByPath(siteId: string, enabled: boolean) {
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pages.data ?? []) map.set(p.path, `/sites/${siteId}/pages/${p.id}`);
    for (const e of entries.data ?? [])
      if (e.status === "published")
        map.set(`/${e.collection}/${e.slug}`, `/sites/${siteId}/articles/${e.id}`);
    return map;
  }, [pages.data, entries.data, siteId]);
}

/** The redirect dialog, prefilled with a broken path; it loads what it checks against when opened. */
function CreateRedirect({
  siteId,
  from,
  onClose,
}: {
  siteId: string;
  from: string | undefined;
  onClose: () => void;
}) {
  const open = from !== undefined;
  const data = useTaxonomyData(siteId, open);
  const redirects = useQuery({
    queryKey: taxonomyKeys.redirects(siteId),
    queryFn: () => api.redirects.list(siteId),
    enabled: open,
  });
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: open,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: open,
  });
  const served = servedPaths({
    pages: pages.data ?? [],
    entries: entries.data ?? [],
    defaultLocale: data.defaultLocale,
    taxonomies: data.taxonomies.data ?? [],
    terms: data.items.map((i) => i.term),
  });
  return (
    <RedirectDialog
      siteId={siteId}
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      editing={undefined}
      initialFrom={from}
      redirects={redirects.data ?? []}
      served={served}
      host={primaryHostname(data.site.data?.domains ?? [])}
    />
  );
}

type ErrorRow = Extract<AnalyticsRenders, { report: "errors" }>["rows"][number];
type RedirectRow = Extract<AnalyticsRenders, { report: "redirects" }>["rows"][number];

/** "Errors and redirects": 404/410/5xx with the linking page and last seen; old paths that redirect. */
export function ErrorsCard({ scope }: { scope: AnalyticsScope }) {
  const { t, fmt } = scope.text;
  const [tab, setTab] = useState<"errors" | "redirects">("errors");
  const [redirectFrom, setRedirectFrom] = useState<string | undefined>();
  const structure = useGate("structure.write");
  const q = rangeQuery(scope.range);
  const errors = useReport(scope, ["renders", "errors"], () =>
    api.analytics.renders(scope.siteId, "errors", q, 50),
  );
  const redirects = useReport(
    scope,
    ["renders", "redirects"],
    () => api.analytics.renders(scope.siteId, "redirects", q, 50),
    tab === "redirects",
  );
  const errorRows: ErrorRow[] = errors.data?.data.rows ?? [];
  const redirectRows: RedirectRow[] = redirects.data?.data.rows ?? [];
  const editorFor = useEditorByPath(
    scope.siteId,
    errorRows.some((r) => r.refPath),
  );
  const report = tab === "errors" ? errors : redirects;
  const count = tab === "errors" ? errorRows.length : redirectRows.length;
  return (
    <SectionCard
      id="errors"
      title={t("analytics.errors.cardTitle")}
      icon={<Signpost size={16} />}
      actions={
        <Tabs
          variant="segmented"
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as "errors" | "redirects")}
          tabs={[
            { value: "errors", label: t("analytics.errors.tabs.errors") },
            { value: "redirects", label: t("analytics.errors.tabs.redirects") },
          ]}
        />
      }
      flush
    >
      {report.isError ? (
        <CardError onRetry={() => void report.refetch()} retrying={report.isFetching} />
      ) : !report.isPending && count === 0 ? (
        <SectionEmpty
          icon={<Signpost size={32} className="text-kumo-inactive" />}
          title={t(`analytics.errors.empty.${tab}`)}
        />
      ) : tab === "errors" ? (
        <Table data-testid="analytics-errors">
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("analytics.columns.status")}</Table.Head>
              <Table.Head>{t("analytics.columns.requested")}</Table.Head>
              <Table.Head className="text-right">{t("analytics.columns.hits")}</Table.Head>
              <Table.Head>{t("analytics.columns.linkedFrom")}</Table.Head>
              <Table.Head>{t("analytics.columns.lastSeen")}</Table.Head>
              <Table.Head sticky="right" />
            </Table.Row>
          </Table.Header>
          {errors.isPending ? (
            <TableSkeleton columns={6} rows={4} />
          ) : (
            <Table.Body>
              {errorRows.map((r) => (
                <ErrorRowView
                  key={`${r.status} ${r.path} ${r.refPath ?? ""}`}
                  row={r}
                  scope={scope}
                  editor={r.refPath ? editorFor.get(r.refPath) : undefined}
                  canRedirect={structure.allowed}
                  redirectReason={structure.reason}
                  onRedirect={() => setRedirectFrom(r.path)}
                />
              ))}
            </Table.Body>
          )}
        </Table>
      ) : (
        <Table data-testid="analytics-redirects">
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("analytics.columns.status")}</Table.Head>
              <Table.Head>{t("analytics.columns.oldPath")}</Table.Head>
              <Table.Head>{t("analytics.columns.target")}</Table.Head>
              <Table.Head className="text-right">{t("analytics.columns.hits")}</Table.Head>
            </Table.Row>
          </Table.Header>
          {redirects.isPending ? (
            <TableSkeleton columns={4} rows={4} />
          ) : (
            <Table.Body>
              {redirectRows.map((r) => (
                <Table.Row key={`${r.status} ${r.path} ${r.redirectTo}`}>
                  <Table.Cell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </Table.Cell>
                  <Table.Cell className="max-w-64">
                    <Text variant="mono" as="span" truncate>
                      {r.path}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="max-w-64">
                    <Text variant="mono-secondary" as="span" truncate>
                      {r.redirectTo}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right whitespace-nowrap tabular-nums">
                    {fmt.number(r.hits)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          )}
        </Table>
      )}
      <div className="border-kumo-hairline border-t px-5 py-3">
        <NoteLine>
          {tab === "errors" ? t("analytics.errors.note") : t("analytics.errors.redirectsNote")}
        </NoteLine>
      </div>
      <CreateRedirect
        siteId={scope.siteId}
        from={redirectFrom}
        onClose={() => setRedirectFrom(undefined)}
      />
    </SectionCard>
  );
}

/** One broken path: status, the path as plain text (visitor-controlled), hits, the linking page. */
function ErrorRowView({
  row,
  scope,
  editor,
  canRedirect,
  redirectReason,
  onRedirect,
}: {
  row: ErrorRow;
  scope: AnalyticsScope;
  editor: string | undefined;
  canRedirect: boolean;
  redirectReason: string | undefined;
  onRedirect: () => void;
}) {
  const { t, fmt } = scope.text;
  let linkedFrom: ReactNode;
  if (row.refPath && editor)
    linkedFrom = (
      <Link href={editor}>
        <span className="font-mono text-[0.9em]">{row.refPath}</span>
      </Link>
    );
  else if (row.refPath)
    linkedFrom = (
      <Text variant="mono-secondary" as="span">
        {row.refPath}
      </Text>
    );
  else
    linkedFrom = (
      <Text variant="secondary" as="span">
        {t("analytics.errors.noReferrer")}
      </Text>
    );
  return (
    <Table.Row data-error-path={row.path}>
      <Table.Cell>
        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
      </Table.Cell>
      <Table.Cell className="max-w-64">
        <Text variant="mono" as="span" truncate>
          {row.path}
        </Text>
      </Table.Cell>
      <Table.Cell className="text-right whitespace-nowrap tabular-nums">
        {fmt.number(row.hits)}
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">{linkedFrom}</Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        {row.lastSeen ? (
          <RelativeTime iso={row.lastSeen} />
        ) : (
          <Text variant="secondary" as="span">
            —
          </Text>
        )}
      </Table.Cell>
      <Table.Cell sticky="right" className="text-right">
        {row.status === 404 || row.status === 410 ? (
          canRedirect ? (
            <Tooltip
              content={t("analytics.errors.createRedirect")}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  icon={<Signpost />}
                  aria-label={t("analytics.errors.createRedirectFor", { path: row.path })}
                  onClick={onRedirect}
                />
              }
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<Signpost />}
              aria-label={t("analytics.errors.createRedirectFor", { path: row.path })}
              disabled
              title={redirectReason}
            />
          )
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}

// ---- Countries ----------------------------------------------------------------------------------

/** Natural Earth 1:110m admin-0 shapes (public domain), fetched once when the map first shows. */
function useCountryShapes() {
  return useQuery({
    queryKey: ["geo", "countries-110m"],
    queryFn: async () => {
      const res = await fetch(countriesUrl);
      if (!res.ok) throw new Error(`countries: ${res.status}`);
      return (await res.json()) as MapGeoJson;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

/** "Countries": the shaded map and the top eight countries under it. */
export function CountriesCard({ scope, total }: { scope: AnalyticsScope; total?: number }) {
  const { t, locale, countryNames } = scope.text;
  const shapes = useCountryShapes();
  const q = rangeQuery(scope.range, scope.filter);
  const top = useReport(scope, ["top", "country", 100], () =>
    api.analytics.top(scope.siteId, "country", q, 100),
  );
  const rows = (top.data?.data.rows ?? [])
    .filter((r) => r.key !== "(other)" && r.pageviews > 0)
    .map((r) => ({ country: r.key, value: r.pageviews }));
  return (
    <SectionCard
      id="countries"
      title={t("analytics.countries.title")}
      icon={<GlobeHemisphereWest size={16} />}
      flush
    >
      {top.isError ? (
        <CardError onRetry={() => void top.refetch()} retrying={top.isFetching} />
      ) : (
        <CountryMap
          rows={rows}
          geoJson={shapes.data}
          locale={locale}
          loading={top.isPending}
          {...(total !== undefined ? { total } : {})}
          labels={{
            ...countryNames,
            map: t("analytics.countries.map", { range: scope.rangeLabel }),
            item: t("analytics.columns.country"),
            value: t("analytics.metrics.pageviews"),
            share: t("analytics.columns.share"),
            other: t("analytics.countries.other"),
            high: t("analytics.countries.high"),
            low: t("analytics.countries.low"),
          }}
          empty={
            <SectionEmpty
              icon={<GlobeHemisphereWest size={32} className="text-kumo-inactive" />}
              title={t("analytics.countries.empty")}
            />
          }
        />
      )}
    </SectionCard>
  );
}

// ---- Devices ------------------------------------------------------------------------------------

type DeviceTab = "device" | "browser" | "os";

/** "Devices": device class, browser or operating system family as labelled meters. */
export function DevicesCard({ scope, total }: { scope: AnalyticsScope; total?: number }) {
  const { t, locale, device, browser, os } = scope.text;
  const [tab, setTab] = useState<DeviceTab>("device");
  const q = rangeQuery(scope.range, scope.filter);
  const top = useReport(scope, ["top", tab, 10], () => api.analytics.top(scope.siteId, tab, q, 10));
  const name = tab === "device" ? device : tab === "browser" ? browser : os;
  const rows: BreakdownRow[] = sortByValue(
    (top.data?.data.rows ?? [])
      .filter((r) => r.pageviews > 0)
      .map((r) =>
        r.key === "(other)"
          ? { id: r.key, label: t("analytics.other"), value: r.pageviews, other: true }
          : { id: r.key, label: name(r.key), value: r.pageviews },
      ),
  );
  return (
    <SectionCard
      id="devices"
      title={t("analytics.devices.title")}
      icon={<DesktopTower size={16} />}
      actions={
        <Tabs
          variant="segmented"
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as DeviceTab)}
          tabs={(["device", "browser", "os"] as const).map((v) => ({
            value: v,
            label: t(`analytics.devices.tabs.${v}`),
          }))}
        />
      }
    >
      {top.isError ? (
        <CardError onRetry={() => void top.refetch()} retrying={top.isFetching} />
      ) : (
        <BreakdownMeters
          key={tab}
          rows={rows}
          locale={locale}
          limit={5}
          {...(total !== undefined ? { total } : {})}
          otherLabel={t("analytics.other")}
          label={t(`analytics.devices.tabs.${tab}`)}
          loading={top.isPending}
          empty={
            <SectionEmpty
              icon={<Cpu size={32} className="text-kumo-inactive" />}
              title={t("analytics.devices.empty")}
            />
          }
        />
      )}
    </SectionCard>
  );
}

// ---- Core Web Vitals ----------------------------------------------------------------------------

const RATING_VARIANT: Record<VitalRating, "success" | "warning" | "error"> = {
  good: "success",
  needsImprovement: "warning",
  poor: "error",
};

const RATING_BAR: Record<VitalRating, string> = {
  good: "from-kumo-success via-kumo-success to-kumo-success",
  needsImprovement: "from-kumo-warning via-kumo-warning to-kumo-warning",
  poor: "from-kumo-danger via-kumo-danger to-kumo-danger",
};

type VitalsTab = "all" | "mobile" | "desktop";

/** One Core Web Vital: name, rating badge, and a meter of good samples with the p75. */
function VitalRow({
  scope,
  name,
  metric,
}: {
  scope: AnalyticsScope;
  name: CoreVital;
  metric: AnalyticsVitalsMetric | undefined;
}) {
  const { t, locale, fmt } = scope.text;
  const rating = metric ? vitalRating(name, metric.p75) : undefined;
  const share = metric ? goodShare(metric) : null;
  const p75 =
    metric?.p75 !== null && metric?.p75 !== undefined ? formatVital(name, metric.p75, locale) : "—";
  return (
    <div className="grid min-w-0 gap-2" data-vital={name} data-rating={rating}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="grid min-w-0 gap-0.5">
          <Text bold as="span">
            {t(`analytics.vitals.metrics.${name}.short`)}
          </Text>
          <Text variant="secondary" size="sm" as="span">
            {t(`analytics.vitals.metrics.${name}.name`)}
          </Text>
        </span>
        <Badge variant={rating ? RATING_VARIANT[rating] : "secondary"}>
          {rating ? t(`analytics.vitals.ratings.${rating}`) : t("analytics.vitals.noSamples")}
        </Badge>
      </div>
      <Meter
        label={t("analytics.vitals.good")}
        value={share === null ? 0 : share * 100}
        customValue={
          share === null
            ? t("analytics.vitals.p75Only", { p75 })
            : t("analytics.vitals.value", { p75, good: fmt.percent(share) })
        }
        indicatorClassName={`motion-reduce:transition-none ${rating ? RATING_BAR[rating] : ""}`}
      />
    </div>
  );
}

/** "Core Web Vitals": p75 LCP, INP and CLS with their rating and the share of good samples. */
export function VitalsCard({
  scope,
  vitalsOneIn,
  settingsHref,
}: {
  scope: AnalyticsScope;
  /** The site sampling (0 = not measured). */
  vitalsOneIn: number | undefined;
  /** Analytics settings, for people who may change them. */
  settingsHref: string | undefined;
}) {
  const { t } = scope.text;
  const [tab, setTab] = useState<VitalsTab>("all");
  // The API takes one filter: a page-level filter wins over the device switch.
  const device = scope.filter || tab === "all" ? undefined : tab;
  const vitals = useReport(
    scope,
    ["vitals", device ?? "all"],
    () =>
      api.analytics.vitals(scope.siteId, {
        ...rangeQuery(scope.range, scope.filter),
        ...(device ? { filter: `device:${device}` } : {}),
      }),
    vitalsOneIn !== 0,
  );
  const byName = new Map((vitals.data?.data.metrics ?? []).map((m) => [m.metric, m]));
  const anySamples = CORE_VITALS.some((m) => (byName.get(m)?.samples ?? 0) > 0);
  let body: ReactNode;
  if (vitalsOneIn === 0)
    body = (
      <SectionEmpty
        icon={<Gauge size={32} className="text-kumo-inactive" />}
        title={t("analytics.vitals.off")}
        description={t("analytics.vitals.offDescription")}
        contents={
          settingsHref ? (
            <LinkButton href={settingsHref} variant="secondary" size="sm">
              {t("analytics.vitals.turnOn")}
            </LinkButton>
          ) : undefined
        }
      />
    );
  else if (vitals.isError)
    body = <CardError onRetry={() => void vitals.refetch()} retrying={vitals.isFetching} />;
  else if (vitals.isPending)
    body = (
      <div className="grid gap-5" aria-busy>
        {CORE_VITALS.map((m) => (
          <div key={m} className="grid gap-2">
            <SkeletonLine minWidth={30} maxWidth={60} />
            <SkeletonLine minWidth={100} maxWidth={100} blockHeight={8} />
          </div>
        ))}
      </div>
    );
  else if (!anySamples)
    body = (
      <SectionEmpty
        icon={<Gauge size={32} className="text-kumo-inactive" />}
        title={t("analytics.vitals.empty")}
      />
    );
  else
    body = (
      <div className="grid gap-5" data-testid="analytics-vitals">
        {CORE_VITALS.map((name) => (
          <VitalRow key={name} scope={scope} name={name} metric={byName.get(name)} />
        ))}
      </div>
    );
  return (
    <SectionCard
      id="vitals"
      title={t("analytics.vitals.title")}
      icon={<Gauge size={16} />}
      actions={
        vitalsOneIn === 0 ? undefined : (
          <Tabs
            variant="segmented"
            size="sm"
            value={scope.filter ? "all" : tab}
            onValueChange={(v) => setTab(v as VitalsTab)}
            tabs={(["all", "mobile", "desktop"] as const).map((v) => ({
              value: v,
              label: t(`analytics.vitals.tabs.${v}`),
              ...(scope.filter && v !== "all" ? { disabled: true } : {}),
            }))}
          />
        )
      }
    >
      {body}
      {vitalsOneIn !== 0 && vitalsOneIn !== undefined && (
        <NoteLine>
          {vitalsOneIn === 1 // i18n-ignore: 1 in 1 is "every page view", another sentence
            ? t("analytics.vitals.sampleEvery")
            : t("analytics.vitals.sample", { n: vitalsOneIn })}
        </NoteLine>
      )}
    </SectionCard>
  );
}

// ---- Crawlers -----------------------------------------------------------------------------------

type CrawlerRow = Extract<AnalyticsRenders, { report: "crawlers" }>["rows"][number];

function crawlerVariant(kind: CrawlerRow["class"]): "info" | "secondary" | "outline" {
  return kind === "ai" ? "info" : kind === "search" ? "secondary" : "outline";
}

/** "AI and search crawlers": pages rendered for crawlers, cache misses only (a lower bound). */
export function CrawlersCard({ scope }: { scope: AnalyticsScope }) {
  const { t, fmt } = scope.text;
  const crawlers = useReport(scope, ["renders", "crawlers"], () =>
    api.analytics.renders(scope.siteId, "crawlers", rangeQuery(scope.range), 20),
  );
  const rows: CrawlerRow[] = crawlers.data?.data.rows ?? [];
  return (
    <SectionCard
      id="crawlers"
      title={t("analytics.crawlers.title")}
      icon={<Robot size={16} />}
      actions={<Badge variant="outline">{t("analytics.crawlers.cacheMisses")}</Badge>}
      description={t("analytics.crawlers.description")}
      flush
    >
      {crawlers.isError ? (
        <CardError onRetry={() => void crawlers.refetch()} retrying={crawlers.isFetching} />
      ) : !crawlers.isPending && rows.length === 0 ? (
        <SectionEmpty
          icon={<Robot size={32} className="text-kumo-inactive" />}
          title={t("analytics.crawlers.empty")}
        />
      ) : (
        <Table data-testid="analytics-crawlers">
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("analytics.columns.crawler")}</Table.Head>
              <Table.Head>{t("analytics.columns.kind")}</Table.Head>
              <Table.Head className="text-right">{t("analytics.columns.rendered")}</Table.Head>
            </Table.Row>
          </Table.Header>
          {crawlers.isPending ? (
            <TableSkeleton columns={3} rows={3} />
          ) : (
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.crawler}>
                  <Table.Cell>
                    <Text as="span">{r.crawler}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={crawlerVariant(r.class)}>
                      {t(`analytics.crawlers.classes.${r.class}`)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right whitespace-nowrap tabular-nums">
                    {fmt.number(r.hits)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          )}
        </Table>
      )}
    </SectionCard>
  );
}

// ---- About this data ----------------------------------------------------------------------------

/** "About this data": what is (not) stored, unique visitors, the Free-plan estimate, freshness. */
export function AboutCard({
  scope,
  status,
  summary,
  settingsHref,
}: {
  scope: AnalyticsScope;
  status: AnalyticsStatus | undefined;
  summary: AnalyticsEnvelope<AnalyticsSummary> | undefined;
  settingsHref: string | undefined;
}) {
  const { t, fmt } = scope.text;
  const unique = status?.settings.uniqueVisitors;
  const quota = status?.quota;
  const budget = status?.budget;
  const source = summary?.source;
  const updated = status?.lastRollup?.finishedAt ?? summary?.generatedAt;
  return (
    <SectionCard id="about" title={t("analytics.about.title")} icon={<ShieldCheck size={16} />}>
      <dl className="-my-3 grid divide-y divide-kumo-hairline" data-testid="analytics-about">
        <SettingRow label={t("analytics.about.privacy")} hint={t("analytics.about.privacyHint")}>
          <Badge variant="success" appearance="dot">
            {t("analytics.about.cookieless")}
          </Badge>
        </SettingRow>
        <SettingRow
          label={t("analytics.about.uniqueVisitors")}
          hint={t("analytics.about.uniqueVisitorsHint")}
        >
          {status ? (
            <Badge variant={unique ? "success" : "neutral"} appearance="dot">
              {unique ? t("analytics.about.on") : t("analytics.about.off")}
            </Badge>
          ) : (
            <SkeletonLine minWidth={20} maxWidth={30} />
          )}
          {settingsHref && (
            <LinkButton href={settingsHref} variant="ghost" size="sm">
              {t("analytics.about.change")}
            </LinkButton>
          )}
        </SettingRow>
        {unique && typeof summary?.data.privacySignalShare === "number" && (
          <SettingRow label={t("analytics.about.signals")} hint={t("analytics.about.signalsHint")}>
            <Text>
              {t("analytics.about.signalsValue", {
                share: fmt.percent(summary.data.privacySignalShare),
              })}
            </Text>
          </SettingRow>
        )}
        {source && (
          <SettingRow
            label={t("analytics.about.source")}
            hint={summary?.estimated ? t("analytics.about.estimated") : undefined}
          >
            <Badge variant="outline">{t(`analytics.about.sources.${source}`)}</Badge>
          </SettingRow>
        )}
        {typeof summary?.data.cacheHitRatio === "number" && (
          <div className="grid gap-2 py-3">
            <Meter
              label={t("analytics.about.cacheHits")}
              value={summary.data.cacheHitRatio * 100}
              customValue={t("analytics.about.cacheHitsValue", {
                share: fmt.percent(summary.data.cacheHitRatio),
              })}
              indicatorClassName="motion-reduce:transition-none"
            />
            <Text variant="secondary" size="sm">
              {t("analytics.about.cacheHitsHint")}
            </Text>
          </div>
        )}
        {quota && (
          <div className="grid gap-2 py-3">
            <Meter
              label={t("analytics.about.requests")}
              value={Math.min(100, (quota.requests / WORKERS_FREE_DAILY_REQUESTS) * 100)}
              customValue={t("analytics.about.requestsValue", {
                used: fmt.number(quota.requests),
                limit: fmt.number(WORKERS_FREE_DAILY_REQUESTS),
              })}
              indicatorClassName="motion-reduce:transition-none"
            />
            <Text variant="secondary" size="sm">
              {t("analytics.about.requestsHint")}
            </Text>
          </div>
        )}
        {budget && (
          <div className="grid gap-2 py-3">
            <Meter
              label={t("analytics.about.budget")}
              value={Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100)}
              customValue={t("analytics.about.budgetValue", {
                used: fmt.number(budget.used),
                limit: fmt.number(budget.limit),
              })}
              indicatorClassName="motion-reduce:transition-none"
            />
          </div>
        )}
        <SettingRow label={t("analytics.about.updated")}>
          {updated ? (
            <RelativeTime iso={updated} size="base" />
          ) : (
            <SkeletonLine minWidth={20} maxWidth={30} />
          )}
        </SettingRow>
      </dl>
      <InsetPanel className="gap-1.5">
        <NoteLine icon={<ArrowsClockwise size={16} />}>
          {status?.feature.rollups === "on-read"
            ? t("analytics.about.rollupsOnRead")
            : t("analytics.about.rollupsScheduled")}
        </NoteLine>
      </InsetPanel>
    </SectionCard>
  );
}
