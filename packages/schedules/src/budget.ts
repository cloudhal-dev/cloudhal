/**
 * Budget accounting for runs and sites (RFC-0008 §11.5, D11). Pure: usage is counted from audit
 * and approval rows (`SqlScheduleStore.runUsage`, `automationWritesToday`); these functions decide.
 */
import type { AutomationBudget, ScheduleRunUsage } from "@cloudhal/core-contracts";
import { canonicalInstant, DAY_MS, instantMs, MINUTE_MS } from "./time.ts";

/** Defaults for a new agent task (§11.5). */
export const DEFAULT_AGENT_BUDGET: Readonly<AutomationBudget> = Object.freeze({
  maxToolCalls: 100,
  maxWrites: 20,
  maxApprovalRequests: 5,
  maxMinutes: 15,
});

/** Automation mutations per site per UTC day (`schedule_settings.daily_write_cap`, §11.5). */
export const DEFAULT_DAILY_WRITE_CAP = 200;

export const EMPTY_USAGE: Readonly<ScheduleRunUsage> = Object.freeze({
  toolCalls: 0,
  writes: 0,
  approvalRequests: 0,
});

export type BudgetLimit = "toolCalls" | "writes" | "approvalRequests" | "minutes";

/** What the next call would add. */
export interface NextCall {
  write?: boolean;
  approvalRequest?: boolean;
}

export type BudgetCheck = { ok: true } | { ok: false; exceeded: BudgetLimit };

/**
 * Whether a run may make its next call: the call itself, a write, an approval request and the
 * clock must all stay within the budget (`startedAt + maxMinutes`). A refusal ends the run as
 * `budget-exceeded` and pauses the automation.
 */
export function checkRunBudget(
  budget: AutomationBudget,
  usage: ScheduleRunUsage,
  clock: { startedAt: string | Date | number; now: string | Date | number },
  next: NextCall = {},
): BudgetCheck {
  if (instantMs(clock.now) > instantMs(clock.startedAt) + budget.maxMinutes * MINUTE_MS)
    return { ok: false, exceeded: "minutes" };
  if (usage.toolCalls + 1 > budget.maxToolCalls) return { ok: false, exceeded: "toolCalls" };
  if (next.write && usage.writes + 1 > budget.maxWrites) return { ok: false, exceeded: "writes" };
  if (next.approvalRequest && usage.approvalRequests + 1 > budget.maxApprovalRequests)
    return { ok: false, exceeded: "approvalRequests" };
  return { ok: true };
}

/** What the run has left (for `get_mode`'s `budgetLeft`). */
export function budgetLeft(
  budget: AutomationBudget,
  usage: ScheduleRunUsage,
): { toolCalls: number; writes: number; approvalRequests: number } {
  return {
    toolCalls: Math.max(0, budget.maxToolCalls - usage.toolCalls),
    writes: Math.max(0, budget.maxWrites - usage.writes),
    approvalRequests: Math.max(0, budget.maxApprovalRequests - usage.approvalRequests),
  };
}

/** Whether one more automation write fits the site's daily cap. */
export function withinDailyWriteCap(writesToday: number, cap: number): boolean {
  return writesToday + 1 <= cap;
}

/** Midnight UTC of the instant's day (the daily cap's window). */
export function utcDayStart(now: string | Date | number): string {
  const ms = instantMs(now);
  return canonicalInstant(ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS));
}
