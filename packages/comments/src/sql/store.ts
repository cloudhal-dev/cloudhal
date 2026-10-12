/**
 * `SqlCommentStore` — the comment tables of migration `0016_comments` through `SqlDriver` (SQLite
 * locally and on Node, D1 on Cloudflare). Worker-safe.
 *
 * Writes follow RFC-0007 §4.4 and AGENTS.md rule 4: no interactive transactions, every write is
 * one statement or one atomic `batch()`, and statements that follow a compare-and-swap in the
 * same batch are guarded on what that CAS wrote (a fresh operation id `op` and the new content
 * `hash`), never on `rev + 1`. Statement counts per path (asserted by the conformance suite):
 *
 * | Path | Statements |
 * |---|---|
 * | submit / report | 1–2 (+1 the first time a month's salt is stored) |
 * | moderate (1–50 ids) | 2–3 + audit, however many comments |
 * | label (1–50 ids) | 2 + audit |
 * | staff reply | 3 + audit |
 * | settings | 1 |
 * | thread | 1–2 + audit |
 * | erase | ≤ 5 + audit per 200 comments |
 *
 * Bulk statements pass their per-row data as one JSON parameter read with `json_each`, so they
 * stay far below D1's 100 bound parameters whatever the number of comments.
 */
import type { Actor, Comment, CommentLabel, CommentModeration } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { type CommentKeys, fromBase64Url, toBase64Url, utf8 } from "../crypto.ts";
import {
  CommentConflictError,
  CommentForbiddenError,
  CommentInputError,
  CommentNotFoundError,
} from "../errors.ts";
import {
  commentRecordHash,
  commentStateHash,
  ID_PREFIX,
  newCommentsId,
  openEmail,
  openSecret,
  sealSecret,
} from "../hashes.ts";
import {
  type AuditStatement,
  type BanSubject,
  type CommentBan,
  type CommentCounts,
  type CommentEvent,
  type Commenter,
  type CommentId,
  type CommentQuery,
  type CommentReport,
  type CommentStatus,
  type CountQuery,
  type EraseResult,
  type EraseTarget,
  isPerson,
  LABELS,
  type LabelName,
  type LabelOp,
  MAX_BULK,
  MAX_LABELS,
  type ModerateAction,
  type ModerationOp,
  type ModerationResult,
  NOTE_MAX,
  num,
  type PreparedReport,
  type PreparedSubmission,
  REASON_CODES,
  RENDER_PAGE_SIZE,
  type ReasonCode,
  type RenderItem,
  type RenderPage,
  type ReportReason,
  type StaffReply,
  type SubmitResult,
  type ThreadInput,
  type ThreadRow,
  type ThreadState,
} from "../model.ts";
import {
  CONTRACT_FORBIDDEN,
  checkName,
  checkText,
  normalizeName,
  normalizeText,
} from "../normalize.ts";
import type { SubmissionStore } from "../pipeline.ts";
import {
  COMMENTS_TAG_PREFIX,
  commentsCacheTag,
  type PurgeLogEntry,
  type PurgePriority,
  type PurgeQueueRow,
  purgeBackoffMs,
} from "../purge.ts";
import {
  PURGE_LOG_KEEP_MS,
  type RetentionPlan,
  type RetentionReport,
  type RetentionStepKind,
} from "../retention.ts";
import {
  applySettingsInput,
  type CommentSettings,
  type CommentSettingsInput,
  defaultCommentSettings,
} from "../settings.ts";
import {
  type CommentRow,
  SETTINGS_COLUMNS,
  type SettingsRow,
  settingsValues,
  toComment,
  toSettings,
} from "./rows.ts";

const COMMENT_ID = /^cmt_[A-Za-z0-9]{6,32}$/;
const PERSON_ID = /^user_[A-Za-z0-9]{6,32}$/;
const ERASED_AUTHOR = JSON.stringify({ kind: "erased" });
const json = (v: unknown) => JSON.stringify(v);

/** Which statuses each action may move a comment from (RFC-0007 §4.2), and where to. */
const TRANSITIONS: Record<ModerateAction, { from: readonly CommentStatus[]; to: CommentStatus }> = {
  approve: { from: ["pending", "hidden", "spam"], to: "approved" },
  restore: { from: ["hidden", "spam"], to: "approved" },
  hide: { from: ["pending", "approved", "spam"], to: "hidden" },
  spam: { from: ["pending", "approved", "hidden"], to: "spam" },
  hold: { from: ["approved", "hidden", "spam"], to: "pending" },
  delete: { from: ["pending", "approved", "hidden", "spam"], to: "deleted" },
};
const NEEDS_REASON: readonly ModerateAction[] = ["hide", "spam", "delete"];
const PERSON_ONLY: readonly ModerateAction[] = ["approve", "restore", "delete"];

export interface SqlCommentStoreOptions {
  readonly now?: () => Date;
}

/** Thread write options: the purge the change needs (the caller knows the effective states). */
export interface PutThreadOptions {
  readonly purge?: PurgePriority | null;
  readonly audit?: readonly AuditStatement[];
}

/** What `comments_summary` and Studio's "Today" read (RFC-0007 §11.1): counts, never reader text. */
export interface CommentSummaryStats {
  /** Guest comments created since `since`. */
  readonly newComments: number;
  /** Entries with the most new guest comments since `since`, at most 10. */
  readonly busiest: readonly { readonly nodeId: string; readonly comments: number }[];
  /** Labels on comments created since `since`. */
  readonly labels: Readonly<Partial<Record<LabelName, number>>>;
  /** Pending comments of any age: how many, the oldest and the median creation time. */
  readonly pending: {
    readonly count: number;
    readonly oldestAt: string | null;
    readonly medianAt: string | null;
  };
  /**
   * Pending or approved comments since `since` labelled `question` or `needs-reply` that no staff
   * reply answers yet.
   */
  readonly unansweredQuestions: number;
}

export interface BanInput {
  /** The comment whose author is banned; the store resolves its hashes. */
  readonly commentId: CommentId;
  readonly subjects: readonly BanSubject[];
  /** `null` = until lifted. */
  readonly until: string | null;
  readonly reasonCode: ReasonCode;
  readonly note?: string;
  readonly by: Actor;
}

function assertNote(note: string | undefined): void {
  if (note === undefined) return;
  if (typeof note !== "string" || note.length > NOTE_MAX || CONTRACT_FORBIDDEN.test(note))
    throw new CommentInputError(`a note is plain text of at most ${NOTE_MAX} characters`);
}

function assertIds(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK)
    throw new CommentInputError(`between 1 and ${MAX_BULK} comment ids`);
  if (new Set(ids).size !== ids.length) throw new CommentInputError("comment ids repeat");
  for (const id of ids)
    if (!COMMENT_ID.test(id))
      throw new CommentInputError(`"${String(id).slice(0, 40)}" is not a comment id`);
}

const encodeCursor = (createdAt: string, id: string) =>
  toBase64Url(utf8(JSON.stringify([createdAt, id])));

function decodeCursor(cursor: string): [string, string] {
  const bytes = fromBase64Url(cursor);
  try {
    const v = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as unknown) : undefined;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string")
      return [v[0], v[1]];
  } catch {
    // fall through
  }
  throw new CommentInputError("invalid cursor");
}

const auditStatements = (audit: readonly AuditStatement[] | undefined): SqlStatement[] =>
  (audit ?? []).map((a) => ({ sql: a.sql, params: (a.params ?? []) as SqlValue[] }));

export class SqlCommentStore implements SubmissionStore {
  readonly sql: SqlDriver;
  readonly #now: () => Date;

  constructor(sql: SqlDriver, options: SqlCommentStoreOptions = {}) {
    this.sql = sql;
    this.#now = options.now ?? (() => new Date());
  }

  // ───────────────────────────── settings ─────────────────────────────

  /** A site's settings: the stored row, or the defaults (`rev: 0`, comments off). */
  async settings(siteId: string): Promise<CommentSettings> {
    const row = await this.sql.get<SettingsRow>(
      "SELECT * FROM comment_settings WHERE site_id = ?",
      [siteId],
    );
    return row ? toSettings(row) : defaultCommentSettings(siteId);
  }

  /**
   * CAS on `rev` (one statement): `rev` 0 inserts the first row, later writes need the current
   * `rev`. A stale `rev` throws `CommentConflictError` and changes nothing.
   */
  async putSettings(
    siteId: string,
    input: CommentSettingsInput,
    rev: number,
    by: string,
  ): Promise<{ before: CommentSettings; after: CommentSettings }> {
    const before = await this.settings(siteId);
    if (before.rev !== rev)
      throw new CommentConflictError("comment settings changed somewhere else");
    const next = applySettingsInput(before, input);
    const stamp = this.#now().toISOString();
    const values = settingsValues(next);
    const res =
      rev === 0
        ? await this.sql.run(
            `INSERT INTO comment_settings (${SETTINGS_COLUMNS}, updated_at, updated_by, site_id, rev)
             VALUES (${values.map(() => "?").join(", ")}, ?, ?, ?, 1) ON CONFLICT (site_id) DO NOTHING`,
            [...values, stamp, by, siteId],
          )
        : await this.sql.run(
            `UPDATE comment_settings SET ${SETTINGS_COLUMNS.split(", ")
              .map((c) => `${c} = ?`)
              .join(
                ", ",
              )}, updated_at = ?, updated_by = ?, rev = rev + 1 WHERE site_id = ? AND rev = ?`,
            [...values, stamp, by, siteId, rev],
          );
    if (res.changes !== 1)
      throw new CommentConflictError("comment settings changed somewhere else");
    return { before, after: { ...next, rev: rev + 1, updatedAt: stamp, updatedBy: by } };
  }

  // ───────────────────────────── secrets ─────────────────────────────

