/**
 * Site › Overview › Analytics (RFC-0006 §10.1, DESIGN.md §2v), template `dashboard`: the range in
 * the page header, the banners that explain what can be read, then `Columns 2-1` of `SectionCard`s
 * (components/AnalyticsSections.tsx): Traffic, Top content, Sources, Errors and redirects; aside
 * Countries, Devices, Core Web Vitals, AI and search crawlers, About this data. Lazy-loaded, so
 * ECharts and the country shapes reach only people who open it.
 */
import {
  AnalyticsQuotaBanner,
  AnalyticsRangePicker,
  Banner,
  Button,
  Columns,
  directional,
  Empty,
  LinkButton,
  PageLayout,
  RefreshButton,
  resolveAnalyticsRange,
  shouldWarnFreePlan,
} from "@cloudhal/ui";
import {
  ArrowSquareOut,
  ChartLine,
  ClockCountdown,
  Funnel,
  GearSix,
  Info,
  LockSimple,
  Power,
} from "@phosphor-icons/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AnalyticsErrorBanner,
  analyticsKeys,
  useAnalyticsAccess,
  useAnalyticsFeature,
  useAnalyticsStatus,
  useAnalyticsText,
} from "../components/Analytics.tsx";
import { BotTrafficBanner, useBotTraffic } from "../components/AnalyticsBots.tsx";
import {
  AboutCard,
  type AnalyticsScope,
  CountriesCard,
  CrawlersCard,
  DevicesCard,
  ErrorsCard,
  SourcesCard,
  TopContentCard,
  TrafficCard,
  useSummary,
  VitalsCard,
} from "../components/AnalyticsSections.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { useGate } from "../components/useMe.ts";
import {
  analyticsSituation,
  parseAnalyticsFilter,
  rangeFromSearch,
  rangeKey,
  searchForRange,
} from "../lib/analytics.ts";
import { api, isNotEnabled } from "../lib/api.ts";
import { primaryHostname } from "../lib/site-settings.ts";

/** Opens elsewhere; mirrors in right-to-left languages (ADR-0033 C1). */
const OpenOutside = directional(ArrowSquareOut);

/** The node a `node:` filter names, from the lists the shell already caches. */
function useNodeTitle(siteId: string, nodeId: string | undefined): string | undefined {
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: !!nodeId,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: !!nodeId,
  });
  if (!nodeId) return undefined;
  return (
    pages.data?.find((p) => p.id === nodeId)?.title ??
    entries.data?.find((e) => e.id === nodeId)?.title
  );
}

