/**
 * RFC-0044 §5, §7: `agent_grants`, one row per member and OAuth client, written on Studio's
 * consent screen. A token is only as good as its grant: the row carries the scopes after
 * narrowing by the member's role at consent, the agent mode, an elevation and the revocation,
 * and `/mcp` reads it on every call. Each write is one statement or one atomic `batch()`
 * (AGENTS.md rule 4). Worker-safe: no Node imports.
 */
import {
  type AgentMode,
  activeElevation,
  isAgentMode,
  isKeyScope,
  type ModeElevation,
  type Scope,
} from "@cloudhal/agent-runtime";
import type { SqlDriver, SqlStatement } from "@cloudhal/storage";

export interface AgentGrant {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly clientName: string;
  /** Key scopes after narrowing by the installation role at consent (the token's cap). */
  readonly scopes: Scope[];
  readonly mode: AgentMode;
  readonly elevation?: ModeElevation | undefined;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

type GrantRow = {
  id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  scopes: string;
  mode: string;
  elevation: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** `last_used_at` is written at most this often per grant (one write, not one per call). */
export const LAST_USED_RESOLUTION_MS = 5 * 60_000;

/** The agent actor id a grant's calls are recorded under (as `agentIdForKey` for keys). */
export function agentIdForGrant(grantId: string): string {
  return `agent_${grantId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32)
    .padEnd(6, "0")}`;
}

function parseScopes(text: string): Scope[] {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value.filter((s): s is Scope => isKeyScope(s)) : [];
  } catch {
    return [];
  }
}

function parseElevation(text: string | null): ModeElevation | undefined {
  if (!text) return undefined;
  try {
    const raw = JSON.parse(text) as Partial<ModeElevation>;
    if (!isAgentMode(raw.mode) || typeof raw.until !== "string") return undefined;
    return {
      mode: raw.mode,
      until: raw.until,
      grantedBy: typeof raw.grantedBy === "string" ? raw.grantedBy : "",
      grantedAt: typeof raw.grantedAt === "string" ? raw.grantedAt : "",
      ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
    };
  } catch {
    return undefined;
  }
}

function toGrant(row: GrantRow): AgentGrant {
  const elevation = parseElevation(row.elevation);
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    clientName: row.client_name,
    scopes: parseScopes(row.scopes),
    mode: isAgentMode(row.mode) ? row.mode : "edits",
    ...(elevation ? { elevation } : {}),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

/** The grant's elevation if one is in force at `now` (ADR-0016, as for a key). */
export function grantElevation(grant: AgentGrant, now: Date): ModeElevation | undefined {
  return grant.elevation ? activeElevation(grant.mode, grant.elevation, now) : undefined;
}

export interface GrantConsent {
  readonly userId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly Scope[];
  readonly mode: AgentMode;
}

export class GrantStore {
  readonly #sql: SqlDriver;
  readonly #now: () => Date;
  constructor(sql: SqlDriver, now: () => Date = () => new Date()) {
    this.#sql = sql;
    this.#now = now;
  }

  async byId(id: string): Promise<AgentGrant | undefined> {
    const row = await this.#sql.get<GrantRow>("SELECT * FROM agent_grants WHERE id = ?", [id]);
    return row ? toGrant(row) : undefined;
  }

  /** The live (not revoked) grant of a member for a client. */
  async live(userId: string, clientId: string): Promise<AgentGrant | undefined> {
    const row = await this.#sql.get<GrantRow>(
      "SELECT * FROM agent_grants WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL",
      [userId, clientId],
    );
    return row ? toGrant(row) : undefined;
  }

  async listOf(userId: string): Promise<AgentGrant[]> {
    const rows = await this.#sql.all<GrantRow>(
      "SELECT * FROM agent_grants WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 500",
      [userId],
    );
    return rows.map(toGrant);
  }

