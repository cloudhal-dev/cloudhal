/**
 * Automation and run state machines (RFC-0008 §5.3, §8.6, §11.2, §11.6). Pure.
 */
import type {
  Automation,
  AutomationRecurrence,
  AutomationState,
  ScheduleRunState,
} from "@cloudhal/core-contracts";
import { ScheduleError } from "./errors.ts";
import { nextOccurrence, type Occurrence, occurrencesBetween } from "./recurrence.ts";
import { canonicalInstant, instantMs, MINUTE_MS } from "./time.ts";

/** Three consecutive failures pause an automation (D11). */
export const CONSECUTIVE_FAILURE_LIMIT = 3;
/** How long a built-in step holds its automation before another tick may continue it. */
export const AUTOMATION_LEASE_MS = 10 * MINUTE_MS;

/**
 * Automation transitions (§5.3): `active ⇄ paused`; `active → auto-paused` (failures, budget);
 * `active → broken` (key revoked, owner removed, role changed); `active → ended` (COUNT/UNTIL).
 * Only a person resumes (`paused | auto-paused | broken → active`); the kill switch pauses with
 * `pausedReason = kill-switch` and resuming the site resumes exactly those. A paused automation may
 * still break (its key can be revoked meanwhile); an edited rule may revive an ended one.
 */
export const AUTOMATION_TRANSITIONS: Readonly<Record<AutomationState, readonly AutomationState[]>> =
  {
    active: ["paused", "auto-paused", "broken", "ended"],
    paused: ["active", "broken", "ended"],
    "auto-paused": ["active", "paused", "broken", "ended"],
    broken: ["active", "paused", "ended"],
    ended: ["active"],
  };

export function canTransitionAutomation(from: AutomationState, to: AutomationState): boolean {
  return AUTOMATION_TRANSITIONS[from].includes(to);
}

export function assertAutomationTransition(from: AutomationState, to: AutomationState): void {
  if (!canTransitionAutomation(from, to))
    throw new ScheduleError("invalid_transition", `an automation cannot go from ${from} to ${to}`);
}

/**
 * Run transitions (§5.3): `due` (claimed) → `running` → `succeeded | failed | budget-exceeded |
 * killed`; agent tasks start at `ready` (window open) and become `missed` when the window closes
 * without `begin_run`; coalesced occurrences are written directly as `skipped`.
 */
export const RUN_TRANSITIONS: Readonly<Record<ScheduleRunState, readonly ScheduleRunState[]>> = {
  due: ["running", "skipped", "missed", "killed", "failed"],
  ready: ["running", "missed", "killed"],
  running: ["succeeded", "failed", "budget-exceeded", "killed", "missed"],
  succeeded: [],
  failed: [],
  missed: [],
  skipped: [],
  "budget-exceeded": [],
  killed: [],
};

export const OPEN_RUN_STATES: readonly ScheduleRunState[] = ["due", "ready", "running"];

export function canTransitionRun(from: ScheduleRunState, to: ScheduleRunState): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export function isOpenRun(state: ScheduleRunState): boolean {
  return OPEN_RUN_STATES.includes(state);
}

export interface FailureAccounting {
  consecutiveFailures: number;
  /** Set when the automation must leave `active`. */
  pause?: { state: "auto-paused"; pausedReason: "failures" | "budget" };
}

/**
 * What a finished run does to its automation (D11): success resets the failure count; `failed`
 * (and an agent task's `missed` window: the agent did not show up) adds one, and the third in a
 * row auto-pauses; `budget-exceeded` auto-pauses at once. `skipped` (coalesced by downtime) and
 * `killed` (a person or the kill switch) are not the automation's fault and change nothing.
 */
export function accountRunResult(
  consecutiveFailures: number,
  result: ScheduleRunState,
  job: "builtin" | "agent-task",
): FailureAccounting {
  if (result === "succeeded") return { consecutiveFailures: 0 };
  if (result === "budget-exceeded")
    return { consecutiveFailures, pause: { state: "auto-paused", pausedReason: "budget" } };
  const counts = result === "failed" || (result === "missed" && job === "agent-task");
  if (!counts) return { consecutiveFailures };
  const n = consecutiveFailures + 1;
  return n >= CONSECUTIVE_FAILURE_LIMIT
    ? { consecutiveFailures: n, pause: { state: "auto-paused", pausedReason: "failures" } }
    : { consecutiveFailures: n };
}

