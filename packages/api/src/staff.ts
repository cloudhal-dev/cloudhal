/**
 * Membership, invites, password-reset links and agent ownership over SQL (RFC-0005 §3, §7, §11).
 * Rows live in Better Auth's organization tables (`organization`, `member`, `invitation`; one
 * organization per deployment) plus `agent_owner` and `password_reset` (migration 0012). Every
 * multi-row change is one guarded statement or one atomic `batch()` (AGENTS.md rule 4); the
 * database itself refuses a second Owner or a second membership (unique indexes).
 *
 * Worker-safe: no Node imports.
 */
import { isRole, type Role } from "@cloudhal/agent-runtime";
import type { SqlDriver } from "@cloudhal/storage";

/** The one organization of a deployment (Cloud: one per tenant). */
export const DEPLOYMENT_ORG = "deployment";

export interface MemberRow {
  /** Better Auth user id. */
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export type InviteStatus = "pending" | "accepted" | "canceled" | "expired";

export interface InviteRow {
  id: string;
  email: string;
  role: Role;
  status: InviteStatus;
  inviterId: string;
  inviterName: string | null;
  delivery: "link" | "email";
  createdAt: string;
  expiresAt: string;
  acceptedUserId: string | null;
  acceptedAt: string | null;
  canceledBy: string | null;
  canceledAt: string | null;
}

export interface PasswordResetRow {
  id: string;
  userId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

type Row = Record<string, unknown>;

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A Better Auth–style id (32 alphanumerics). */
export function newRowId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => ALPHANUM[b % ALPHANUM.length]).join("");
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value ?? "");
}

function toMember(r: Row): MemberRow | undefined {
  if (!isRole(r.role)) return undefined;
  return {
    userId: r.userId as string,
    name: (r.name as string | null) ?? "",
    email: (r.email as string | null) ?? "",
    role: r.role,
    joinedAt: iso(r.createdAt),
  };
}

export class StaffStore {
  readonly #sql: SqlDriver;
  readonly #now: () => Date;

  constructor(sql: SqlDriver, now: () => Date = () => new Date()) {
    this.#sql = sql;
    this.#now = now;
  }

  // ───────────────────────────── members ─────────────────────────────