  /** Stores an owner-supplied secret, encrypted (write-only through the API). */
  async putSecret(
    siteId: string,
    name: string,
    value: string,
    keys: CommentKeys,
    by: string,
  ): Promise<void> {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new CommentInputError("invalid secret name");
    if (typeof value !== "string" || value.length === 0 || value.length > 4096)
      throw new CommentInputError("a secret is 1 to 4,096 characters");
    const sealed = await sealSecret(keys, siteId, name, value);
    await this.sql.run(
      `INSERT INTO comment_secrets (site_id, name, ciphertext, iv, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id, name) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [siteId, name, sealed.ciphertext, sealed.iv, this.#now().toISOString(), by],
    );
  }

  /** The decrypted secret (site Worker only), or `null`. */
  async readSecret(siteId: string, name: string, keys: CommentKeys): Promise<string | null> {
    const row = await this.sql.get<{ ciphertext: string; iv: string }>(
      "SELECT ciphertext, iv FROM comment_secrets WHERE site_id = ? AND name = ?",
      [siteId, name],
    );
    return row ? openSecret(keys, siteId, name, row) : null;
  }

  /** Whether a secret is stored and when (Studio shows "Saved"), never its value. */
  async secretInfo(
    siteId: string,
    name: string,
  ): Promise<{ updatedAt: string; updatedBy: string } | null> {
    const row = await this.sql.get<{ updated_at: string; updated_by: string }>(
      "SELECT updated_at, updated_by FROM comment_secrets WHERE site_id = ? AND name = ?",
      [siteId, name],
    );
    return row ? { updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
  }

  async deleteSecret(siteId: string, name: string): Promise<boolean> {
    return (
      (
        await this.sql.run("DELETE FROM comment_secrets WHERE site_id = ? AND name = ?", [
          siteId,
          name,
        ])
      ).changes === 1
    );
  }

  // ───────────────────────────── threads ─────────────────────────────

  async thread(siteId: string, nodeId: string): Promise<ThreadRow | null> {
    const r = await this.sql.get<Record<string, unknown>>(
      "SELECT * FROM comment_threads WHERE site_id = ? AND node_id = ?",
      [siteId, nodeId],
    );
    if (!r) return null;
    return {
      siteId,
      nodeId,
      mode: String(r.mode) as ThreadRow["mode"],
      closesAt: r.closes_at === null ? null : String(r.closes_at),
      rev: num(r.rev),
      updatedAt: String(r.updated_at),
      updatedBy: String(r.updated_by),
    };
  }

  /**
   * Sets an entry's thread override with CAS on `rev` (`0` when no row exists). The purge row the
   * change needs (`options.purge`, default `normal`; `hidden` should pass `takedown`) is upserted
   * in the same batch, guarded on what the CAS wrote.
   */
  async putThread(
    siteId: string,
    nodeId: string,
    input: ThreadInput,
    rev: number,
    by: string,
    options: PutThreadOptions = {},
  ): Promise<ThreadRow> {
    if (!["default", "open", "closed", "hidden"].includes(input.mode))
      throw new CommentInputError("mode must be default, open, closed or hidden");
    if (
      input.closesAt !== undefined &&
      input.closesAt !== null &&
      Number.isNaN(Date.parse(input.closesAt))
    )
      throw new CommentInputError("closesAt must be an ISO timestamp or null");
    const current = await this.thread(siteId, nodeId);
    if ((current?.rev ?? 0) !== rev)
      throw new CommentConflictError("the thread changed somewhere else");
    const closesAt =
      input.closesAt === undefined
        ? (current?.closesAt ?? null)
        : input.closesAt === null
          ? null
          : new Date(input.closesAt).toISOString();
    const stamp = this.#now().toISOString();
    const write: SqlStatement =
      rev === 0
        ? {
            sql: "INSERT INTO comment_threads (site_id, node_id, mode, closes_at, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT (site_id, node_id) DO NOTHING",
            params: [siteId, nodeId, input.mode, closesAt, stamp, by],
          }
        : {
            sql: "UPDATE comment_threads SET mode = ?, closes_at = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE site_id = ? AND node_id = ? AND rev = ?",
            params: [input.mode, closesAt, stamp, by, siteId, nodeId, rev],
          };
    const guard =
      "EXISTS (SELECT 1 FROM comment_threads WHERE site_id = ? AND node_id = ? AND rev = ? AND updated_at = ? AND updated_by = ? AND mode = ?)";
    const guardParams = [siteId, nodeId, rev + 1, stamp, by, input.mode];
    const purge = options.purge === undefined ? "normal" : options.purge;
    const statements: SqlStatement[] = [write];
    if (purge)
      statements.push(
        this.#purgeUpsert(siteId, [commentsCacheTag(nodeId)], purge, stamp, guard, guardParams),
      );
    statements.push(...auditStatements(options.audit));
    const [res] = await this.sql.batch(statements);
    if (res?.changes !== 1) throw new CommentConflictError("the thread changed somewhere else");
    return {
      siteId,
      nodeId,
      mode: input.mode,
      closesAt,
      rev: rev + 1,
      updatedAt: stamp,
      updatedBy: by,
    };
  }

  // ───────────────────────────── pipeline reads ─────────────────────────────

  async approvedComment(siteId: string, commentId: string) {
    if (!COMMENT_ID.test(commentId)) return null;
    const r = await this.sql.get<{ id: string; node_id: string; parent_id: string | null }>(
      "SELECT id, node_id, parent_id FROM comments WHERE id = ? AND site_id = ? AND status = 'approved'",
      [commentId, siteId],
    );
    return r ? { id: r.id, nodeId: r.node_id, parentId: r.parent_id } : null;
  }

  async readSalt(month: string): Promise<string | undefined> {
    const r = await this.sql.get<{ salt: string }>(
      "SELECT salt FROM comment_salts WHERE month = ?",
      [month],
    );
    return r?.salt;
  }

  async clientActivity(
    siteId: string,
    ipHmac: string,
    since: { hour: string; day: string; noScript: string },
  ): Promise<{ hour: number; day: number; noScript: number }> {
    const r = await this.sql.get<Record<string, unknown>>(
      `SELECT COUNT(*) AS day,
              COALESCE(SUM(created_at >= ?), 0) AS hour,
              COALESCE(SUM(proof = 'none' AND created_at >= ?), 0) AS no_script
       FROM comments WHERE site_id = ? AND ip_hmac = ? AND created_at >= ?`,
      [since.hour, since.noScript, siteId, ipHmac, since.day],
    );
    return { hour: num(r?.hour), day: num(r?.day), noScript: num(r?.no_script) };
  }

  async isDuplicate(siteId: string, nodeId: string, text: string, since: string): Promise<boolean> {
    const r = await this.sql.get(
      `SELECT 1 AS hit FROM (SELECT body FROM comments WHERE site_id = ? AND node_id = ? AND created_at >= ?
         ORDER BY created_at DESC LIMIT 200) WHERE body = ? LIMIT 1`,
      [siteId, nodeId, since, text],
    );
    return r !== undefined;
  }

  async storedSince(
    siteId: string,
    since: string,
  ): Promise<{ total: number; withoutScript: number }> {
    const r = await this.sql.get<Record<string, unknown>>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(proof = 'none'), 0) AS no_script FROM comments
       WHERE site_id = ? AND created_at >= ? AND proof IN ('pow', 'turnstile', 'none')`,
      [siteId, since],
    );
    return { total: num(r?.total), withoutScript: num(r?.no_script) };
  }

