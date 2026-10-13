/**
 * The scheduler (RFC-0008 §8): one `runDue(now)` that every ticker calls — the every-minute cron,
 * the `SchedulerClock` Durable Object alarm, the Node timer, the request backstop and a person's
 * manual tick. D1 (SQLite on Node) is the only state; tickers only wake `runDue`.
 *
 * A tick does, in order (§8.1): (1) one overview read, which is also the heartbeat check;
 * (2) due releases, one at a time per site in time order (D15), each claimed with a lease
 * (§8.5) and executed by the injected `ReleaseExecutor` (`publishRelease` in core-ts, rollout
 * step 5); expired leases are recovered first; (3) automation occurrences — built-in steps through
 * the injected `BuiltinRunner`, agent-task windows recorded and closed; (4) due system jobs behind
 * their watermarks; (5) the heartbeat write. Every unit first checks that its statements fit the
 * `TickBudget` (S17); a tick that runs out reports `more`.
 *
 * At most one effect per occurrence (S3): run ids are derived from the occurrence, every claim is
 * a compare-and-swap that also stores a fresh lease token, and every later write is guarded on that
 * token, so two ticks racing on two stores over one database produce one effect.
 */
import type {
  Automation,
  BuiltinAutomationJob,
  Release,
  ReleaseConflict,
  ReleaseConflictOutcome,
  ReleaseFailedOutcome,
  ReleaseOutcome,
  ReleasePublishedOutcome,
  ScheduleRun,
} from "@cloudhal/core-contracts";
import {
  AUTOMATION_LEASE_MS,
  accountRunResult,
  dueOccurrences,
  type FailureAccounting,
  runWindow,
} from "./automation.ts";
import type { TickBudget, TickMeter, TickTrigger } from "./budget-meter.ts";
import { TickBudgetExhaustedError } from "./errors.ts";
import { newLeaseToken, runId } from "./ids.ts";
import type { ScheduleNotification, ScheduleNotifier } from "./notify.ts";
import type { Occurrence } from "./recurrence.ts";
import {
  type ApprovalVerdict,
  baseApprovalVerdict,
  type ExpiredReason,
  isPastLateLimit,
  nextRetryAt,
  orderReleases,
  type PinnedItem,
  RELEASE_LEASE_MS,
  releaseHash,
  SCHEDULER_ACTOR,
} from "./release.ts";
import { cleanCounts, plainLine, plainText } from "./text.ts";
import {
  canonicalInstant,
  instantMs,
  latenessSeconds,
  MINUTE_MS,
  recomputeExecuteAt,
} from "./time.ts";

export type { TickBudget, TickTrigger } from "./budget-meter.ts";

export interface TickReport {
  /** Releases published plus automation runs and system jobs completed. */
  ran: number;
  /** Releases that ran more than a minute late, or became `missed`. */
  late: number;
  /** Releases and runs that ended `failed`, plus failed system jobs. */
  failed: number;
  /** Work is left that did not fit this tick's budget (the alarm re-arms at +1 s). */
  more: boolean;
  /** The next instant anything is due (canonical), when known. */
  nextWakeAt?: string;
  /**
   * The next instant something is really due (a release, an occurrence, a window close, a system
   * job), before `wake: "minute"` caps `nextWakeAt` at the next minute boundary. A cron tick whose
   * trigger fires late in the minute uses it to run that work on time (`followUpDelay`).
   */
  nextDueAt?: string;
  /** Statements this tick executed, when it was metered. */
  statements?: number;
}

/** §8.1. */
export interface Scheduler {
  /** Runs what is due within a budget. Idempotent: two concurrent calls never double an effect. */
  runDue(now: Date, budget: TickBudget, trigger: TickTrigger): Promise<TickReport>;
  /** The next instant anything is due (releases, occurrences, window closes, system jobs). */
  nextWakeAt(now: Date): Promise<Date | undefined>;
}

// ───────────────────────────── the store seam ─────────────────────────────

export interface Heartbeat {
  at: string;
  trigger: TickTrigger;
  /** The latest time the next heartbeat is expected (see `heartbeatNextWake`). */
  nextWakeAt: string;
  ran: number;
  more: boolean;
  lagSeconds?: number;
}

/** One read that tells an idle tick there is nothing to do (§8.2: an idle tick is cheap). */
export interface TickOverview {
  /** Earliest `execute_at` of a `scheduled` release. */
  nextReleaseAt?: string;
  /** Earliest `next_run_at` of an `active` automation. */
  nextAutomationAt?: string;
  /** Earliest `next_run_at` of a system job. */
  nextSystemJobAt?: string;
  /** Earliest deadline of an open run: a `ready` window's close or a running run's lease. */
  nextRunDeadline?: string;
  /** Rows in `system_jobs` (to register new definitions without a write every tick). */
  systemJobs: number;
  heartbeat?: Heartbeat;
}

export interface StoredReleaseItem extends PinnedItem {
  held: boolean;
}

export interface DueRelease {
  release: Release;
  items: StoredReleaseItem[];
  executeAt: string;
  sitePaused: boolean;
}

export interface RecoverableRelease extends DueRelease {
  run: { id: string; attempt: number; leaseToken: string; occurrenceAt: string };
}

export interface DueAutomation {
  automation: Automation;
  sitePaused: boolean;
  /** A built-in job's continuation (bounded steps span ticks, §11.1). */
  cursor?: BuiltinCursor;
  leaseUntil?: string;
}

/** Where a built-in job continues: the run it belongs to and the job's own position. */
export interface BuiltinCursor {
  runId: string;
  occurrenceAt: string;
  attempt: number;
  position?: unknown;
  /** The run read untrusted text in an earlier step (§11.4); kept to its end. */
  taint?: BuiltinTaint;
  /** Run accounting so far: steps taken and the statements they executed (§11.5, S17). */
  usage?: BuiltinUsage;
  /** A person's "Run now" (§13): the scheduled `nextRunAt` the automation returns to afterwards. */
  manual?: { nextRunAt?: string };
}

