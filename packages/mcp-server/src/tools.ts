/**
 * Cloudhal's semantic tool surface, defined independently of the MCP SDK so the same definitions
 * serve stdio, HTTP and tests. Each tool carries: JSON Schema input/output, honest annotations,
 * the scopes the policy engine checks, and a handler over `SiteGraphStore`.
 *
 * Mutations snapshot automatically (reason `agentMutation`, label = tool name) so every agent
 * change is diffable and reversible. `publish` and `rollback` are approval-gated.
 */

import type {
  AuditLog,
  AutoCheck,
  Decision,
  PolicyEngine,
  ToolPolicy,
} from "@cloudhal/agent-runtime";
import {
  type CallClass,
  checkAutoPublish,
  describeAutoCheck,
  describeOwnOnly,
  effectiveMode,
} from "@cloudhal/agent-runtime";
import { expiringEntries, type SiteGraphStore, type SnapshotDiff } from "@cloudhal/core-ts";
import {
  afterRunCall,
  checkRunBudget,
  checkRunCall,
  withinDailyWriteCap,
} from "@cloudhal/schedules";
import { analyticsTools } from "./analytics-tools.ts";
import { assetTools } from "./asset-tools.ts";
import { bodyTools } from "./body-tools.ts";
import { chromeTools } from "./chrome-tools.ts";
import { collectionTools } from "./collection-tools.ts";
import { commentTools } from "./comment-tools.ts";
import { type ToolContext, type ToolDefinition, ToolError, toToolError } from "./common.ts";
import { designTools } from "./design-tools.ts";
import { elevationTools } from "./elevation-tools.ts";
import { entryTools } from "./entry-tools.ts";
import { fieldTools } from "./field-tools.ts";
import { menuTools } from "./menu-tools.ts";
import { pageRemovalTools, siteAndPageTools } from "./page-tools.ts";
import { permalinkTools } from "./permalink-tools.ts";
import { previewDoc } from "./preview-doc.ts";
import { ownOnlyPublish, publishTools } from "./publish-tools.ts";
import { renderTools } from "./render-tools.ts";
import { scheduleTools } from "./schedule-tools.ts";
import { RUN_COUNTS, type RunContext } from "./schedules.ts";
import { hoistDefs, relaxImageRefs } from "./schema-transforms.ts";
import { searchTools } from "./search-tools.ts";
import { surfaceTools } from "./surface-tools.ts";
import { taxonomyTools } from "./taxonomy-tools.ts";
import { translationTools } from "./translation-tools.ts";

export {
  type ApprovalChanges,
  type BuildObserver,
  type JsonSchema,
  type MediaToolOptions,
  notifyBuild,
  type RenderDeps,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  type ToolErrorCode,
  toToolError,
} from "./common.ts";
export { previewDoc } from "./preview-doc.ts";
export { ownOnlyPublish } from "./publish-tools.ts";
export { hoistDefs, relaxImageRefs } from "./schema-transforms.ts";

/** All tools, in the deterministic order `tools/list` exposes them (agents see this order). */
export function defineTools(): ToolDefinition[] {
  return [
    ...siteAndPageTools(),
    ...surfaceTools(),
    ...pageRemovalTools(),
    ...entryTools(),
    ...translationTools(),
    // RFC-0029 §8: find nodes by words (drafts included), or what readers find.
    ...searchTools(),
    ...bodyTools(),
    // RFC-0021 §2: DESIGN.md
    ...designTools(),
    // RFC-0025 §5: the header, footer and brand
    ...chromeTools(),
    ...renderTools(previewDoc),
    // Taxonomy, term and redirect tools (RFC-0002 §6.2), then menu tools (RFC-0003 §6.1) and
    // media tools (RFC-0004 §6.2), follow the article tools.
    ...taxonomyTools(),
    // RFC-0040 §5: the collection registry; new collections are a person's decision.
    ...collectionTools(),
    // RFC-0041 §8: field operations rewrite entries; always a person's decision.
    ...fieldTools(),
    // RFC-0038 §5: where a collection's entries live (always a person's decision).
    ...permalinkTools(),
    ...menuTools(),
    ...assetTools(),
    ...publishTools(),
    // RFC-0006 §9.3: read-only analytics (`analytics:read`).
    ...analyticsTools(),
    // RFC-0007 §11: reader comments (read, advisory labels, reductions; approvals for the rest).
    ...commentTools(),
    // RFC-0008 §12: the schedule, releases, gates and automation runs.
    ...scheduleTools(),
    ...elevationTools(),
  ].map((t) => ({
    ...t,
    inputSchema: relaxImageRefs(hoistDefs(t.inputSchema)),
    outputSchema: hoistDefs(t.outputSchema),
  }));
}

