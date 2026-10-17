/**
 * The approval half of a tool call: the answer a call carries (elicitation round 2, a redeemed
 * `approvalId`, a `confirmToken`) checked against its binding, and the request when policy wants a
 * person (Studio for agents and role limits, otherwise the client's elicitation).
 */
import { type ApprovalStore, effectiveMode, type Principal } from "@cloudhal/agent-runtime";
import {
  acceptedContent,
  type CallToolResult,
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  type ElicitRequestFormParams,
  type InputRequiredResult,
  inputRequired,
  inputResponse,
  type ServerContext,
} from "@modelcontextprotocol/server";
import type { RunContext } from "./schedules.ts";
import type { CallRuntime } from "./server-call.ts";
import type { runTool, ToolDefinition } from "./tools.ts";

export interface ApprovalState {
  tool: string;
  /** sha256 of the canonical arguments, so an approval cannot be replayed for other arguments. */
  args: string;
  /** The site's content digest when the person was asked; a later change voids the approval. */
  state: string;
}

const REDEEM_MESSAGES: Record<string, string> = {
  "not-found": "unknown approvalId",
  pending: "still waiting for a person to approve it in Studio — try again later",
  denied: "a person denied this request; nothing changed",
  consumed: "this approval was already used; ask again",
  expired: "this approval expired; ask again",
  mismatch: "this approval was for a different call",
  "state-changed":
    "the site changed after the approval was requested; ask again so the person sees the current changes",
};

/** Where an agent sees what a carried-out request did. */
function outcomeTools(tool: string): string {
  return tool.includes("comment")
    ? "list_comments or get_comment_thread"
    : "get_release or list_schedule";
}

const APPROVAL_SCHEMA: ElicitRequestFormParams["requestedSchema"] = {
  type: "object",
  properties: {
    confirm: {
      type: "boolean",
      title: "Approve",
      description: "true to let the action run, false to stop here",
    },
  },
  required: ["confirm"],
};

export function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** What an approval is tied to: the tool, the arguments and the state of what the call acts on. */
export interface Binding {
  argsHash: string;
  /** The current state, or `null` when it cannot be read (nothing may be filed or matched then). */
  stateHash: () => Promise<string | null>;
  matches: (state: ApprovalState | undefined) => Promise<boolean>;
  unbound: () => CallToolResult;
}

/** One call in flight. */
export interface Call {
  rt: CallRuntime;
  def: ToolDefinition;
  args: Record<string, unknown>;
  ctx: ServerContext;
  principal: Principal;
  run: RunContext | undefined;
  siteId: string | undefined;
  binding: Binding;
}

/** `confirmed`: a person said yes to this call; `approved`: someone who could make it decided it. */
export interface Clearance {
  confirmed: boolean;
  approved: boolean;
}

/** The approval the call carries, checked against its binding. */
export function clearance(
  call: Call,
  approvalId: unknown,
  confirmToken: unknown,
): Promise<Clearance | CallToolResult> | Clearance {
  const answer = inputResponse(call.ctx.mcpReq.inputResponses, "approval");
  if (answer.kind !== "missing") return elicitedClearance(call, answer);
  if (approvalId !== undefined) return redeemedClearance(call, approvalId);
  if (confirmToken !== undefined) return tokenClearance(call, confirmToken);
  return { confirmed: false, approved: false };
}

/** Round 2 of an approval: the client echoed our elicitation answer + signed state. */
async function elicitedClearance(
  call: Call,
  answer: ReturnType<typeof inputResponse>,
): Promise<Clearance | CallToolResult> {
  const { def, args, ctx, principal } = call;
  if (answer.kind !== "elicit") return errorResult("unexpected input response kind");
  if (!(await call.binding.matches(ctx.mcpReq.requestState<ApprovalState>())))
    return errorResult(
      "approval state does not match this call (different arguments, or the site changed meanwhile); start over",
    );
  const content = acceptedContent<{ confirm?: unknown }>(ctx.mcpReq.inputResponses, "approval");
  if (answer.action !== "accept" || content?.confirm !== true) {
    await call.rt.options.audit?.record({
      at: new Date().toISOString(),
      actor: principal.actor,
      siteId: call.siteId,
      tool: def.name,
      decision: "deny",
      reason: answer.action === "accept" ? "approval refused" : `approval ${answer.action}d`,
      skill: principal.skill?.name,
      input: def.auditArgs ? def.auditArgs(args) : args,
      outcome: "error",
    });
    return errorResult(`${def.name} was not approved; nothing changed.`);
  }
  return { confirmed: true, approved: false };
}

/** A redeemed out-of-band approval (ADR-0014): someone who could make the full call decided it. */
async function redeemedClearance(
  call: Call,
  approvalId: unknown,
): Promise<Clearance | CallToolResult> {
  const { def } = call;
  const approvals = call.rt.options.approvals;
  if (!approvals) return errorResult("approvalId is not accepted on this server");
  if (typeof approvalId !== "string") return errorResult("approvalId must be a string");
  // Comment and release tools are carried out by the person who approves them
  // (RFC-0007 §10.3, RFC-0008 §10.4).
  if (def.carryOutOnApproval) {
    const request = await approvals.get(approvalId);
    return errorResult(
      request?.status === "consumed" && request.tool === def.name
        ? `approval ${approvalId}: already carried out — the person who approved it ran ${def.name} at once. Check the result with ${outcomeTools(def.name)}.`
        : `approval ${approvalId}: ${request?.status === "denied" ? REDEEM_MESSAGES.denied : `${def.name} is carried out in Cloudhal Studio when a person approves it; there is nothing to redeem`}`,
    );
  }
  const current = await call.binding.stateHash();
  if (current === null) return call.binding.unbound();
  const redeemed = await approvals.redeem(approvalId, {
    tool: def.name,
    argsHash: call.binding.argsHash,
    actorId: call.principal.actor.id,
    stateHash: current,
  });
  if (!redeemed.ok)
    return errorResult(`approval ${approvalId}: ${REDEEM_MESSAGES[redeemed.reason]}`);
  return { confirmed: true, approved: true };
}

