// RFC-0008 §10.6: the scheduler's run-time re-check of release approvals, over this API's members
// and agent keys (`createScheduler({ …, checkApproval })`).
export { createReleaseApprovalCheck } from "@cloudhal/mcp-server/schedules";
export { type CloudhalApi, createApi } from "./app.ts";
export type { ActorResolver, ApiDeps } from "./context.ts";
export type { ApiErrorBody } from "./errors.ts";
export { releaseApprovalCheck, releaseRights } from "./schedules.ts";
