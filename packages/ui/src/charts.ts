/**
 * @cloudhal/ui/charts — the analytics blocks that draw with ECharts (RFC-0006 §10.4). A separate
 * entry, like `@cloudhal/ui/code`, so only the lazy Analytics route and the editors' Readers card
 * load ECharts and its modules; the rest of the analytics blocks (`StatTile`,
 * `AnalyticsRangePicker`, `BreakdownTable`, `AnalyticsQuotaBanner`, `useChartPalette`) live in
 * the main entry.
 */
export {
  type AnalyticsSeries,
  AnalyticsTimeseries,
  type AnalyticsTimeseriesLabels,
  type AnalyticsTimeseriesProps,
} from "./blocks/AnalyticsTimeseries.tsx";
export {
  CountryMap,
  type CountryMapLabels,
  type CountryMapProps,
  type CountryRow,
} from "./blocks/CountryMap.tsx";
export { echarts } from "./blocks/charts.ts";
export {
  type ReadersFigure,
  ReadersSummary,
  type ReadersSummaryLabels,
  type ReadersSummaryProps,
} from "./blocks/ReadersSummary.tsx";
