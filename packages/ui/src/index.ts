/**
 * @cloudhal/ui — the only UI entry point for Cloudhal admin surfaces (ADR-0003).
 * Kumo components are re-exported as-is; Kumo *blocks* (copied via `kumo add`, owned here) and
 * Cloudhal blocks live in ./blocks.
 */
export * from "@cloudflare/kumo";
export { ApprovalDialog, type ApprovalDialogProps } from "./blocks/ApprovalDialog.tsx";
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
