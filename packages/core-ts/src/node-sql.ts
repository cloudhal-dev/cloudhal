/**
 * SQL building blocks for node writes: kind-aware insert / CAS / delete statements, guards, and the
 * operation batch that ends in `op_guards` assertion rows (RFC-0002 §4.3). Internal to core-ts.
 */
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import {
  ConflictError,
  isOpGuardViolation,
  isUniqueViolation,
  UniqueConstraintError,
} from "./errors.ts";
import { canonicalJson, nodeHash } from "./hash.ts";
import { type NodeKind, type NodeTypes, siteIdOf, uniquenessKey } from "./nodes.ts";

export type Row = {
  id: string;
  site_id: string;
  kind: NodeKind;
  key: string;
  rev: number;
  hash: string;
  body: string;
};

/** A boolean SQL condition with its parameters. */
export interface Cond {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

/** JSON path of one taxonomy's assignment inside an entry body (keys are slugs: no quoting issues). */
export function termsPath(key: string, field: "ids" | "primary"): string {
  return `$.terms."${key}".${field}`;
}

/** `true` when the node `id` currently has content hash `hash` (AGENTS.md rule 4 anchor). */
export function hashIs(id: string, hash: string): Cond {
  return { sql: "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)", params: [id, hash] };
}

export function and(...conds: (Cond | undefined)[]): Cond | undefined {
  const cs = conds.filter((c): c is Cond => c !== undefined);
  if (cs.length === 0) return undefined;
  return { sql: cs.map((c) => `(${c.sql})`).join(" AND "), params: cs.flatMap((c) => c.params) };
}

export async function insertNodeStatement<K extends NodeKind>(
  kind: K,
  node: NodeTypes[K],
  ts: string,
  guard?: Cond,
): Promise<SqlStatement> {
  const values = [
    node.id,
    siteIdOf(kind, node),
    kind,
    uniquenessKey(kind, node),
    node.rev,
    await nodeHash(node),
    canonicalJson(node),
    ts,
    ts,
  ];
  if (!guard)
    return {
      sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: values,
    };
  return {
    sql: `INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    params: [...values, ...guard.params],
  };
}

/** Compare-and-swap on `expectedRev`, scoped by kind and site so a body can never land in another row. */
export async function casUpdateStatement<K extends NodeKind>(
  kind: K,
  next: NodeTypes[K],
  expectedRev: number,
  guard?: Cond,
): Promise<SqlStatement> {
  return {
    sql: `UPDATE nodes SET key = ?, rev = ?, hash = ?, body = ?, updated_at = ? WHERE id = ? AND rev = ? AND kind = ? AND site_id = ?${guard ? ` AND ${guard.sql}` : ""}`,
    params: [
      uniquenessKey(kind, next),
      next.rev,
      await nodeHash(next),
      canonicalJson(next),
      next.updatedAt,
      next.id,
      expectedRev,
      kind,
      siteIdOf(kind, next),
      ...(guard?.params ?? []),
    ],
  };
}

export function casDeleteStatement<K extends NodeKind>(
  kind: K,
  node: NodeTypes[K],
  guard?: Cond,
): SqlStatement {
  return {
    sql: `DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = ? AND site_id = ?${guard ? ` AND ${guard.sql}` : ""}`,
    params: [node.id, node.rev, kind, siteIdOf(kind, node), ...(guard?.params ?? [])],
  };
}

/** Pairs per assertion statement: one JSON parameter each, so this only bounds statement work. */
const ASSERT_CHUNK = 200;
const OP_GUARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Planned {
  readonly kind: NodeKind;
  readonly id: string;
  /** Revision the operation read (CAS); undefined for inserts. */
  readonly readRev: number | undefined;
}

/**
 * One atomic multi-node operation. Writes are added in order; every write after the first carries
 * the first write's new-hash guard (AGENTS.md rule 4), and the batch ends with `op_guards` assertion
 * rows: every written node has its expected new hash, every deleted node is gone, every node the
 * operation depends on is unchanged, and every extra condition holds. Any miss leaves `ok` NULL and
 * rolls the batch back (migration 0011).
 */
export class OpBatch {
  readonly opId: string;
  readonly siteId: string;
  readonly #ts: string;
  readonly #statements: SqlStatement[] = [];
  readonly #expect = new Map<string, string>();
  readonly #absent = new Set<string>();
  readonly #conds: Cond[] = [];
  readonly #planned: Planned[] = [];
  #anchor: Cond | undefined;

  constructor(opId: string, siteId: string, ts: string) {
    this.opId = opId;
    this.siteId = siteId;
    this.#ts = ts;
  }

  get ts(): string {
    return this.#ts;
  }

  /** Writes planned so far. */
  get writes(): number {
    return this.#statements.length;
  }

  get planned(): readonly Planned[] {
    return this.#planned;
  }

  #guard(own?: Cond): Cond | undefined {
    return and(this.#anchor, own);
  }

  async insert<K extends NodeKind>(kind: K, node: NodeTypes[K], guard?: Cond): Promise<void> {
    const hash = await nodeHash(node);
    this.#statements.push(await insertNodeStatement(kind, node, this.#ts, this.#guard(guard)));
    this.#expect.set(node.id, hash);
    this.#planned.push({ kind, id: node.id, readRev: undefined });
    this.#anchor ??= hashIs(node.id, hash);
  }

  /** CAS from `prev.rev` to `next` (whose rev must already be `prev.rev + 1`). */
  async update<K extends NodeKind>(
    kind: K,
    prev: NodeTypes[K],
    next: NodeTypes[K],
    guard?: Cond,
  ): Promise<void> {
    const hash = await nodeHash(next);
    this.#statements.push(await casUpdateStatement(kind, next, prev.rev, this.#guard(guard)));
    this.#expect.set(next.id, hash);
    this.#planned.push({ kind, id: next.id, readRev: prev.rev });
    this.#anchor ??= hashIs(next.id, hash);
  }

  delete<K extends NodeKind>(kind: K, node: NodeTypes[K]): void {
    this.#statements.push(casDeleteStatement(kind, node, this.#guard()));
    this.#absent.add(node.id);
    this.#expect.delete(node.id);
    this.#planned.push({ kind, id: node.id, readRev: node.rev });
  }

  /** The operation was planned on this node's content; it must not change before the batch. */
  expectUnchanged(id: string, hash: string): void {
    if (!this.#expect.has(id)) this.#expect.set(id, hash);
  }

  /** An extra condition that must hold once every write of the batch has run. */
  assert(cond: Cond): void {
    this.#conds.push(cond);
  }

  statements(): SqlStatement[] {
    const asserts: Cond[] = [];
    const pairs = [...this.#expect].map(([id, hash]) => `${id}:${hash}`);
    for (let i = 0; i < pairs.length; i += ASSERT_CHUNK) {
      const chunk = pairs.slice(i, i + ASSERT_CHUNK);
      asserts.push({
        sql: "(SELECT count(*) FROM nodes WHERE site_id = ? AND id || ':' || hash IN (SELECT value FROM json_each(?))) = ?",
        params: [this.siteId, JSON.stringify(chunk), chunk.length],
      });
    }
    if (this.#absent.size > 0)
      asserts.push({
        sql: "NOT EXISTS (SELECT 1 FROM nodes WHERE id IN (SELECT value FROM json_each(?)))",
        params: [JSON.stringify([...this.#absent])],
      });
    asserts.push(...this.#conds);
    return [
      ...this.#statements,
      ...asserts.map((c, seq) => ({
        sql: `INSERT INTO op_guards (op_id, seq, ok, created_at) SELECT ?, ?, CASE WHEN ${c.sql} THEN 1 END, ?`,
        params: [this.opId, seq, ...c.params, this.#ts],
      })),
    ];
  }
}

/** Raised when an operation's assertion failed and no single node explains it. */
export class OperationConflictError extends ConflictError {
  readonly opId: string;
  constructor(opId: string, detail: string) {
    super("operation", opId, 0, undefined);
    this.opId = opId;
    this.message = `operation ${opId} conflicted with a concurrent change (${detail}); reload and retry`;
  }
}

/**
 * Runs an operation batch. A failed assertion becomes a ConflictError naming the first node that
 * moved since it was read (or `diagnose()`'s more specific error); a unique-index violation becomes
 * a UniqueConstraintError.
 */
export async function runOpBatch(
  sql: SqlDriver,
  batch: OpBatch,
  options: {
    uniqueKind?: string;
    uniqueKey?: string;
    diagnose?: () => Promise<void>;
  } = {},
): Promise<void> {
  try {
    // Sweep assertion rows older than 30 days (indexed; usually deletes nothing).
    await sql.run("DELETE FROM op_guards WHERE created_at < ?", [
      new Date(Date.parse(batch.ts) - OP_GUARD_TTL_MS).toISOString(),
    ]);
    await sql.batch(batch.statements());
  } catch (e) {
    if (isOpGuardViolation(e)) {
      await options.diagnose?.();
      for (const p of batch.planned) {
        if (p.readRev === undefined) continue;
        const row = await sql.get<{ rev: number }>("SELECT rev FROM nodes WHERE id = ?", [p.id]);
        if (row?.rev !== p.readRev) throw new ConflictError(p.kind, p.id, p.readRev, row?.rev);
      }
      throw new OperationConflictError(batch.opId, "a node it depends on changed");
    }
    if (isUniqueViolation(e))
      throw new UniqueConstraintError(options.uniqueKind ?? "node", options.uniqueKey ?? "");
    throw e;
  }
}

export function parseRows<T>(rows: { body: string }[]): T[] {
  return rows.map((r) => JSON.parse(r.body) as T);
}
