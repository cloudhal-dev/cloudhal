import { Button, ChartLegend, cn, Table, Text, TimeseriesChart } from "@cloudflare/kumo";
import { ChartLine, Table as TableIcon } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { createAnalyticsFormatter } from "./analytics-format.ts";
import { type AnalyticsGranularity, currentBucketStart } from "./analytics-range.ts";
import { echarts } from "./charts.ts";
import { useChartFrame } from "./useChartFrame.ts";
import { useChartPalette } from "./useChartPalette.ts";

/** One line or bar series: `[bucket start in ms (UTC), value]`, ordered by time. */
export interface AnalyticsSeries {
  id: string;
  /** Legend, tooltip and table header ("Page views"). */
  name: string;
  points: readonly (readonly [number, number])[];
  /** The legend's figure; defaults to the sum of the points. */
  total?: number;
}

export interface AnalyticsTimeseriesLabels {
  /**
   * What the chart shows, for screen readers, with its numbers:
   * "Page views 12,400, visits 8,900, last 30 days, up 12%".
   */
  description: string;
  /** Tooltip footer and table note ("Times in UTC"). */
  timezone: string;
  /** Toggle to the data table ("Show as table") and back ("Show as chart"). */
  showTable: string;
  showChart: string;
  /** The table's time column ("Time (UTC)"). */
  time: string;
  /** Announced while the series load ("Loading…"); Kumo's own loader would say "Loading chart". */
  loading: string;
}

export interface AnalyticsTimeseriesProps {
  /** Up to four series; colours come from `useChartPalette` in order (brand first). */
  series: readonly AnalyticsSeries[];
  /** Bucket size of the points: hourly for ranges of two days or less. */
  granularity: AnalyticsGranularity;
  locale: string;
  labels: AnalyticsTimeseriesLabels;
  /** `line` (traffic, with a gradient) or `bar` (the editor's Readers card). */
  type?: "line" | "bar";
  /** Pixel height of the plot. 280 on the Analytics screen, 120 in compact cards. */
  height?: number;
  /** Buckets from this instant on are partial (dashed). Default: the bucket `now` is in. */
  incompleteAfter?: number | null;
  /** Hide the legend and axis padding for small cards; the table toggle stays. */
  compact?: boolean;
  loading?: boolean;
  /** The clock, for tests. */
  now?: number;
  className?: string;
}

/**
 * Kumo's time axis works in the browser's zone, but buckets are UTC. Shifting each instant by the
 * local offset makes the chart's local wall clock read UTC, so the axis and the day boundaries
 * agree with the "Times in UTC" footer. Ticks and the tooltip's time are formatted back in UTC,
 * in the Studio locale (`tooltipTimestampFormat` comes from Cloudhal's Kumo patch, DESIGN.md §2v).
 */
const toChartTime = (ms: number) => ms + new Date(ms).getTimezoneOffset() * 60_000;
const fromChartTime = (ms: number) => ms - new Date(ms).getTimezoneOffset() * 60_000;

/** Time axes add month starts between the regular ticks; drop labels that would collide. */
const AXIS_PATCH = { xAxis: { axisLabel: { hideOverlap: true } } };

/**
 * Traffic over time (DESIGN.md §2v): Kumo `TimeseriesChart` with token colours, `Intl` ticks and
 * tooltip values, the current partial bucket dashed, a legend with each series' total and a
 * toggle to an accessible data table (the chart's alternative for screen readers and keyboard
 * users). Animations follow `prefers-reduced-motion`; the theme follows `data-mode`.
 */