/** The local fallback: a signed token the server handed out with the approval question. */
async function tokenClearance(
  call: Call,
  confirmToken: unknown,
): Promise<Clearance | CallToolResult> {
  if (!call.rt.fallback) return errorResult("confirmToken is not accepted on this server");
  if (typeof confirmToken !== "string") return errorResult("confirmToken must be a string");
  let state: ApprovalState | undefined;
  try {
    state = await call.rt.codec.verify(confirmToken, call.ctx);
  } catch {
    state = undefined;
  }
  if (!(await call.binding.matches(state)))
    return errorResult("invalid, expired or mismatched confirmToken; ask for approval again");
  return { confirmed: true, approved: false };
}

export type Outcome = Awaited<ReturnType<typeof runTool>>;
type ApprovalDecision = Extract<Outcome["decision"], { kind: "approval-required" }>;

/** Policy wants a person: file the request in Studio, or ask in the client. */
export function approvalRequired(
  call: Call,
  outcome: Outcome,
  decision: ApprovalDecision,
): Promise<CallToolResult | InputRequiredResult> | CallToolResult {
  const approvals = call.rt.options.approvals;
  const prompt = outcome.approvalPrompt ?? decision.reason;
  // A call beyond the caller's role (cause `role`) is decided by someone else, never in the
  // caller's own client (RFC-0005 §10.2).
  const role = decision.cause === "role";
  if (role && !approvals)
    return errorResult(`denied: ${decision.reason}. Ask someone whose role allows it (an Editor).`);
  // Agents with their own credentials never answer for a person: the request waits in Studio.
  if (approvals && (call.principal.actor.kind === "agent" || role))
    return requestInStudio(call, { approvals, outcome, decision, prompt });
  return askInClient(call, prompt);
}

async function requestInStudio(
  call: Call,
  input: { approvals: ApprovalStore; outcome: Outcome; decision: ApprovalDecision; prompt: string },
): Promise<CallToolResult> {
  const { def, args, principal, run } = call;
  const { approvals, outcome, decision, prompt } = input;
  const current = await call.binding.stateHash();
  if (current === null) return call.binding.unbound();
  const pending = await approvals.request({
    siteId: call.siteId,
    tool: def.name,
    argsHash: call.binding.argsHash,
    input: args,
    actor: principal.actor,
    prompt,
    stateHash: current,
    mode: effectiveMode(principal),
    cause: decision.cause,
    ...(outcome.autoCheck ? { autoCheck: outcome.autoCheck } : {}),
    ...(run ? { runId: run.run.id } : {}),
  });
  if (def.carryOutOnApproval)
    return errorResult(
      `approval pending: ${prompt}\nA person must approve request ${pending.id} in Cloudhal Studio (site → Activity → Approvals); approving it carries the call out at once, as long as what it acts on has not changed meanwhile. Do not call ${def.name} again for it; check the outcome later with ${outcomeTools(def.name)}. It expires ${pending.expiresAt}.\napprovalId: ${pending.id}`,
    );
  // A person's own request is carried out when someone approves it (RFC-0005 §6).
  if (principal.actor.kind !== "agent")
    return errorResult(
      `approval pending: ${decision.reason}\nRequest ${pending.id} waits in Cloudhal Studio (site → Activity → Approvals) for someone whose role allows it; approving it runs ${def.name} for you. It expires ${pending.expiresAt}.\napprovalId: ${pending.id}`,
    );
  return errorResult(
    `approval pending: ${prompt}\nA person must approve request ${pending.id} in Cloudhal Studio (site → Activity → Approvals). After it is approved, call ${def.name} again with the same arguments plus approvalId "${pending.id}". It expires ${pending.expiresAt}.\napprovalId: ${pending.id}`,
  );
}

/** Ask the person in their MCP client (elicitation), or hand out a confirmToken (local fallback). */
async function askInClient(
  call: Call,
  prompt: string,
): Promise<CallToolResult | InputRequiredResult> {
  const { rt, def, ctx } = call;
  const current = await call.binding.stateHash();
  if (current === null) return call.binding.unbound();
  const state = await rt.codec.mint(
    { tool: def.name, args: call.binding.argsHash, state: current },
    ctx,
  );
  // 2026-07-28 requests carry the client's capabilities in their _meta envelope (stateless
  // HTTP); 2025-era connections declared them at initialize.
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const caps =
    (envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined) ??
    rt.server.server.getClientCapabilities();
  if (caps?.elicitation) {
    return inputRequired({
      inputRequests: {
        approval: inputRequired.elicit({ message: prompt, requestedSchema: APPROVAL_SCHEMA }),
      },
      requestState: state,
    });
  }
  if (!rt.fallback)
    return errorResult(
      `approval required: ${prompt}\nThis client cannot collect approval (no elicitation support).`,
    );
  return errorResult(
    `approval required: ${prompt}\nAsk the person. If (and only if) they approve, call ${def.name} again with the same arguments plus confirmToken: "${state}" (valid ${Math.round((rt.options.approvalTtlSeconds ?? 600) / 60)} minutes).`,
  );
}
