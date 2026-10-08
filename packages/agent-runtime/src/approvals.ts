/**
 * Out-of-band approvals (ADR-0014). A remote agent cannot approve its own publish: the request is
 * stored as `pending`, a person approves or denies it in Studio, and only then can the agent
 * redeem it — once, for the exact call it asked about, while the site is still in the state the
 * person saw.
 */
import type { Actor } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import type { AgentMode, AutoCheck } from "./modes.ts";
import type { ApprovalCause } from "./policy.ts";

export type ApprovalStatus = "pending" | "approved" | "denied" | "consumed" | "expired";

export interface Approval {
  id: string;
  siteId?: string | undefined;
  tool: string;
  input?: unknown;
  actor: Actor;
  prompt: string;
  /** The mode the agent worked in when it asked (ADR-0015). */
  mode?: AgentMode | undefined;
  /** Why a person must decide. */
  cause?: ApprovalCause | undefined;
  /** For an `auto`-mode publish: the low-risk check that sent it to a person. */
  autoCheck?: AutoCheck | undefined;
  /** For a granted `request_elevation`: what was granted (the approver may have shortened it). */
  grant?: ElevationGrant | undefined;
  /** Why it was decided the way it was, when the server decided (e.g. "member removed"). */
  reason?: string | undefined;
  /** The content state the request is bound to (empty for requests not bound to content). */
  stateHash: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string | undefined;
  decidedBy?: string | undefined;
  consumedAt?: string | undefined;
}

/** The elevation a person granted for an agent's request (ADR-0016). */
export interface ElevationGrant {
  /** The key's own mode it was granted on top of. */
  from: AgentMode;
  mode: AgentMode;
  minutes: number;
  until: string;
}

export interface ApprovalRequest {
  siteId?: string | undefined;
  tool: string;
  argsHash: string;
  input?: unknown;
  actor: Actor;
  prompt: string;
  stateHash: string;
  mode?: AgentMode | undefined;
  cause?: ApprovalCause | undefined;
  autoCheck?: AutoCheck | undefined;
}

export type RedeemResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-found"
        | "pending"
        | "denied"
        | "consumed"
        | "expired"
        | "mismatch"
        | "state-changed";
    };

type Row = Record<string, unknown>;

function newApprovalId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return `appr_${Array.from(bytes, (b) => alphabet[b % 32]).join("")}`;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function resultOf(raw: unknown): { grant?: ElevationGrant; reason?: string } {
  const result =
    typeof raw === "string"
      ? (parseJson(raw) as { grant?: ElevationGrant; reason?: unknown } | undefined)
      : undefined;
  return {
    ...(result?.grant ? { grant: result.grant } : {}),
    ...(typeof result?.reason === "string" ? { reason: result.reason } : {}),
  };
}

export class ApprovalStore {
  readonly #sql: SqlDriver;
  readonly #ttlMs: number;
  readonly #now: () => Date;

  constructor(sql: SqlDriver, options: { ttlMs?: number; now?: () => Date } = {}) {
    this.#sql = sql;
    this.#ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Files a request, or returns the one already waiting for the same actor, tool, arguments and
   * site state: an agent that retries (or loses the first answer) does not fill Approvals with
   * copies a person would have to deny one by one.
   */
  async request(req: ApprovalRequest): Promise<Approval> {
    const now = this.#now();
    const same = await this.#sql.get<{ id: string }>(
      "SELECT id FROM approvals WHERE status = 'pending' AND expires_at > ? AND actor_id = ? AND tool = ? AND args_hash = ? AND state_hash = ? AND site_id IS ? ORDER BY created_at DESC LIMIT 1",
      [now.toISOString(), req.actor.id, req.tool, req.argsHash, req.stateHash, req.siteId ?? null],
    );
    if (same) return (await this.get(same.id)) as Approval;
    const id = newApprovalId();
    const expires = new Date(now.getTime() + this.#ttlMs).toISOString();
    await this.#sql.run(
      "INSERT INTO approvals (id, site_id, tool, args_hash, input, actor_kind, actor_id, actor_name, prompt, state_hash, status, created_at, expires_at, mode, cause, auto_check) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
      [
        id,
        req.siteId ?? null,
        req.tool,
        req.argsHash,
        req.input === undefined ? null : JSON.stringify(req.input).slice(0, 8000),
        req.actor.kind,
        req.actor.id,
        req.actor.name ?? null,
        req.prompt,
        req.stateHash,
        now.toISOString(),
        expires,
        req.mode ?? null,
        req.cause ?? null,
        req.autoCheck ? JSON.stringify(req.autoCheck) : null,
      ],
    );
    return (await this.get(id)) as Approval;
  }

  async get(id: string): Promise<Approval | undefined> {
    const row = await this.#sql.get<Row>("SELECT * FROM approvals WHERE id = ?", [id]);
    return row ? this.#toApproval(row) : undefined;
  }