/** The first occurrence strictly after `after`, or undefined when the recurrence has ended. */
export function nextRunAfter(
  recurrence: Pick<AutomationRecurrence, "start" | "timeZone" | "rule">,
  after: string | Date | number,
): Occurrence | undefined {
  return nextOccurrence(recurrence, after);
}

/** The first occurrence at or after `from` (a new or resumed automation's `nextRunAt`). */
export function firstRunFrom(
  recurrence: Pick<AutomationRecurrence, "start" | "timeZone" | "rule">,
  from: string | Date | number,
): Occurrence | undefined {
  return nextOccurrence(recurrence, instantMs(from) - 1);
}

export interface DueOccurrences {
  /** The occurrence that runs (or whose window is recorded). */
  latest: Occurrence;
  /** How many earlier missed occurrences are coalesced into one `skipped` row (`counts.coalesced`). */
  coalesced: number;
  /** The earliest coalesced occurrence (the `skipped` row's `occurrenceAt`). */
  firstCoalesced?: Occurrence;
  /** The next occurrence after `now` (the new `nextRunAt`), or undefined: the automation ended. */
  next?: Occurrence;
}

/** At most this many missed occurrences are counted after downtime (the count saturates). */
export const MAX_COALESCED = 1_000;

/**
 * The missed policy for recurring jobs (§8.6, S8): of the occurrences in `[nextRunAt, now]` only
 * the latest runs; earlier ones are coalesced. Undefined when nothing is due.
 */
export function dueOccurrences(
  recurrence: Pick<AutomationRecurrence, "start" | "timeZone" | "rule">,
  nextRunAt: string | Date | number,
  now: string | Date | number,
): DueOccurrences | undefined {
  if (instantMs(nextRunAt) > instantMs(now)) return undefined;
  // Beyond MAX_COALESCED the count saturates; `latest` is always the true latest.
  const between = occurrencesBetween(recurrence, instantMs(nextRunAt) - 1, now, MAX_COALESCED);
  const latest = between.latest;
  if (!latest) return undefined;
  const first = between.count > 1 ? between.occurrences[0] : undefined;
  const next = nextOccurrence(recurrence, now);
  return {
    latest,
    coalesced: between.count - 1,
    ...(first ? { firstCoalesced: first } : {}),
    ...(next ? { next } : {}),
  };
}

/** An agent task's run window: `[occurrence, occurrence + windowMinutes]` (§8.6, §11.2). */
export function runWindow(
  occurrenceAt: string | Date | number,
  windowMinutes: number,
): { opensAt: string; closesAt: string } {
  const opens = instantMs(occurrenceAt);
  return {
    opensAt: canonicalInstant(opens),
    closesAt: canonicalInstant(opens + windowMinutes * MINUTE_MS),
  };
}

/** `endsAt = min(window end, start + maxMinutes)` (§11.2). */
export function runEndsAt(
  window: { closesAt: string },
  startedAt: string | Date | number,
  maxMinutes: number,
): string {
  return canonicalInstant(
    Math.min(instantMs(window.closesAt), instantMs(startedAt) + maxMinutes * MINUTE_MS),
  );
}

/** True while `now` is inside the window (inclusive start, exclusive end). */
export function insideWindow(
  window: { opensAt: string; closesAt: string },
  now: string | Date | number,
): boolean {
  const t = instantMs(now);
  return t >= instantMs(window.opensAt) && t < instantMs(window.closesAt);
}

/** Pausing for the site's kill switch: every `active` automation, marked so resume finds them (§11.6). */
export function killSwitchPauses(
  automations: readonly Pick<Automation, "id" | "state">[],
): string[] {
  return automations.filter((a) => a.state === "active").map((a) => a.id);
}

/** Resuming the site resumes exactly the automations the kill switch paused. */
export function killSwitchResumes(
  automations: readonly Pick<Automation, "id" | "state" | "pausedReason">[],
): string[] {
  return automations
    .filter((a) => a.state === "paused" && a.pausedReason === "kill-switch")
    .map((a) => a.id);
}
