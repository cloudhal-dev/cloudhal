/**
 * Taint accounting for unattended runs (RFC-0008 §11.4, D10). Pure: the MCP layer (rollout steps
 * 8 and 10) calls `checkRunCall` before a tool runs inside an automation run and `afterRunCall`
 * after it, and stores the returned state on the run (`schedule_runs.taint`).
 *
 * 1. Taint per run: a call of a tool that returns visitor-supplied text taints the run; from then on
 *    only `read`-class tools, `label_comments` and `reduce`-class tools are allowed (`tainted`).
 * 2. No egress: `fetch_asset_url` is unavailable inside runs in v1.
 * 3. Declared input profile: an automation that reads untrusted text holds no write scopes.
 * 4. Anomaly pause: more than 50 `reduce` calls, or 10 consecutive refusals, end the run (`killed`).
 */

/** Per-argument call classes (RFC-0007 plus RFC-0008's `publish`, §10.3). */
export type CallClass = "read" | "advisory" | "reduce" | "publish" | "person";

/** Tools whose results carry visitor-supplied text (§11.4 item 1). */
export const TAINTING_TOOLS: readonly string[] = [
  "list_comments",
  "get_comment_thread",
  "broken_links",
  "get_analytics",
  "top_content",
  "fetch_asset_url",
];

/** Tools that are not `read`/`reduce` but stay allowed in a tainted run. */
export const TAINTED_RUN_EXTRA_TOOLS: readonly string[] = [
  "label_comments",
  "pause_automation",
  "end_run",
  "get_mode",
];

/** Tools unavailable inside any run (§11.4 item 2). */
export const NO_EGRESS_TOOLS: readonly string[] = ["fetch_asset_url"];

/** Scopes an automation that reads untrusted text may not hold (§11.4 item 3). */
export const UNTRUSTED_FORBIDDEN_SCOPES: readonly string[] = [
  "content:write",
  "content:write:own",
  "site:publish",
  "site:publish:own",
  "schedules:write",
  "schedules:write:own",
  "releases:publish",
  "releases:publish:own",
];
/** Scope prefixes refused for such automations (`asset:*`). */
export const UNTRUSTED_FORBIDDEN_SCOPE_PREFIXES: readonly string[] = ["asset:"];

export const ANOMALY_LIMITS = { maxReduceCalls: 50, maxConsecutiveRefusals: 10 } as const;

/** What a run remembers between calls. */
export interface RunTaintState {
  taint?: { at: string; tool: string };
  reduceCalls: number;
  consecutiveRefusals: number;
}

export const CLEAN_RUN: RunTaintState = Object.freeze({ reduceCalls: 0, consecutiveRefusals: 0 });

export interface RunCall {
  tool: string;
  class: CallClass;
}

export type RunCallCheck =
  | { allowed: true }
  | { allowed: false; code: "tainted" | "no_egress_in_runs"; message: string };

/** Whether a call may run inside an automation run in this taint state. */
export function checkRunCall(state: RunTaintState, call: RunCall): RunCallCheck {
  if (NO_EGRESS_TOOLS.includes(call.tool))
    return {
      allowed: false,
      code: "no_egress_in_runs",
      message: `${call.tool} is not available inside runs`,
    };
  if (!state.taint) return { allowed: true };
  if (
    call.class === "read" ||
    call.class === "reduce" ||
    TAINTED_RUN_EXTRA_TOOLS.includes(call.tool)
  )
    return { allowed: true };
  return {
    allowed: false,
    code: "tainted",
    message: `this run read visitor-supplied text (${state.taint.tool}); it may only read, label, hide and pause`,
  };
}

export interface AfterRunCall {
  state: RunTaintState;
  /** The run must end as `killed` and its automation pause (anomaly, §11.4 item 6). */
  kill?: "too_many_reduce_calls" | "too_many_refusals";
}

/**
 * The run's state after a call: tainted from the first tainting tool on (`at` the call's time), a
 * count of `reduce` calls and of consecutive refusals (policy or taint).
 */
export function afterRunCall(
  state: RunTaintState,
  call: RunCall,
  result: "allowed" | "refused",
  at: string,
): AfterRunCall {
  const next: RunTaintState = {
    ...(state.taint ? { taint: state.taint } : {}),
    reduceCalls: state.reduceCalls + (result === "allowed" && call.class === "reduce" ? 1 : 0),
    consecutiveRefusals: result === "refused" ? state.consecutiveRefusals + 1 : 0,
  };
  if (!next.taint && result === "allowed" && TAINTING_TOOLS.includes(call.tool))
    next.taint = { at, tool: call.tool };
  if (next.reduceCalls > ANOMALY_LIMITS.maxReduceCalls)
    return { state: next, kill: "too_many_reduce_calls" };
  if (next.consecutiveRefusals >= ANOMALY_LIMITS.maxConsecutiveRefusals)
    return { state: next, kill: "too_many_refusals" };
  return { state: next };
}

export function isUntrustedForbiddenScope(scope: string): boolean {
  return (
    UNTRUSTED_FORBIDDEN_SCOPES.includes(scope) ||
    UNTRUSTED_FORBIDDEN_SCOPE_PREFIXES.some((p) => scope.startsWith(p))
  );
}

/** The scopes refused for an automation that reads untrusted text (empty: allowed). */
export function forbiddenUntrustedScopes(scopes: readonly string[]): string[] {
  return scopes.filter(isUntrustedForbiddenScope);
}

/** The key's scopes as they apply on every call of such an automation: write scopes stripped. */
export function untrustedEffectiveScopes(scopes: readonly string[]): string[] {
  return scopes.filter((s) => !isUntrustedForbiddenScope(s));
}
