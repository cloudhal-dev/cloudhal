/**
 * The Studio API client. Each area lives in `lib/api/<area>.ts` (its types and one `<area>Api`
 * object); this file re-exports them by name and composes `api`, so imports and `api.<area>.<fn>`
 * calls stay the same everywhere.
 */

export type {
  ActivityPage,
  AgentKeyElevation,
  AgentKeySummary,
  AgentMode,
  AgentModesInfo,
  AgentScope,
  AnyScope,
  ApprovalCause,
  AuditDecision,
  AuditElevation,
  AuditOutcome,
  AuditRow,
  AutoCheck,
  AutoCheckCode,
  CreatedAgentKey,
  ElevationGrant,
  ElevationInput,
  KeyMode,
  PersonScope,
  ScheduleScope,
  SkillSummary,
} from "./api/agents.ts";
export { mcpEndpoint } from "./api/agents.ts";
export type {
  AiCommandRequest,
  AiDayUsage,
  AiPickerModel,
  AiSettings,
  AiTransportKind,
  BuildTurnEvent,
} from "./api/ai.ts";
export type {
  AnalyticsBotReason,
  AnalyticsBotTraffic,
  AnalyticsChannel,
  AnalyticsDevice,
  AnalyticsDimension,
  AnalyticsEnvelope,
  AnalyticsFeature,
  AnalyticsNode,
  AnalyticsNodeStats,
  AnalyticsRangePreset,
  AnalyticsRangeQuery,
  AnalyticsRenderReport,
  AnalyticsRenders,
  AnalyticsSeries,
  AnalyticsSettings,
  AnalyticsSettingsPatch,
  AnalyticsStatus,
  AnalyticsSummary,
  AnalyticsTop,
  AnalyticsTopRow,
  AnalyticsTotals,
  AnalyticsVitalsMetric,
  AnalyticsVitalsOneIn,
} from "./api/analytics.ts";
export type { Approval, ApprovalChanges, ApprovalStatus } from "./api/approvals.ts";
export type {
  CommentBan,
  CommentCounts,
  CommentEraseResult,
  CommentEventRow,
  Commenter,
  CommentLabelName,
  CommentListQuery,
  CommentModerateAction,
  CommentModerationResponse,
  CommentModerationResult,
  CommentNotification,
  CommentReasonCode,
  CommentReportReason,
  CommentReportRow,
  CommentRetention,
  CommentSettings,
  CommentSettingsPatch,
  CommentSummary,
  CommentsFeature,
  CommentThreadMode,
  CommentThreadState,
  CommentThreadView,
  CommentView,
  ReaderCommentStatus,
} from "./api/comments-types.ts";
export type {
  DesignRules,
  DraftPreview,
  EntryListQuery,
  NewEntry,
  NewPage,
  PreviewLink,
  PreviewLinkInput,
  PreviewTarget,
  ThemeSettings,
} from "./api/content.ts";
export type {
  AssignmentDelta,
  BodyProposal,
  ProposalItem,
  ProposalStep,
  PublishResult,
  RoleRequest,
  SnapshotDiff,
} from "./api/history.ts";
export { publishResultOf } from "./api/history.ts";
export type { ApiError } from "./api/http.ts";
export {
  ApiRequestError,
  errorCode,
  errorDetail,
  isNotEnabled,
  json,
  listOf,
  query,
  request,
} from "./api/http.ts";
export type {
  AssetDetail,
  AssetListItem,
  AssetListPage,
  AssetListQuery,
  AssetPatch,
  AssetUse,
  UploadFileRequest,
  UploadResult,
  UploadTicket,
} from "./api/media.ts";
export type {
  ElevationEndingNotification,
  ElevationRequestNotification,
  MemberJoinedNotification,
  NotificationsPage,
  RoleChangedNotification,
  StudioNotification,
} from "./api/notifications.ts";
export type {
  AutomationInput,
  BuiltinJob,
  CalendarItem,
  CalendarQuery,
  ReleaseApprovalState,
  ReleaseDiff,
  ReleaseItemView,
  ReleaseNotification,
  ReleaseResult,
  ReleaseView,
  ReleaseWhenInput,
  RulePreview,
  RunDetail,
  RunFinding,
  ScheduleNotification,
  SchedulePage,
  SchedulerStatus,
  ScheduleSettings,
  SchedulesFeature,
} from "./api/schedules-types.ts";
export { SCHEDULE_NOTIFICATION_KINDS } from "./api/schedules-types.ts";
export type { SiteSearchHit, SiteSearchKind, SiteSearchResult } from "./api/search.ts";
export type {
  ArchiveReason,
  EntrySummary,
  GovernanceOp,
  GovernancePreview,
  GovernanceResponse,
  GovernanceResult,
  NewRedirect,
  NewTaxonomy,
  NewTerm,
  PlannedRedirect,
  TagsMigrationResult,
  TagsRevertResult,
  TermDetail,
  TermListItem,
  TermPreview,
  TermUsage,
} from "./api/taxonomy.ts";
export type {
  Ability,
  CreatedInvite,
  InstanceFeature,
  InstanceInfo,
  Invite,
  InviteDetails,
  InviteStatus,
  InvitesInfo,
  KeyNarrowing,
  Me,
  Member,
  MemberRemoval,
  NewInvite,
  ResetDetails,
  Role,
  RolesInfo,
  SignUpPolicy,
} from "./api/team.ts";

import { agentsApi } from "./api/agents.ts";
import { aiApi } from "./api/ai.ts";
import { analyticsApi } from "./api/analytics.ts";
import { approvalsApi } from "./api/approvals.ts";
import { commentsApi } from "./api/comments.ts";
import { contentApi } from "./api/content.ts";
import { historyApi } from "./api/history.ts";
import { mediaApi } from "./api/media.ts";
import { menusApi } from "./api/menus.ts";
import { notificationsApi } from "./api/notifications.ts";
import { searchApi } from "./api/search.ts";
import { taxonomyApi } from "./api/taxonomy.ts";
import { teamApi } from "./api/team.ts";

/** Thin typed client over the Cloudhal API; every mutation sends the full document (CAS on `rev`). */
export const api = {
  me: teamApi.me,
  instance: teamApi.instance,
  scheduler: teamApi.scheduler,
  members: teamApi.members,
  invites: teamApi.invites,
  passwordReset: teamApi.passwordReset,
  notifications: notificationsApi,
  skills: agentsApi.skills,
  approvals: approvalsApi,
  previewLinks: contentApi.previewLinks,
  sites: contentApi.sites,
  pages: contentApi.pages,
  entries: contentApi.entries,
  design: contentApi.design,
  themeSettings: contentApi.themeSettings,
  blockTypes: contentApi.blockTypes,
  ai: aiApi,
  proposals: historyApi.proposals,
  snapshots: historyApi.snapshots,
  taxonomies: taxonomyApi.taxonomies,
  terms: taxonomyApi.terms,
  redirects: taxonomyApi.redirects,
  menus: menusApi,
  migrations: taxonomyApi.migrations,
  activity: agentsApi.activity,
  agentKeys: agentsApi.agentKeys,
  assets: mediaApi,
  analytics: analyticsApi,
  comments: commentsApi,
  preview: contentApi.preview,
  search: searchApi,
};
