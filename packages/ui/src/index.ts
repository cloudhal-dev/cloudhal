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
  AgendaList,
  type AgendaListLabels,
  type AgendaListProps,
} from "./blocks/AgendaList.tsx";
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
  ArticleCommentsSummary,
  type ArticleCommentsSummaryLabels,
  type ArticleCommentsSummaryProps,
} from "./blocks/ArticleCommentsSummary.tsx";
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
  BlockPropsForm,
  type BlockPropsFormLabels,
  type BlockPropsFormProps,
} from "./blocks/BlockPropsForm.tsx";
export { BodyDiff, type BodyDiffLabels, type BodyDiffProps } from "./blocks/BodyDiff.tsx";
export {
  type BreakdownLabels,
  BreakdownMeters,
  type BreakdownMetersProps,
  type BreakdownRow,
  BreakdownTable,
  type BreakdownTableProps,
  foldBreakdown,
} from "./blocks/Breakdown.tsx";
export {
  BuildActivity,
  type BuildActivityItem,
  type BuildActivityLabels,
  type BuildActivityProps,
} from "./blocks/BuildActivity.tsx";
export {
  type BuildChatItem,
  BuildChatLog,
  type BuildChatLogProps,
} from "./blocks/BuildChatLog.tsx";
export {
  type BulkAction,
  BulkActionBar,
  type BulkActionBarLabels,
  type BulkActionBarProps,
} from "./blocks/BulkActionBar.tsx";
export { blockIcon } from "./blocks/blockIcon.ts";
export {
  type CalendarDayContext,
  type CalendarDensity,
  CalendarMonth,
  type CalendarMonthLabels,
  type CalendarMonthProps,
  type CalendarMove,
} from "./blocks/CalendarMonth.tsx";
export {
  CALENDAR_VIEWS,
  CalendarNav,
  type CalendarNavLabels,
  type CalendarNavProps,
  type CalendarView,
} from "./blocks/CalendarNav.tsx";
export {
  ColorRolePreview,
  type ColorRolePreviewLabels,
  type ColorRolePreviewProps,
  type ColorRolePreviewScheme,
} from "./blocks/ColorRolePreview.tsx";
export { Columns, type ColumnsProps, type ColumnsVariant } from "./blocks/Columns.tsx";
export {
  type CommentBanSubject,
  type CommenterBan,
  CommenterSummary,
  type CommenterSummaryLabels,
  type CommenterSummaryProps,
} from "./blocks/CommenterSummary.tsx";
export {
  COMMENT_DATE_FILTERS,
  type CommentActorFilter,
  type CommentDateFilter,
  type CommentFilterFacet,
  CommentFilters,
  type CommentFiltersLabels,
  type CommentFiltersProps,
  type CommentFilterValue,
  type CommentLabelFilter,
  type CommentStatusFilter,
  commentFilterSince,
  DEFAULT_COMMENT_FILTERS,
  isCommentFilterActive,
} from "./blocks/CommentFilters.tsx";
export {
  type CommentEvent,
  CommentHistory,
  type CommentHistoryLabels,
  type CommentHistoryProps,
  type CommentModerationLabels,
  StatementOfReasons,
  type StatementOfReasonsLabels,
  type StatementOfReasonsProps,
} from "./blocks/CommentModeration.tsx";
export {
  CommentAuthor,
  type CommentAuthorProps,
  CommentLabelBadge,
  type CommentLabelBadgeProps,
  CommentLabelList,
  type CommentLabelListProps,
  CommentStatusBadge,
  type CommentStatusBadgeProps,
  CommentTime,
  type CommentTimeProps,
  type CommentWords,
  UntrustedTextPanel,
  type UntrustedTextPanelProps,
} from "./blocks/CommentParts.tsx";
export {
  type CommentReport,
  CommentReports,
  type CommentReportsLabels,
  type CommentReportsProps,
} from "./blocks/CommentReports.tsx";
export { CommentRow, type CommentRowData, type CommentRowProps } from "./blocks/CommentRow.tsx";
export { CommentText, type CommentTextProps } from "./blocks/CommentText.tsx";
export {
  CommentThread,
  type CommentThreadLabels,
  type CommentThreadProps,
} from "./blocks/CommentThread.tsx";
export {
  type CorrectionKind,
  CorrectionList,
  type CorrectionListItem,
  type CorrectionListLabels,
  type CorrectionListProps,
} from "./blocks/CorrectionList.tsx";
export {
  type CalendarLabels,
  calendarLocaleProps,
  firstDayOfWeek,
} from "./blocks/calendar-locale.ts";
export {
  buildCommentThread,
  COMMENT_DISPLAY_DEPTH,
  COMMENT_LABELS,
  COMMENT_REASON_CODES,
  COMMENT_REPORT_REASONS,
  COMMENT_STATUSES,
  COMMENT_THREAD_MODES,
  type CommentLabelName,
  type CommentLabelSource,
  type CommentModerationAction,
  type CommentReasonCode,
  type CommentReportReason,
  type CommentTextLine,
  type CommentTextParagraph,
  type CommentTextSegment,
  type CommentThreadMode,
  type CommentThreadNode,
  type CommentThreadState,
  commentAnchorId,
  commentAuthorName,
  commentExcerpt,
  formatCommentDate,
  formatCommentTime,
  isInstructionLike,
  linkifyCommentLine,
  parseCommentText,
  safeCommentHref,
  type ThreadComment,
} from "./blocks/comment-model.ts";
export {
  DateTimeField,
  type DateTimeFieldLabels,
  type DateTimeFieldProps,
  type DateTimeValue,
  useTimeOfDayDraft,
} from "./blocks/DateTimeField.tsx";
export {
  type FocalPoint,
  FocalPointPicker,
  type FocalPointPickerLabels,
  type FocalPointPickerProps,
} from "./blocks/FocalPointPicker.tsx";
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
  type NextRun,
  NextRuns,
  type NextRunsLabels,
  type NextRunsProps,
} from "./blocks/NextRuns.tsx";
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
  usePageScrollRoot,
  usePageScrollRootRef,
} from "./blocks/PageLayout.tsx";
export {
  morphPreview,
  PREVIEW_DEVICE_WIDTH,
  type PreviewDevice,
  PreviewPanel,
  type PreviewPanelLabels,
  type PreviewPanelProps,
  type PreviewPick,
  type PreviewTarget,
  previewElement,
  previewTargetAt,
} from "./blocks/PreviewPanel.tsx";
export {
  RecurrenceEditor,
  type RecurrenceEditorLabels,
  type RecurrenceEditorProps,
} from "./blocks/RecurrenceEditor.tsx";
export {
  type RescheduleApprovalEffect,
  RescheduleDialog,
  type RescheduleDialogLabels,
  type RescheduleDialogProps,
} from "./blocks/RescheduleDialog.tsx";
export {
  DEFAULT_RECURRENCE,
  RECURRENCE_PRESETS,
  type RecurrenceEnd,
  type RecurrenceFrequency,
  type RecurrenceMonthly,
  type RecurrenceOrdinal,
  type RecurrencePreset,
  type RecurrenceProblem,
  type RecurrenceValue,
  type RecurrenceWeekday,
  RRULE_WEEKDAYS,
  recurrenceProblems,
  recurrenceRule,
} from "./blocks/recurrence.ts";
export {
  isScheduleFilterActive,
  type ScheduleFacetDefinition,
  type ScheduleFilterFacet,
  type ScheduleFilterOption,
  ScheduleFilters,
  type ScheduleFiltersLabels,
  type ScheduleFiltersProps,
  type ScheduleFilterValue,
  type ScheduleView,
} from "./blocks/ScheduleFilters.tsx";
export {
  SCHEDULE_KIND_ICON,
  ScheduleItem,
  type ScheduleItemChipProps,
  type ScheduleItemProps,
  type ScheduleItemRowProps,
  scheduleItemSentence,
} from "./blocks/ScheduleItem.tsx";
export {
  SCHEDULE_RUN_COLUMNS,
  type ScheduleRunColumn,
  ScheduleRunHeader,
  ScheduleRunRow,
  type ScheduleRunRowData,
  type ScheduleRunRowLabels,
  type ScheduleRunRowProps,
} from "./blocks/ScheduleRunRow.tsx";
export {
  ScheduleStatusBadge,
  type ScheduleStatusBadgeProps,
  scheduleStatusLook,
} from "./blocks/ScheduleStatusBadge.tsx";
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
export {
  SurfaceOutline,
  type SurfaceOutlineField,
  type SurfaceOutlineLabels,
  type SurfaceOutlineNode,
  type SurfaceOutlineProps,
} from "./blocks/SurfaceOutline.tsx";
export {
  AUTOMATION_STATES,
  dateToDay,
  dayToDate,
  entryDay,
  formatDay,
  formatMonth,
  formatScheduleTime,
  formatTimeOfDay,
  groupByDay,
  hourCycleOf,
  isHiddenByDefault,
  monthGrid,
  monthOf,
  parseTimeOfDay,
  RELEASE_STATES,
  relativeDay,
  SCHEDULE_APPROVAL_STATES,
  SCHEDULE_KINDS,
  SCHEDULE_RUN_OUTCOMES,
  SCHEDULE_RUN_STATES,
  SCHEDULE_RUN_TRIGGERS,
  type ScheduleApprovalState,
  type ScheduleEntry,
  type ScheduleKind,
  type ScheduleLook,
  type ScheduleOrigin,
  type ScheduleRunOutcome,
  type ScheduleRunTrigger,
  type ScheduleStatus,
  type ScheduleWords,
  scheduleLook,
  shiftDay,
  shiftMonth,
  sortEntries,
  statusWord,
  type WeekDay,
  weekdayNames,
  weekdayOf,
  weekdayOrder,
  zonedDay,
  zonedParts,
} from "./blocks/schedule-model.ts";
export { TermChip, TermChipList, type TermChipProps } from "./blocks/TermChips.tsx";
export {
  TimezoneNote,
  type TimezoneNoteProps,
} from "./blocks/TimezoneNote.tsx";
export {
  type ChartColors,
  mixHex,
  resolveChartColors,
  useChartPalette,
  useColorMode,
  useReducedMotion,
} from "./blocks/useChartPalette.ts";