  async member(userId: string): Promise<MemberRow | undefined> {
    const row = await this.#sql.get<Row>(
      `SELECT m."userId", m."role", m."createdAt", u."name", u."email" FROM "member" m JOIN "user" u ON u."id" = m."userId" WHERE m."organizationId" = ? AND m."userId" = ?`,
      [DEPLOYMENT_ORG, userId],
    );
    return row ? toMember(row) : undefined;
  }

  /** Members by rank, then join date. */
  async list(): Promise<MemberRow[]> {
    const rows = await this.#sql.all<Row>(
      `SELECT m."userId", m."role", m."createdAt", u."name", u."email" FROM "member" m JOIN "user" u ON u."id" = m."userId" WHERE m."organizationId" = ? ORDER BY m."createdAt", m."userId"`,
      [DEPLOYMENT_ORG],
    );
    const order: Role[] = ["owner", "administrator", "editor", "author", "contributor"];
    return rows
      .map(toMember)
      .filter((m): m is MemberRow => m !== undefined)
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  }

  /**
   * The deployment's name (shown on invites): the organization's, unless it still has the default
   * from a migration that ran before any site existed; then the first site's.
   */
  async deploymentName(): Promise<string> {
    const row = await this.#sql.get<{ name: string }>(
      `SELECT "name" FROM "organization" WHERE "id" = ?`,
      [DEPLOYMENT_ORG],
    );
    if (row?.name && row.name !== "Cloudhal") return row.name;
    const site = await this.#sql.get<{ name: string | null }>(
      "SELECT json_extract(body, '$.name') AS name FROM nodes WHERE kind = 'site' ORDER BY created_at, id LIMIT 1",
    );
    return site?.name ?? row?.name ?? "Cloudhal";
  }

  async owner(): Promise<MemberRow | undefined> {
    return (await this.list()).find((m) => m.role === "owner");
  }

  /** Adds a membership; false when the user already has one (or `owner` is taken). */
  async join(userId: string, role: Role): Promise<boolean> {
    try {
      const r = await this.#sql.run(
        `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND "userId" = ?)`,
        [newRowId(), DEPLOYMENT_ORG, userId, role, this.#stamp(), DEPLOYMENT_ORG, userId],
      );
      return r.changes === 1;
    } catch {
      return false; // unique index: a concurrent join, or a second owner
    }
  }

  /**
   * The first account of a deployment becomes the Owner (one statement: only while nobody is);
   * otherwise it joins as `fallback` (open sign-up: Contributor), or not at all.
   */
  async joinAsOwnerOr(userId: string, fallback: Role | undefined): Promise<Role | undefined> {
    try {
      const r = await this.#sql.run(
        `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") SELECT ?, ?, ?, 'owner', ? WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND ("role" = 'owner' OR "userId" = ?))`,
        [newRowId(), DEPLOYMENT_ORG, userId, this.#stamp(), DEPLOYMENT_ORG, userId],
      );
      if (r.changes === 1) return "owner";
    } catch {
      // a concurrent first sign-up took the Owner
    }
    if (!fallback) return undefined;
    return (await this.join(userId, fallback)) ? fallback : (await this.member(userId))?.role;
  }

  /** Changes a role, guarded on the role the caller saw (a concurrent change voids it). */
  async setRole(userId: string, from: Role, to: Role): Promise<boolean> {
    if (from === "owner" || to === "owner") return false;
    const r = await this.#sql.run(
      `UPDATE "member" SET "role" = ? WHERE "organizationId" = ? AND "userId" = ? AND "role" = ?`,
      [to, DEPLOYMENT_ORG, userId, from],
    );
    return r.changes === 1;
  }

  /** Deletes a membership (never the Owner's). */
  async remove(userId: string): Promise<boolean> {
    const r = await this.#sql.run(
      `DELETE FROM "member" WHERE "organizationId" = ? AND "userId" = ? AND "role" <> 'owner'`,
      [DEPLOYMENT_ORG, userId],
    );
    return r.changes === 1;
  }

  /**
   * Ownership transfer (RFC-0005 §3): one batch; each statement is guarded on both rows' current
   * roles, and the last one asserts the outcome, so a concurrent change voids the whole operation.
   * The caller is demoted first so the one-Owner index never sees two.
   */
  async transfer(fromUserId: string, toUserId: string): Promise<boolean> {
    if (fromUserId === toUserId) return false;
    const org = DEPLOYMENT_ORG;
    try {
      await this.#sql.batch([
        {
          sql: `UPDATE "member" SET "role" = 'administrator' WHERE "organizationId" = ? AND "userId" = ? AND "role" = 'owner' AND EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND "userId" = ? AND "role" = 'administrator')`,
          params: [org, fromUserId, org, toUserId],
        },
        {
          sql: `UPDATE "member" SET "role" = 'owner' WHERE "organizationId" = ? AND "userId" = ? AND "role" = 'administrator' AND NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND "role" = 'owner')`,
          params: [org, toUserId, org],
        },
        // Assertion: exactly the target is the Owner now, else NOT NULL fails and nothing applies.
        this.#assert(
          `(SELECT COUNT(*) FROM "member" WHERE "organizationId" = ? AND "role" = 'owner' AND "userId" = ?) = 1`,
          [org, toUserId],
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Operator recovery (`cloudhal owner transfer`, deployment token): the member `toUserId` becomes
   * the Owner and the current Owner (if any) an Administrator, in one batch.
   */
  async forceOwner(toUserId: string): Promise<{ from: string | null } | undefined> {
    const current = await this.owner();
    if (current?.userId === toUserId) return { from: toUserId };
    const org = DEPLOYMENT_ORG;
    try {
      await this.#sql.batch([
        {
          sql: `UPDATE "member" SET "role" = 'administrator' WHERE "organizationId" = ? AND "role" = 'owner' AND EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = ? AND "userId" = ?)`,
          params: [org, org, toUserId],
        },
        {
          sql: `UPDATE "member" SET "role" = 'owner' WHERE "organizationId" = ? AND "userId" = ?`,
          params: [org, toUserId],
        },
        this.#assert(
          `(SELECT COUNT(*) FROM "member" WHERE "organizationId" = ? AND "role" = 'owner' AND "userId" = ?) = 1`,
          [org, toUserId],
        ),
      ]);
      return { from: current?.userId ?? null };
    } catch {
      return undefined;
    }
  }

  // ───────────────────────────── agents ─────────────────────────────

  /** Records whose key an agent actor uses (kept after the key is deleted). */
  async recordAgent(agentId: string, userId: string, keyId: string): Promise<void> {
    await this.#sql.run(
      "INSERT INTO agent_owner (agent_id, user_id, key_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (agent_id) DO NOTHING",
      [agentId, userId, keyId, this.#stamp()],
    );
  }

  /** The Better Auth user id behind an agent actor. */
  async userOfAgent(agentId: string): Promise<string | undefined> {
    const row = await this.#sql.get<{ user_id: string }>(
      "SELECT user_id FROM agent_owner WHERE agent_id = ?",
      [agentId],
    );
    return row?.user_id;
  }

  /** Agent actor ids of every key a person ever created. */
  async agentsOf(userId: string): Promise<string[]> {
    const rows = await this.#sql.all<{ agent_id: string }>(
      "SELECT agent_id FROM agent_owner WHERE user_id = ? ORDER BY created_at LIMIT 500",
      [userId],
    );
    return rows.map((r) => r.agent_id);
  }

  /** Disables every key of a person (removal, RFC-0005 §3); kept for audit, deletable. */
  async disableKeysOf(userId: string): Promise<number> {
    const r = await this.#sql.run(
      `UPDATE "apikey" SET "enabled" = 0, "updatedAt" = ? WHERE "referenceId" = ? AND ("enabled" IS NULL OR "enabled" <> 0)`,
      [this.#stamp(), userId],
    );
    return r.changes;
  }

  // ───────────────────────────── invites ─────────────────────────────

  /**
   * Stores an invite (only the token's hash) and cancels any pending invite for the same email
   * (re-inviting replaces it), in one batch.
   */
  async createInvite(input: {
    email: string;
    role: Role;
    inviterId: string;
    expiresAt: string;
    delivery: "link" | "email";
    tokenHash: string;
  }): Promise<InviteRow> {
    const id = newRowId();
    const now = this.#stamp();
    await this.#sql.batch([
      {
        sql: `UPDATE "invitation" SET "status" = 'canceled', "canceledBy" = ?, "canceledAt" = ? WHERE "organizationId" = ? AND "email" = ? AND "status" = 'pending'`,
        params: [input.inviterId, now, DEPLOYMENT_ORG, input.email],
      },
      {
        sql: `INSERT INTO "invitation" ("id", "organizationId", "email", "role", "status", "expiresAt", "createdAt", "inviterId", "tokenHash", "delivery") VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        params: [
          id,
          DEPLOYMENT_ORG,
          input.email,
          input.role,
          input.expiresAt,
          now,
          input.inviterId,
          input.tokenHash,
          input.delivery,
        ],
      },
    ]);
    return (await this.invite(id)) as InviteRow;
  }

  async invite(id: string): Promise<InviteRow | undefined> {
    const row = await this.#sql.get<Row>(`${INVITE_SELECT} WHERE i."id" = ?`, [id]);
    return row ? this.#toInvite(row) : undefined;
  }

  async inviteByHash(tokenHash: string): Promise<InviteRow | undefined> {
    const row = await this.#sql.get<Row>(`${INVITE_SELECT} WHERE i."tokenHash" = ?`, [tokenHash]);
    return row ? this.#toInvite(row) : undefined;
  }

  /** Pending invites (and recent accepted ones without an account), newest first. */
  async listInvites(): Promise<InviteRow[]> {
    const rows = await this.#sql.all<Row>(
      `${INVITE_SELECT} WHERE i."organizationId" = ? AND (i."status" = 'pending' OR (i."status" = 'accepted' AND i."acceptedUserId" IS NULL)) ORDER BY i."createdAt" DESC LIMIT 200`,
      [DEPLOYMENT_ORG],
    );
    return rows.map((r) => this.#toInvite(r));
  }

  /** Invites accepted since `since` that `inviterId` sent (`member-joined` notifications). */
  async acceptedInvitesBy(inviterId: string, since: string): Promise<InviteRow[]> {
    const rows = await this.#sql.all<Row>(
      `${INVITE_SELECT} WHERE i."organizationId" = ? AND i."inviterId" = ? AND i."status" = 'accepted' AND i."acceptedUserId" IS NOT NULL AND i."acceptedAt" >= ? ORDER BY i."acceptedAt" DESC LIMIT 50`,
      [DEPLOYMENT_ORG, inviterId, since],
    );
    return rows.map((r) => this.#toInvite(r));
  }

  async countPending(): Promise<number> {
    const row = await this.#sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "invitation" WHERE "organizationId" = ? AND "status" = 'pending' AND "expiresAt" > ?`,
      [DEPLOYMENT_ORG, this.#stamp()],
    );
    return Number(row?.n ?? 0);
  }

  async countCreatedSince(inviterId: string, since: string): Promise<number> {
    const row = await this.#sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "invitation" WHERE "organizationId" = ? AND "inviterId" = ? AND "createdAt" >= ?`,
      [DEPLOYMENT_ORG, inviterId, since],
    );
    return Number(row?.n ?? 0);
  }

  /**
   * Claims an invite for acceptance with one guarded statement (RFC-0005 §7.1): `changes = 1`
   * wins; anything else is gone (used, revoked, expired, unknown).
   */
  async claimInvite(tokenHash: string): Promise<boolean> {
    const now = this.#stamp();
    const r = await this.#sql.run(
      `UPDATE "invitation" SET "status" = 'accepted', "acceptedAt" = ? WHERE "tokenHash" = ? AND "status" = 'pending' AND "expiresAt" > ?`,
      [now, tokenHash, now],
    );
    return r.changes === 1;
  }

  /** Account creation failed after the claim: the invite becomes usable again. */
  async releaseInvite(id: string): Promise<void> {
    await this.#sql.run(
      `UPDATE "invitation" SET "status" = 'pending', "acceptedAt" = NULL WHERE "id" = ? AND "status" = 'accepted' AND "acceptedUserId" IS NULL`,
      [id],
    );
  }

  /**
   * Binds an accepted invite to its account and inserts the membership, guarded on the invite
   * being accepted by exactly this user (one batch).
   */
  async completeInvite(invite: InviteRow, userId: string): Promise<boolean> {
    try {
      const [bind, insert] = await this.#sql.batch([
        {
          sql: `UPDATE "invitation" SET "acceptedUserId" = ? WHERE "id" = ? AND "status" = 'accepted' AND "acceptedUserId" IS NULL`,
          params: [userId, invite.id],
        },
        {
          sql: `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM "invitation" WHERE "id" = ? AND "status" = 'accepted' AND "acceptedUserId" = ? AND "role" = ?)`,
          params: [
            newRowId(),
            DEPLOYMENT_ORG,
            userId,
            invite.role,
            this.#stamp(),
            invite.id,
            userId,
            invite.role,
          ],
        },
      ]);
      return bind?.changes === 1 && insert?.changes === 1;
    } catch {
      return false;
    }
  }

  /** Revokes a pending invite. */
  async cancelInvite(id: string, by: string): Promise<boolean> {
    const r = await this.#sql.run(
      `UPDATE "invitation" SET "status" = 'canceled', "canceledBy" = ?, "canceledAt" = ? WHERE "id" = ? AND "organizationId" = ? AND "status" = 'pending'`,
      [by, this.#stamp(), id, DEPLOYMENT_ORG],
    );
    return r.changes === 1;
  }

  /** Cancels every pending invite a person sent (their removal). */
  async cancelInvitesBy(inviterId: string, by: string): Promise<number> {
    const r = await this.#sql.run(
      `UPDATE "invitation" SET "status" = 'canceled', "canceledBy" = ?, "canceledAt" = ? WHERE "organizationId" = ? AND "inviterId" = ? AND "status" = 'pending'`,
      [by, this.#stamp(), DEPLOYMENT_ORG, inviterId],
    );
    return r.changes;
  }

  // ───────────────────────────── password resets ─────────────────────────────

  /** Stores a reset link (hash only); an older unused link for the same user stops working. */
  async createReset(input: {
    userId: string;
    createdBy: string;
    expiresAt: string;
    tokenHash: string;
  }): Promise<PasswordResetRow> {
    const id = newRowId();
    const now = this.#stamp();
    await this.#sql.batch([
      {
        sql: "UPDATE password_reset SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
        params: [now, input.userId],
      },
      {
        sql: "INSERT INTO password_reset (id, token_hash, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [id, input.tokenHash, input.userId, input.createdBy, now, input.expiresAt],
      },
    ]);
    return {
      id,
      userId: input.userId,
      createdBy: input.createdBy,
      createdAt: now,
      expiresAt: input.expiresAt,
      usedAt: null,
    };
  }

  /** A usable (unused, unexpired) reset link. */
  async resetByHash(tokenHash: string): Promise<PasswordResetRow | undefined> {
    const row = await this.#sql.get<Row>(
      "SELECT * FROM password_reset WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
      [tokenHash, this.#stamp()],
    );
    return row
      ? {
          id: row.id as string,
          userId: row.user_id as string,
          createdBy: row.created_by as string,
          createdAt: row.created_at as string,
          expiresAt: row.expires_at as string,
          usedAt: null,
        }
      : undefined;
  }

  /** Uses a reset link once (guarded). */
  async claimReset(tokenHash: string): Promise<boolean> {
    const now = this.#stamp();
    const r = await this.#sql.run(
      "UPDATE password_reset SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
      [now, tokenHash, now],
    );
    return r.changes === 1;
  }

  // ───────────────────────────── rate limits ─────────────────────────────

  /**
   * Fixed-window counter in Better Auth's `rateLimit` table (migration 0005), under keys of our own
   * (`cloudhal:…`). Returns false once `max` requests were seen within `windowMs`.
   */
  async hit(key: string, windowMs: number, max: number): Promise<boolean> {
    const now = this.#now().getTime();
    const start = now - windowMs;
    await this.#sql.run(
      `INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest") VALUES (?, ?, 1, ?) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "rateLimit"."lastRequest" < ? THEN 1 ELSE "rateLimit"."count" + 1 END, "lastRequest" = CASE WHEN "rateLimit"."lastRequest" < ? THEN excluded."lastRequest" ELSE "rateLimit"."lastRequest" END`,
      [newRowId(), key, now, start, start],
    );
    const row = await this.#sql.get<{ count: number }>(
      `SELECT "count" FROM "rateLimit" WHERE "key" = ?`,
      [key],
    );
    return Number(row?.count ?? 0) <= max;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  #stamp(): string {
    return this.#now().toISOString();
  }

  /** A batch statement that fails (rolling the batch back) unless `condition` holds. */
  #assert(condition: string, params: (string | number)[]) {
    return {
      sql: `INSERT INTO op_guards (op_id, seq, ok, created_at) SELECT ?, 0, CASE WHEN ${condition} THEN 1 END, ?`,
      params: [`members_${newRowId()}`, ...params, this.#stamp()],
    };
  }

  #toInvite(r: Row): InviteRow {
    const status = r.status as string;
    const expired = status === "pending" && iso(r.expiresAt) <= this.#stamp();
    return {
      id: r.id as string,
      email: r.email as string,
      role: (isRole(r.role) ? r.role : "contributor") as Role,
      status: expired ? "expired" : (status as InviteStatus),
      inviterId: r.inviterId as string,
      inviterName: (r.inviterName as string | null) ?? null,
      delivery: r.delivery === "email" ? "email" : "link",
      createdAt: iso(r.createdAt),
      expiresAt: iso(r.expiresAt),
      acceptedUserId: (r.acceptedUserId as string | null) ?? null,
      acceptedAt: r.acceptedAt ? iso(r.acceptedAt) : null,
      canceledBy: (r.canceledBy as string | null) ?? null,
      canceledAt: r.canceledAt ? iso(r.canceledAt) : null,
    };
  }
}

const INVITE_SELECT = `SELECT i.*, u."name" AS "inviterName" FROM "invitation" i LEFT JOIN "user" u ON u."id" = i."inviterId"`;