/** `ScheduleRun.taint` of a built-in run: when and through what it read untrusted text. */
export interface BuiltinTaint {
  at: string;
  tool: string;
}

/** A built-in run's budget use across its steps, recorded as `counts.steps` / `counts.statements`. */
export interface BuiltinUsage {
  steps: number;
  statements: number;
}

export type ReleaseFinish =
  | { state: "published"; outcome: ReleasePublishedOutcome }
  | { state: "conflict" | "failed" | "expired" | "canceled" | "missed"; outcome: ReleaseOutcome };

export interface ClaimReleaseInput {
  siteId: string;
  releaseId: string;
  expectedRev: number;
  executeAt: string;
  runId: string;
  token: string;
  now: string;
  leaseUntil: string;
  trigger: TickTrigger;
  latenessSeconds: number;
  adjusted?: "tzdata";
}

export interface SystemJobState {
  name: string;
  nextRunAt: string;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string;
  leaseUntil?: string;
}

/** What `runDue` needs from storage. `SqlScheduleStore` implements it over `SqlDriver`. */
export interface SchedulerStore {
  overview(now: string): Promise<TickOverview>;
  dueReleases(now: string, limit: number): Promise<DueRelease[]>;
  expiredReleaseLeases(now: string, limit: number): Promise<RecoverableRelease[]>;
  /** Claims a `scheduled` release (state `running`, a lease, the run row); false if another tick has it. */
  claimRelease(input: ClaimReleaseInput): Promise<boolean>;
  /** Takes over a `running` release whose lease expired; false if another tick did. */
  reclaimRelease(input: {
    releaseId: string;
    runId: string;
    oldToken: string;
    token: string;
    now: string;
    leaseUntil: string;
    trigger: TickTrigger;
    latenessSeconds: number;
  }): Promise<boolean>;
  /** Ends a claimed release (guarded on the lease token). */
  finishRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    latenessSeconds: number;
    finish: ReleaseFinish;
  }): Promise<boolean>;
  /** Keeps a claimed release `running` until `retryAt` (a transient error, §8.8). */
  deferRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    retryAt: string;
    error: string;
  }): Promise<boolean>;
  /** Ends a not-yet-claimed `scheduled` release as `missed` or `expired` (CAS on `rev`). */
  settleRelease(input: {
    siteId: string;
    releaseId: string;
    expectedRev: number;
    executeAt: string;
    now: string;
    outcome: ReleaseOutcome & { kind: "missed" | "expired" };
    trigger: TickTrigger;
  }): Promise<boolean>;
  /** Moves a `scheduled` release later (never-early recompute, `adjusted: "tzdata"`). */
  moveRelease(input: {
    siteId: string;
    releaseId: string;
    expectedRev: number;
    at: string;
    now: string;
  }): Promise<boolean>;

  dueAutomations(now: string, limit: number): Promise<DueAutomation[]>;
  /** Claims a built-in occurrence: the automation's lease, the run row (and a `skipped` row). */
  claimBuiltinRun(input: {
    automation: Automation;
    occurrence: Occurrence;
    runId: string;
    attempt: number;
    continuing: boolean;
    coalesced?: { runId: string; occurrenceAt: string; count: number };
    token: string;
    now: string;
    leaseUntil: string;
    trigger: TickTrigger;
    latenessSeconds: number;
  }): Promise<boolean>;
  /** Ends (or pauses between steps) a built-in run; guarded on the automation's lease token. */
  finishBuiltinRun(input: {
    automation: Automation;
    runId: string;
    token: string;
    now: string;
    step:
      | { done: false; cursor: BuiltinCursor }
      | {
          done: true;
          run: Pick<ScheduleRun, "state"> &
            Partial<Pick<ScheduleRun, "outcome" | "summary" | "counts" | "error" | "taint">> & {
              findings?: unknown[];
            };
          nextRunAt?: string;
          consecutiveFailures: number;
          pause?: { state: "auto-paused"; pausedReason: "failures" | "budget" };
        };
  }): Promise<boolean>;
  /** Records an agent task's latest occurrence (`ready`, or `missed` when its window already closed) and moves `next_run_at`. */
  recordAgentOccurrence(input: {
    automation: Automation;
    occurrence: Occurrence;
    runId: string;
    window: { opensAt: string; closesAt: string };
    state: "ready" | "missed";
    nextRunAt?: string;
    consecutiveFailures: number;
    pause?: { state: "auto-paused"; pausedReason: "failures" | "budget" };
    now: string;
    trigger: TickTrigger;
    latenessSeconds: number;
  }): Promise<boolean>;
  /** Closes windows that passed without `begin_run` (`missed`) and agent runs past their end (`failed`). */
  closeExpiredRuns(now: string): Promise<{ missed: number; failed: number }>;

  ensureSystemJobs(jobs: readonly { name: string; nextRunAt: string }[]): Promise<void>;
  dueSystemJobs(now: string): Promise<SystemJobState[]>;
  claimSystemJob(input: {
    name: string;
    token: string;
    now: string;
    leaseUntil: string;
  }): Promise<boolean>;
  finishSystemJob(input: {
    name: string;
    token: string;
    now: string;
    ok: boolean;
    nextRunAt: string;
    error?: string;
  }): Promise<boolean>;

  writeHeartbeat(heartbeat: Heartbeat): Promise<void>;
}

// ───────────────────────────── the work seams ─────────────────────────────

export interface ReleaseExecutionInput {
  release: Release;
  items: StoredReleaseItem[];
  executeAt: string;
  run: { id: string; attempt: number; leaseToken: string; recovering: boolean };
  now: Date;
  latenessSeconds: number;
  trigger: TickTrigger;
}

