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
  /** Lower-case hex SHA-256, when the backend recorded one (R2 checksums, RFC-0004 §4.1). */
  readonly sha256?: string;
}

export interface BlobPutOptions {
  readonly contentType?: string;
  /**
   * Lower-case hex SHA-256 the data must have. On a mismatch the adapter throws
   * `BlobIntegrityError` and stores nothing (RFC-0004 §4.1).
   */
  readonly sha256?: string;
}

/** A byte range: `offset` (+ `length`), or the last `suffix` bytes. */
export type BlobRange = { offset: number; length?: number } | { suffix: number };

export interface BlobStream {
  readonly body: ReadableStream<Uint8Array>;
  /** Size of the whole object. */
  readonly size: number;
  /** The part `body` carries, when a range was asked for. */
  readonly range?: { offset: number; length: number };
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
  /**
   * Streams exactly `size` bytes to `key` and verifies `sha256` before the object becomes visible;
   * a short, long or mismatching stream stores nothing. Optional: callers fall back to buffered
   * `put` (RFC-0004 §4.1).
   */
  putStream?(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void>;
  /** Streams an object, or a range of it. Optional: callers fall back to `get`. */
  getStream?(key: string, options?: { range?: BlobRange }): Promise<BlobStream | null>;
}

/** The data did not have the SHA-256 (or size) the caller declared; nothing was stored. */
export class BlobIntegrityError extends Error {
  override readonly name = "BlobIntegrityError";
}

const KEY_RE = /^[A-Za-z0-9._\-/]+$/;

/**
 * Blob keys are path-like and built from validated parts only: `[A-Za-z0-9._-/]`, no empty, `.`
 * or `..` segment, at most 512 characters. Every adapter calls this (RFC-0004 §4.1), so a key can
 * never escape its prefix on the filesystem or address another site's objects by traversal.
 */
export function assertBlobKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > 512 ||
    !KEY_RE.test(key) ||
    key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new StorageError(`invalid blob key "${String(key).slice(0, 80)}"`);
  }
}

/** Resolves a range against an object size; undefined when it cannot be satisfied (416). */
export function resolveBlobRange(
  range: BlobRange,
  size: number,
): { offset: number; length: number } | undefined {
  if ("suffix" in range) {
    if (!Number.isInteger(range.suffix) || range.suffix <= 0 || size === 0) return undefined;
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const { offset } = range;
  if (!Number.isInteger(offset) || offset < 0 || offset >= size) return undefined;
  const max = size - offset;
  const length = range.length === undefined ? max : Math.min(range.length, max);
  if (!Number.isInteger(length) || length <= 0) return undefined;
  return { offset, length };
}

/** Lower-case hex SHA-256 of bytes (WebCrypto: Node and Workers). */
export async function sha256OfBytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads a stream into memory, failing once it carries more than `max` bytes. */
export async function readAllBytes(
  stream: ReadableStream<Uint8Array>,
  max: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new BlobIntegrityError(`stream is longer than ${max} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A stream over bytes (the buffered fallback of `getStream`). */
export function bytesStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (data.byteLength > 0) controller.enqueue(data);
      controller.close();
    },
  });
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Throws BlobIntegrityError unless `data` is `size` bytes (when given) with SHA-256 `sha256`. */
export async function verifyBlob(data: Uint8Array, sha256: string, size?: number): Promise<void> {
  if (!SHA256_HEX.test(sha256)) throw new BlobIntegrityError("sha256 must be 64 lower-case hex");
  if (size !== undefined && data.byteLength !== size)
    throw new BlobIntegrityError(`expected ${size} bytes, got ${data.byteLength}`);
  if ((await sha256OfBytes(data)) !== sha256)
    throw new BlobIntegrityError("data does not match the declared sha256");
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
