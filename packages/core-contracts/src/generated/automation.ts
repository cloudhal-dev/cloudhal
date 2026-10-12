/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * An automation id: `aut_` and 6 to 32 letters or digits.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationId".
 */
export type AutomationId = string;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * What runs, discriminated by `kind`.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationJob".
 */
export type AutomationJob = BuiltinAutomationJob | AgentTaskAutomationJob;
/**
 * A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "LocalDateTime".
 */
export type LocalDateTime = string;
/**
 * IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "TimeZone".
 */
export type TimeZone = string;
/**
 * The recurrence as an RFC 5545 RRULE value in Cloudhal's subset, without the `RRULE:` prefix: FREQ DAILY, WEEKLY or MONTHLY; INTERVAL; BYDAY (ordinals such as 2TU or -1FR only with MONTHLY); BYMONTHDAY (1–31 or -1); BYHOUR; BYMINUTE; COUNT or UNTIL. The pattern bounds the vocabulary; the parser refuses repeated parts, COUNT with UNTIL, ordinals outside MONTHLY and runs closer than the job's minimum interval.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationRule".
 */
export type AutomationRule = string;
/**
 * `active` runs on its recurrence; `paused` and `auto-paused` (by failures or a budget) wait for a person to resume; `broken` needs a person to repair it (key revoked, owner gone); `ended` reached its COUNT or UNTIL.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationState".
 */
export type AutomationState = "active" | "paused" | "auto-paused" | "broken" | "ended";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;

/**
 * A recurring job on a site (RFC-0008), created by a person in Studio: either a built-in deterministic job that Cloudhal runs itself (reports, findings and notifications; it never publishes), or a scheduled agent task that an external agent picks up over MCP with the automation's own key, inside a run window, under a mode cap and budgets. No language model runs inside Cloudhal. Scheduling never grants rights: every call of a task runs with the key's scopes narrowed to its owner's current role. Automations live in D1 next to the graph; they are not graph nodes and are not part of site bundles.
 */
export interface Automation {
  schemaVersion: SchemaVersion;
  id: AutomationId;
  siteId: Id;
  name: string;
  job: AutomationJob;
  recurrence: AutomationRecurrence;
  state: AutomationState;
  /**
   * Why the automation is not `active`: a person paused it; its agent paused it; three consecutive failures; a run exceeded its budget; the site's kill switch; its key was revoked; its owner left or no longer holds the scopes it needs.
   */
  pausedReason?:
    | "person"
    | "agent"
    | "failures"
    | "budget"
    | "kill-switch"
    | "key-revoked"
    | "owner-removed"
    | "role-changed";
  consecutiveFailures: number;
  owner: AutomationOwner;
  nextRunAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rev: Revision;
  metadata?: Metadata;
}
/**
 * A deterministic job Cloudhal runs itself, in bounded steps. Its outputs are findings, reports and Studio notifications; it never changes or publishes content.
 */
export interface BuiltinAutomationJob {
  kind: "builtin";
  builtin: "broken-links" | "stale-content" | "feed-check" | "weekly-digest" | "cleanup";
  /**
   * `stale-content` only: entries not updated for this many days are listed for review.
   */
  staleAfterDays?: number;
}
/**
 * A task an external agent performs over MCP. At each occurrence a run window opens for `windowMinutes`; the automation's key (`keyId`, owned by the automation's owner) is valid only inside an open run, which the agent starts with `begin_run` and ends with `end_run`. The run's mode is the key's effective mode capped by `modeCap`; it never waits for a person: calls that need one leave an approval request and the run ends. `readsUntrustedText` declares that the task reads visitor-supplied text (comments, 404 paths, fetched pages); such an automation's key cannot hold write scopes, and any run that reads such text is limited to reading, labelling and hiding from then on.
 */
export interface AgentTaskAutomationJob {
  kind: "agent-task";
  keyId: string;
  /**
   * What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text.
   */
  instructions: string;
  /**
   * A skill the run declares (its scopes and approval list narrow the run further).
   */
  skill?: string;
  /**
   * The most autonomous mode a run may use; never `bypass`.
   */
  modeCap: "plan" | "manual" | "edits" | "auto";
  readsUntrustedText: boolean;
  windowMinutes: number;
  budget: AutomationBudget;
}
/**
 * Per-run limits Cloudhal counts and enforces for an agent task: tool calls, mutations, approval requests filed and minutes since the run began. Exceeding one ends the run (`budget-exceeded`) and pauses the automation.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationBudget".
 */
export interface AutomationBudget {
  maxToolCalls: number;
  maxWrites: number;
  maxApprovalRequests: number;
  maxMinutes: number;
}
/**
 * When the automation runs: the first occurrence as a wall-clock time in `timeZone`, repeated by `rule` (absent: once). Occurrences are computed in the zone, so "Mondays 09:07" stays 09:07 across daylight-saving changes; a time that does not exist on a given day (a spring-forward gap) runs at the next valid minute, and a time that occurs twice runs once, at the first (a documented deviation from RFC 5545 §3.3.10, which drops such occurrences). `preset` records which Studio choice produced the rule.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationRecurrence".
 */
export interface AutomationRecurrence {
  start: LocalDateTime;
  timeZone: TimeZone;
  rule?: AutomationRule;
  preset: "once" | "hourly" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
}
/**
 * The person who created the automation and owns its key (`user_…`). Agents never own automations.
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "AutomationOwner".
 */
export interface AutomationOwner {
  id: string;
  name?: string;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Automation`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
