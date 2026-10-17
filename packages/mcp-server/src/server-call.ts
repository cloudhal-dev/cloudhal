/**
 * One tool call through the MCP layer, in order: the declared skill, the automation run, the
 * approval answer the call carries (elicitation round 2, a redeemed `approvalId` or a
 * `confirmToken`), `runTool`, and when policy wants a person, the approval request (Studio, or
 * the client's elicitation).
 *
 * Approvals are bound to the tool, the canonical arguments and the state of what the call acts on
 * (`Binding`); a state that cannot be computed is `null` and fails closed.
 */
import type { LoadedSkill, PolicyEngine, Principal } from "@cloudhal/agent-runtime";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { canonicalJson, sha256Hex } from "@cloudhal/core-ts";
import type {
  CallToolResult,
  createRequestStateCodec,
  InputRequiredResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import { isBoundState } from "./comments.ts";
import type { ToolContext } from "./common.ts";
import { type RunContext, resolveRun, runPrincipal } from "./schedules.ts";
import type { CloudhalMcpOptions } from "./server.ts";
import {
  type ApprovalState,
  approvalRequired,
  type Binding,
  type Call,
  clearance,
  errorResult,
  type Outcome,
} from "./server-approvals.ts";
import { runTool, type ToolDefinition, ToolError } from "./tools.ts";

export const SKILL_META_KEY = "cloudhal.skill";

export type ApprovalCodec = ReturnType<typeof createRequestStateCodec<ApprovalState>>;

/** What every call of one server instance shares. */
export interface CallRuntime {
  options: CloudhalMcpOptions;
  policy: PolicyEngine;
  skills: Map<string, LoadedSkill>;
  codec: ApprovalCodec;
  /** Hand out `confirmToken`s to clients that cannot elicit (local only). */
  fallback: boolean;
  server: McpServer;
}

/** Tools an automation key may call outside an open run (RFC-0008 §11.2, §11.6). */
const OUTSIDE_RUN_TOOLS = new Set(["begin_run", "get_mode", "pause_automation"]);

function okResult(result: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result as Record<string, unknown>,
  };
}

/** The principal, limited to the skill the client declared in `_meta` (if any). */
function declaredPrincipal(rt: CallRuntime, ctx: ServerContext): Principal | CallToolResult {
  const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
  const skillName = meta?.[SKILL_META_KEY];
  if (skillName === undefined) return rt.options.principal;
  if (typeof skillName !== "string")
    return errorResult(`_meta["${SKILL_META_KEY}"] must be a string`);
  const skill = rt.skills.get(skillName);
  if (!skill)
    return errorResult(
      `unknown skill "${skillName}"; read skill:// resources for the available ones`,
    );
  return {
    ...rt.options.principal,
    skill: {
      name: skill.manifest.name,
      scopes: skill.cloudhal.scopes,
      approval: skill.cloudhal.approval,
    },
  };
}

/**
 * An automation key works only inside an open run of its automation (RFC-0008 §11.2):
 * `begin_run`, `get_mode` and `pause_automation` (stopping never waits) work outside it.
 */
async function runScope(
  rt: CallRuntime,
  def: ToolDefinition,
  declared: Principal,
  siteId: string | undefined,
): Promise<{ principal: Principal; run?: RunContext } | CallToolResult> {
  if (!declared.automationId) return { principal: declared };
  const { options } = rt;
  const resolved = await resolveRun(options.schedules, declared, options.now?.() ?? new Date());
  if (resolved.kind === "run")
    return { principal: { ...resolved.principal, skill: declared.skill }, run: resolved.run };
  if (resolved.kind === "outside" && OUTSIDE_RUN_TOOLS.has(def.name)) {
    // `get_mode` reports the mode the next run works in: capped by `modeCap` (§11.3)
    const automation = resolved.automation;
    if (automation?.job.kind === "agent-task")
      return {
        principal: {
          ...runPrincipal(declared, automation as RunContext["automation"]),
          skill: declared.skill,
        },
      };
    return { principal: declared };
  }
  if (resolved.kind === "outside") {
    await options.audit?.record({
      at: new Date().toISOString(),
      actor: declared.actor,
      siteId,
      tool: def.name,
      decision: "deny",
      reason: `outside_run: ${resolved.message}`,
      outcome: "error",
      ...(resolved.automation ? { automationId: resolved.automation.id } : {}),
    });
    return errorResult(`outside_run: ${resolved.message}`);
  }
  return { principal: declared };
}

