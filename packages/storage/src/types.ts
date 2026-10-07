/**
 * Storage interfaces. Deliberately tiny and shaped by the most constrained backend
 * (Cloudflare D1): no interactive transactions, atomic `batch()` only, ≤100 bound
 * parameters per statement, ≤100 KB per statement, ≤1000 statements per batch.
 * Every adapter, including the local SQLite one, enforces the same limits so nothing
 * "works locally but not on Cloudflare" (ADR-0002).
 */

/** Values that can be bound to SQL parameters on every backend. Booleans are stored as 0/1 by callers. */
export type SqlValue = string | number | null | Uint8Array;

export interface SqlStatement {
  readonly sql: string;
  readonly params?: readonly SqlValue[];
}

export interface RunResult {
  /** Rows changed by an INSERT/UPDATE/DELETE (0 for reads). */
  readonly changes: number;
  /** ROWID of the last inserted row, when the backend reports it. */
  readonly lastRowId: number | null;
}

export interface SqlDriver {
  readonly name: string;
  /** First row of a query, or `undefined`. */
  get<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | undefined>;
  /** All rows of a query. */
  all<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T[]>;
  /** Execute one write statement. */
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  /**
   * Execute statements atomically: either all succeed or none are applied.
   * This is the only multi-statement write primitive; there is no `transaction()`.
   */
  batch(statements: readonly SqlStatement[]): Promise<RunResult[]>;
  /** Run raw multi-statement SQL (DDL in migrations). Not atomic on every backend; use `batch` for data. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface BlobMeta {
  readonly size: number;
  readonly contentType?: string;
}

export interface BlobPutOptions {
  readonly contentType?: string;
}

/** Content store keyed by path-like strings ("nodes/<hash>.json"). Mirrors the R2 surface. */
export interface BlobStore {
  readonly name: string;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<BlobMeta | null>;
  put(key: string, data: Uint8Array, options?: BlobPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys under `prefix`, sorted ascending. */
  list(prefix?: string): Promise<string[]>;
}

/** D1 limits, enforced by every SQL adapter. */
export const SQL_LIMITS = {
  maxBoundParams: 100,
  maxStatementBytes: 100_000,
  maxBatchStatements: 1000,
} as const;

export class StorageLimitError extends Error {
  override readonly name = "StorageLimitError";
}

export class StorageError extends Error {
  override readonly name = "StorageError";
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

const encoder = new TextEncoder();

/** Throws `StorageLimitError` when a statement would be rejected by D1. */
export function assertStatementLimits(sql: string, params: readonly SqlValue[] = []): void {
  if (params.length > SQL_LIMITS.maxBoundParams) {
    throw new StorageLimitError(
      `statement binds ${params.length} parameters; the limit is ${SQL_LIMITS.maxBoundParams} (chunk the write)`,
    );
  }
  if (encoder.encode(sql).byteLength > SQL_LIMITS.maxStatementBytes) {
    throw new StorageLimitError(`statement exceeds ${SQL_LIMITS.maxStatementBytes} bytes`);
  }
}

export function assertBatchLimits(statements: readonly SqlStatement[]): void {
  if (statements.length === 0) throw new StorageError("batch requires at least one statement");
  if (statements.length > SQL_LIMITS.maxBatchStatements) {
    throw new StorageLimitError(
      `batch has ${statements.length} statements; the limit is ${SQL_LIMITS.maxBatchStatements}`,
    );
  }
  for (const s of statements) assertStatementLimits(s.sql, s.params);
}
