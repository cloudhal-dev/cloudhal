/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * A run id: `run_` and 6 to 32 letters or digits, derived from the subject id and `occurrenceAt` (the occurrence's idempotency key).
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunId".
 */
export type ScheduleRunId = string;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * What ran, discriminated by `kind`.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunSubject".
 */
export type ScheduleRunSubject = ReleaseRunSubject | AutomationRunSubject;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * `due`: claimed occurrence not started yet; `ready`: an agent task's window is open and waits for `begin_run`; `running`; `succeeded`; `failed`; `missed`: the window closed or the scheduler came too late; `skipped`: a missed occurrence coalesced into a later one; `budget-exceeded`; `killed`: stopped by a pause or a kill switch.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunState".
 */
export type ScheduleRunState =
  | "due"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "missed"
  | "skipped"
  | "budget-exceeded"
  | "killed";
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;

/**
 * One occurrence of something scheduled (RFC-0008): a release's execution or an automation's run. Its id is derived from the subject and `occurrenceAt`, so a second scheduler tick that reaches the same occurrence finds the same row and the effect happens at most once. `state` says whether the run itself completed; `outcome` says whether it did any work, because a run that ended cleanly may still have done nothing. Runs live in D1 and are kept 90 days; the audit log keeps what each call did.
 */
export interface ScheduleRun {
  schemaVersion: SchemaVersion;
  id: ScheduleRunId;
  siteId: Id;
  subject: ScheduleRunSubject;
  occurrenceAt: Timestamp;
  state: ScheduleRunState;
  /**
   * What the run achieved, separately from whether it completed: `did-work` changed something or produced findings; `nothing-to-do`; `proposed` left drafts or proposals for people; `waiting-approval` filed requests a person must decide.
   */
  outcome?: "did-work" | "nothing-to-do" | "proposed" | "waiting-approval";
  /**
   * What woke the scheduler: the every-minute cron trigger, the Durable Object clock's alarm, an admin request (backstop), the Node timer, or a person ("Run now", "Publish now").
   */
  trigger?: "cron" | "alarm" | "request" | "node" | "manual";
  attempt: number;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  latenessSeconds?: number;
  /**
   * The occurrence was moved: `dst-gap` (the wall-clock time did not exist that day, so it ran at the next valid minute) or `tzdata` (the zone's rules changed after it was planned).
   */
  adjusted?: "dst-gap" | "tzdata";
  window?: ScheduleRunWindow;
  usage?: ScheduleRunUsage;
  taint?: ScheduleRunTaint;
  /**
   * The agent's own account of the run (`end_run`) or the built-in job's report line. Plain text written by an agent: Studio renders it as text and never as an instruction.
   */
  summary?: string;
  /**
   * Findings by name (e.g. `broken-links`, `stale-entries`, `proposals`).
   */
  counts?: {
    [k: string]: number | undefined;
  };
  /**
   * Approval requests the run filed.
   *
   * @maxItems 50
   */
  approvalIds?: Id[];
  error?: ScheduleRunError;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rev: Revision;
}
export interface ReleaseRunSubject {
  kind: "release";
  releaseId: string;
}
export interface AutomationRunSubject {
  kind: "automation";
  automationId: string;
  job: "builtin" | "agent-task";
}
/**
 * An agent task's run window: the automation's key is valid only between `opensAt` and `closesAt`, and only inside a run it began.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunWindow".
 */
export interface ScheduleRunWindow {
  opensAt: Timestamp;
  closesAt: Timestamp;
}
/**
 * What the run used against its budget, counted by the server.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunUsage".
 */
export interface ScheduleRunUsage {
  toolCalls: number;
  writes: number;
  approvalRequests: number;
}
/**
 * The run read visitor-supplied text at `at` through `tool`; from then on it may only read, label, hide and pause.
 *
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunTaint".
 */
export interface ScheduleRunTaint {
  at: Timestamp;
  tool: string;
}
/**
 * This interface was referenced by `ScheduleRun`'s JSON-Schema
 * via the `definition` "ScheduleRunError".
 */
export interface ScheduleRunError {
  code: string;
  message?: string;
}
