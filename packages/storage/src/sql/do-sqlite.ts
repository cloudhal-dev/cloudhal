import {
  assertBatchLimits,
  assertStatementLimits,
  type RunResult,
  type SqlDriver,
  type SqlStatement,
  type SqlValue,
  StorageError,
} from "../types.ts";

type Binding = string | number | null | ArrayBuffer;

/**
 * SQLite-backed Durable Object adapter (RFC-0036 §2) over `ctx.storage` of the DO that owns the
 * database. Every call runs synchronously on the DO's own SQLite; the async signature is the
 * `SqlDriver` contract. `batch` runs inside `transactionSync`, so a throw rolls every statement back;
 * the transaction is never handed to callers, and `BEGIN` is refused by the runtime, so the
 * batch-only rule holds here as on D1 (ADR-0002). D1's limits are enforced like on every adapter.
 */
export class DoSqliteDriver implements SqlDriver {
  readonly name = "do-sqlite";
  readonly #storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
  }

  /** Bytes the database takes on disk (`ctx.storage.sql.databaseSize`), for size caps. */
  get databaseSize(): number {
    return this.#storage.sql.databaseSize;
  }

  #rows<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    assertStatementLimits(sql, params);
    const cursor = this.#storage.sql.exec(sql, ...params.map(toBinding));
    return cursor.toArray().map((row) => fromRow(row) as T);
  }

  #run(sql: string, params: readonly SqlValue[] = []): RunResult {
    this.#rows(sql, params);
    const meta = this.#storage.sql.exec("SELECT changes() AS c, last_insert_rowid() AS id").one();
    const changes = Number(meta.c ?? 0);
    return { changes, lastRowId: changes > 0 ? Number(meta.id) : null };
  }

  async get<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | undefined> {
    return this.#rows<T>(sql, params)[0];
  }

  async all<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T[]> {
    return this.#rows<T>(sql, params);
  }

  async run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    return this.#run(sql, params);
  }

  async batch(statements: readonly SqlStatement[]): Promise<RunResult[]> {
    assertBatchLimits(statements);
    try {
      return this.#storage.transactionSync(() => statements.map((s) => this.#run(s.sql, s.params)));
    } catch (cause) {
      throw new StorageError(`batch failed: ${(cause as Error).message}`, cause);
    }
  }

  async exec(sql: string): Promise<void> {
    this.#storage.sql.exec(sql);
  }

  async close(): Promise<void> {
    // The database belongs to the Durable Object; nothing to release.
  }
}

function toBinding(value: SqlValue): Binding {
  if (value instanceof Uint8Array)
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return value;
}

/** BLOB columns come back as ArrayBuffer; hand them out as Uint8Array like the other adapters. */
function fromRow(row: Record<string, SqlStorageValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row))
    out[k] = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  return out;
}
