/**
 * RFC-0042 §4, #110: what one `rebuildListValues` call may spend. Entries and milliseconds bound
 * the chunk work; `statements` bounds every SQL statement the call issues, counted as a tick
 * meter counts them (`get`, `all` and `run` are one each, a `batch()` counts each of its
 * statements), so a scheduled job can declare it as its cost. Work asks before it starts:
 * nothing is refused mid-way.
 */
import type { SqlDriver } from "@cloudhal/storage";

/** Work one call may do before it stops (the state rows keep the progress). */
export interface ListValuesBudget {
  readonly entries: number;
  readonly ms: number;
  /** SQL statements the call may issue (absent: no bound). */
  readonly statements?: number | undefined;
}

/** Entries one chunk reads at most. */
export const CHUNK = 100;

export class ListValuesMeter {
  /** `inner`, counting every statement into this meter. */
  readonly sql: SqlDriver;
  readonly #budget: ListValuesBudget | undefined;
  readonly #started = Date.now();
  #entries = 0;
  #statements = 0;

  constructor(inner: SqlDriver, budget: ListValuesBudget | undefined) {
    this.#budget = budget;
    const note = (n: number) => {
      this.#statements += n;
    };
    this.sql = {
      name: inner.name,
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

  /** Statements issued so far. */
  get statements(): number {
    return this.#statements;
  }

  /** Statements still allowed. */
  left(): number {
    const max = this.#budget?.statements;
    return max === undefined ? Number.POSITIVE_INFINITY : max - this.#statements;
  }

  /** Fewer than `n` statements are left, or the time is spent (what tidying checks). */
  short(n: number): boolean {
    const b = this.#budget;
    return !!b && (this.left() < n || Date.now() - this.#started >= b.ms);
  }

  /** No more chunk work may start: entries or time spent, or fewer than `n` statements left. */
  out(n: number): boolean {
    const b = this.#budget;
    return !!b && (this.#entries >= b.entries || this.short(n));
  }

  /** Counts `n` entries of chunk work. */
  take(n: number): void {
    this.#entries += n;
  }

  /** Entries the next chunk may read (at most `CHUNK`, at least 1). */
  room(): number {
    const b = this.#budget;
    return b ? Math.max(1, Math.min(CHUNK, b.entries - this.#entries)) : CHUNK;
  }
}
