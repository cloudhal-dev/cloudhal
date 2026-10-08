import type { Actor } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import type { AutoCheck } from "./modes.ts";
import type { ApprovalCause } from "./policy.ts";

export interface AuditEntry {
  at: string;
  actor: Actor;
  siteId?: string | undefined;
  tool: string;
  decision: "allow" | "deny" | "approval-required";
  reason?: string | undefined;
  skill?: string | undefined;
  input?: unknown;
  outcome?: "ok" | "error" | "pending" | undefined;
  snapshotId?: string | undefined;
  durationMs?: number | undefined;
  /** Agent mode the call ran under (ADR-0015). */
  mode?: string | undefined;
  /** Why the call waited for a person (`approval-required` rows). */
  cause?: ApprovalCause | undefined;
  /**
   * The `auto`-mode check behind a publish: `lowRisk` on an `allow` row means it went live without
   * a person; on an `approval-required` row it says why it waited.
   */
  autoCheck?: AutoCheck | undefined;
  /** The call ran under a time-boxed elevation (ADR-0016): the key's own mode and the end. */
  elevation?: { from: string; until: string } | undefined;
}

export interface AuditRow extends AuditEntry {
  id: number;
}

const MAX_INPUT = 4000;

/** Inputs are stored as JSON; oversized ones become a valid `{ truncated, preview }` object. */
export function auditInput(input: unknown): string | null {
  if (input === undefined) return null;
  const json = JSON.stringify(input) ?? "null";
  if (json.length <= MAX_INPUT) return json;
  return JSON.stringify({
    truncated: true,
    bytes: json.length,
    preview: json.slice(0, MAX_INPUT - 200),
  });
}

function parseAuditInput(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // rows written before inputs were truncated safely
    return { truncated: true, preview: raw };
  }
}

function parseJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Append-only record of every policy decision and tool call (table `audit`, migration 0003). */
export class AuditLog {
  readonly #sql: SqlDriver;
  constructor(sql: SqlDriver) {
    this.#sql = sql;
  }

  async record(entry: AuditEntry): Promise<number> {
    const r = await this.#sql.run(
      "INSERT INTO audit (at, actor_kind, actor_id, actor_name, site_id, tool, decision, reason, skill, input, outcome, snapshot_id, duration_ms, mode, cause, auto_check, elevation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        entry.at,
        entry.actor.kind,
        entry.actor.id,
        entry.actor.name ?? null,
        entry.siteId ?? null,
        entry.tool,
        entry.decision,
        entry.reason ?? null,
        entry.skill ?? null,
        auditInput(entry.input),
        entry.outcome ?? null,
        entry.snapshotId ?? null,
        entry.durationMs ?? null,
        entry.mode ?? null,
        entry.cause ?? null,
        entry.autoCheck ? JSON.stringify(entry.autoCheck) : null,
        entry.elevation ? JSON.stringify(entry.elevation) : null,
      ],
    );
    return r.lastRowId ?? 0;
  }

  async list(
    filter: {
      siteId?: string | undefined;
      actorId?: string | undefined;
      /** Only rows older than this id (cursor pagination, newest first). */
      before?: number | undefined;
      limit?: number | undefined;
    } = {},
  ): Promise<AuditRow[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.before !== undefined) {
      where.push("id < ?");
      params.push(filter.before);
    }
    if (filter.siteId) {
      where.push("site_id = ?");
      params.push(filter.siteId);
    }
    if (filter.actorId) {
      where.push("actor_id = ?");
      params.push(filter.actorId);
    }
    params.push(filter.limit ?? 100);
    const rows = await this.#sql.all<Record<string, unknown>>(
      `SELECT * FROM audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`,
      params,
    );
    return rows.map((r) => ({
      id: r.id as number,
      at: r.at as string,
      actor: {
        kind: r.actor_kind as Actor["kind"],
        id: r.actor_id as string,
        ...(r.actor_name ? { name: r.actor_name as string } : {}),
      },
      siteId: (r.site_id as string | null) ?? undefined,
      tool: r.tool as string,
      decision: r.decision as AuditEntry["decision"],
      reason: (r.reason as string | null) ?? undefined,
      skill: (r.skill as string | null) ?? undefined,
      input: parseAuditInput(r.input as string | null),
      outcome: (r.outcome as AuditEntry["outcome"] | null) ?? undefined,
      snapshotId: (r.snapshot_id as string | null) ?? undefined,
      durationMs: (r.duration_ms as number | null) ?? undefined,
      mode: (r.mode as string | null) ?? undefined,
      ...(r.cause ? { cause: r.cause as ApprovalCause } : {}),
      ...(r.auto_check ? { autoCheck: parseJson<AutoCheck>(r.auto_check as string) } : {}),
      ...(r.elevation
        ? { elevation: parseJson<{ from: string; until: string }>(r.elevation as string) }
        : {}),
    }));
  }
}