export function AnalyticsTimeseries({
  series,
  granularity,
  locale,
  labels,
  type = "line",
  height = 280,
  incompleteAfter,
  compact = false,
  loading = false,
  now,
  className,
}: AnalyticsTimeseriesProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const palette = useChartPalette();
  const [view, setView] = useState<"chart" | "table">("chart");
  const frameRef = useChartFrame(AXIS_PATCH);
  const tableId = useId();

  const data = useMemo(
    () =>
      series.map((s, i) => ({
        name: s.name,
        color: palette.series[i % palette.series.length] as string,
        data: s.points.map(([t, v]) => [toChartTime(t), v] as [number, number]),
      })),
    [series, palette],
  );
  const partialFrom =
    incompleteAfter === null
      ? undefined
      : (incompleteAfter ?? currentBucketStart(granularity, now));
  const buckets = useMemo(() => {
    const times = new Set<number>();
    for (const s of series) for (const [t] of s.points) times.add(t);
    return [...times].sort((a, b) => a - b);
  }, [series]);

  return (
    <div
      ref={frameRef}
      className={cn("grid min-w-0 grid-cols-1 gap-3", className)}
      data-testid="analytics-timeseries"
    >
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2",
          compact ? "justify-end" : "justify-between",
        )}
      >
        {compact ? null : (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            {loading
              ? series.map((s) => <ChartLegend.SmallItem key={s.id} loading />)
              : series.map((s, i) => (
                  <ChartLegend.SmallItem
                    key={s.id}
                    name={s.name}
                    color={palette.series[i % palette.series.length] as string}
                    value={fmt.number(s.total ?? s.points.reduce((sum, [, v]) => sum + v, 0))}
                  />
                ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="xs"
          icon={view === "chart" ? <TableIcon size={14} /> : <ChartLine size={14} />}
          aria-expanded={view === "table"}
          aria-controls={tableId}
          disabled={loading}
          onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
        >
          {view === "chart" ? labels.showTable : labels.showChart}
        </Button>
      </div>
      {view === "chart" && loading ? (
        <span role="status" className="sr-only">
          {labels.loading}
        </span>
      ) : null}
      {view === "chart" ? (
        // While loading, Kumo's skeleton announces "Loading chart" in English: it is hidden from
        // assistive technology and the status above speaks instead.
        <div aria-hidden={loading || undefined} className="min-w-0">
          <TimeseriesChart
            echarts={echarts}
            type={type}
            data={data}
            gradient={type === "line"}
            height={height}
            isDarkMode={palette.isDarkMode}
            loading={loading}
            yAxisMinInterval={1}
            {...(compact ? { yAxisTickCount: 2, xAxisTickCount: 3 } : {})}
            xAxisTickFormat={(ms) => fmt.tick(fromChartTime(ms), granularity)}
            yAxisTickFormat={(v) => fmt.compact(v)}
            tooltipValueFormat={(v) => fmt.number(v)}
            tooltipTimestampFormat={(ms) => fmt.bucket(fromChartTime(ms), granularity)}
            tooltipFooter={labels.timezone}
            tooltipFollowCursor="x"
            {...(partialFrom !== undefined
              ? { incomplete: { after: toChartTime(partialFrom) } }
              : {})}
            ariaDescription={labels.description}
          />
        </div>
      ) : null}
      <section
        id={tableId}
        hidden={view !== "table"}
        aria-label={labels.description}
        // A scrolling region must be reachable by keyboard.
        tabIndex={view === "table" ? 0 : -1}
        className="max-h-80 min-w-0 overflow-auto rounded-lg ring ring-kumo-hairline"
      >
        {view === "table" && (
          <Table>
            <caption className="sr-only">{labels.description}</caption>
            <Table.Header>
              <Table.Row>
                <Table.Head>{labels.time}</Table.Head>
                {series.map((s) => (
                  <Table.Head key={s.id} className="text-end whitespace-nowrap">
                    {s.name}
                  </Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {buckets.map((t) => (
                <Table.Row key={t}>
                  <Table.Cell className="whitespace-nowrap">
                    <Text as="span">{fmt.bucket(t, granularity)}</Text>
                  </Table.Cell>
                  {series.map((s) => {
                    const v = s.points.find(([at]) => at === t)?.[1];
                    return (
                      <Table.Cell key={s.id} className="text-end whitespace-nowrap tabular-nums">
                        {v === undefined ? "—" : fmt.number(v)}
                      </Table.Cell>
                    );
                  })}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </section>
      {view === "table" && (
        <Text variant="secondary" size="xs">
          {labels.timezone}
        </Text>
      )}
    </div>
  );
}
