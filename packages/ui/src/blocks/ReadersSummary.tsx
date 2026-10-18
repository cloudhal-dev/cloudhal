import { LinkButton, Text } from "@cloudflare/kumo";
import { ArrowBendDownRight, ChartLine } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AnalyticsTimeseries, type AnalyticsTimeseriesLabels } from "./AnalyticsTimeseries.tsx";
import type { StatDelta } from "./analytics-format.ts";
import { BreakdownMeters, type BreakdownRow } from "./Breakdown.tsx";
import { DirectionalIcon } from "./DirectionalIcon.tsx";
import { StatTile, StatTileGroup } from "./StatTile.tsx";

/** A figure and, when comparing, the previous period's figure. */
export interface ReadersFigure {
  value: number | null | undefined;
  previous?: number | null;
}

export interface ReadersSummaryLabels {
  pageviews: string;
  visits: string;
  /** Accessible name of the two figures ("Readers, last 30 days"). */
  figures: string;
  /** The bar chart's labels (description with its numbers, "Times in UTC", table toggle). */
  chart: AnalyticsTimeseriesLabels;
  /** Accessible name of the channel meters ("Where readers came from"). */
  channels: string;
  /** Folded channels ("Other"), unused unless more than three are passed with `showOther`. */
  other: string;
  /** The ghost link to the Analytics screen filtered to this node ("Open in analytics"). */
  open: string;
  /** Delta words for the tiles (see `StatTile.describeDelta`). */
  describeDelta?: (formatted: string, delta: StatDelta) => string;
}

export interface ReadersSummaryProps {
  locale: string;
  labels: ReadersSummaryLabels;
  pageviews: ReadersFigure;
  visits: ReadersFigure;
  /** Daily page views of the node, `[day start (UTC ms), views]`. */
  series: readonly (readonly [number, number])[];
  /** Entrances by channel, ranked; the top three are shown as meters (shares of all channels). */
  channels: readonly BreakdownRow[];
  /**
   * The slug-history line, already worded by the screen ("Old addresses still bring readers: 42
   * this month"); left out when no redirect was hit.
   */
  redirects?: string;
  /** `/analytics?filter=node:<id>` for the "Open in analytics" link. */
  href: string;
  loading?: boolean;
  /**
   * Replaces the body with a state of its own (a `SectionEmpty`): never published, no readers yet,
   * or — for Contributors — the reason they cannot see analytics (DESIGN.md §2s).
   */
  empty?: ReactNode;
}

/**
 * The body of the editors' "Readers" card (RFC-0006 §10.2, DESIGN.md §2v): page views and visits
 * as compact `StatTile`s, a 120 px daily bar chart, the top three channels as `Meter`s, the old
 * addresses that still bring readers, and a ghost link to the Analytics screen filtered to the
 * node. The card itself (`SectionCard` with the 7 days | 30 days | All time `Tabs`) is the
 * screen's; this block fills it.
 */
export function ReadersSummary({
  locale,
  labels,
  pageviews,
  visits,
  series,
  channels,
  redirects,
  href,
  loading = false,
  empty,
}: ReadersSummaryProps) {
  if (empty !== undefined && empty !== null && empty !== false) return <>{empty}</>;
  const channelTotal = channels.reduce((sum, c) => sum + c.value, 0);
  return (
    <div className="grid min-w-0 gap-5" data-testid="readers-summary">
      <StatTileGroup label={labels.figures} density="compact">
        <StatTile
          label={labels.pageviews}
          value={pageviews.value}
          previous={pageviews.previous ?? null}
          locale={locale}
          loading={loading}
          {...(labels.describeDelta ? { describeDelta: labels.describeDelta } : {})}
        />
        <StatTile
          label={labels.visits}
          value={visits.value}
          previous={visits.previous ?? null}
          locale={locale}
          loading={loading}
          {...(labels.describeDelta ? { describeDelta: labels.describeDelta } : {})}
        />
      </StatTileGroup>
      <AnalyticsTimeseries
        series={[{ id: "pageviews", name: labels.pageviews, points: series }]}
        granularity="day"
        type="bar"
        height={120}
        compact
        locale={locale}
        labels={labels.chart}
        loading={loading}
      />
      <BreakdownMeters
        rows={channels}
        locale={locale}
        limit={3}
        total={channelTotal}
        showOther={false}
        otherLabel={labels.other}
        label={labels.channels}
        loading={loading}
      />
      {redirects && !loading && (
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-lh shrink-0 items-center text-kumo-subtle" aria-hidden>
            <DirectionalIcon icon={ArrowBendDownRight} size={16} />
          </span>
          <Text variant="secondary" size="sm">
            {redirects}
          </Text>
        </div>
      )}
      <div className="flex justify-start">
        <LinkButton variant="ghost" size="sm" href={href} icon={<ChartLine size={16} />}>
          {labels.open}
        </LinkButton>
      </div>
    </div>
  );
}
