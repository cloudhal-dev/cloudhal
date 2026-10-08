/**
 * @cloudhal/ui — the only UI entry point for Cloudhal admin surfaces (ADR-0003).
 * Kumo components are re-exported as-is; Kumo *blocks* (copied via `kumo add`, owned here) and
 * Cloudhal blocks live in ./blocks.
 */
export * from "@cloudflare/kumo";
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
export { Columns, type ColumnsProps, type ColumnsVariant } from "./blocks/Columns.tsx";
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
export { StatusBadge, type StatusBadgeProps } from "./blocks/StatusBadge.tsx";
export { TermChip, TermChipList, type TermChipProps } from "./blocks/TermChips.tsx";