export function toolPolicies(tools: ToolDefinition[]): ToolPolicy[] {
  return tools.map((t) => ({
    name: t.name,
    scopes: t.scopes,
    annotations: t.annotations,
    ...(t.requiresApproval ? { requiresApproval: true } : {}),
    ...(t.own ? { own: t.own } : {}),
    ...(t.classify ? { classify: t.classify } : {}),
    ...(t.proposeScopes ? { proposeScopes: t.proposeScopes } : {}),
    ...(t.approverScopes ? { approverScopes: t.approverScopes } : {}),
  }));
}

export interface CallResult {
  decision: Decision;
  /** Set when `auto` mode let a low-risk publish through without a person (English, for the agent). */
  autoApproved?: string;
  /** The `auto`-mode check behind a publish, whichever way it went. */
  autoCheck?: AutoCheck;
  /** Present when the call needs a human decision before running. */
  approvalPrompt?: string;
  result?: unknown;
}

/**
 * What the store knows about a pending publish for the `auto`-mode check: new images riding with
 * articles (RFC-0004 §6.3), corrections (RFC-0019 §2.4) and derived gates added or moved earlier
 * on live articles (RFC-0042 §3.5).
 */
async function autoPublishFacts(store: SiteGraphStore, siteId: string, pending: SnapshotDiff) {
  return {
    ridingAssets: await store.ridingAssets(siteId, pending),
    corrections: await store.correctingEntries(siteId, pending),
    expiries: await expiringEntries(store, siteId, pending),
  };
}

/**
 * Policy → audit → handler. Transports call this; it is the only path a tool runs through.
 * `confirmed` is set by the transport once the human said yes (MRTR response or confirm token);
 * `approved` once an out-of-band approval was redeemed — someone who could make the full call
 * decided it (RFC-0005 §6), so an own limit on a publish no longer applies.
 */
