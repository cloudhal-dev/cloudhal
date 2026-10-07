import type Database from "better-sqlite3";
import {
  assertBatchLimits,
  assertStatementLimits,
  type RunResult,
  type SqlDriver,
  type SqlStatement,
  type SqlValue,
  StorageError,
} from "../types.ts";

export interface BetterSqlite3DriverOptions {
  /** Enforce D1 limits locally (default true). Turn off only for one-off maintenance scripts. */
  readonly enforceLimits?: boolean;
}

function toParams(params: readonly SqlValue[] | undefined): SqlValue[] {
  return params ? [...params] : [];
}

/**
 * Local SQLite adapter over better-sqlite3 (synchronous under the hood, async interface).
 * `batch` runs inside a SQLite transaction so it is atomic like D1's batch.
 */
export class BetterSqlite3Driver implements SqlDriver {
  readonly name = "better-sqlite3";
  readonly #db: Database.Database;
  readonly #enforce: boolean;

  constructor(db: Database.Database, options: BetterSqlite3DriverOptions = {}) {
    this.#db = db;
    this.#enforce = options.enforceLimits ?? true;
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");
    // D1 rejects BEGIN from user SQL; mirror that so code never depends on it.
  }

  /** Open a database file (or ":memory:") and wrap it. */
  static async open(
    filename: string,
    options: BetterSqlite3DriverOptions = {},
  ): Promise<BetterSqlite3Driver> {
    const mod = await import("better-sqlite3");
    const db = new mod.default(filename);
    return new BetterSqlite3Driver(db, options);
  }

  #check(sql: string, params?: readonly SqlValue[]): void {
    if (this.#enforce) assertStatementLimits(sql, params);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
      throw new StorageError(
        "interactive transactions are not supported (D1 parity); use batch() for atomic writes",
      );
    }
  }

  async get<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | undefined> {
    this.#check(sql, params);
    return this.#db.prepare(sql).get(...toParams(params)) as T | undefined;
  }

  async all<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T[]> {
    this.#check(sql, params);
    return this.#db.prepare(sql).all(...toParams(params)) as T[];
  }

  async run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    this.#check(sql, params);
    return this.#runSync(params ? { sql, params } : { sql });
  }

  #runSync(statement: SqlStatement): RunResult {
    const stmt = this.#db.prepare(statement.sql);
    if (stmt.reader) {
      stmt.all(...toParams(statement.params));
      return { changes: 0, lastRowId: null };
    }
    const info = stmt.run(...toParams(statement.params));
    return { changes: info.changes, lastRowId: Number(info.lastInsertRowid) };
  }

  async batch(statements: readonly SqlStatement[]): Promise<RunResult[]> {
    if (this.#enforce) assertBatchLimits(statements);
    for (const s of statements) this.#check(s.sql, s.params);
    const tx = this.#db.transaction((stmts: readonly SqlStatement[]) =>
      stmts.map((s) => this.#runSync(s)),
    );
    return tx(statements);
  }

  async exec(sql: string): Promise<void> {
    this.#db.exec(sql);
  }

  async close(): Promise<void> {
    this.#db.close();
  }
}
