import {
  assertBatchLimits,
  assertStatementLimits,
  type RunResult,
  type SqlDriver,
  type SqlStatement,
  type SqlValue,
  StorageError,
} from "../types.ts";

/** Cloudflare D1 adapter. Expects the `D1Database` binding from the Worker environment. */
export class D1Driver implements SqlDriver {
  readonly name = "d1";
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  #prepare(sql: string, params: readonly SqlValue[] = []): D1PreparedStatement {
    assertStatementLimits(sql, params);
    return this.#db.prepare(sql).bind(...params);
  }

  async get<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | undefined> {
    const row = await this.#prepare(sql, params).first<T>();
    return row ?? undefined;
  }

  async all<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T[]> {
    const res = await this.#prepare(sql, params).all<T>();
    return res.results;
  }

  async run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    const res = await this.#prepare(sql, params).run();
    return toRunResult(res);
  }

  async batch(statements: readonly SqlStatement[]): Promise<RunResult[]> {
    assertBatchLimits(statements);
    const prepared = statements.map((s) => this.#prepare(s.sql, s.params));
    let results: D1Result[];
    try {
      results = await this.#db.batch(prepared);
    } catch (cause) {
      throw new StorageError(`batch failed: ${(cause as Error).message}`, cause);
    }
    return results.map(toRunResult);
  }

  async exec(sql: string): Promise<void> {
    await this.#db.exec(sql);
  }

  async close(): Promise<void> {
    // D1 bindings are owned by the runtime; nothing to release.
  }
}

function toRunResult(res: D1Result): RunResult {
  const meta = res.meta as { changes?: number; last_row_id?: number };
  return { changes: meta.changes ?? 0, lastRowId: meta.last_row_id ?? null };
}