export async function runTool(
  def: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: {
    policy: PolicyEngine;
    audit?: AuditLog | undefined;
    confirmed?: boolean | undefined;
    approved?: boolean | undefined;
  },
): Promise<CallResult> {
  const started = Date.now();
  let decision = deps.policy.evaluate(ctx.principal, def.name, {
    confirmed: deps.confirmed ?? false,
    args,
  });
  const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
  const limit = decision.kind === "deny" ? undefined : decision.limit;
  ctx = {
    ...ctx,
    limit,
    confirmed: deps.confirmed === true,
    policy: deps.policy,
    ...(deps.audit ? { audit: deps.audit } : {}),
  };
  // Own-only publish (I10): an Author's (or their agent's) publish that carries someone else's
  // work, or structure, waits for someone whose role allows it (cause `role`).
  if (limit?.target === "changeset" && !deps.approved && siteId && decision.kind !== "deny") {
    const check = await ownOnlyPublish(ctx, siteId).catch(() => undefined);
    if (!check?.ownOnly) {
      const why = check ? describeOwnOnly(check) : "the site could not be read";
      decision = {
        kind: "approval-required",
        reason: `your role publishes only your own work, but ${why}`,
        cause: "role",
        limit,
      };
    }
  }
  const audited = def.auditArgs ? def.auditArgs(args) : args;
  const base = {
    at: new Date().toISOString(),
    actor: ctx.principal.actor,
    siteId,
    tool: def.name,
    skill: ctx.principal.skill?.name,
    input: audited,
    mode: effectiveMode(ctx.principal),
    ...(ctx.principal.actor.kind === "agent" && ctx.principal.elevation
      ? { elevation: ctx.principal.elevation }
      : {}),
    // RFC-0008 §5.1: a run's rows carry the run and its automation; release tools the release.
    ...(ctx.run ? { runId: ctx.run.run.id, automationId: ctx.run.automation.id } : {}),
    ...(typeof args.releaseId === "string" ? { releaseId: args.releaseId } : {}),
  };
  // Inside an automation run (RFC-0008 §11.4–§11.5): the run's site, the taint rule, the budget.
  const run = ctx.run;
  const cls = runCallClass(def, args);
  if (run) {
    const refusal = await runRefusal(def, args, ctx, run, cls, decision);
    if (refusal) {
      await deps.audit?.record({
        ...base,
        decision: "deny",
        reason: refusal.message,
        outcome: "error",
      });
      await noteRunCall(ctx, run, def.name, cls, "refused");
      throw refusal;
    }
  }
  if (decision.kind === "deny") {
    if (run) await noteRunCall(ctx, run, def.name, cls, "refused");
    await deps.audit?.record({
      ...base,
      decision: "deny",
      reason: decision.reason,
      outcome: "error",
    });
    return { decision };
  }
  if (def.precheck) {
    try {
      await def.precheck(args, ctx);
    } catch (raw) {
      const e = toToolError(raw);
      await deps.audit?.record({
        ...base,
        decision: "deny",
        reason: e instanceof Error ? e.message : String(e),
        outcome: "error",
      });
      throw e;
    }
  }
  // `auto` mode: a publish that only adds or edits a few articles goes live without a person.
  let autoCheck: AutoCheck | undefined;
  let autoNote: string | undefined;
  if (
    decision.kind === "approval-required" &&
    decision.autoApprove === "low-risk-publish" &&
    siteId
  ) {
    const pending = await ctx.store.pendingChanges(siteId);
    // New raster images used only by the articles in this publish ride along (RFC-0004 §6.3).
    autoCheck = checkAutoPublish(pending, await autoPublishFacts(ctx.store, siteId, pending));
    if (autoCheck.lowRisk)
      autoNote = `auto mode: published without approval (${describeAutoCheck(autoCheck)})`;
    else
      decision = {
        ...decision,
        reason: `auto mode waits for a person: ${describeAutoCheck(autoCheck)}`,
      };
  }
  const checked = autoCheck ? { autoCheck } : {};
  // RFC-0008 §10.4: release tools file their own request bound to `rl1:` (or take `auto`'s
  // low-risk path), so their handler runs with the waiting decision instead of the generic gate.
  if (
    decision.kind === "approval-required" &&
    def.handlesApproval &&
    !deps.confirmed &&
    decision.cause !== "role" &&
    ((ctx.approvals && ctx.principal.actor.kind === "agent") ||
      decision.autoApprove === "low-risk-release")
  ) {
    const pending = decision;
    let effect: Record<string, unknown> | undefined;
    const callCtx: ToolContext = {
      ...ctx,
      pending,
      report: (e) => {
        effect = { ...effect, ...e };
      },
    };
    try {
      const result = await def.handler(args, callCtx);
      const waits = (result as { status?: string } | undefined)?.status === "approval-pending";
      const releaseId =
        (result as { release?: { id?: string } } | undefined)?.release?.id ??
        (typeof effect?.releaseId === "string" ? effect.releaseId : undefined);
      await deps.audit?.record({
        ...base,
        ...(effect ? { input: { ...audited, effect } } : {}),
        ...(releaseId ? { releaseId } : {}),
        decision: waits ? "approval-required" : "allow",
        reason: waits
          ? pending.reason
          : `auto mode: scheduled without a person (${describeAutoCheck((effect?.autoCheck as AutoCheck | undefined) ?? { rule: "low-risk-release", lowRisk: true, code: "low-risk", changes: 0, limit: 20 })})`,
        ...(waits ? { cause: pending.cause } : {}),
        outcome: waits ? "pending" : "ok",
        durationMs: Date.now() - started,
      });
      if (run) await noteRunCall(ctx, run, def.name, cls, "allowed");
      return { decision: { kind: "allow" }, result };
    } catch (raw) {
      const e = toToolError(raw);
      await deps.audit?.record({
        ...base,
        decision: "allow",
        outcome: "error",
        reason: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - started,
      });
      if (run)
        await noteRunCall(
          ctx,
          run,
          def.name,
          cls,
          e instanceof ToolError && e.code === "denied" ? "refused" : "allowed",
        );
      throw e;
    }
  }
  if (decision.kind === "approval-required" && !autoNote) {
    const approvalPrompt = def.approvalPrompt
      ? await def.approvalPrompt(args, ctx)
      : decision.reason;
    await deps.audit?.record({
      ...base,
      decision: "approval-required",
      reason: decision.reason,
      cause: decision.cause,
      ...checked,
      outcome: "pending",
    });
    if (run) await noteRunCall(ctx, run, def.name, cls, "allowed");
    return { decision, approvalPrompt, ...checked };
  }
  // What the call did beyond its arguments (assignment deltas, a governance operation) goes into
  // the audit row's `input.effect` (RFC-0002 §6.4).
  let effect: Record<string, unknown> | undefined;
  const callCtx: ToolContext = {
    ...ctx,
    report: (e) => {
      effect = { ...effect, ...e };
    },
  };
  try {
    const result = await def.handler(args, callCtx);
    const snapshotId = (result as { snapshot?: { id?: string } } | undefined)?.snapshot?.id;
    const releaseId =
      (result as { release?: { id?: string } } | undefined)?.release?.id ??
      (typeof (effect as { releaseId?: unknown } | undefined)?.releaseId === "string"
        ? (effect as { releaseId: string }).releaseId
        : undefined);
    await deps.audit?.record({
      ...base,
      ...(effect ? { input: { ...audited, effect } } : {}),
      ...(releaseId ? { releaseId } : {}),
      decision: "allow",
      outcome: "ok",
      snapshotId,
      durationMs: Date.now() - started,
      ...(autoNote ? { reason: autoNote } : {}),
      ...checked,
    });
    if (run) await noteRunCall(ctx, run, def.name, cls, "allowed");
    return {
      decision: { kind: "allow" },
      result,
      ...(autoNote ? { autoApproved: autoNote } : {}),
      ...checked,
    };
  } catch (raw) {
    const e = toToolError(raw);
    await deps.audit?.record({
      ...base,
      decision: "allow",
      outcome: "error",
      reason: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    });
    if (run)
      await noteRunCall(
        ctx,
        run,
        def.name,
        cls,
        e instanceof ToolError && e.code === "denied" ? "refused" : "allowed",
      );
    throw e;
  }
}