  async listAll(): Promise<AgentGrant[]> {
    const rows = await this.#sql.all<GrantRow>(
      "SELECT * FROM agent_grants WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 500",
    );
    return rows.map(toGrant);
  }

  /**
   * Records a consent: a new grant, or the member's existing row for the client with the new
   * scopes and mode (a revoked row comes back to life with a fresh id, so audit rows of the old
   * connection keep pointing at the old agent id). `agent_owner` and the audit row go in the same
   * batch (RFC-0005 §4), passed in by the caller.
   */
  async consent(
    input: GrantConsent,
    also: (grantId: string) => readonly SqlStatement[] = () => [],
  ): Promise<AgentGrant> {
    const now = this.#now().toISOString();
    const existing = await this.#sql.get<GrantRow>(
      "SELECT * FROM agent_grants WHERE user_id = ? AND client_id = ?",
      [input.userId, input.clientId],
    );
    const id = existing && !existing.revoked_at ? existing.id : newGrantId();
    const scopes = JSON.stringify([...input.scopes]);
    const write: SqlStatement = existing
      ? {
          // The stored elevation ends with a new consent: a widened connection starts afresh.
          sql: "UPDATE agent_grants SET id = ?, client_name = ?, scopes = ?, mode = ?, elevation = NULL, revoked_at = NULL, created_at = CASE WHEN revoked_at IS NULL THEN created_at ELSE ? END WHERE user_id = ? AND client_id = ?",
          params: [id, input.clientName, scopes, input.mode, now, input.userId, input.clientId],
        }
      : {
          sql: "INSERT INTO agent_grants (id, user_id, client_id, client_name, scopes, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          params: [id, input.userId, input.clientId, input.clientName, scopes, input.mode, now],
        };
    await this.#sql.batch([write, ...also(id)]);
    const grant = await this.byId(id);
    if (!grant) throw new Error("agent grant vanished after consent");
    return grant;
  }

  /** Marks a grant revoked (kept for audit); true when it was live. */
  async revoke(id: string, also: readonly SqlStatement[] = []): Promise<boolean> {
    const before = await this.byId(id);
    if (!before || before.revokedAt) return false;
    await this.#sql.batch([
      {
        sql: "UPDATE agent_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        params: [this.#now().toISOString(), id],
      },
      ...also,
    ]);
    return true;
  }

  /** `last_used_at`, written only when the stored value is older than the resolution. */
  async touch(grant: AgentGrant): Promise<void> {
    const now = this.#now();
    const last = grant.lastUsedAt ? Date.parse(grant.lastUsedAt) : Number.NaN;
    if (!Number.isNaN(last) && now.getTime() - last < LAST_USED_RESOLUTION_MS) return;
    await this.#sql.run(
      "UPDATE agent_grants SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
      [
        now.toISOString(),
        grant.id,
        new Date(now.getTime() - LAST_USED_RESOLUTION_MS).toISOString(),
      ],
    );
  }
}

/**
 * The provider's side of ending connections (§2 "Revocation"): its stored consent, so the next
 * authorization shows Studio's screen again; its refresh tokens, so no new access token is
 * minted; and its pending authorization codes (5 min), so none is exchanged after a reconnect. For
 * one client, or every client of the member (removal). Plain SQL, so it rides in the same atomic
 * batch as the grant change and can never leave a consent without a live grant.
 */
export function providerRevocation(
  userId: string,
  clientId: string | undefined,
  at: string,
): SqlStatement[] {
  const client = clientId === undefined ? "" : ' AND "clientId" = ?';
  const scope = clientId === undefined ? [userId] : [userId, clientId];
  // Codes are verification rows whose value is the provider's JSON; other rows may not be JSON.
  const code = (path: string) =>
    `CASE WHEN json_valid("value") THEN json_extract("value", '${path}') END`;
  const codeClient = clientId === undefined ? "" : ` AND ${code("$.query.client_id")} = ?`;
  return [
    { sql: `DELETE FROM "oauthConsent" WHERE "userId" = ?${client}`, params: scope },
    {
      sql: `UPDATE "oauthRefreshToken" SET "revoked" = ? WHERE "userId" = ?${client} AND "revoked" IS NULL`,
      params: [at, ...scope],
    },
    {
      sql: `DELETE FROM "verification" WHERE "value" LIKE '%authorization_code%' AND ${code("$.type")} = 'authorization_code' AND ${code("$.userId")} = ?${codeClient}`,
      params: scope,
    },
  ];
}

/** A grant id: 24 base62 characters from WebCrypto. */
export function newGrantId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