export type ReleaseExecution =
  /** Applied. `committed`: the executor's own batch already moved the release and run (§6.3 statements 5–7). */
  | {
      kind: "published";
      snapshotId: string;
      baseSnapshotId: string;
      purge: ReleasePublishedOutcome["purge"];
      committed: boolean;
    }
  | { kind: "conflict"; conflicts: ReleaseConflict[] }
  | { kind: "failed"; code: ReleaseFailedOutcome["code"]; message?: string }
  | { kind: "expired"; reason: ExpiredReason }
  /** The site or a node no longer exists (§10.6). */
  | { kind: "canceled" }
  /** Transient (a D1 error, CPU, a lost site CAS twice): retry with back-off inside the hour. */
  | { kind: "retry"; error: string };

/** Applies a claimed release — `publishRelease` in core-ts (rollout step 5). */
export interface ReleaseExecutor {
  /** Statements one execution may take (reads + its batch), for the budget check. */
  readonly cost: number;
  execute(input: ReleaseExecutionInput): Promise<ReleaseExecution>;
}

export interface BuiltinStepInput {
  automation: Automation;
  job: BuiltinAutomationJob;
  run: { id: string; occurrenceAt: string; attempt: number };
  position?: unknown;
  now: Date;
  trigger: TickTrigger;
}

export interface BuiltinStepResult {
  /** False: more steps follow on later ticks from `position`. */
  done: boolean;
  position?: unknown;
  outcome?: ScheduleRun["outcome"];
  counts?: Record<string, number>;
  summary?: string;
  /** Studio-only findings (≤ 200 per run). */
  findings?: unknown[];
  /** The step read untrusted text (404 paths, a fetched document): the run is tainted (§11.4). */
  taint?: BuiltinTaint;
  /** Delivered through `RunDueDeps.notify` once the run's end is committed (done steps only). */
  notify?: ScheduleNotification[];
}

/** Runs one bounded step of a built-in job (rollout step 9). */
export interface BuiltinRunner {
  /** Statements one step may take (the largest job's, when `costOf` is absent). */
  readonly cost: number;
  /** Statements one step of this job may take. */
  costOf?(job: BuiltinAutomationJob): number;
  step(input: BuiltinStepInput): Promise<BuiltinStepResult>;
}

/** A deployment-wide periodic job behind a watermark (§8.2): `analytics.rollup`, `comments.hourly`, … */
export interface SystemJobDefinition {
  name: string;
  /** Statements one run may take. */
  cost: number;
  /** The next watermark strictly after `after`. */
  next(after: Date): Date;
  run(context: { now: Date; trigger: TickTrigger }): Promise<void>;
}

/** Every hour at `:minute` (UTC). */
export function hourlyAt(minute: number): (after: Date) => Date {
  return (after) => {
    const d = new Date(after.getTime());
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(minute);
    if (d.getTime() <= after.getTime()) d.setUTCHours(d.getUTCHours() + 1);
    return d;
  };
}

