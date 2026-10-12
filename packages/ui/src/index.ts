/**
 * @cloudhal/ui — the only UI entry point for Cloudhal admin surfaces (ADR-0003).
 * Kumo components are re-exported as-is; Kumo *blocks* (copied via `kumo add`, owned here) and
 * Cloudhal blocks live in ./blocks. Blocks that draw with ECharts (analytics charts and the
 * country map) live in the separate `@cloudhal/ui/charts` entry so only lazy routes load ECharts.
 *
 * `package.json` declares `sideEffects` (the CSS and the ECharts registration in blocks/charts.ts
 * only), so a bundler keeps just the blocks a chunk uses: a block every screen does not need stays
 * out of Studio's initial load. Keep blocks free of top-level side effects, or list them there.
 */
export * from "@cloudflare/kumo";
export {
  AnalyticsBotBanner,
  type AnalyticsBotBannerLabels,
  type AnalyticsBotBannerProps,
} from "./blocks/AnalyticsBotBanner.tsx";
export {
  type AnalyticsPlanHint,
  AnalyticsQuotaBanner,
  type AnalyticsQuotaBannerLabels,
  type AnalyticsQuotaBannerProps,
  FREE_PLAN_WARNING_AT,
  shouldWarnFreePlan,
  WORKERS_FREE_DAILY_REQUESTS,
} from "./blocks/AnalyticsQuotaBanner.tsx";
export {
  AnalyticsRangePicker,
  type AnalyticsRangePickerLabels,
  type AnalyticsRangePickerProps,
} from "./blocks/AnalyticsRangePicker.tsx";
export { ApprovalDialog, type ApprovalDialogProps } from "./blocks/ApprovalDialog.tsx";
export {
  ActorBadge,
  type ActorBadgeProps,
  type AuditActorKind,
  type AuditDecision,
  type AuditOutcome,
  DecisionBadge,
  type DecisionBadgeProps,
  OutcomeBadge,
  type OutcomeBadgeProps,
} from "./blocks/AuditBadges.tsx";
export { AuthLayout, type AuthLayoutProps } from "./blocks/AuthLayout.tsx";
export { Avatar, type AvatarProps, type AvatarSize } from "./blocks/Avatar.tsx";
export {
  type AnalyticsFormatter,
  type CountryNameLabels,
  compareValues,
  createAnalyticsFormatter,
  type DeltaTone,
  FLAT_WITHIN,
  type StatDelta,
} from "./blocks/analytics-format.ts";
export {
  ANALYTICS_RANGE_PRESETS,
  type AnalyticsGranularity,
  type AnalyticsRange,
  type AnalyticsRangePreset,
  addDays,
  currentBucketStart,
  isAnalyticsRangePreset,
  isoDay,
  isValidCustomRange,
  MAX_RANGE_DAYS,
  pickedDay,
  previousAnalyticsRange,
  type ResolvedAnalyticsRange,
  resolveAnalyticsRange,
  utcMidnight,
} from "./blocks/analytics-range.ts";
export {
  type BreakdownLabels,
  BreakdownMeters,
  type BreakdownMetersProps,
  type BreakdownRow,
  BreakdownTable,
  type BreakdownTableProps,
  foldBreakdown,
} from "./blocks/Breakdown.tsx";
export { Columns, type ColumnsProps, type ColumnsVariant } from "./blocks/Columns.tsx";
export {
  type CalendarLabels,
  calendarLocaleProps,
  firstDayOfWeek,
} from "./blocks/calendar-locale.ts";
export {
  InsetPanel,
  type InsetPanelProps,
  type InsetPanelVariant,
} from "./blocks/InsetPanel.tsx";
export {
  DeleteResource,
  type DeleteResourceProps,
} from "./blocks/kumo/delete-resource/delete-resource.tsx";
export { PageHeader, type PageHeaderProps } from "./blocks/kumo/page-header/page-header.tsx";
export {
  ResourceListPage,
  type ResourceListPageProps,
} from "./blocks/kumo/resource-list/resource-list.tsx";
export {
  MediaDropZone,
  type MediaDropZoneLabels,
  type MediaDropZoneProps,
  MediaGrid,
  MediaKindFrame,
  MediaTile,
  type MediaTileProps,
  useFileChooser,
} from "./blocks/Media.tsx";
export {
  MenuTree,
  type MenuTreeBlock,
  type MenuTreeEvent,
  type MenuTreeItem,
  type MenuTreeLabels,
  type MenuTreeMove,
  type MenuTreeProps,
  type MenuTreeRowContext,
} from "./blocks/MenuTree.tsx";
export {
  NavigationPreview,
  type NavigationPreviewItem,
  type NavigationPreviewLabels,
  type NavigationPreviewProps,
} from "./blocks/NavigationPreview.tsx";
export {
  NotificationBell,
  type NotificationBellProps,
  NotificationItem,
  type NotificationItemProps,
  type NotificationTone,
} from "./blocks/NotificationPanel.tsx";
export {
  PageCrumbsSlot,
  PageFrameProvider,
  PageLayout,
  type PageLayoutProps,
  type PageWidth,
} from "./blocks/PageLayout.tsx";
export {
  PREVIEW_DEVICE_WIDTH,
  type PreviewDevice,
  PreviewPanel,
  type PreviewPanelLabels,
  type PreviewPanelProps,
} from "./blocks/PreviewPanel.tsx";
export { SectionCard, type SectionCardProps } from "./blocks/SectionCard.tsx";
export { SectionEmpty, type SectionEmptyProps } from "./blocks/SectionEmpty.tsx";
export {
  ImagePreview,
  type ImagePreviewLabels,
  type ImagePreviewProps,
  type ImagePreviewStatus,
  SearchResultPreview,
  type SearchResultPreviewProps,
  SocialCardPreview,
  type SocialCardPreviewProps,
} from "./blocks/SeoPreview.tsx";
export {
  SidebarSwitcher,
  type SidebarSwitcherProps,
  type SwitcherItem,
} from "./blocks/SidebarSwitcher.tsx";
export {
  SnapshotTimeline,
  type SnapshotTimelineLabels,
  type SnapshotTimelineProps,
} from "./blocks/SnapshotTimeline.tsx";
export {
  DeltaBadge,
  Sparkline,
  StatTile,
  StatTileGroup,
  type StatTileGroupProps,
  type StatTileProps,
} from "./blocks/StatTile.tsx";
export { StatusBadge, type StatusBadgeProps } from "./blocks/StatusBadge.tsx";
export { TermChip, TermChipList, type TermChipProps } from "./blocks/TermChips.tsx";
export {
  type ChartColors,
  mixHex,
  resolveChartColors,
  useChartPalette,
  useColorMode,
  useReducedMotion,
} from "./blocks/useChartPalette.ts";