export function AnalyticsPage() {
  const text = useAnalyticsText();
  const { t, fmt } = text;
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search = useSearch({ from: "/sites/$siteId/analytics" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gate = useAnalyticsAccess();
  const settingsGate = useGate("analytics.settings");
  const { feature } = useAnalyticsFeature();
  const status = useAnalyticsStatus(siteId, gate.allowed);
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });

  const range = rangeFromSearch(search);
  const filter = parseAnalyticsFilter(search.filter);
  const compare = search.compare !== "0";
  const key = rangeKey(range);
  const resolved = resolveAnalyticsRange(range);
  const scope: AnalyticsScope = {
    siteId,
    range,
    resolved,
    filter,
    compare,
    poll: "preset" in range && range.preset === "today" ? 60_000 : false,
    rangeLabel: fmt.dayRange(resolved.from, resolved.to),
    text,
  };
  const missing = isNotEnabled(status.error);
  const situation = analyticsSituation(missing ? undefined : feature, status.data);
  const readable = gate.ready && gate.allowed && !missing;
  const summary = useSummary(scope, readable);
  const pageviews = summary.data?.data.pageviews;
  const empty = readable && !filter && pageviews === 0;
  // Zero in this period: has the site ever had a visit (decides "no visits yet" vs "pick longer")?
  const ever = useQuery({
    queryKey: [...analyticsKeys.all(siteId), "ever"],
    queryFn: () => api.analytics.summary(siteId, { range: "12m" }),
    enabled: empty && key !== "12m",
    staleTime: 5 * 60_000,
  });
  // Possible bot traffic (§5.5): live hourly reads, so not while live reads are off or spent.
  const bots = useBotTraffic(
    scope,
    readable &&
      pageviews !== undefined &&
      pageviews > 0 &&
      !situation.cantRead &&
      !situation.budgetSpent &&
      !situation.deploymentOff,
  );
  const fetching = useIsFetching({ queryKey: analyticsKeys.all(siteId) }) > 0;
  const nodeTitle = useNodeTitle(siteId, filter?.kind === "node" ? filter.value : undefined);
  const settingsHref = settingsGate.allowed ? `/sites/${siteId}/settings#analytics` : undefined;
  const host = primaryHostname(site.data?.domains ?? []);

  const setSearch = (next: Partial<typeof search>) =>
    navigate({
      to: "/sites/$siteId/analytics",
      params: { siteId },
      search: (prev: typeof search) => ({ ...prev, ...next }),
      replace: true,
    });
  const openSettings = () =>
    navigate({ to: "/sites/$siteId/settings", params: { siteId }, hash: "analytics" });
  const turnOn = (
    <Button
      variant="primary"
      icon={<Power />}
      onClick={openSettings}
      disabled={!settingsGate.allowed}
      title={settingsGate.reason}
    >
      {t("analytics.off.turnOn")}
    </Button>
  );

  const banners: ReactNode[] = [];
  if (situation.deploymentOff && status.isSuccess)
    banners.push(
      <Banner
        key="not-running"
        variant="secondary"
        icon={<Info weight="fill" />}
        title={t("analytics.banners.notRunning.title")}
        description={t("analytics.banners.notRunning.description")}
      />,
    );
  if (situation.cantRead)
    banners.push(
      <Banner
        key="cant-read"
        variant="secondary"
        icon={<Info weight="fill" />}
        title={t("analytics.banners.cantRead.title")}
        description={t("analytics.banners.cantRead.description")}
      />,
    );
  const quota = status.data?.quota;
  if (quota && shouldWarnFreePlan(quota.requests, status.data?.settings.planHint ?? "unknown"))
    banners.push(
      <AnalyticsQuotaBanner
        key="quota"
        requests={quota.requests}
        locale={text.locale}
        labels={{
          title: t("analytics.banners.quota.title"),
          description: t("analytics.banners.quota.description"),
          meter: t("analytics.banners.quota.meter"),
          meterValue: (used, limit) => t("analytics.banners.quota.meterValue", { used, limit }),
        }}
        actions={
          settingsHref ? (
            <Banner.Action variant="secondary" icon={<GearSix />} onClick={openSettings}>
              {t("analytics.banners.quota.settings")}
            </Banner.Action>
          ) : undefined
        }
      />,
    );
  if (situation.budgetSpent)
    banners.push(
      <Banner
        key="budget"
        variant="secondary"
        icon={<ClockCountdown weight="fill" />}
        title={t("analytics.banners.budget.title")}
        description={t("analytics.banners.budget.description")}
      />,
    );
  if (situation.siteOff && !empty)
    banners.push(
      <Banner
        key="site-off"
        variant="secondary"
        icon={<Info weight="fill" />}
        title={t("analytics.banners.siteOff.title")}
        description={t("analytics.banners.siteOff.description")}
        action={
          settingsHref ? (
            <Banner.Action variant="secondary" icon={<GearSix />} onClick={openSettings}>
              {t("analytics.off.turnOn")}
            </Banner.Action>
          ) : undefined
        }
      />,
    );
  if (bots.data && bots.data.data.level !== "none")
    banners.push(
      <BotTrafficBanner
        key="bots"
        scope={scope}
        signal={bots.data.data}
        onShowDay={(day) => setSearch({ range: undefined, ...searchForRange(day) })}
      />,
    );
  if (filter)
    banners.push(
      <Banner
        key="filter"
        variant="secondary"
        icon={<Funnel weight="fill" />}
        title={t("analytics.filter.title", { label: text.filterLabel(filter, nodeTitle) })}
        description={t(`analytics.filter.kinds.${filter.kind}`)}
        action={
          <Banner.Action variant="secondary" onClick={() => setSearch({ filter: undefined })}>
            {t("analytics.filter.clear")}
          </Banner.Action>
        }
      />,
    );

  const notRunning = (
    <Empty
      icon={<ChartLine size={48} className="text-kumo-inactive" />}
      title={t("analytics.empty.notRunning.title")}
      description={t("analytics.empty.notRunning.description")}
      commandLine="cloudhal deploy"
    />
  );
  let body: ReactNode;
  if (!gate.ready || !gate.allowed) body = null;
  else if (missing) body = notRunning;
  else if (empty && situation.deploymentOff) body = notRunning;
  else if (empty && situation.siteOff)
    body = (
      <Empty
        icon={<Power size={48} className="text-kumo-inactive" />}
        title={t("analytics.empty.off.title")}
        description={t("analytics.empty.off.description")}
        contents={turnOn}
      />
    );
  else if (empty && situation.cantRead)
    body = (
      <Empty
        icon={<ClockCountdown size={48} className="text-kumo-inactive" />}
        title={t("analytics.empty.cantRead.title")}
        description={t("analytics.banners.cantRead.description")}
      />
    );
  else if (empty && (key === "12m" || ever.data?.data.pageviews === 0))
    body = (
      <Empty
        icon={<ChartLine size={48} className="text-kumo-inactive" />}
        title={t("analytics.empty.noVisits.title")}
        description={t("analytics.empty.noVisits.description")}
        contents={
          host ? (
            <LinkButton href={`https://${host}`} external variant="secondary" icon={OpenOutside}>
              {t("analytics.empty.noVisits.openSite")}
            </LinkButton>
          ) : undefined
        }
      />
    );
  else if (empty && ever.data)
    body = (
      <Empty
        icon={<ChartLine size={48} className="text-kumo-inactive" />}
        title={t("analytics.empty.noVisitsInRange.title")}
        description={t("analytics.empty.noVisitsInRange.description")}
        contents={
          <Button
            variant="secondary"
            onClick={() =>
              setSearch({ ...searchForRange({ preset: "12m" }), from: undefined, to: undefined })
            }
          >
            {t("analytics.empty.noVisitsInRange.action")}
          </Button>
        }
      />
    );
  else
    body = (
      <Columns variant="2-1">
        <div className="grid min-w-0 content-start gap-6">
          <TrafficCard
            scope={scope}
            summary={summary}
            uniqueVisitors={status.data?.settings.uniqueVisitors ?? false}
          />
          {filter?.kind !== "node" && (
            <TopContentCard scope={scope} total={summary.data?.data.pageviews} />
          )}
          <SourcesCard scope={scope} totalVisits={summary.data?.data.visits} />
          {!filter && <ErrorsCard scope={scope} />}
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <CountriesCard scope={scope} total={summary.data?.data.pageviews} />
          <DevicesCard scope={scope} total={summary.data?.data.pageviews} />
          <VitalsCard
            scope={scope}
            vitalsOneIn={status.data?.settings.vitalsOneIn}
            settingsHref={settingsHref}
          />
          {!filter && <CrawlersCard scope={scope} />}
          <AboutCard
            scope={scope}
            status={status.data}
            summary={summary.data}
            settingsHref={settingsHref}
          />
        </div>
      </Columns>
    );

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("analytics.page.title") }]} />}
      icon={<ChartLine size={24} />}
      title={t("analytics.page.title")}
      description={t("analytics.page.description")}
      actions={
        gate.allowed ? (
          <AnalyticsRangePicker
            value={range}
            onChange={(next) =>
              setSearch({
                range: undefined,
                from: undefined,
                to: undefined,
                ...searchForRange(next),
              })
            }
            labels={text.rangePicker}
            locale={text.locale}
            compare={compare}
            onCompareChange={(on) => setSearch({ compare: on ? undefined : "0" })}
            // In the picker's own row, so on phones it wraps with Custom… and Compare.
            trailing={
              <RefreshButton
                size="sm"
                variant="secondary"
                aria-label={t("analytics.refresh")}
                loading={fetching}
                onClick={() => void qc.invalidateQueries({ queryKey: analyticsKeys.all(siteId) })}
              />
            }
          />
        ) : undefined
      }
    >
      {!gate.allowed && (
        <div data-testid="analytics-gated">
          <Banner
            variant="secondary"
            icon={<LockSimple weight="fill" />}
            title={t("analytics.gate.title")}
            description={gate.reason}
          />
        </div>
      )}
      {banners}
      {readable && !missing && (
        <AnalyticsErrorBanner
          error={summary.error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
        />
      )}
      {body}
    </PageLayout>
  );
}