function toolContext(
  options: CloudhalMcpOptions,
  principal: Principal,
  run: RunContext | undefined,
): ToolContext {
  return {
    store: options.store,
    principal,
    approvals: options.approvals,
    now: options.now,
    previewBaseUrl: options.previewBaseUrl,
    previewSecret: options.previewSecret,
    build: options.build,
    ownership: options.ownership,
    media: options.media,
    analytics: options.analytics,
    comments: options.comments,
    schedules: options.schedules,
    render: options.render,
    run,
  };
}

/**
 * Approvals are bound to the content the person saw, not just to the arguments: the site graph,
 * or what the tool binds itself to (comment tools: the comments' state, RFC-0007 §10.3). Worked
 * out only when an approval needs it. A tool binding that cannot be computed is `null`, never a
 * placeholder: nothing is filed, minted or matched against it (fail closed — two failures must not
 * compare equal).
 */
function bindingFor(input: {
  def: ToolDefinition;
  args: Record<string, unknown>;
  toolCtx: ToolContext;
  store: SiteGraphStore;
  siteId: string | undefined;
  argsHash: string;
}): Binding {
  const { def, args, toolCtx, store, siteId, argsHash } = input;
  let bound: Promise<string | null> | undefined;
  const stateHash = () => {
    bound ??= def.bindState
      ? def.bindState(args, toolCtx).then(
          (h) => (isBoundState(h) ? h : null),
          () => null,
        )
      : def.annotations.readOnlyHint !== true && siteId
        ? store.stateHash(siteId)
        : Promise.resolve("");
    return bound;
  };
  return {
    argsHash,
    stateHash,
    unbound: () =>
      errorResult(
        `state_unavailable: could not read the current state of what ${def.name} acts on, so no approval can be tied to it; nothing was filed or changed. Try again.`,
      ),
    matches: async (state) => {
      const current = await stateHash();
      return (
        current !== null &&
        state?.tool === def.name &&
        state.args === argsHash &&
        state.state === current
      );
    },
  };
}

function toCallResult(def: ToolDefinition, result: unknown): CallToolResult {
  if (def.renderContent) {
    const { content, structured } = def.renderContent(result);
    return { content, structuredContent: structured };
  }
  return def.renderText
    ? {
        content: [{ type: "text", text: def.renderText(result) }],
        structuredContent: result as Record<string, unknown>,
      }
    : okResult(result);
}

/** The `registerTool` callback for `def`. */
export async function handleToolCall(
  rt: CallRuntime,
  def: ToolDefinition,
  rawArgs: unknown,
  ctx: ServerContext,
): Promise<CallToolResult | InputRequiredResult> {
  const { confirmToken, approvalId, ...args } = rawArgs as Record<string, unknown> & {
    confirmToken?: unknown;
    approvalId?: unknown;
  };
  const declared = declaredPrincipal(rt, ctx);
  if ("content" in declared) return declared;
  const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
  const scope = await runScope(rt, def, declared, siteId);
  if ("content" in scope) return scope;
  const { principal, run } = scope;
  const argsHash = await sha256Hex(canonicalJson(args));
  const toolCtx = toolContext(rt.options, principal, run);
  const binding = bindingFor({ def, args, toolCtx, store: rt.options.store, siteId, argsHash });
  const call: Call = { rt, def, args, ctx, principal, run, siteId, binding };

  const clear = await clearance(call, approvalId, confirmToken);
  if ("content" in clear) return clear;

  let outcome: Outcome;
  try {
    outcome = await runTool(def, args, toolCtx, {
      policy: rt.policy,
      audit: rt.options.audit,
      confirmed: clear.confirmed,
      approved: clear.approved,
    });
  } catch (e) {
    if (e instanceof ToolError) return errorResult(`${e.code}: ${e.message}`);
    throw e;
  }
  if (outcome.decision.kind === "deny") return errorResult(`denied: ${outcome.decision.reason}`);
  if (outcome.decision.kind === "approval-required")
    return approvalRequired(call, outcome, outcome.decision);
  return toCallResult(def, outcome.result);
}