/** Every day at `hour:minute` (UTC). */
export function dailyAt(hour: number, minute: number): (after: Date) => Date {
  return (after) => {
    const d = new Date(after.getTime());
    d.setUTCHours(hour, minute, 0, 0);
    if (d.getTime() <= after.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };
}

// ───────────────────────────── heartbeat and health ─────────────────────────────

/** Idle ticks write the heartbeat every fifth minute (§8.7). */
export const HEARTBEAT_EVERY_MS = 5 * MINUTE_MS;
/** Stalled when this far past the expected wake while something is due within 24 h (§8.7). */
export const STALL_GRACE_DUE_MS = 2 * MINUTE_MS;
/** Stalled at all when this far past it. */
export const STALL_GRACE_MS = 10 * MINUTE_MS;
export const SYSTEM_JOB_LEASE_MS = 10 * MINUTE_MS;

export function shouldWriteHeartbeat(
  prev: Heartbeat | undefined,
  now: string,
  didWork: boolean,
): boolean {
  return didWork || !prev || instantMs(now) - instantMs(prev.at) >= HEARTBEAT_EVERY_MS;
}

/**
 * The heartbeat's `next_wake_at`: the later of the next wake and the next heartbeat write an idle
 * cron tick owes (`at + 5 min`), so a quiet scheduler is not reported stalled between writes.
 */
export function heartbeatNextWake(at: string, nextWake: string | undefined): string {
  const floor = instantMs(at) + HEARTBEAT_EVERY_MS;
  return canonicalInstant(nextWake ? Math.max(instantMs(nextWake), floor) : floor);
}

export type SchedulerHealthState = "running" | "late" | "stopped" | "unknown";

/**
 * §8.7: stalled = `now > next_wake_at + 2 min` while something is due within 24 h, or
 * `now > next_wake_at + 10 min` at all. `late` is the first, `stopped` the second.
 */
export function schedulerHealth(
  heartbeat: Heartbeat | undefined,
  now: string | Date | number,
  options: { dueWithin24h: boolean },
): { state: SchedulerHealthState; healthy: boolean; lastTickAt?: string; nextWakeAt?: string } {
  if (!heartbeat) return { state: "unknown", healthy: false };
  const past = instantMs(now) - instantMs(heartbeat.nextWakeAt);
  const base = { lastTickAt: heartbeat.at, nextWakeAt: heartbeat.nextWakeAt };
  if (past > STALL_GRACE_MS) return { ...base, state: "stopped", healthy: false };
  if (options.dueWithin24h && past > STALL_GRACE_DUE_MS)
    return { ...base, state: "late", healthy: false };
  return { ...base, state: "running", healthy: true };
}

/**
 * The request backstop (§8.6): an admin request runs `runDue(…, "request")` in `waitUntil` when the
 * heartbeat is missing or more than 2 minutes behind its `next_wake_at`.
 */
export function backstopDue(
  heartbeat: Heartbeat | undefined,
  now: string | Date | number,
): boolean {
  return !heartbeat || instantMs(now) - instantMs(heartbeat.nextWakeAt) > STALL_GRACE_DUE_MS;
}

/** The next instant anything in the overview is due. */
export function overviewNextWake(o: TickOverview): string | undefined {
  const all = [o.nextReleaseAt, o.nextAutomationAt, o.nextSystemJobAt, o.nextRunDeadline].filter(
    (x): x is string => x !== undefined,
  );
  if (all.length === 0) return undefined;
  return canonicalInstant(Math.min(...all.map(instantMs)));
}

// ───────────────────────────── runDue ─────────────────────────────

/** Statement estimates per path, checked before each unit (measured by the conformance suite). */
export const PATH_COST = {
  overview: 1,
  dueReleases: 1,
  recover: 1,
  releaseClaim: 3,
  releaseFinish: 4,
  releaseSettle: 3,
  releaseMove: 1,
  dueAutomations: 1,
  builtinClaim: 4,
  builtinFinish: 3,
  agentOccurrence: 3,
  closeRuns: 5,
  ensureJobs: 1,
  dueJobs: 1,
  jobClaim: 1,
  jobFinish: 1,
  heartbeat: 1,
} as const;

export interface RunDueDeps {
  store: SchedulerStore;
  trigger: TickTrigger;
  budget: TickBudget;
  /** The meter wrapping the store's driver; without it only `maxReleases` and the deadline limit the tick. */
  meter?: TickMeter;
  /** Applies releases; without it due releases are left for a tick that has one. */
  releases?: ReleaseExecutor;
  /** Policy re-checks at run time (§10.6); `baseApprovalVerdict` is applied first either way. */
  checkApproval?: (release: Release, now: Date) => ApprovalVerdict | Promise<ApprovalVerdict>;
  builtins?: BuiltinRunner;
  /** Notifications of finished, failed and paused automation runs (§14); default: none. */
  notify?: ScheduleNotifier;
  systemJobs?: readonly SystemJobDefinition[];
  /** `CLOUDHAL_AUTOMATIONS=off` → false: automations stop, releases continue (§11.6). */
  automationsEnabled?: boolean;
  /** `minute` (cron: wakes every minute anyway) or `computed` (alarm, Node timer). */
  wake?: "minute" | "computed";
  log?: (line: string) => void;
  /** Lease tokens (tests may pin them). */
  newToken?: () => string;
}

const MAX_DUE_AUTOMATIONS = 20;
const MAX_RECOVER = 5;

/** Runs what is due (§8.1). See the module comment for the order and guarantees. */
export async function runDue(nowDate: Date, deps: RunDueDeps): Promise<TickReport> {
  const now = canonicalInstant(nowDate);
  const { store, meter, trigger } = deps;
  const token = deps.newToken ?? newLeaseToken;
  const report: TickReport = { ran: 0, late: 0, failed: 0, more: false };
  const reserve = PATH_COST.overview + PATH_COST.heartbeat;
  const fits = (n: number) => {
    if (meter?.deadlinePassed()) return false;
    return meter ? meter.canAfford(n, reserve) : true;
  };
  let overview: TickOverview | undefined;
  let didWork = false;
  let oldestDue: string | undefined;
  const noteDue = (at: string) => {
    if (!oldestDue || instantMs(at) < instantMs(oldestDue)) oldestDue = at;
  };

  try {
    overview = await store.overview(now);
    const t = instantMs(now);
    const due = (at: string | undefined) => at !== undefined && instantMs(at) <= t;

    // (2) releases — recover expired leases first (§6.3 Recovery), then due releases in order.
    let releasesRun = 0;
    if (due(overview.nextRunDeadline) && deps.releases && fits(PATH_COST.recover)) {
      for (const r of await store.expiredReleaseLeases(now, MAX_RECOVER)) {
        if (releasesRun >= deps.budget.maxReleases) {
          report.more = true;
          break;
        }
        if (!fits(PATH_COST.releaseClaim + deps.releases.cost + PATH_COST.releaseFinish)) {
          report.more = true;
          break;
        }
        noteDue(r.executeAt);
        const lateness = latenessSeconds(r.executeAt, now);
        const tok = token();
        if (isPastLateLimit(r.executeAt, now)) {
          // Nothing is ever published more than an hour late, even by a recovery (S8).
          if (
            await store.reclaimRelease({
              releaseId: r.release.id,
              runId: r.run.id,
              oldToken: r.run.leaseToken,
              token: tok,
              now,
              leaseUntil: now,
              trigger,
              latenessSeconds: lateness,
            })
          ) {
            await store.finishRelease({
              releaseId: r.release.id,
              runId: r.run.id,
              token: tok,
              now,
              latenessSeconds: lateness,
              finish: {
                state: "missed",
                outcome: { kind: "missed", at: now, latenessSeconds: lateness },
              },
            });
            report.late++;
            didWork = true;
          }
          continue;
        }
        if (r.sitePaused) continue; // the kill switch: waits, missed after the hour
        const leaseUntil = canonicalInstant(t + RELEASE_LEASE_MS);
        if (
          !(await store.reclaimRelease({
            releaseId: r.release.id,
            runId: r.run.id,
            oldToken: r.run.leaseToken,
            token: tok,
            now,
            leaseUntil,
            trigger,
            latenessSeconds: lateness,
          }))
        )
          continue;
        didWork = true;
        releasesRun++;
        await executeClaimed(deps, report, {
          release: r.release,
          items: r.items,
          executeAt: r.executeAt,
          runId: r.run.id,
          attempt: r.run.attempt + 1,
          token: tok,
          now,
          nowDate,
          lateness,
          recovering: true,
        });
      }
    }

    if (due(overview.nextReleaseAt) && fits(PATH_COST.dueReleases)) {
      const list = orderReleases(
        (await store.dueReleases(now, Math.max(1, deps.budget.maxReleases) * 4)).map((d) => ({
          ...d,
          id: d.release.id,
        })),
      );
      for (const d of list) {
        noteDue(d.executeAt);
        const lateness = latenessSeconds(d.executeAt, now);
        const r = d.release;
        // Gates of the run (§6.3 step 2): lateness first — a paused site waits, but not past the hour.
        if (isPastLateLimit(d.executeAt, now)) {
          if (!fits(PATH_COST.releaseSettle)) {
            report.more = true;
            break;
          }
          if (
            await store.settleRelease({
              siteId: r.siteId,
              releaseId: r.id,
              expectedRev: r.rev,
              executeAt: d.executeAt,
              now,
              trigger,
              outcome: { kind: "missed", at: now, latenessSeconds: lateness },
            })
          ) {
            report.late++;
            didWork = true;
            deps.log?.(`schedules: release ${r.id} missed (${lateness} s late)`);
          }
          continue;
        }
        if (d.sitePaused) continue; // the kill switch: waits, missed after the hour (§8.6)
        if (!deps.releases) continue;
        if (releasesRun >= deps.budget.maxReleases) {
          report.more = true;
          break;
        }
        // Approval (§10.6) and the binding (§10.4): items must still hash to the approved `rl1:`.
        let verdict = baseApprovalVerdict(r.approval, nowDate);
        if (
          verdict.ok &&
          (await releaseHash(
            r.siteId,
            d.items.map((i) => i.item),
          )) !== r.hash
        )
          verdict = { ok: false, reason: "approval_lost" };
        if (verdict.ok && deps.checkApproval) verdict = await deps.checkApproval(r, nowDate);
        if (!verdict.ok) {
          if (!fits(PATH_COST.releaseSettle)) {
            report.more = true;
            break;
          }
          if (
            await store.settleRelease({
              siteId: r.siteId,
              releaseId: r.id,
              expectedRev: r.rev,
              executeAt: d.executeAt,
              now,
              trigger,
              outcome: { kind: "expired", at: now, reason: verdict.reason },
            })
          ) {
            didWork = true;
            deps.log?.(`schedules: release ${r.id} expired (${verdict.reason})`);
          }
          continue;
        }
        // Never early (S2): recompute a wall-clock time with today's tzdata.
        let executeAt = d.executeAt;
        let adjusted: "tzdata" | undefined;
        if (r.when?.kind === "at" && r.when.localTime) {
          const re = recomputeExecuteAt({
            at: d.executeAt,
            timeZone: r.when.timeZone,
            localTime: r.when.localTime,
          });
          if (re.changed) {
            if (!fits(PATH_COST.releaseMove)) {
              report.more = true;
              break;
            }
            if (
              !(await store.moveRelease({
                siteId: r.siteId,
                releaseId: r.id,
                expectedRev: r.rev,
                at: re.at,
                now,
              }))
            )
              continue;
            deps.log?.(`schedules: release ${r.id} moved to ${re.at} (tzdata)`);
            if (instantMs(re.at) > t) continue; // not due yet at its real wall-clock time
            executeAt = re.at;
            adjusted = "tzdata";
            r.rev += 1;
          }
        }
        if (!fits(PATH_COST.releaseClaim + deps.releases.cost + PATH_COST.releaseFinish)) {
          report.more = true;
          break;
        }
        const tok = token();
        const run = await runId(r.id, executeAt);
        const claimed = await store.claimRelease({
          siteId: r.siteId,
          releaseId: r.id,
          expectedRev: r.rev,
          executeAt,
          runId: run,
          token: tok,
          now,
          leaseUntil: canonicalInstant(t + RELEASE_LEASE_MS),
          trigger,
          latenessSeconds: latenessSeconds(executeAt, now),
          ...(adjusted ? { adjusted } : {}),
        });
        if (!claimed) continue; // another tick has it, or another release of the site is running
        didWork = true;
        releasesRun++;
        await executeClaimed(deps, report, {
          release: r,
          items: d.items,
          executeAt,
          runId: run,
          attempt: 1,
          token: tok,
          now,
          nowDate,
          lateness: latenessSeconds(executeAt, now),
          recovering: false,
        });
      }
    }

    // (3) automations.
    const automations = deps.automationsEnabled !== false;
    if (automations && due(overview.nextRunDeadline) && fits(PATH_COST.closeRuns)) {
      const closed = await store.closeExpiredRuns(now);
      if (closed.missed + closed.failed > 0) didWork = true;
      report.failed += closed.failed;
    }
    if (automations && due(overview.nextAutomationAt) && fits(PATH_COST.dueAutomations)) {
      for (const a of await store.dueAutomations(now, MAX_DUE_AUTOMATIONS)) {
        if (a.sitePaused) continue;
        const done = await runAutomation(deps, report, a, now, nowDate, fits, token, noteDue);
        if (done === "budget") {
          report.more = true;
          break;
        }
        if (done === "ran") didWork = true;
      }
    }

    // (4) system jobs behind watermarks.
    const jobs = deps.systemJobs ?? [];
    if (jobs.length > 0) {
      if (overview.systemJobs < jobs.length && fits(PATH_COST.ensureJobs)) {
        await store.ensureSystemJobs(
          jobs.map((j) => ({ name: j.name, nextRunAt: canonicalInstant(j.next(nowDate)) })),
        );
      }
      if (due(overview.nextSystemJobAt) && fits(PATH_COST.dueJobs)) {
        for (const row of await store.dueSystemJobs(now)) {
          const def = jobs.find((j) => j.name === row.name);
          if (!def) continue;
          if (!fits(PATH_COST.jobClaim + def.cost + PATH_COST.jobFinish)) {
            report.more = true;
            break;
          }
          const tok = token();
          if (
            !(await store.claimSystemJob({
              name: row.name,
              token: tok,
              now,
              leaseUntil: canonicalInstant(t + SYSTEM_JOB_LEASE_MS),
            }))
          )
            continue;
          didWork = true;
          let ok = true;
          let error: string | undefined;
          try {
            await def.run({ now: nowDate, trigger });
          } catch (e) {
            if (e instanceof TickBudgetExhaustedError) throw e;
            ok = false;
            error = e instanceof Error ? e.message : String(e);
            report.failed++;
          }
          // The watermark moves past `now`: a missed hour is caught up by this run (bounded, idempotent).
          await store.finishSystemJob({
            name: row.name,
            token: tok,
            now,
            ok,
            nextRunAt: canonicalInstant(def.next(nowDate)),
            ...(error ? { error: error.slice(0, 500) } : {}),
          });
          if (ok) report.ran++;
        }
      }
    }
  } catch (e) {
    if (!(e instanceof TickBudgetExhaustedError)) throw e;
    report.more = true;
  }

  // (5) heartbeat; the reserve kept for it above (a fresh overview after work, and the write).
  let nextWake = overview ? overviewNextWake(overview) : undefined;
  if (didWork && (!meter || meter.canAfford(PATH_COST.overview + PATH_COST.heartbeat))) {
    try {
      nextWake = overviewNextWake(await store.overview(now));
    } catch (e) {
      if (!(e instanceof TickBudgetExhaustedError)) throw e;
    }
  }
  // Something due but left (a paused site, no executor) must not make an alarm fire in a loop.
  if (nextWake && instantMs(nextWake) <= instantMs(now))
    nextWake = canonicalInstant(instantMs(now) + MINUTE_MS);
  if (nextWake && instantMs(nextWake) > instantMs(now)) report.nextDueAt = nextWake;
  if (deps.wake === "minute") {
    const nextMinute = canonicalInstant(
      Math.floor(instantMs(now) / MINUTE_MS) * MINUTE_MS + MINUTE_MS,
    );
    nextWake = nextWake && instantMs(nextWake) < instantMs(nextMinute) ? nextWake : nextMinute;
  }
  if (report.more) nextWake = canonicalInstant(instantMs(now) + 1000);
  if (nextWake) report.nextWakeAt = nextWake;
  if (shouldWriteHeartbeat(overview?.heartbeat, now, didWork)) {
    try {
      await store.writeHeartbeat({
        at: now,
        trigger,
        nextWakeAt: heartbeatNextWake(now, nextWake),
        ran: report.ran,
        more: report.more,
        ...(oldestDue ? { lagSeconds: latenessSeconds(oldestDue, now) } : {}),
      });
    } catch (e) {
      if (!(e instanceof TickBudgetExhaustedError)) throw e;
      report.more = true;
    }
  }
  if (meter) report.statements = meter.used;
  if (didWork || report.more)
    deps.log?.(
      `schedules tick (${trigger}): ${report.ran} ran, ${report.late} late, ${report.failed} failed${report.more ? ", more" : ""}${nextWake ? `; next ${nextWake}` : ""}`,
    );
  return report;
}

/**
 * Executes a release the caller already claimed — a person's "Publish now"
 * (`SqlScheduleStore.claimManualRun`) — and records its end exactly as a tick does: published,
 * conflict, failed, expired or canceled, or a transient error kept `running` for a retry.
 */
export async function runClaimedRelease(
  deps: Pick<RunDueDeps, "store" | "trigger" | "log"> & { releases: ReleaseExecutor },
  claimed: {
    release: Release;
    items: StoredReleaseItem[];
    executeAt: string;
    runId: string;
    token: string;
    now: Date;
    attempt?: number;
  },
): Promise<TickReport> {
  const report: TickReport = { ran: 0, late: 0, failed: 0, more: false };
  const now = canonicalInstant(claimed.now);
  await executeClaimed(
    {
      ...deps,
      budget: {
        maxQueries: Number.POSITIVE_INFINITY,
        maxReleases: 1,
        deadlineMs: Number.POSITIVE_INFINITY,
      },
    },
    report,
    {
      release: claimed.release,
      items: claimed.items,
      executeAt: claimed.executeAt,
      runId: claimed.runId,
      attempt: claimed.attempt ?? 1,
      token: claimed.token,
      now,
      nowDate: claimed.now,
      lateness: latenessSeconds(claimed.executeAt, now),
      recovering: false,
    },
  );
  return report;
}

interface Claimed {
  release: Release;
  items: StoredReleaseItem[];
  executeAt: string;
  runId: string;
  attempt: number;
  token: string;
  now: string;
  nowDate: Date;
  lateness: number;
  recovering: boolean;
}

async function executeClaimed(deps: RunDueDeps, report: TickReport, c: Claimed): Promise<void> {
  const executor = deps.releases as ReleaseExecutor;
  let result: ReleaseExecution;
  try {
    result = await executor.execute({
      release: c.release,
      items: c.items,
      executeAt: c.executeAt,
      run: { id: c.runId, attempt: c.attempt, leaseToken: c.token, recovering: c.recovering },
      now: c.nowDate,
      latenessSeconds: c.lateness,
      trigger: deps.trigger,
    });
  } catch (e) {
    if (e instanceof TickBudgetExhaustedError) throw e;
    result = { kind: "retry", error: e instanceof Error ? e.message : String(e) };
  }
  const base = {
    releaseId: c.release.id,
    runId: c.runId,
    token: c.token,
    now: c.now,
    latenessSeconds: c.lateness,
  };
  const at = c.now;
  switch (result.kind) {
    case "published": {
      if (!result.committed)
        await deps.store.finishRelease({
          ...base,
          finish: {
            state: "published",
            outcome: {
              kind: "published",
              runId: c.runId,
              at,
              snapshotId: result.snapshotId,
              baseSnapshotId: result.baseSnapshotId,
              latenessSeconds: c.lateness,
              purge: result.purge,
            },
          },
        });
      report.ran++;
      if (c.lateness > 60) report.late++;
      deps.log?.(`schedules: release ${c.release.id} published (${c.lateness} s late)`);
      return;
    }
    case "conflict":
      await deps.store.finishRelease({
        ...base,
        finish: {
          state: "conflict",
          outcome: {
            kind: "conflict",
            runId: c.runId,
            at,
            conflicts: result.conflicts as ReleaseConflictOutcome["conflicts"],
          },
        },
      });
      return;
    case "failed":
      report.failed++;
      await deps.store.finishRelease({
        ...base,
        finish: {
          state: "failed",
          outcome: {
            kind: "failed",
            runId: c.runId,
            at,
            code: result.code,
            ...(result.message ? { message: plainLine(result.message) } : {}),
          },
        },
      });
      return;
    case "expired":
      await deps.store.finishRelease({
        ...base,
        finish: { state: "expired", outcome: { kind: "expired", at, reason: result.reason } },
      });
      return;
    case "canceled":
      await deps.store.finishRelease({
        ...base,
        finish: {
          state: "canceled",
          outcome: { kind: "canceled", at, by: { ...SCHEDULER_ACTOR } },
        },
      });
      return;
    case "retry": {
      const retryAt = nextRetryAt(c.executeAt, c.now, c.attempt);
      if (retryAt) {
        await deps.store.deferRelease({
          releaseId: c.release.id,
          runId: c.runId,
          token: c.token,
          now: c.now,
          retryAt,
          error: result.error.slice(0, 500),
        });
        deps.log?.(`schedules: release ${c.release.id} will retry at ${retryAt}: ${result.error}`);
      } else {
        report.late++;
        await deps.store.finishRelease({
          ...base,
          finish: { state: "missed", outcome: { kind: "missed", at, latenessSeconds: c.lateness } },
        });
      }
      return;
    }
  }
}

async function runAutomation(
  deps: RunDueDeps,
  report: TickReport,
  a: DueAutomation,
  now: string,
  nowDate: Date,
  fits: (n: number) => boolean,
  token: () => string,
  noteDue: (at: string) => void,
): Promise<"ran" | "skipped" | "budget"> {
  const aut = a.automation;
  if (!aut.nextRunAt) return "skipped";
  noteDue(aut.nextRunAt);
  const rec = aut.recurrence;
  const job = aut.job;

  if (job.kind === "agent-task") {
    if (!fits(PATH_COST.agentOccurrence)) return "budget";
    const occ = dueOccurrences(rec, aut.nextRunAt, now);
    if (!occ) return "skipped";
    const window = runWindow(occ.latest.at, job.windowMinutes);
    const closed = instantMs(window.closesAt) <= instantMs(now);
    const acc = closed
      ? accountRunResult(aut.consecutiveFailures, "missed", "agent-task")
      : { consecutiveFailures: aut.consecutiveFailures };
    const ok = await deps.store.recordAgentOccurrence({
      automation: aut,
      occurrence: occ.latest,
      runId: await runId(aut.id, occ.latest.at),
      window,
      state: closed ? "missed" : "ready",
      ...(occ.next ? { nextRunAt: occ.next.at } : {}),
      consecutiveFailures: acc.consecutiveFailures,
      ...(acc.pause ? { pause: acc.pause } : {}),
      now,
      trigger: deps.trigger,
      latenessSeconds: latenessSeconds(occ.latest.at, now),
    });
    return ok ? "ran" : "skipped";
  }

  // Built-in: one bounded step per tick; the cursor carries the run across ticks.
  const runner = deps.builtins;
  if (!runner) return "skipped";
  if (a.leaseUntil && instantMs(a.leaseUntil) > instantMs(now)) return "skipped"; // another tick is stepping it
  const cost = runner.costOf?.(job) ?? runner.cost;
  if (!fits(PATH_COST.builtinClaim + cost + PATH_COST.builtinFinish)) return "budget";
  let occurrence: Occurrence;
  let run: string;
  let attempt = 1;
  let coalesced: { runId: string; occurrenceAt: string; count: number } | undefined;
  let next: Occurrence | undefined;
  const continuing = a.cursor !== undefined;
  const occ = dueOccurrences(rec, aut.nextRunAt, now);
  if (a.cursor) {
    occurrence = { at: a.cursor.occurrenceAt, local: a.cursor.occurrenceAt };
    run = a.cursor.runId;
    attempt = a.cursor.attempt;
    // A person's "Run now" moved `nextRunAt` to now; the scheduled occurrence comes back after it.
    const manual = a.cursor.manual;
    next = manual
      ? manual.nextRunAt
        ? { at: manual.nextRunAt, local: manual.nextRunAt }
        : undefined
      : occ?.next;
  } else {
    if (!occ) return "skipped";
    occurrence = occ.latest;
    run = await runId(aut.id, occ.latest.at);
    next = occ.next;
    if (occ.firstCoalesced && occ.coalesced > 0)
      coalesced = {
        runId: await runId(aut.id, occ.firstCoalesced.at),
        occurrenceAt: occ.firstCoalesced.at,
        count: occ.coalesced,
      };
  }
  const tok = token();
  const claimed = await deps.store.claimBuiltinRun({
    automation: aut,
    occurrence,
    runId: run,
    attempt,
    continuing,
    ...(coalesced ? { coalesced } : {}),
    token: tok,
    now,
    leaseUntil: canonicalInstant(instantMs(now) + AUTOMATION_LEASE_MS),
    trigger: deps.trigger,
    latenessSeconds: latenessSeconds(occurrence.at, now),
  });
  if (!claimed) return "skipped";
  // Run accounting (§11.5, S17): the statements each step executed, summed over the run.
  const before = deps.meter?.used ?? 0;
  const prior: BuiltinUsage = a.cursor?.usage ?? { steps: 0, statements: 0 };
  const usageNow = (): BuiltinUsage => ({
    steps: prior.steps + 1,
    statements: prior.statements + Math.max(0, (deps.meter?.used ?? before) - before),
  });
  let taint = a.cursor?.taint;
  let result: BuiltinStepResult;
  try {
    result = await runner.step({
      automation: aut,
      job,
      run: { id: run, occurrenceAt: occurrence.at, attempt },
      ...(a.cursor?.position !== undefined ? { position: a.cursor.position } : {}),
      now: nowDate,
      trigger: deps.trigger,
    });
  } catch (e) {
    if (e instanceof TickBudgetExhaustedError) throw e;
    const acc = accountRunResult(aut.consecutiveFailures, "failed", "builtin");
    report.failed++;
    const error = {
      code: "job_error",
      message: plainLine(e instanceof Error ? e.message : String(e)),
    };
    const usage = usageNow();
    const ended = await deps.store.finishBuiltinRun({
      automation: aut,
      runId: run,
      token: tok,
      now,
      step: {
        done: true,
        run: {
          state: "failed",
          error,
          counts: usageCounts(usage),
          ...(taint ? { taint } : {}),
        },
        ...(next ? { nextRunAt: next.at } : {}),
        consecutiveFailures: acc.consecutiveFailures,
        ...(acc.pause ? { pause: acc.pause } : {}),
      },
    });
    if (ended)
      await deliver(deps, [
        runNotice(aut, run, now, "automation-failed", { error }),
        ...pauseNotice(aut, run, now, acc),
      ]);
    return "ran";
  }
  if (result.taint && !taint)
    taint = { at: canonicalInstant(result.taint.at), tool: result.taint.tool };
  const usage = usageNow();
  if (!result.done) {
    await deps.store.finishBuiltinRun({
      automation: aut,
      runId: run,
      token: tok,
      now,
      step: {
        done: false,
        cursor: {
          runId: run,
          occurrenceAt: occurrence.at,
          attempt,
          ...(result.position !== undefined ? { position: result.position } : {}),
          ...(taint ? { taint } : {}),
          usage,
          ...(a.cursor?.manual ? { manual: a.cursor.manual } : {}),
        },
      },
    });
    return "ran";
  }
  report.ran++;
  const ended = await deps.store.finishBuiltinRun({
    automation: aut,
    runId: run,
    token: tok,
    now,
    step: {
      done: true,
      run: {
        state: "succeeded",
        outcome: result.outcome ?? "nothing-to-do",
        ...(result.summary !== undefined ? { summary: plainText(result.summary) } : {}),
        counts: cleanCounts({ ...usageCounts(usage), ...(result.counts ?? {}) }),
        ...(result.findings ? { findings: result.findings.slice(0, MAX_FINDINGS) } : {}),
        ...(taint ? { taint } : {}),
      },
      ...(next ? { nextRunAt: next.at } : {}),
      consecutiveFailures: 0,
    },
  });
  if (ended && result.notify) await deliver(deps, result.notify);
  return "ran";
}

/** Findings kept per run (§4.5). */
const MAX_FINDINGS = 200;

function usageCounts(u: BuiltinUsage): Record<string, number> {
  return { steps: u.steps, statements: u.statements };
}

function runNotice(
  a: Automation,
  run: string,
  now: string,
  kind: ScheduleNotification["kind"],
  extra: Partial<ScheduleNotification> = {},
): ScheduleNotification {
  return {
    id: `${kind}:${run}`,
    kind,
    siteId: a.siteId,
    automationId: a.id,
    automationName: a.name,
    runId: run,
    recipients: [a.owner.id],
    at: now,
    ...extra,
  };
}

function pauseNotice(
  a: Automation,
  run: string,
  now: string,
  acc: FailureAccounting,
): ScheduleNotification[] {
  if (!acc.pause) return [];
  return [
    {
      ...runNotice(a, run, now, "automation-paused", { pausedReason: acc.pause.pausedReason }),
      id: `automation-paused:${a.id}:${run}`,
    },
  ];
}

/** Sends notifications after a committed end; a notifier that fails never fails the tick. */
async function deliver(deps: RunDueDeps, notices: readonly ScheduleNotification[]): Promise<void> {
  if (!deps.notify) return;
  for (const n of notices) {
    try {
      await deps.notify.notify(n);
    } catch (e) {
      deps.log?.(
        `schedules: notification ${n.id} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

/** Builds a `Scheduler` over a store factory: each tick gets a fresh meter (and so a fresh budget). */
export function createScheduler(
  options: {
    /** The store for one tick, over a driver wrapped by `meter.wrap(...)`. */
    openStore: (meter: TickMeter) => SchedulerStore;
    newMeter: (budget: TickBudget) => TickMeter;
  } & Omit<RunDueDeps, "store" | "trigger" | "budget" | "meter">,
): Scheduler {
  const { openStore, newMeter, ...rest } = options;
  return {
    async runDue(now, budget, trigger) {
      const meter = newMeter(budget);
      return runDue(now, { ...rest, store: openStore(meter), meter, budget, trigger });
    },
    async nextWakeAt(now) {
      const meter = newMeter({
        maxQueries: 1,
        maxReleases: 0,
        deadlineMs: Number.POSITIVE_INFINITY,
      });
      const next = overviewNextWake(await openStore(meter).overview(canonicalInstant(now)));
      return next ? new Date(next) : undefined;
    },
  };
}