/** Bookkeeping tools a run may always call: they never count against its budget. */
const RUN_BOOKKEEPING = new Set(["end_run", "get_mode", "pause_automation", "begin_run"]);

/** A call's class inside a run (§11.4): its own `classify`, else read-only or not. */
function runCallClass(def: ToolDefinition, args: Record<string, unknown>): RunCallClass {
  const cls = def.classify?.(args);
  // A proposal is a note a person reads before deciding, like a label (RFC-0014 phase 4).
  if (cls === "propose") return "advisory";
  if (cls) return cls;
  return def.annotations.readOnlyHint === true ? "read" : "advisory";
}

/** The classes runs account for (RFC-0008 §11.4): `propose` counts as `advisory`. */
type RunCallClass = Exclude<CallClass, "propose">;

/**
 * Why a run may not make this call (RFC-0008 §10.7, §11.4, §11.5), or undefined: another site,
 * `request_elevation` (code `run`), no egress, the taint rule, the run's budget (which ends the run
 * and pauses its automation) and the site's daily cap on automation writes.
 */
async function runRefusal(
  def: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolContext,
  run: RunContext,
  cls: RunCallClass,
  decision: Decision,
): Promise<ToolError | undefined> {
  const siteId = run.automation.siteId;
  if (typeof args.siteId === "string" && args.siteId !== siteId)
    return new ToolError("outside_run", `this run works on site ${siteId} only`);
  if (def.name === "request_elevation")
    return new ToolError(
      "run",
      "a run's autonomy is fixed by its automation (modeCap); request_elevation is not available inside runs",
    );
  const taint = checkRunCall(run.state, { tool: def.name, class: cls });
  if (!taint.allowed) return new ToolError(taint.code, taint.message);
  if (RUN_BOOKKEEPING.has(def.name) || !ctx.schedules) return undefined;
  const store = ctx.schedules.store;
  const now = (ctx.now?.() ?? new Date()).toISOString();
  const writes = decision.kind === "allow" && def.annotations.readOnlyHint !== true;
  const usage = await store.runUsage(siteId, run.run.id);
  const budget = checkRunBudget(
    run.automation.job.budget,
    usage,
    { startedAt: run.run.startedAt ?? now, now },
    { write: writes, approvalRequest: decision.kind === "approval-required" },
  );
  if (!budget.ok) {
    await store.endAgentRunAs(siteId, run.run.id, {
      now,
      state: "budget-exceeded",
      error: { code: "budget_exceeded", message: budget.exceeded },
      usage,
    });
    const a = await store.getAutomation(siteId, run.automation.id);
    if (a?.state === "active")
      await store
        .transitionAutomation(siteId, a.id, {
          expectedRev: a.rev,
          to: "auto-paused",
          pausedReason: "budget",
        })
        .catch(() => undefined);
    return new ToolError(
      "budget_exceeded",
      `the run's ${budget.exceeded} budget is used up: the run ended and the automation is paused until a person resumes it`,
    );
  }
  if (writes) {
    const settings = await store.settings(siteId);
    if (
      !withinDailyWriteCap(await store.automationWritesToday(siteId, now), settings.dailyWriteCap)
    )
      return new ToolError(
        "budget_exceeded",
        `daily_write_cap: automations on this site made ${settings.dailyWriteCap} changes today (UTC); try tomorrow or ask a person to raise the cap`,
      );
  }
  return undefined;
}

