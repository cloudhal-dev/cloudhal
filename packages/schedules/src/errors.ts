/** Error codes of `@cloudhal/schedules`; routes map them to HTTP answers (step 7). */
export type ScheduleErrorCode =
  // time and recurrence (§9)
  | "invalid_time_zone"
  | "invalid_local_time"
  | "invalid_timestamp"
  | "invalid_rule"
  | "unsupported_rule_part"
  | "rule_too_frequent"
  // releases (§6)
  | "nothing_to_publish"
  | "site_node_in_release"
  | "remove_not_allowed"
  | "node_not_found"
  | "duplicate_item"
  | "too_many_items"
  | "invalid_transition"
  | "not_found"
  | "too_many_releases"
  | "invalid_settings"
  | "too_soon"
  | "too_far";

/** A refused input or an illegal state change; nothing was written. */
export class ScheduleError extends Error {
  override readonly name = "ScheduleError";
  readonly code: ScheduleErrorCode;
  constructor(code: ScheduleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** A compare-and-swap lost: the row changed (or is not in the expected state) since it was read. */
export class ScheduleConflictError extends Error {
  override readonly name = "ScheduleConflictError";
  readonly kind: "release" | "automation" | "run" | "settings" | "system_job";
  readonly id: string;
  constructor(kind: ScheduleConflictError["kind"], id: string, message?: string) {
    super(message ?? `${kind} ${id} changed since it was read`);
    this.kind = kind;
    this.id = id;
  }
}

/** A tick tried to execute more statements than its `TickBudget` allows (S17). */
export class TickBudgetExhaustedError extends Error {
  override readonly name = "TickBudgetExhaustedError";
  readonly used: number;
  readonly max: number;
  constructor(used: number, max: number) {
    super(`tick query budget exhausted (${used} of ${max} statements)`);
    this.used = used;
    this.max = max;
  }
}
