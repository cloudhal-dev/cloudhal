// RFC-0008 §10.6: the scheduler's run-time re-check of release approvals, over this API's members
// and agent keys (`createScheduler({ …, checkApproval })`).
export { createReleaseApprovalCheck } from "@cloudhal/mcp-server/schedules";
export {
  type AiBinding,
  AiError,
  type AiEvent,
  type AiModelInfo,
  type AiRunRequest,
  type AiTransport,
  bindingTransport,
  parseAiStream,
  restTransport,
} from "./ai/client.ts";
export { AiStore, DEFAULT_AI_MODEL } from "./ai/store.ts";
export { type CloudhalApi, createApi } from "./app.ts";
export {
  BUILD_VIEWER_LIMIT,
  type BuildChange,
  type BuildHub,
  BuildViewerLimitError,
  buildChange,
  createBuildHub,
  type LocalBuildHub,
} from "./build.ts";
export {
  BUILD_EVAL_BRIEFS,
  BUILD_EVAL_MODELS,
  type BuildEvalBrief,
  type BuildEvalRun,
  type BuildEvalSummary,
  buildEvalTable,
  runBuildEvalOnce,
  summariseBuildEval,
} from "./build-eval.ts";
export type { ActorResolver, ApiDeps } from "./context.ts";
export type { ApiErrorBody } from "./errors.ts";
export { MailError, type MailMessage, type MailSender } from "./mail.ts";
export { releaseApprovalCheck, releaseRights } from "./schedules.ts";