  async list(
    filter: {
      siteId?: string;
      status?: ApprovalStatus;
      actorId?: string;
      tool?: string;
      limit?: number;
    } = {},
  ): Promise<Approval[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.siteId) {
      where.push("site_id = ?");
      params.push(filter.siteId);
    }
    if (filter.actorId) {
      where.push("actor_id = ?");
      params.push(filter.actorId);
    }
    if (filter.tool) {
      where.push("tool = ?");
      params.push(filter.tool);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    params.push(filter.limit ?? 50);
    const rows = await this.#sql.all<Row>(
      `SELECT * FROM approvals ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
      params,
    );
    return rows.map((r) => this.#toApproval(r));
  }

  /** A person's decision. Only a pending, unexpired request can be decided. */
  async decide(
    id: string,
    decision: "approved" | "denied",
    by: Actor,
    reason?: string,
  ): Promise<Approval | undefined> {
    const now = this.#now().toISOString();
    const r = await this.#sql.run(
      "UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, result = COALESCE(?, result) WHERE id = ? AND status = 'pending' AND expires_at > ?",
      [decision, now, by.id, reason ? JSON.stringify({ reason }) : null, id, now],
    );
    if (r.changes !== 1) return undefined;
    return this.get(id);
  }

  /**
   * Denies every pending request filed by these actors (RFC-0005 §3: a removed member's agents and
   * their own person-requests), decided by `by` with `reason`. Returns how many were denied.
   */
  async denyPending(actorIds: readonly string[], by: Actor, reason: string): Promise<number> {
    const now = this.#now().toISOString();
    let denied = 0;
    for (let i = 0; i < actorIds.length; i += 90) {
      const chunk = actorIds.slice(i, i + 90);
      const r = await this.#sql.run(
        `UPDATE approvals SET status = 'denied', decided_at = ?, decided_by = ?, result = ? WHERE status = 'pending' AND actor_id IN (${chunk.map(() => "?").join(", ")})`,
        [now, by.id, JSON.stringify({ reason }), ...chunk],
      );
      denied += r.changes;
    }
    return denied;
  }

  /**
   * Marks an approved request as used when the server itself carries it out on approval (an
   * elevation request, ADR-0016) rather than the agent redeeming it.
   */
  async complete(id: string, grant?: ElevationGrant): Promise<Approval | undefined> {
    const now = this.#now().toISOString();
    const r = await this.#sql.run(
      "UPDATE approvals SET status = 'consumed', consumed_at = ?, result = ? WHERE id = ? AND status = 'approved'",
      [now, grant ? JSON.stringify({ grant }) : null, id],
    );
    if (r.changes !== 1) return undefined;
    return this.get(id);
  }

  /**
   * Redeems an approved request exactly once, for the same tool, arguments, actor and site state.
   * The status change and every binding check happen in one UPDATE, so two concurrent redeems
   * cannot both succeed.
   */
  async redeem(
    id: string,
    binding: { tool: string; argsHash: string; actorId: string; stateHash: string },
  ): Promise<RedeemResult> {
    const now = this.#now().toISOString();
    const r = await this.#sql.run(
      "UPDATE approvals SET status = 'consumed', consumed_at = ? WHERE id = ? AND status = 'approved' AND expires_at > ? AND tool = ? AND args_hash = ? AND actor_id = ? AND state_hash = ?",
      [now, id, now, binding.tool, binding.argsHash, binding.actorId, binding.stateHash],
    );
    if (r.changes === 1) return { ok: true };
    const row = await this.#sql.get<Row>("SELECT * FROM approvals WHERE id = ?", [id]);
    if (!row) return { ok: false, reason: "not-found" };
    if (
      row.tool !== binding.tool ||
      row.args_hash !== binding.argsHash ||
      row.actor_id !== binding.actorId
    )
      return { ok: false, reason: "mismatch" };
    if ((row.expires_at as string) <= now && row.status !== "consumed")
      return { ok: false, reason: "expired" };
    if (row.status === "pending") return { ok: false, reason: "pending" };
    if (row.status === "denied") return { ok: false, reason: "denied" };
    if (row.status === "consumed") return { ok: false, reason: "consumed" };
    if (row.state_hash !== binding.stateHash) return { ok: false, reason: "state-changed" };
    return { ok: false, reason: "expired" };
  }

  #toApproval(r: Row): Approval {
    const now = this.#now().toISOString();
    const status = r.status as ApprovalStatus;
    let input: unknown;
    try {
      input = r.input ? JSON.parse(r.input as string) : undefined;
    } catch {
      input = { truncated: true };
    }
    return {
      id: r.id as string,
      siteId: (r.site_id as string | null) ?? undefined,
      tool: r.tool as string,
      input,
      actor: {
        kind: r.actor_kind as Actor["kind"],
        id: r.actor_id as string,
        ...(r.actor_name ? { name: r.actor_name as string } : {}),
      },
      prompt: r.prompt as string,
      ...(r.mode ? { mode: r.mode as AgentMode } : {}),
      ...(r.cause ? { cause: r.cause as ApprovalCause } : {}),
      ...(r.auto_check ? { autoCheck: parseJson(r.auto_check as string) as AutoCheck } : {}),
      ...resultOf(r.result),
      stateHash: (r.state_hash as string | null) ?? "",
      status: status === "pending" && (r.expires_at as string) <= now ? "expired" : status,
      createdAt: r.created_at as string,
      expiresAt: r.expires_at as string,
      decidedAt: (r.decided_at as string | null) ?? undefined,
      decidedBy: (r.decided_by as string | null) ?? undefined,
      consumedAt: (r.consumed_at as string | null) ?? undefined,
    };
  }
}