/**
 * Records a call on its run (§11.4): the taint from the first tainting tool on, the anomaly counters
 * and the usage. More than 50 reductions or 10 refusals in a row end the run (`killed`) and pause
 * the automation.
 */
async function noteRunCall(
  ctx: ToolContext,
  run: RunContext,
  tool: string,
  cls: RunCallClass,
  result: "allowed" | "refused",
): Promise<void> {
  const store = ctx.schedules?.store;
  if (!store) return;
  const siteId = run.automation.siteId;
  const now = (ctx.now?.() ?? new Date()).toISOString();
  const next = afterRunCall(run.state, { tool, class: cls }, result, now);
  run.state = next.state;
  const counts = {
    ...(run.run.counts ?? {}),
    [RUN_COUNTS.reduce]: next.state.reduceCalls,
    [RUN_COUNTS.refusals]: next.state.consecutiveRefusals,
  };
  const usage = await store.runUsage(siteId, run.run.id);
  await store.recordRunCall(siteId, run.run.id, {
    now,
    ...(next.state.taint ? { taint: next.state.taint } : {}),
    counts,
    usage,
  });
  if (!next.kill) return;
  await store.endAgentRunAs(siteId, run.run.id, {
    now,
    state: "killed",
    error: { code: next.kill },
    usage,
  });
  const a = await store.getAutomation(siteId, run.automation.id);
  if (a?.state === "active")
    await store
      .transitionAutomation(siteId, a.id, {
        expectedRev: a.rev,
        to: "auto-paused",
        pausedReason: "failures",
      })
      .catch(() => undefined);
}