  async pendingOnEntry(siteId: string, nodeId: string): Promise<number> {
    const r = await this.sql.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM comments WHERE site_id = ? AND node_id = ? AND status = 'pending'",
      [siteId, nodeId],
    );
    return num(r?.n);
  }

  async isBanned(
    siteId: string,
    subjects: { emailHmac?: string; ipHmac?: string },
    now: string,
  ): Promise<boolean> {
    if (!subjects.emailHmac && !subjects.ipHmac) return false;
    const r = await this.sql.get(
      `SELECT 1 AS hit FROM comment_bans WHERE site_id = ?
         AND ((subject = 'email' AND value = ?) OR (subject = 'ip' AND value = ?))
         AND (until IS NULL OR until > ?) LIMIT 1`,
      [siteId, subjects.emailHmac ?? null, subjects.ipHmac ?? null, now],
    );
    return r !== undefined;
  }

  async reportActivity(
    siteId: string,
    ipHmac: string | null,
    since: { hour: string; day: string },
  ): Promise<{ clientHour: number; siteDay: number }> {
    // the site count is "since 00:00 UTC", the client count "in the last hour"
    const r = await this.sql.get<Record<string, unknown>>(
      `SELECT COALESCE(SUM(created_at >= ?), 0) AS site_day, COALESCE(SUM(ip_hmac = ? AND created_at >= ?), 0) AS client_hour
       FROM comment_reports WHERE site_id = ? AND created_at >= ?`,
      [since.day, ipHmac, since.hour, siteId, since.day < since.hour ? since.day : since.hour],
    );
    return { clientHour: num(r?.client_hour), siteDay: num(r?.site_day) };
  }

  // ───────────────────────────── submissions ─────────────────────────────

  #saltStatements(
    salt: PreparedSubmission["newSalt"],
    at: string,
  ): { pre: SqlStatement[]; guard: string; params: SqlValue[] } {
    if (!salt) return { pre: [], guard: "", params: [] };
    return {
      pre: [
        {
          sql: "INSERT OR IGNORE INTO comment_salts (month, salt, created_at) VALUES (?, ?, ?)",
          params: [salt.month, salt.salt, at],
        },
      ],
      guard: " AND EXISTS (SELECT 1 FROM comment_salts WHERE month = ? AND salt = ?)",
      params: [salt.month, salt.salt],
    };
  }

  async #afterIgnoredInsert(salt: PreparedSubmission["newSalt"]): Promise<SubmitResult> {
    if (salt && (await this.readSalt(salt.month)) !== salt.salt) return { saltConflict: true };
    return { duplicate: true };
  }

  /**
   * Stores a guest comment (§6.2 step 12) in one batch: the commenter email row when given
   * (`INSERT OR IGNORE`, one row per address and site) and the comment, whose `email_id` comes from
   * a sub-select. A replayed challenge hits the unique index on `challenge_id` and is answered
   * `{ duplicate: true }` with nothing written.
   */
  async submit(siteId: string, p: PreparedSubmission): Promise<SubmitResult> {
    if (!COMMENT_ID.test(p.id)) throw new CommentInputError("invalid comment id");
    const record: Comment = {
      schemaVersion: 1,
      id: p.id,
      siteId,
      nodeId: p.nodeId,
      ...(p.parentId ? { parentId: p.parentId } : {}),
      ...(p.inReplyToId ? { inReplyToId: p.inReplyToId } : {}),
      source: "native",
      author: { kind: "guest", name: p.name },
      body: { format: "text", text: p.text },
      status: p.status,
      ...(p.labels.length > 0 ? { labels: [...p.labels] } : {}),
      ...(p.moderation ? { moderation: p.moderation } : {}),
      createdAt: p.createdAt,
      rev: 1,
    };
    const hash = await commentRecordHash(record);
    const salt = this.#saltStatements(p.newSalt, p.createdAt);
    const statements: SqlStatement[] = [...salt.pre];
    if (p.email)
      statements.push(this.#emailInsert(siteId, p.email, p.createdAt, "comments", p.challengeId));
    statements.push({
      sql: `INSERT OR IGNORE INTO comments (id, site_id, node_id, parent_id, in_reply_to_id, source, origin, author, body, status, labels, moderation, email_id, ip_hmac, challenge_id, proof, op, hash, created_at, edited_at, rev)
            SELECT ?, ?, ?, ?, ?, 'native', NULL, ?, ?, ?, ?, ?, ${p.email ? "(SELECT id FROM commenter_emails WHERE site_id = ? AND email_hmac = ?)" : "NULL"}, ?, ?, ?, NULL, ?, ?, NULL, 1
            WHERE 1 = 1${salt.guard}`,
      params: [
        p.id,
        siteId,
        p.nodeId,
        p.parentId ?? null,
        p.inReplyToId ?? null,
        json(record.author),
        p.text,
        p.status,
        json(p.labels),
        p.moderation ? json(p.moderation) : null,
        ...(p.email ? [siteId, p.email.hmac] : []),
        p.ipHmac,
        p.challengeId,
        p.proof,
        hash,
        p.createdAt,
        ...salt.params,
      ],
    });
    const results = await this.sql.batch(statements);
    if (results.at(-1)?.changes !== 1) return this.#afterIgnoredInsert(p.newSalt);
    return { id: p.id };
  }

  #emailInsert(
    siteId: string,
    e: NonNullable<PreparedSubmission["email"]>,
    at: string,
    table: "comments" | "comment_reports",
    challengeId: string | null,
  ): SqlStatement {
    // a replayed challenge must not leave an email row behind
    const guard = challengeId
      ? ` WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE challenge_id = ?)`
      : "";
    return {
      sql: `INSERT OR IGNORE INTO commenter_emails (id, site_id, email_hmac, email_ciphertext, email_iv, created_at) SELECT ?, ?, ?, ?, ?, ?${guard}`,
      params: [e.id, siteId, e.hmac, e.ciphertext, e.iv, at, ...(challengeId ? [challengeId] : [])],
    };
  }

  /** Stores a report (§6.6) of a comment that is still approved; a report never changes it. */
  async report(siteId: string, p: PreparedReport): Promise<SubmitResult> {
    const salt = this.#saltStatements(p.newSalt, p.createdAt);
    const statements: SqlStatement[] = [...salt.pre];
    if (p.email)
      statements.push(
        this.#emailInsert(siteId, p.email, p.createdAt, "comment_reports", p.challengeId),
      );
    statements.push({
      sql: `INSERT OR IGNORE INTO comment_reports (id, site_id, comment_id, reason, details, email_id, ip_hmac, challenge_id, created_at)
            SELECT ?, ?, ?, ?, ?, ${p.email ? "(SELECT id FROM commenter_emails WHERE site_id = ? AND email_hmac = ?)" : "NULL"}, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM comments WHERE id = ? AND site_id = ? AND status = 'approved')${salt.guard}`,
      params: [
        p.id,
        siteId,
        p.commentId,
        p.reason,
        p.details,
        ...(p.email ? [siteId, p.email.hmac] : []),
        p.ipHmac,
        p.challengeId,
        p.createdAt,
        p.commentId,
        siteId,
        ...salt.params,
      ],
    });
    const results = await this.sql.batch(statements);
    if (results.at(-1)?.changes !== 1) return this.#afterIgnoredInsert(p.newSalt);
    return { id: p.id };
  }

  // ───────────────────────────── reads ─────────────────────────────

  async get(siteId: string, id: string): Promise<Comment | null> {
    if (!COMMENT_ID.test(id)) return null;
    const r = await this.sql.get<CommentRow>(
      "SELECT * FROM comments WHERE id = ? AND site_id = ?",
      [id, siteId],
    );
    return r ? toComment(r) : null;
  }

  /** Several comments of a site in one read (≤ 50 ids; unknown ids are left out). */
  async getMany(siteId: string, ids: readonly string[]): Promise<Comment[]> {
    if (ids.length === 0) return [];
    if (ids.length > MAX_BULK) throw new CommentInputError(`at most ${MAX_BULK} comment ids`);
    const rows = await this.#rows(
      siteId,
      ids.filter((id) => COMMENT_ID.test(id)),
    );
    return ids.flatMap((id) => {
      const r = rows.get(id);
      return r ? [toComment(r)] : [];
    });
  }

  async #rows(siteId: string, ids: readonly string[]): Promise<Map<string, CommentRow>> {
    const rows = await this.sql.all<CommentRow>(
      "SELECT * FROM comments WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))",
      [siteId, json(ids)],
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Comments of a site, newest first by default, keyset-paginated (§11.1 `list_comments`). */
  async list(
    siteId: string,
    q: CommentQuery = {},
  ): Promise<{ comments: Comment[]; nextCursor?: string }> {
    const limit = q.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new CommentInputError("limit must be 1 to 50");
    const where = ["site_id = ?"];
    const params: SqlValue[] = [siteId];
    if (q.status === "reported") {
      where.push(
        "EXISTS (SELECT 1 FROM comment_reports r WHERE r.comment_id = comments.id AND r.resolved_at IS NULL)",
      );
    } else if (q.status !== undefined) {
      if (!["pending", "approved", "hidden", "spam", "deleted"].includes(q.status))
        throw new CommentInputError("unknown status");
      where.push("status = ?");
      params.push(q.status);
    }
    if (q.nodeId !== undefined) {
      where.push("node_id = ?");
      params.push(q.nodeId);
    }
    if (q.nodeIds !== undefined) {
      where.push("node_id IN (SELECT value FROM json_each(?))");
      params.push(json(q.nodeIds));
    }
    if (q.label !== undefined) {
      if (!(LABELS as readonly string[]).includes(q.label))
        throw new CommentInputError("unknown label");
      where.push(
        "EXISTS (SELECT 1 FROM json_each(comments.labels) l WHERE json_extract(l.value, '$.label') = ?)",
      );
      params.push(q.label);
    }
    if (q.since !== undefined) {
      where.push("created_at >= ?");
      params.push(q.since);
    }
    const newest = (q.order ?? "newest") === "newest";
    if (q.cursor !== undefined) {
      const [c, id] = decodeCursor(q.cursor);
      where.push(
        newest
          ? "(created_at < ? OR (created_at = ? AND id < ?))"
          : "(created_at > ? OR (created_at = ? AND id > ?))",
      );
      params.push(c, c, id);
    }
    const dir = newest ? "DESC" : "ASC";
    const rows = await this.sql.all<CommentRow>(
      `SELECT * FROM comments WHERE ${where.join(" AND ")} ORDER BY created_at ${dir}, id ${dir} LIMIT ?`,
      [...params, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      comments: page.map(toComment),
      ...(rows.length > limit && last
        ? { nextCursor: encodeCursor(last.created_at, last.id) }
        : {}),
    };
  }

  /** A thread in display order (§4.3): top-level oldest first, each followed by its replies. */
  async threadComments(
    siteId: string,
    nodeId: string,
    options: { includePending?: boolean } = {},
  ): Promise<Comment[]> {
    const statuses =
      options.includePending === false
        ? ["approved"]
        : ["pending", "approved", "hidden", "spam", "deleted"];
    const rows = await this.sql.all<CommentRow>(
      `SELECT * FROM comments WHERE site_id = ? AND node_id = ? AND status IN (SELECT value FROM json_each(?)) ORDER BY created_at, id LIMIT 1000`,
      [siteId, nodeId, json(statuses)],
    );
    const top = rows.filter((r) => !r.parent_id);
    const byParent = new Map<string, CommentRow[]>();
    for (const r of rows)
      if (r.parent_id) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
    const out: Comment[] = [];
    const placed = new Set<string>();
    for (const t of top) {
      out.push(toComment(t));
      placed.add(t.id);
      for (const r of byParent.get(t.id) ?? []) {
        out.push(toComment(r));
        placed.add(r.id);
      }
    }
    for (const r of rows) if (!placed.has(r.id)) out.push(toComment(r)); // replies whose parent left
    return out;
  }

  /**
   * One rendered page of approved comments (§8.1): up to 50 top-level comments, oldest first, with
   * their approved replies. A top-level comment that is no longer public but has approved replies
   * renders as "removed". `page` past the end returns no items (the renderer answers 404).
   */
  async renderPage(siteId: string, nodeId: string, page = 1): Promise<RenderPage> {
    if (!Number.isInteger(page) || page < 1) throw new CommentInputError("page must be 1 or more");
    const visibleTop = `parent_id IS NULL AND (status = 'approved' OR EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.status = 'approved'))`;
    const counts = await this.sql.get<{ total: number; tops: number }>(
      `SELECT (SELECT COUNT(*) FROM comments WHERE site_id = ? AND node_id = ? AND status = 'approved') AS total,
              (SELECT COUNT(*) FROM comments c WHERE c.site_id = ? AND c.node_id = ? AND ${visibleTop}) AS tops`,
      [siteId, nodeId, siteId, nodeId],
    );
    const total = num(counts?.total);
    const pageCount = Math.max(1, Math.ceil(num(counts?.tops) / RENDER_PAGE_SIZE));
    if (page > pageCount) return { items: [], total, page, pageCount };
    const tops = await this.sql.all<CommentRow>(
      `SELECT * FROM comments c WHERE c.site_id = ? AND c.node_id = ? AND ${visibleTop} ORDER BY c.created_at, c.id LIMIT ? OFFSET ?`,
      [siteId, nodeId, RENDER_PAGE_SIZE, (page - 1) * RENDER_PAGE_SIZE],
    );
    const replies =
      tops.length === 0
        ? []
        : await this.sql.all<CommentRow>(
            `SELECT * FROM comments WHERE site_id = ? AND node_id = ? AND status = 'approved' AND parent_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, id`,
            [siteId, nodeId, json(tops.map((t) => t.id))],
          );
    const items: RenderItem[] = tops.map((t) => {
      const rs = replies.filter((r) => r.parent_id === t.id).map(toComment);
      return t.status === "approved"
        ? { comment: toComment(t), replies: rs }
        : { removed: { id: t.id, createdAt: t.created_at }, replies: rs };
    });
    return { items, total, page, pageCount };
  }

  /** Counts by status and open reports, optionally for some entries (indexed COUNTs). */
  async counts(siteId: string, q: CountQuery = {}): Promise<CommentCounts> {
    const where = ["site_id = ?"];
    const params: SqlValue[] = [siteId];
    if (q.nodeId !== undefined) {
      where.push("node_id = ?");
      params.push(q.nodeId);
    }
    if (q.nodeIds !== undefined) {
      where.push("node_id IN (SELECT value FROM json_each(?))");
      params.push(json(q.nodeIds));
    }
    const rows = await this.sql.all<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM comments WHERE ${where.join(" AND ")} GROUP BY status`,
      params,
    );
    const reported = await this.sql.get<{ n: number }>(
      `SELECT COUNT(DISTINCT r.comment_id) AS n FROM comment_reports r JOIN comments c ON c.id = r.comment_id
       WHERE r.site_id = ? AND r.resolved_at IS NULL AND c.${where.join(" AND c.")}`,
      [siteId, ...params],
    );
    const out: CommentCounts = {
      pending: 0,
      approved: 0,
      hidden: 0,
      spam: 0,
      deleted: 0,
      reported: num(reported?.n),
    };
    for (const r of rows) if (r.status in out) out[r.status as CommentStatus] = num(r.n);
    return out;
  }

  /** Entries of a site that have comments (the hourly job looks for deleted entries among them). */
  async nodeIds(siteId: string): Promise<string[]> {
    const rows = await this.sql.all<{ node_id: string }>(
      "SELECT DISTINCT node_id FROM comments WHERE site_id = ? ORDER BY node_id",
      [siteId],
    );
    return rows.map((r) => r.node_id);
  }

  /** Every thread override of a site (the hourly job computes closing times from them). */
  async threads(siteId: string): Promise<ThreadRow[]> {
    const rows = await this.sql.all<Record<string, unknown>>(
      "SELECT * FROM comment_threads WHERE site_id = ? ORDER BY node_id",
      [siteId],
    );
    return rows.map((r) => ({
      siteId,
      nodeId: String(r.node_id),
      mode: String(r.mode) as ThreadRow["mode"],
      closesAt: r.closes_at === null ? null : String(r.closes_at),
      rev: num(r.rev),
      updatedAt: String(r.updated_at),
      updatedBy: String(r.updated_by),
    }));
  }

  /**
   * Activity since `since` for summaries (RFC-0007 §11.1 `comments_summary`): five indexed reads,
   * counts only. `nodeIds` limits it to some entries (an Author's own).
   */
  async summary(
    siteId: string,
    since: string,
    q: { readonly nodeIds?: readonly string[] } = {},
  ): Promise<CommentSummaryStats> {
    const scope = q.nodeIds ? " AND c.node_id IN (SELECT value FROM json_each(?))" : "";
    const scopeParams: SqlValue[] = q.nodeIds ? [json(q.nodeIds)] : [];
    const guest = "c.proof IN ('pow', 'turnstile', 'none', 'import')";
    const busiest = await this.sql.all<{ node_id: string; n: number }>(
      `SELECT c.node_id, COUNT(*) AS n FROM comments c WHERE c.site_id = ? AND c.created_at >= ? AND ${guest}${scope}
       GROUP BY c.node_id ORDER BY n DESC, c.node_id LIMIT 10`,
      [siteId, since, ...scopeParams],
    );
    const total = await this.sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM comments c WHERE c.site_id = ? AND c.created_at >= ? AND ${guest}${scope}`,
      [siteId, since, ...scopeParams],
    );
    const labels = await this.sql.all<{ label: string; n: number }>(
      `SELECT json_extract(l.value, '$.label') AS label, COUNT(*) AS n FROM comments c, json_each(c.labels) l
       WHERE c.site_id = ? AND c.created_at >= ?${scope} GROUP BY label ORDER BY label`,
      [siteId, since, ...scopeParams],
    );
    const pending = await this.sql.get<{ n: number; oldest: string | null }>(
      `SELECT COUNT(*) AS n, MIN(c.created_at) AS oldest FROM comments c WHERE c.site_id = ? AND c.status = 'pending'${scope}`,
      [siteId, ...scopeParams],
    );
    const n = num(pending?.n);
    const median =
      n === 0
        ? undefined
        : await this.sql.get<{ created_at: string }>(
            `SELECT c.created_at FROM comments c WHERE c.site_id = ? AND c.status = 'pending'${scope}
             ORDER BY c.created_at LIMIT 1 OFFSET ?`,
            [siteId, ...scopeParams, Math.floor((n - 1) / 2)],
          );
    const unanswered = await this.sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM comments c WHERE c.site_id = ? AND c.created_at >= ? AND c.status IN ('pending', 'approved')${scope}
         AND EXISTS (SELECT 1 FROM json_each(c.labels) l WHERE json_extract(l.value, '$.label') IN ('question', 'needs-reply'))
         AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.site_id = c.site_id AND r.proof = 'staff'
           AND (r.in_reply_to_id = c.id OR (r.parent_id = c.id AND r.in_reply_to_id IS NULL)))`,
      [siteId, since, ...scopeParams],
    );
    const labelCounts: Partial<Record<LabelName, number>> = {};
    for (const l of labels)
      if ((LABELS as readonly string[]).includes(l.label))
        labelCounts[l.label as LabelName] = num(l.n);
    return {
      newComments: num(total?.n),
      busiest: busiest.map((b) => ({ nodeId: b.node_id, comments: num(b.n) })),
      labels: labelCounts,
      pending: {
        count: n,
        oldestAt: pending?.oldest ?? null,
        medianAt: median?.created_at ?? null,
      },
      unansweredQuestions: num(unanswered?.n),
    };
  }

  /** The `cm1:` binding of an approval to these comments and threads (§10.3). */
  async stateHash(
    siteId: string,
    ids: readonly string[],
    threads: readonly { readonly nodeId: string; readonly state: ThreadState }[],
  ): Promise<string> {
    const rows = await this.#rows(siteId, ids);
    const threadRevs = new Map<string, number>();
    if (threads.length > 0) {
      const tr = await this.sql.all<{ node_id: string; rev: number }>(
        "SELECT node_id, rev FROM comment_threads WHERE site_id = ? AND node_id IN (SELECT value FROM json_each(?))",
        [siteId, json(threads.map((t) => t.nodeId))],
      );
      for (const t of tr) threadRevs.set(t.node_id, num(t.rev));
    }
    return commentStateHash({
      comments: ids.map((id) => {
        const r = rows.get(id);
        return r
          ? { id, rev: num(r.rev), status: r.status as CommentStatus }
          : { id, rev: 0, status: "missing" as const };
      }),
      threads: threads.map((t) => ({
        nodeId: t.nodeId,
        rev: threadRevs.get(t.nodeId) ?? 0,
        state: t.state,
      })),
    });
  }

  /** A comment's moderation history (statements of reasons), oldest first. */
  async history(siteId: string, commentId: string): Promise<CommentEvent[]> {
    const rows = await this.sql.all<Record<string, unknown>>(
      "SELECT * FROM comment_events WHERE comment_id = ? AND site_id = ? ORDER BY at, id",
      [commentId, siteId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      commentId: String(r.comment_id),
      action: String(r.action) as CommentEvent["action"],
      actor: JSON.parse(String(r.actor)) as Actor,
      reasonCode: r.reason_code === null ? null : (String(r.reason_code) as ReasonCode),
      note: r.note === null ? null : String(r.note),
      automated: num(r.automated) === 1,
      approvalId: r.approval_id === null ? null : String(r.approval_id),
      op: r.op === null ? null : String(r.op),
      at: String(r.at),
    }));
  }

  // ───────────────────────────── moderation ─────────────────────────────

  /**
   * Moderates up to 50 comments in one batch of 2–3 statements plus the audit rows (§4.4):
   * a set-based UPDATE marks every comment whose `(id, rev)` still matches with a fresh `op` (and
   * its new `hash`); the events and the purge rows are inserted from the rows carrying that `op`.
   * Each comment is independent: the result says which were done and which met a conflict,
   * were not found, are not the caller's own, or cannot make that transition.
   */
  async moderate(siteId: string, op: ModerationOp): Promise<ModerationResult[]> {
    assertIds(op.ids);
    const t = TRANSITIONS[op.action];
    if (!t) throw new CommentInputError("unknown moderation action");
    if (PERSON_ONLY.includes(op.action) && !isPerson(op.actor))
      throw new CommentForbiddenError(`only a person can ${op.action} comments`);
    if (NEEDS_REASON.includes(op.action) && op.reasonCode === undefined)
      throw new CommentInputError(`${op.action} needs a reasonCode`);
    if (op.reasonCode !== undefined && !(REASON_CODES as readonly string[]).includes(op.reasonCode))
      throw new CommentInputError("unknown reasonCode");
    assertNote(op.note);
    for (const id of op.ids)
      if (!Number.isInteger(op.expectedRevs[id]))
        throw new CommentInputError(`expectedRevs has no rev for ${id}`);

    const now = this.#now().toISOString();
    const opId = newCommentsId(ID_PREFIX.op);
    const moderation: CommentModeration = {
      action: op.action,
      actor: op.actor,
      at: now,
      ...(op.reasonCode ? { reasonCode: op.reasonCode } : {}),
      ...(op.note ? { note: op.note } : {}),
      automated: !isPerson(op.actor),
    };
    const rows = await this.#rows(siteId, op.ids);
    const own = op.ownNodeIds ? new Set(op.ownNodeIds) : undefined;
    const early = new Map<string, ModerationResult>();
    const changes: [string, number, string][] = [];
    const purgeIds: string[] = [];
    for (const id of op.ids) {
      const r = rows.get(id);
      if (!r) early.set(id, { id, ok: false, error: "not_found" });
      else if (own && !own.has(r.node_id)) early.set(id, { id, ok: false, error: "not_own" });
      else if (num(r.rev) !== op.expectedRevs[id])
        early.set(id, { id, ok: false, error: "conflict" });
      else if (!t.from.includes(r.status as CommentStatus))
        early.set(id, { id, ok: false, error: "invalid_transition" });
      else {
        const before = toComment(r);
        const { body: _body, ...rest } = before;
        const after: Comment = {
          ...(op.action === "delete" ? rest : before),
          status: t.to,
          moderation,
          rev: before.rev + 1,
        };
        changes.push([id, before.rev, await commentRecordHash(after)]);
        if (t.to === "approved" || before.status === "approved") purgeIds.push(id);
      }
    }
    if (changes.length > 0) {
      const statements: SqlStatement[] = [
        {
          sql: `UPDATE comments SET status = ?, moderation = ?, rev = rev + 1, op = ?${op.action === "delete" ? ", body = NULL" : ""},
                  hash = (SELECT json_extract(j.value, '$[2]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comments.id)
                WHERE site_id = ? AND (id, rev) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))`,
          params: [t.to, json(moderation), opId, json(changes), siteId, json(changes)],
        },
        this.#eventsFromOp(
          siteId,
          opId,
          changes.map((c) => c[0]),
          op.action,
          op.actor,
          op.reasonCode ?? null,
          op.note ?? null,
          !isPerson(op.actor),
          op.approvalId ?? null,
          now,
        ),
      ];
      if (purgeIds.length > 0)
        statements.push(
          this.#purgeFromOp(
            siteId,
            opId,
            purgeIds,
            t.to === "approved" ? "normal" : "takedown",
            now,
          ),
        );
      statements.push(...auditStatements(op.audit));
      await this.sql.batch(statements);
    }
    return this.#results(siteId, op.ids, opId, early);
  }

  #eventsFromOp(
    siteId: string,
    opId: string,
    ids: readonly string[],
    action: string,
    actor: Actor,
    reasonCode: string | null,
    note: string | null,
    automated: boolean,
    approvalId: string | null,
    at: string,
  ): SqlStatement {
    return {
      sql: `INSERT INTO comment_events (id, site_id, comment_id, action, actor, reason_code, note, automated, approval_id, op, at)
            SELECT ? || '.' || id, site_id, id, ?, ?, ?, ?, ?, ?, op, ? FROM comments
            WHERE site_id = ? AND id IN (SELECT value FROM json_each(?)) AND op = ?`,
      params: [
        opId,
        action,
        json(actor),
        reasonCode,
        note,
        automated ? 1 : 0,
        approvalId,
        at,
        siteId,
        json(ids),
        opId,
      ],
    };
  }

  #purgeFromOp(
    siteId: string,
    opId: string,
    ids: readonly string[],
    priority: PurgePriority,
    at: string,
  ): SqlStatement {
    return {
      sql: `INSERT INTO comment_purge_queue (site_id, tag, priority, enqueued_at, attempts, next_at)
            SELECT DISTINCT site_id, ? || node_id, ?, ?, 0, ? FROM comments
            WHERE site_id = ? AND id IN (SELECT value FROM json_each(?)) AND op = ?
            ${PURGE_UPSERT}`,
      params: [COMMENTS_TAG_PREFIX, priority, at, at, siteId, json(ids), opId],
    };
  }

  #purgeUpsert(
    siteId: string,
    tags: readonly string[],
    priority: PurgePriority,
    at: string,
    guard?: string,
    guardParams: readonly SqlValue[] = [],
  ): SqlStatement {
    return {
      sql: `INSERT INTO comment_purge_queue (site_id, tag, priority, enqueued_at, attempts, next_at)
            SELECT ?, value, ?, ?, 0, ? FROM json_each(?) WHERE ${guard ?? "1 = 1"}
            ${PURGE_UPSERT}`,
      params: [siteId, priority, at, at, json(tags), ...guardParams],
    };
  }

  async #results(
    siteId: string,
    ids: readonly string[],
    opId: string,
    early: Map<string, ModerationResult>,
  ): Promise<ModerationResult[]> {
    const pending = ids.filter((id) => !early.has(id));
    const after =
      pending.length > 0 ? await this.#rows(siteId, pending) : new Map<string, CommentRow>();
    return ids.map((id) => {
      const e = early.get(id);
      if (e) return e;
      const r = after.get(id);
      if (!r) return { id, ok: false, error: "not_found" };
      if (r.op === opId)
        return { id, ok: true, status: r.status as CommentStatus, rev: num(r.rev) };
      return { id, ok: false, error: "conflict" };
    });
  }

  /**
   * Adds and removes advisory labels (§6.7, §11.1) on up to 50 comments: one UPDATE with each
   * comment's new labels and hash, one event insert, plus the audit rows. Labels bump `rev` (an
   * approval requested before a label changed is void) but never change status or purge (C9).
   * Agents add and remove only `agent` labels.
   */
  async label(siteId: string, op: LabelOp): Promise<ModerationResult[]> {
    const ids = op.items.map((i) => i.commentId);
    assertIds(ids);
    if (!["agent", "person", "classifier"].includes(op.source))
      throw new CommentInputError("unknown label source");
    if (op.source === "person" && !isPerson(op.actor))
      throw new CommentForbiddenError("person labels need a person");
    for (const item of op.items) {
      for (const l of [...(item.add ?? []), ...(item.remove ?? [])])
        if (!(LABELS as readonly string[]).includes(l))
          throw new CommentInputError(`unknown label "${String(l).slice(0, 40)}"`);
      if (
        item.confidence !== undefined &&
        (!Number.isInteger(item.confidence) || item.confidence < 0 || item.confidence > 100)
      )
        throw new CommentInputError("confidence is a whole number from 0 to 100");
    }
    const now = this.#now().toISOString();
    const opId = newCommentsId(ID_PREFIX.op);
    const rows = await this.#rows(siteId, ids);
    const own = op.ownNodeIds ? new Set(op.ownNodeIds) : undefined;
    const early = new Map<string, ModerationResult>();
    const changes: [string, number, string, string][] = [];
    for (const item of op.items) {
      const id = item.commentId;
      const r = rows.get(id);
      const expected = op.expectedRevs?.[id];
      if (!r) {
        early.set(id, { id, ok: false, error: "not_found" });
        continue;
      }
      if (own && !own.has(r.node_id)) {
        early.set(id, { id, ok: false, error: "not_own" });
        continue;
      }
      if (expected !== undefined && num(r.rev) !== expected) {
        early.set(id, { id, ok: false, error: "conflict" });
        continue;
      }
      const before = toComment(r);
      const removable = (l: CommentLabel) => op.source === "person" || l.source === op.source;
      const remove = new Set<LabelName>([...(item.remove ?? []), ...(item.add ?? [])]);
      let labels = (before.labels ?? []).filter((l) => !(remove.has(l.label) && removable(l)));
      for (const name of item.add ?? []) {
        if (labels.some((l) => l.label === name && l.source === op.source)) continue;
        labels.push({
          label: name,
          source: op.source,
          ...(op.source === "classifier" ? {} : { by: op.actor }),
          ...(item.confidence !== undefined ? { confidence: item.confidence } : {}),
          at: now,
        });
      }
      if (labels.length > MAX_LABELS) labels = labels.slice(labels.length - MAX_LABELS);
      if (json(labels) === json(before.labels ?? [])) {
        early.set(id, { id, ok: true, status: before.status, rev: before.rev });
        continue;
      }
      const after: Comment = { ...before, rev: before.rev + 1 };
      if (labels.length > 0) after.labels = labels;
      else delete after.labels;
      changes.push([id, before.rev, await commentRecordHash(after), json(labels)]);
    }
    if (changes.length > 0) {
      const summary = op.items
        .map((i) =>
          [...(i.add ?? []).map((l) => `+${l}`), ...(i.remove ?? []).map((l) => `-${l}`)].join(" "),
        )
        .find((s) => s.length > 0);
      await this.sql.batch([
        {
          sql: `UPDATE comments SET rev = rev + 1, op = ?,
                  hash = (SELECT json_extract(j.value, '$[2]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comments.id),
                  labels = (SELECT json_extract(j.value, '$[3]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comments.id)
                WHERE site_id = ? AND (id, rev) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))`,
          params: [opId, json(changes), json(changes), siteId, json(changes)],
        },
        this.#eventsFromOp(
          siteId,
          opId,
          changes.map((c) => c[0]),
          "label",
          op.actor,
          null,
          summary ? summary.slice(0, NOTE_MAX) : null,
          !isPerson(op.actor),
          null,
          now,
        ),
        ...auditStatements(op.audit),
      ]);
    }
    return this.#results(siteId, ids, opId, early);
  }

  /**
   * A person's reply on the site's behalf (§4.2): stored `approved` at once, under the comment it
   * answers (two levels). One batch: the comment (guarded on its parent still being approved), the
   * `reply` event and the normal purge row (both guarded on the new hash), and the audit rows.
   */
  async reply(siteId: string, input: StaffReply): Promise<Comment> {
    if (!PERSON_ID.test(input.person.id))
      throw new CommentForbiddenError("a reply on the site's behalf is a person's");
    if (input.badge !== "author" && input.badge !== "team")
      throw new CommentInputError("badge must be author or team");
    const name = normalizeName(input.person.name);
    if (checkName(name)) throw new CommentInputError("invalid name");
    const text = normalizeText(input.text);
    if (checkText(text)) throw new CommentInputError("a reply is 2 to 5,000 characters");
    const parent = await this.get(siteId, input.commentId);
    if (!parent) throw new CommentNotFoundError("the comment answered does not exist");
    if (parent.status !== "approved")
      throw new CommentInputError("replies go only to approved comments");
    const now = this.#now().toISOString();
    const record: Comment = {
      schemaVersion: 1,
      id: newCommentsId(ID_PREFIX.comment),
      siteId,
      nodeId: parent.nodeId,
      parentId: parent.parentId ?? parent.id,
      ...(parent.parentId ? { inReplyToId: parent.id } : {}),
      source: "native",
      author: {
        kind: "staff",
        personId: input.person.id,
        name,
        badge: input.badge,
        ...(input.draftedBy ? { draftedBy: input.draftedBy } : {}),
      },
      body: { format: "text", text },
      status: "approved",
      createdAt: now,
      rev: 1,
    };
    const hash = await commentRecordHash(record);
    const actor: Actor = { kind: "human", id: input.person.id, name };
    const guard = "EXISTS (SELECT 1 FROM comments WHERE id = ? AND hash = ?)";
    const [res] = await this.sql.batch([
      {
        sql: `INSERT INTO comments (id, site_id, node_id, parent_id, in_reply_to_id, source, origin, author, body, status, labels, moderation, email_id, ip_hmac, challenge_id, proof, op, hash, created_at, edited_at, rev)
              SELECT ?, ?, ?, ?, ?, 'native', NULL, ?, ?, 'approved', '[]', NULL, NULL, NULL, NULL, 'staff', NULL, ?, ?, NULL, 1
              WHERE EXISTS (SELECT 1 FROM comments WHERE id = ? AND site_id = ? AND status = 'approved' AND rev = ?)`,
        params: [
          record.id,
          siteId,
          record.nodeId,
          record.parentId ?? null,
          record.inReplyToId ?? null,
          json(record.author),
          text,
          hash,
          now,
          parent.id,
          siteId,
          parent.rev,
        ],
      },
      {
        sql: `INSERT INTO comment_events (id, site_id, comment_id, action, actor, reason_code, note, automated, approval_id, op, at)
              SELECT ?, ?, ?, 'reply', ?, NULL, NULL, 0, ?, NULL, ? WHERE ${guard}`,
        params: [
          `${record.id}.reply`,
          siteId,
          record.id,
          json(actor),
          input.approvalId ?? null,
          now,
          record.id,
          hash,
        ],
      },
      this.#purgeUpsert(siteId, [commentsCacheTag(record.nodeId)], "normal", now, guard, [
        record.id,
        hash,
      ]),
      ...auditStatements(input.audit),
    ]);
    if (res?.changes !== 1)
      throw new CommentConflictError("the comment answered changed; reload and retry");
    return record;
  }

  /** Edits a person's own staff reply (sets `editedAt`), CAS on `rev`; purges the entry. */
  async editReply(
    siteId: string,
    id: string,
    text: string,
    rev: number,
    personId: string,
  ): Promise<Comment> {
    const current = await this.get(siteId, id);
    if (!current) throw new CommentNotFoundError();
    if (current.author.kind !== "staff" || current.author.personId !== personId)
      throw new CommentForbiddenError("only the person who wrote a reply can edit it");
    if (current.rev !== rev) throw new CommentConflictError();
    const normal = normalizeText(text);
    if (checkText(normal)) throw new CommentInputError("a reply is 2 to 5,000 characters");
    const now = this.#now().toISOString();
    const after: Comment = {
      ...current,
      body: { format: "text", text: normal },
      editedAt: now,
      rev: rev + 1,
    };
    const hash = await commentRecordHash(after);
    const [res] = await this.sql.batch([
      {
        sql: "UPDATE comments SET body = ?, edited_at = ?, rev = rev + 1, hash = ? WHERE id = ? AND site_id = ? AND rev = ?",
        params: [normal, now, hash, id, siteId, rev],
      },
      ...(current.status === "approved"
        ? [
            this.#purgeUpsert(
              siteId,
              [commentsCacheTag(current.nodeId)],
              "normal",
              now,
              "EXISTS (SELECT 1 FROM comments WHERE id = ? AND hash = ?)",
              [id, hash],
            ),
          ]
        : []),
    ]);
    if (res?.changes !== 1) throw new CommentConflictError();
    return after;
  }

  // ───────────────────────────── commenters, erasure ─────────────────────────────

  /** A commenter's id from their address's keyed hash, or from one of their comments. */
  async findCommenter(
    siteId: string,
    by: { emailHmac: string } | { commentId: string },
  ): Promise<string | null> {
    if ("emailHmac" in by) {
      const r = await this.sql.get<{ id: string }>(
        "SELECT id FROM commenter_emails WHERE site_id = ? AND email_hmac = ?",
        [siteId, by.emailHmac],
      );
      return r?.id ?? null;
    }
    const r = await this.sql.get<{ email_id: string | null }>(
      "SELECT email_id FROM comments WHERE id = ? AND site_id = ?",
      [by.commentId, siteId],
    );
    return r?.email_id ?? null;
  }

  /** A commenter with the decrypted address (`commenters:data` routes only, C10). */
  async commenter(
    siteId: string,
    commenterId: string,
    keys: CommentKeys,
  ): Promise<Commenter | null> {
    const r = await this.sql.get<Record<string, string>>(
      "SELECT id, email_ciphertext, email_iv, created_at FROM commenter_emails WHERE id = ? AND site_id = ?",
      [commenterId, siteId],
    );
    if (!r) return null;
    const email = await openEmail(keys, siteId, {
      ciphertext: String(r.email_ciphertext),
      iv: String(r.email_iv),
    });
    const comments = await this.sql.all<{ id: string }>(
      "SELECT id FROM comments WHERE email_id = ? AND site_id = ? ORDER BY created_at, id",
      [commenterId, siteId],
    );
    const reports = await this.sql.all<{ id: string }>(
      "SELECT id FROM comment_reports WHERE email_id = ? AND site_id = ? ORDER BY created_at, id",
      [commenterId, siteId],
    );
    return {
      id: String(r.id),
      email,
      firstSeen: String(r.created_at),
      commentIds: comments.map((c) => c.id),
      reportIds: reports.map((c) => c.id),
    };
  }

  /**
   * Erasure (§9.4, GDPR Art. 17), people with `commenters:data` only. `anonymise` (the default)
   * gives every comment the `erased` author and clears its email link, IP hash and challenge;
   * `delete-text` also removes the text (status `deleted`). The commenter's email row is deleted
   * and their reports lose the email. Each comment gets an `erase` event with reason
   * `erasure-request`; approved ones a takedown purge. Up to 200 comments a batch of ≤ 5 statements
   * plus the audit rows (on the last batch).
   */
  async erase(
    siteId: string,
    target: EraseTarget,
    mode: "anonymise" | "delete-text",
    by: Actor,
    options: { note?: string; audit?: readonly AuditStatement[] } = {},
  ): Promise<EraseResult> {
    if (!isPerson(by))
      throw new CommentForbiddenError("only a person can erase a commenter's data");
    if (mode !== "anonymise" && mode !== "delete-text")
      throw new CommentInputError("mode must be anonymise or delete-text");
    assertNote(options.note);
    const commenterId = target.commenterId;
    if (!commenterId && !target.commentIds?.length)
      throw new CommentInputError("name a commenter or comments");
    if (target.commentIds)
      for (const id of target.commentIds)
        if (!COMMENT_ID.test(id)) throw new CommentInputError("invalid comment id");
    if (commenterId) {
      const exists = await this.sql.get(
        "SELECT 1 AS hit FROM commenter_emails WHERE id = ? AND site_id = ?",
        [commenterId, siteId],
      );
      if (!exists) throw new CommentNotFoundError("no such commenter");
    }
    const now = this.#now().toISOString();
    const moderation: CommentModeration = {
      action: "erase",
      actor: by,
      at: now,
      reasonCode: "erasure-request",
      ...(options.note ? { note: options.note } : {}),
      automated: false,
    };
    const nodeIds = new Set<string>();
    let comments = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = commenterId
        ? await this.sql.all<CommentRow>(
            "SELECT * FROM comments WHERE site_id = ? AND email_id = ? ORDER BY id LIMIT 200",
            [siteId, commenterId],
          )
        : await this.sql.all<CommentRow>(
            `SELECT * FROM comments WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))
               AND (author != ? OR ip_hmac IS NOT NULL OR challenge_id IS NOT NULL OR email_id IS NOT NULL ${mode === "delete-text" ? "OR body IS NOT NULL" : ""}) ORDER BY id LIMIT 200`,
            [siteId, json(target.commentIds ?? []), ERASED_AUTHOR],
          );
      if (rows.length === 0) break;
      const opId = newCommentsId(ID_PREFIX.op);
      const changes: [string, number, string][] = [];
      const takedown: string[] = [];
      for (const r of rows) {
        const before = toComment(r);
        const { body: _b, ...rest } = before;
        const after: Comment = {
          ...(mode === "delete-text" ? rest : before),
          author: { kind: "erased" },
          ...(mode === "delete-text" && before.status !== "deleted"
            ? { status: "deleted" as const }
            : {}),
          moderation,
          rev: before.rev + 1,
        };
        changes.push([r.id, before.rev, await commentRecordHash(after)]);
        if (before.status === "approved") {
          takedown.push(r.id);
          nodeIds.add(r.node_id);
        }
      }
      const statements: SqlStatement[] = [
        {
          sql: `UPDATE comments SET author = ?, moderation = ?, rev = rev + 1, op = ?, email_id = NULL, ip_hmac = NULL, challenge_id = NULL
                  ${mode === "delete-text" ? ", body = NULL, status = 'deleted'" : ""},
                  hash = (SELECT json_extract(j.value, '$[2]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comments.id)
                WHERE site_id = ? AND (id, rev) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))`,
          params: [ERASED_AUTHOR, json(moderation), opId, json(changes), siteId, json(changes)],
        },
        this.#eventsFromOp(
          siteId,
          opId,
          changes.map((c) => c[0]),
          "erase",
          by,
          "erasure-request",
          options.note ?? null,
          false,
          null,
          now,
        ),
      ];
      if (takedown.length > 0)
        statements.push(this.#purgeFromOp(siteId, opId, takedown, "takedown", now));
      const results = await this.sql.batch(statements);
      comments += results[0]?.changes ?? 0;
    }
    let reports = 0;
    let emailDeleted = false;
    const tail: SqlStatement[] = [];
    if (commenterId) {
      tail.push(
        {
          sql: "UPDATE comment_reports SET email_id = NULL, ip_hmac = NULL, challenge_id = NULL WHERE site_id = ? AND email_id = ?",
          params: [siteId, commenterId],
        },
        {
          sql: "DELETE FROM commenter_emails WHERE id = ? AND site_id = ? AND NOT EXISTS (SELECT 1 FROM comments WHERE email_id = ?)",
          params: [commenterId, siteId, commenterId],
        },
      );
    }
    tail.push(...auditStatements(options.audit));
    if (tail.length > 0) {
      const res = await this.sql.batch(tail);
      if (commenterId) {
        reports = res[0]?.changes ?? 0;
        emailDeleted = (res[1]?.changes ?? 0) === 1;
      }
    }
    return { comments, reports, emailDeleted, nodeIds: [...nodeIds].sort() };
  }

  // ───────────────────────────── bans ─────────────────────────────

  /**
   * Bans a comment's author by email and/or this month's IP hash (§10.1: REST only, people). The
   * store resolves the hashes from the comment, so nobody needs to see an address. An IP ban
   * lasts until the month's salt rotates; a comment whose IP hash was already cleared has none.
   */
  async ban(siteId: string, input: BanInput): Promise<CommentBan[]> {
    if (!isPerson(input.by)) throw new CommentForbiddenError("bans are a person's decision");
    if (!(REASON_CODES as readonly string[]).includes(input.reasonCode))
      throw new CommentInputError("unknown reasonCode");
    assertNote(input.note);
    if (input.until !== null && Number.isNaN(Date.parse(input.until)))
      throw new CommentInputError("until must be an ISO timestamp or null");
    const row = await this.sql.get<{ ip_hmac: string | null; email_hmac: string | null }>(
      `SELECT c.ip_hmac, e.email_hmac FROM comments c LEFT JOIN commenter_emails e ON e.id = c.email_id WHERE c.id = ? AND c.site_id = ?`,
      [input.commentId, siteId],
    );
    if (!row) throw new CommentNotFoundError();
    const now = this.#now().toISOString();
    const out: CommentBan[] = [];
    const statements: SqlStatement[] = [];
    for (const subject of new Set(input.subjects)) {
      const value = subject === "email" ? row.email_hmac : row.ip_hmac;
      if (!value) continue;
      const id = newCommentsId(ID_PREFIX.ban);
      statements.push({
        sql: `INSERT INTO comment_bans (id, site_id, subject, value, until, reason_code, note, by_actor, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (site_id, subject, value) DO UPDATE SET until = excluded.until, reason_code = excluded.reason_code, note = excluded.note, by_actor = excluded.by_actor, at = excluded.at`,
        params: [
          id,
          siteId,
          subject,
          value,
          input.until,
          input.reasonCode,
          input.note ?? null,
          json(input.by),
          now,
        ],
      });
      out.push({
        id,
        subject,
        until: input.until,
        reasonCode: input.reasonCode,
        note: input.note ?? null,
        by: input.by,
        at: now,
      });
    }
    if (statements.length > 0) await this.sql.batch(statements);
    return out;
  }

  /**
   * The site's bans, newest first; with `commentId`, only those that match that comment's author
   * (its email's keyed hash or its network hash), so Studio can show and lift a commenter's ban
   * without anyone seeing an address.
   */
  async listBans(siteId: string, q: { commentId?: string } = {}): Promise<CommentBan[]> {
    const rows = q.commentId
      ? await this.sql.all<Record<string, unknown>>(
          `SELECT b.* FROM comment_bans b, comments c LEFT JOIN commenter_emails e ON e.id = c.email_id
            WHERE b.site_id = ? AND c.site_id = b.site_id AND c.id = ?
              AND ((b.subject = 'email' AND b.value = e.email_hmac) OR (b.subject = 'ip' AND b.value = c.ip_hmac))
            ORDER BY b.at DESC, b.id`,
          [siteId, q.commentId],
        )
      : await this.sql.all<Record<string, unknown>>(
          "SELECT * FROM comment_bans WHERE site_id = ? ORDER BY at DESC, id",
          [siteId],
        );
    return rows.map((r) => ({
      id: String(r.id),
      subject: String(r.subject) as BanSubject,
      until: r.until === null ? null : String(r.until),
      reasonCode: String(r.reason_code) as ReasonCode,
      note: r.note === null ? null : String(r.note),
      by: JSON.parse(String(r.by_actor)) as Actor,
      at: String(r.at),
    }));
  }

  async liftBan(siteId: string, banId: string): Promise<boolean> {
    return (
      (await this.sql.run("DELETE FROM comment_bans WHERE id = ? AND site_id = ?", [banId, siteId]))
        .changes === 1
    );
  }

  // ───────────────────────────── reports ─────────────────────────────

  async listReports(
    siteId: string,
    q: { open?: boolean; commentId?: string; limit?: number } = {},
  ): Promise<CommentReport[]> {
    const where = ["site_id = ?"];
    const params: SqlValue[] = [siteId];
    if (q.open === true) where.push("resolved_at IS NULL");
    if (q.open === false) where.push("resolved_at IS NOT NULL");
    if (q.commentId) {
      where.push("comment_id = ?");
      params.push(q.commentId);
    }
    const rows = await this.sql.all<Record<string, unknown>>(
      `SELECT * FROM comment_reports WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...params, Math.min(Math.max(q.limit ?? 50, 1), 200)],
    );
    return rows.map((r) => ({
      id: String(r.id),
      commentId: String(r.comment_id),
      reason: String(r.reason) as ReportReason,
      details: r.details === null ? null : String(r.details),
      hasEmail: r.email_id !== null,
      createdAt: String(r.created_at),
      resolvedAt: r.resolved_at === null ? null : String(r.resolved_at),
      resolvedBy: r.resolved_by === null ? null : String(r.resolved_by),
      resolution: r.resolution === null ? null : String(r.resolution),
    }));
  }

  /** One report of a site, or `null`. */
  async getReport(siteId: string, reportId: string): Promise<CommentReport | null> {
    const r = await this.sql.get<Record<string, unknown>>(
      "SELECT id, comment_id FROM comment_reports WHERE id = ? AND site_id = ?",
      [reportId, siteId],
    );
    if (!r) return null;
    const all = await this.listReports(siteId, { commentId: String(r.comment_id), limit: 200 });
    return all.find((x) => x.id === reportId) ?? null;
  }

  /** Commenter ids of a site, oldest first (a personal-data export; people only). */
  async commenterIds(siteId: string, limit = 1000): Promise<string[]> {
    const rows = await this.sql.all<{ id: string }>(
      "SELECT id FROM commenter_emails WHERE site_id = ? ORDER BY created_at, id LIMIT ?",
      [siteId, limit],
    );
    return rows.map((r) => r.id);
  }

  /** Records a person's decision on a report; a resolved report cannot be resolved again (409). */
  async resolveReport(
    siteId: string,
    reportId: string,
    resolution: string,
    by: Actor,
  ): Promise<void> {
    if (!/^[a-z][a-z-]{0,39}$/.test(resolution))
      throw new CommentInputError("resolution is a short code");
    const res = await this.sql.run(
      "UPDATE comment_reports SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE id = ? AND site_id = ? AND resolved_at IS NULL",
      [this.#now().toISOString(), json(by), resolution, reportId, siteId],
    );
    if (res.changes !== 1)
      throw new CommentConflictError("the report is resolved or does not exist");
  }

  // ───────────────────────────── purge queue ─────────────────────────────

  readonly purgeQueue = {
    /** A site's queued tags. */
    queued: async (siteId: string): Promise<PurgeQueueRow[]> => {
      const rows = await this.sql.all<Record<string, unknown>>(
        "SELECT * FROM comment_purge_queue WHERE site_id = ? ORDER BY enqueued_at, tag",
        [siteId],
      );
      return rows.map((r) => ({
        tag: String(r.tag),
        priority: String(r.priority) as PurgePriority,
        enqueuedAt: String(r.enqueued_at),
        attempts: num(r.attempts),
        nextAt: String(r.next_at),
      }));
    },
    /** Sites with queued tags (the hourly backstop). */
    sites: async (): Promise<string[]> =>
      (
        await this.sql.all<{ site_id: string }>(
          "SELECT DISTINCT site_id FROM comment_purge_queue ORDER BY site_id",
        )
      ).map((r) => r.site_id),
    /** Enqueues tags (settings changes, closing threads) in one statement. */
    enqueue: async (
      siteId: string,
      tags: readonly string[],
      priority: PurgePriority,
    ): Promise<void> => {
      if (tags.length === 0) return;
      await this.sql.batch([this.#purgeUpsert(siteId, tags, priority, this.#now().toISOString())]);
    },
    /** Purge requests of the last 60 s (any source), for the shared budget. */
    recent: async (now: Date = this.#now()): Promise<PurgeLogEntry[]> => {
      const rows = await this.sql.all<{ at: string; requests: number }>(
        "SELECT at, requests FROM cache_purge_log WHERE at > ? ORDER BY at",
        [new Date(now.getTime() - 60_000).toISOString()],
      );
      return rows.map((r) => ({ at: r.at, requests: num(r.requests) }));
    },
    /** Records a purge request sent by publishing or anything else (the publish path's one statement). */
    log: async (source: string, requests = 1, at: Date = this.#now()): Promise<void> => {
      await this.sql.run("INSERT INTO cache_purge_log (at, source, requests) VALUES (?, ?, ?)", [
        at.toISOString(),
        source,
        requests,
      ]);
    },
    /**
     * A request for `tags` succeeded: removes the rows not re-enqueued since `sentAt` (a change
     * after the request keeps its row) and logs the request, in one batch.
     */
    sent: async (siteId: string, tags: readonly string[], sentAt: Date): Promise<void> => {
      await this.sql.batch([
        {
          sql: "DELETE FROM comment_purge_queue WHERE site_id = ? AND tag IN (SELECT value FROM json_each(?)) AND next_at <= ?",
          params: [siteId, json(tags), sentAt.toISOString()],
        },
        {
          sql: "INSERT INTO cache_purge_log (at, source, requests) VALUES (?, 'comments', 1)",
          params: [sentAt.toISOString()],
        },
      ]);
    },
    /** A request failed: back off each row (30 s × 2^attempts, ≤ 5 min) and log the attempt. */
    failed: async (siteId: string, rows: readonly PurgeQueueRow[], at: Date): Promise<void> => {
      if (rows.length === 0) return;
      const next = rows.map((r) => [
        r.tag,
        new Date(at.getTime() + purgeBackoffMs(r.attempts)).toISOString(),
      ]);
      await this.sql.batch([
        {
          sql: `UPDATE comment_purge_queue SET attempts = attempts + 1,
                  next_at = (SELECT json_extract(j.value, '$[1]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comment_purge_queue.tag)
                WHERE site_id = ? AND tag IN (SELECT json_extract(value, '$[0]') FROM json_each(?)) AND next_at <= ?`,
          params: [json(next), siteId, json(next), at.toISOString()],
        },
        {
          sql: "INSERT INTO cache_purge_log (at, source, requests) VALUES (?, 'comments', 1)",
          params: [at.toISOString()],
        },
      ]);
    },
  };

  // ───────────────────────────── retention ─────────────────────────────

  readonly retention = {
    /**
     * Runs a site's retention plan in order, each step one bounded statement (two for client
     * data), stopping when the plan's row budget is spent (`more: true`; the next run continues).
     */
    run: async (siteId: string, plan: RetentionPlan): Promise<RetentionReport> => {
      let budget = plan.budget;
      const counts: Partial<Record<RetentionStepKind, number>> = {};
      const cut = new Map(plan.steps.map((s) => [s.kind, s.cutoff]));
      const noApprovedReplies =
        "NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.status = 'approved')";
      const decided = "COALESCE(json_extract(c.moderation, '$.at'), c.created_at)";
      const deleteComments = (status: string, timeExpr: string, cutoff: string) => ({
        sql: `DELETE FROM comments WHERE id IN (SELECT c.id FROM comments c WHERE c.site_id = ? AND c.status = ? AND ${timeExpr} < ? AND ${noApprovedReplies} LIMIT ?)`,
        params: [siteId, status, cutoff],
      });
      for (const step of plan.steps) {
        if (budget <= 0) break;
        let n = 0;
        const run = async (s: { sql: string; params: SqlValue[] }) => {
          const res = await this.sql.run(s.sql, [...s.params, budget - n]);
          n += res.changes;
        };
        switch (step.kind) {
          case "pending":
            await run(deleteComments("pending", "c.created_at", step.cutoff));
            break;
          case "spam":
          case "deleted":
          case "hidden":
            await run(deleteComments(step.kind, decided, step.cutoff));
            break;
          case "tombstones":
            n = await this.#tombstones(siteId, cut, budget);
            break;
          case "client-data":
            await run({
              sql: "UPDATE comments SET ip_hmac = NULL, challenge_id = NULL WHERE rowid IN (SELECT rowid FROM comments WHERE site_id = ? AND created_at < ? AND (ip_hmac IS NOT NULL OR challenge_id IS NOT NULL) LIMIT ?)",
              params: [siteId, step.cutoff],
            });
            if (budget - n > 0)
              await run({
                sql: "UPDATE comment_reports SET ip_hmac = NULL, challenge_id = NULL WHERE rowid IN (SELECT rowid FROM comment_reports WHERE site_id = ? AND created_at < ? AND (ip_hmac IS NOT NULL OR challenge_id IS NOT NULL) LIMIT ?)",
                params: [siteId, step.cutoff],
              });
            break;
          case "reports":
            await run({
              sql: "DELETE FROM comment_reports WHERE id IN (SELECT id FROM comment_reports WHERE site_id = ? AND resolved_at IS NOT NULL AND resolved_at < ? LIMIT ?)",
              params: [siteId, step.cutoff],
            });
            break;
          case "events":
            await run({
              sql: "DELETE FROM comment_events WHERE id IN (SELECT e.id FROM comment_events e WHERE e.site_id = ? AND e.at < ? AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = e.comment_id) LIMIT ?)",
              params: [siteId, step.cutoff],
            });
            break;
          case "emails":
            await run({
              sql: `DELETE FROM commenter_emails WHERE id IN (SELECT m.id FROM commenter_emails m WHERE m.site_id = ?
                      AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.email_id = m.id)
                      AND NOT EXISTS (SELECT 1 FROM comment_reports r WHERE r.email_id = m.id) LIMIT ?)`,
              params: [siteId],
            });
            break;
          case "bans":
            await run({
              sql: "DELETE FROM comment_bans WHERE id IN (SELECT id FROM comment_bans WHERE site_id = ? AND until IS NOT NULL AND until <= ? LIMIT ?)",
              params: [siteId, step.cutoff],
            });
            break;
        }
        counts[step.kind] = n;
        budget -= n;
      }
      return { counts, more: budget <= 0 };
    },
    /** Comments, reports and threads of entries deleted ≥ 30 days ago (`deletedEntriesDue`). */
    deleteEntries: async (
      siteId: string,
      nodeIds: readonly string[],
      budget = 500,
    ): Promise<number> => {
      if (nodeIds.length === 0) return 0;
      const [reports, comments] = await this.sql.batch([
        {
          sql: "DELETE FROM comment_reports WHERE site_id = ? AND comment_id IN (SELECT id FROM comments WHERE site_id = ? AND node_id IN (SELECT value FROM json_each(?)) LIMIT ?)",
          params: [siteId, siteId, json(nodeIds), budget],
        },
        {
          sql: "DELETE FROM comments WHERE id IN (SELECT id FROM comments WHERE site_id = ? AND node_id IN (SELECT value FROM json_each(?)) LIMIT ?)",
          params: [siteId, json(nodeIds), budget],
        },
        {
          sql: "DELETE FROM comment_threads WHERE site_id = ? AND node_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM comments WHERE site_id = ? AND node_id = comment_threads.node_id)",
          params: [siteId, json(nodeIds), siteId],
        },
      ]);
      return (reports?.changes ?? 0) + (comments?.changes ?? 0);
    },
    /** Deployment-wide: salts older than the previous month, purge-log rows older than an hour. */
    runDeployment: async (
      now: Date,
      oldestMonthToKeep: string,
    ): Promise<{ salts: number; purgeLog: number }> => {
      const [salts, log] = await this.sql.batch([
        { sql: "DELETE FROM comment_salts WHERE month < ?", params: [oldestMonthToKeep] },
        {
          sql: "DELETE FROM cache_purge_log WHERE at < ?",
          params: [new Date(now.getTime() - PURGE_LOG_KEEP_MS).toISOString()],
        },
      ]);
      return { salts: salts?.changes ?? 0, purgeLog: log?.changes ?? 0 };
    },
  };

  /**
   * Rows due for deletion that approved replies still hang under become tombstones: no text, the
   * `erased` author, status `deleted` (§9.3). One read and one guarded UPDATE.
   */
  async #tombstones(
    siteId: string,
    cut: Map<RetentionStepKind, string>,
    budget: number,
  ): Promise<number> {
    const conds: string[] = [];
    const params: SqlValue[] = [siteId];
    const decided = "COALESCE(json_extract(c.moderation, '$.at'), c.created_at)";
    for (const [status, time] of [
      ["pending", "c.created_at"],
      ["spam", decided],
      ["deleted", decided],
      ["hidden", decided],
    ] as const) {
      const cutoff = cut.get(status);
      if (cutoff === undefined) continue;
      conds.push(`(c.status = ? AND ${time} < ?)`);
      params.push(status, cutoff);
    }
    if (conds.length === 0) return 0;
    const rows = await this.sql.all<CommentRow>(
      `SELECT * FROM comments c WHERE c.site_id = ? AND (${conds.join(" OR ")})
         AND (c.body IS NOT NULL OR c.author != ? OR c.status != 'deleted')
         AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.status = 'approved') LIMIT ?`,
      [...params, ERASED_AUTHOR, Math.min(budget, 200)],
    );
    if (rows.length === 0) return 0;
    const changes: [string, number, string][] = [];
    for (const r of rows) {
      const { body: _b, ...rest } = toComment(r);
      changes.push([
        r.id,
        num(r.rev),
        await commentRecordHash({
          ...rest,
          author: { kind: "erased" },
          status: "deleted",
          rev: num(r.rev) + 1,
        }),
      ]);
    }
    const res = await this.sql.run(
      `UPDATE comments SET body = NULL, author = ?, status = 'deleted', rev = rev + 1, op = NULL,
         hash = (SELECT json_extract(j.value, '$[2]') FROM json_each(?) j WHERE json_extract(j.value, '$[0]') = comments.id)
       WHERE site_id = ? AND (id, rev) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))`,
      [ERASED_AUTHOR, json(changes), siteId, json(changes)],
    );
    return res.changes;
  }
}

const PURGE_UPSERT = `ON CONFLICT (site_id, tag) DO UPDATE SET
  priority = CASE WHEN excluded.priority = 'takedown' THEN 'takedown' ELSE comment_purge_queue.priority END,
  next_at = excluded.next_at, attempts = 0`;
