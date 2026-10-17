/**
 * The Cloudhal MCP server (ADR-0004, ADR-0011): one `McpServer` per principal, built from the
 * SDK-independent tool definitions in `tools.ts`. It adds what the protocol needs on top of the
 * policy engine:
 *
 * - **Approval gate** — when policy answers `approval-required`, the call returns MCP's
 *   multi-round-trip `input_required` with an elicitation ("Publish X to production?"). The human
 *   answers in their client; the client retries with `inputResponses` and the HMAC-signed
 *   `requestState`, and only then does the handler run. Clients without elicitation get a
 *   `confirmToken` to pass on a second call (ADR-0004 fallback; can be disabled).
 * - **Skills as resources** — `skill://<name>/SKILL.md` and `skill://<name>/references/<file>`.
 * - **Skill-scoped calls** — a client declares the skill it is following via
 *   `_meta["cloudhal.skill"]`; the policy engine then limits the call to that skill's scopes.
 * - **Audit** — every decision and call is recorded (see `runTool`).
 */
import {
  type ApprovalStore,
  type AuditLog,
  type LoadedSkill,
  type OwnershipResolver,
  PolicyEngine,
  type Principal,
} from "@cloudhal/agent-runtime";
import type { AnalyticsService } from "@cloudhal/analytics/service";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { createRequestStateCodec, McpServer } from "@modelcontextprotocol/server";
import type { CommentsDeps } from "./comments.ts";
import type { BuildObserver, MediaToolOptions, RenderDeps } from "./common.ts";
import type { SchedulesDeps } from "./schedules.ts";
import type { ApprovalState } from "./server-approvals.ts";
import { type CallRuntime, handleToolCall } from "./server-call.ts";
import { serverInstructions } from "./server-instructions.ts";
import { registerResources } from "./server-resources.ts";
import { compiledSchema, defaultToolList, registeredInputSchema } from "./server-schema.ts";
import { type ToolDefinition, toolPolicies } from "./tools.ts";

export { SKILL_META_KEY } from "./server-call.ts";

export interface CloudhalMcpOptions {
  store: SiteGraphStore;
  /** Told about page writes and refused builds (RFC-0020 §6, Studio's Build view). */
  build?: BuildObserver | undefined;
  /** Who this server instance acts for. One instance per principal (per request over HTTP). */
  principal: Principal;
  audit?: AuditLog | undefined;
  skills?: LoadedSkill[] | undefined;
  /** Base URL of a running `cloudhal dev`, used for `preview_page.url`. */
  previewBaseUrl?: string | undefined;
  /** Preview secret shared with the deployed site: `preview_page.url` becomes a signed link. */
  previewSecret?: string | undefined;
  /** Media settings for the asset tools (fetch transport, host lists, daily limits; RFC-0004). */
  media?: MediaToolOptions | undefined;
  /** Site analytics for the read-only analytics tools (RFC-0006 §9.3). */
  analytics?: AnalyticsService | undefined;
  /** Reader comments for the comment tools (RFC-0007 §11). */
  comments?: CommentsDeps | undefined;
  /** Schedules for the schedule tools and automation runs (RFC-0008 §12). */
  schedules?: SchedulesDeps | undefined;
  /** A browser for `render_page` (RFC-0021 §4). */
  render?: RenderDeps | undefined;
  /**
   * HMAC key (≥ 32 bytes) for the approval state. Every instance that may receive a retried round
   * must share it: a random per-process key is fine for stdio, a configured secret for HTTP.
   */
  stateKey: Uint8Array | string;
  /**
   * Out-of-band approvals (ADR-0014). When set, an agent principal's publish/rollback/delete waits
   * for a person to approve it in Studio — the agent's own MCP client never answers for a person.
   * Without it (local stdio), the approval question goes to the MCP client (elicitation).
   */
  approvals?: ApprovalStore | undefined;
  /**
   * Who owns what (RFC-0005 §4): the person behind an agent. Without it an agent owns what it wrote
   * itself (local stdio).
   */
  ownership?: OwnershipResolver | undefined;
  /**
   * Hand a `confirmToken` to clients that cannot elicit. Default false: the token reaches the
   * agent, so an agent could approve itself (security review H1). Local use only, opt-in.
   */
  confirmTokenFallback?: boolean | undefined;
  /** Clock for time-based answers (`get_mode`); tests inject one. */
  now?: (() => Date) | undefined;
  /** Approval tokens/state expire after this many seconds. Default 600. */
  approvalTtlSeconds?: number | undefined;
  tools?: ToolDefinition[] | undefined;
  policy?: PolicyEngine | undefined;
  serverInfo?: { name?: string; version?: string } | undefined;
}

/** Builds a Cloudhal MCP server for one principal. */
export function createCloudhalMcpServer(options: CloudhalMcpOptions): McpServer {
  const tools = options.tools ?? defaultToolList();
  const policy = options.policy ?? new PolicyEngine(toolPolicies(tools));
  const skills = new Map((options.skills ?? []).map((s) => [s.manifest.name, s]));
  const fallback = options.confirmTokenFallback ?? false;
  const codec = createRequestStateCodec<ApprovalState>({
    key: options.stateKey,
    ttlSeconds: options.approvalTtlSeconds ?? 600,
    bind: () => `cloudhal.approval\0${options.principal.actor.id}`,
  });

  const server = new McpServer(
    {
      name: options.serverInfo?.name ?? "cloudhal",
      version: options.serverInfo?.version ?? "0.0.1",
      title: "Cloudhal",
      websiteUrl: "https://github.com/cloudhal-dev/cloudhal",
    },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: serverInstructions(options.principal),
      requestState: { verify: codec.verify },
    },
  );

  const rt: CallRuntime = { options, policy, skills, codec, fallback, server };
  for (const def of tools)
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: registeredInputSchema(def, { approvals: !!options.approvals, fallback }),
        outputSchema: compiledSchema(def.outputSchema, "", () => def.outputSchema),
        annotations: { ...def.annotations, title: def.title },
        // MCP Apps: hosts that render UI show the tool's results in Cloudhal's View; others ignore it.
        ...(def.ui ? { _meta: { ui: { ...def.ui } } } : {}),
      },
      (rawArgs, ctx) => handleToolCall(rt, def, rawArgs, ctx),
    );

  registerResources(server, skills);
  return server;
}
