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
];
