import type { Actor } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";

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
}

export interface AuditRow extends AuditEntry {
  id: number;
}

/** Append-only record of every policy decision and tool call (table `audit`, migration 0003). */
export class AuditLog {
  readonly #sql: SqlDriver;
  constructor(sql: SqlDriver) {
    this.#sql = sql;
  }

  async record(entry: AuditEntry): Promise<number> {
    const r = await this.#sql.run(
      "INSERT INTO audit (at, actor_kind, actor_id, actor_name, site_id, tool, decision, reason, skill, input, outcome, snapshot_id, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
        entry.input === undefined ? null : JSON.stringify(entry.input).slice(0, 4000),
        entry.outcome ?? null,
        entry.snapshotId ?? null,
        entry.durationMs ?? null,
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
      input: r.input ? JSON.parse(r.input as string) : undefined,
      outcome: (r.outcome as AuditEntry["outcome"] | null) ?? undefined,
      snapshotId: (r.snapshot_id as string | null) ?? undefined,
      durationMs: (r.duration_ms as number | null) ?? undefined,
    }));
  }
}
