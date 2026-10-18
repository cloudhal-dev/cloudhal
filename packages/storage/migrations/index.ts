import type { Migration } from "../src/migrate.ts";
import { migration0001Init } from "./0001_init.ts";
import { migration0002Auth } from "./0002_auth.ts";
import { migration0003Agent } from "./0003_agent.ts";
import { migration0004AuditActorName } from "./0004_audit_actor_name.ts";
import { migration0005AuthRateLimit } from "./0005_auth_rate_limit.ts";
import { migration0006Approvals } from "./0006_approvals.ts";
import { migration0007AuditMode } from "./0007_audit_mode.ts";
import { migration0008PolicyDetail } from "./0008_policy_detail.ts";
import { migration0009AuditElevation } from "./0009_audit_elevation.ts";
import { migration0010ApprovalResult } from "./0010_approval_result.ts";
import { migration0011OpGuards } from "./0011_op_guards.ts";
import { migration0012Roles } from "./0012_roles.ts";
import { migration0013Media } from "./0013_media.ts";
import { migration0014Analytics } from "./0014_analytics.ts";
import { migration0015AnalyticsPrivacySignal } from "./0015_analytics_privacy_signal.ts";
import { migration0016Comments } from "./0016_comments.ts";
import { migration0017Schedules } from "./0017_schedules.ts";
import { migration0018QueryIndexes } from "./0018_query_indexes.ts";
import { migration0019BodyProposals } from "./0019_body_proposals.ts";
import { migration0020Ai } from "./0020_ai.ts";
import { migration0021Search } from "./0021_search.ts";
import { migration0022SearchKinds } from "./0022_search_kinds.ts";
import { migration0023SearchUsage } from "./0023_search_usage.ts";
import { migration0024SearchQuota } from "./0024_search_quota.ts";
import { migration0025TranslationGroups } from "./0025_translation_groups.ts";

/** All Cloudhal storage migrations, in order. */
export const migrations: readonly Migration[] = [
  migration0001Init,
  migration0002Auth,
  migration0003Agent,
  migration0004AuditActorName,
  migration0005AuthRateLimit,
  migration0006Approvals,
  migration0007AuditMode,
  migration0008PolicyDetail,
  migration0009AuditElevation,
  migration0010ApprovalResult,
  migration0011OpGuards,
  migration0012Roles,
  migration0013Media,
  migration0014Analytics,
  migration0015AnalyticsPrivacySignal,
  migration0016Comments,
  migration0017Schedules,
  migration0018QueryIndexes,
  migration0019BodyProposals,
  migration0020Ai,
  migration0021Search,
  migration0022SearchKinds,
  migration0023SearchUsage,
  migration0024SearchQuota,
  migration0025TranslationGroups,
];
