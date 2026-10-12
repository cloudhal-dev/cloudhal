/**
 * The per-invocation query budget (RFC-0008 §8.1, §8.2, S17). A `TickMeter` wraps the `SqlDriver`
 * a tick uses and counts statements — every `get`, `all` and `run` is one, a `batch()` counts each
 * of its statements (the conservative reading of L7) — and refuses a statement that would exceed
 * `maxQueries` before it reaches the database, so a tick stops cleanly under the platform's limit
 * (Workers Free: 50 D1 queries per invocation; the tick takes 40). `runDue` also asks
 * `canAfford(n)` before starting a unit of work, so a refusal mid-path is a safety net only.
 */
import type { SqlDriver } from "@cloudhal/storage";
import { TickBudgetExhaustedError } from "./errors.ts";

export type TickTrigger = "cron" | "alarm" | "request" | "node" | "manual";

export interface TickBudget {
  /** Statements (queries) one invocation may execute. */
  maxQueries: number;
  /** Releases one invocation may run. */
  maxReleases: number;
  /** Wall-clock milliseconds after which no new unit of work starts. */
  deadlineMs: number;
}

/** Workers Free and Paid budgets (§8.2); Node uses `paid` (no platform limit, same bounded steps). */
export const TICK_BUDGETS = {
  free: { maxQueries: 40, maxReleases: 1, deadlineMs: 8_000 },
  paid: { maxQueries: 900, maxReleases: 50, deadlineMs: 12 * 60_000 },
} as const satisfies Record<string, TickBudget>;

export class TickMeter {
  readonly budget: TickBudget;
  #used = 0;
  readonly #started: number;
  readonly #clock: () => number;

  /** `clock` is a monotonic-enough millisecond source for the deadline (injected in tests). */
  constructor(budget: TickBudget, clock: () => number = () => Date.now()) {
    this.budget = budget;
    this.#clock = clock;
    this.#started = clock();
  }

  /** Statements executed so far. */
  get used(): number {
    return this.#used;
  }

  get remaining(): number {
    return Math.max(0, this.budget.maxQueries - this.#used);
  }

  /** True when `n` more statements fit, keeping `reserve` for the heartbeat. */
  canAfford(n: number, reserve = 0): boolean {
    return this.#used + n + reserve <= this.budget.maxQueries;
  }

  deadlinePassed(): boolean {
    return this.#clock() - this.#started >= this.budget.deadlineMs;
  }

  /** Counts `n` statements, refusing before the budget would be exceeded. */
  take(n: number): void {
    if (this.#used + n > this.budget.maxQueries)
      throw new TickBudgetExhaustedError(this.#used + n, this.budget.maxQueries);
    this.#used += n;
  }

  /**
   * Counts `n` statements that already ran outside the limit (a system job's own driver): later
   * units see less room, and nothing is refused.
   */
  note(n: number): void {
    this.#used += n;
  }

  /**
   * A driver that counts every statement into this meter without refusing any — for work whose
   * own bounds hold (the analytics rollup, the comments job) but whose statements share the
   * invocation's platform limit with the tick.
   */
  wrapCounting(inner: SqlDriver): SqlDriver {
    const note = (n: number) => this.note(n);
    return {
      name: `counted(${inner.name})`,
      get: async (sql, params) => {
        note(1);
        return inner.get(sql, params);
      },
      all: async (sql, params) => {
        note(1);
        return inner.all(sql, params);
      },
      run: async (sql, params) => {
        note(1);
        return inner.run(sql, params);
      },
      batch: async (statements) => {
        note(statements.length);
        return inner.batch(statements);
      },
      exec: (sql) => inner.exec(sql),
      close: () => inner.close(),
    };
  }

  /** A driver that counts (and limits) every statement it executes through `inner`. */
  wrap(inner: SqlDriver): SqlDriver {
    const take = (n: number) => this.take(n);
    return {
      name: `metered(${inner.name})`,
      get: async (sql, params) => {
        take(1);
        return inner.get(sql, params);
      },
      all: async (sql, params) => {
        take(1);
        return inner.all(sql, params);
      },
      run: async (sql, params) => {
        take(1);
        return inner.run(sql, params);
      },
      batch: async (statements) => {
        take(statements.length);
        return inner.batch(statements);
      },
      exec: (sql) => inner.exec(sql),
      close: () => inner.close(),
    };
  }
}
