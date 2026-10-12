/**
 * Moving comments between deployments (RFC-0007 §5.3, §9.4, D8): `cloudhal comments export|import`
 * locally and, over the deployment token, `GET|POST /api/admin/sites/:siteId/comments/export|import`.
 *
 * **The file** is JSON lines: one header `{"cloudhal":"comments","version":1,"siteId",…}`, then
 * one `Comment` contract record per line, oldest first. With personal data (people with
 * `commenters:data`, or the operator) `{"commenter":{commenterId,email,firstSeen,commentIds}}`
 * lines follow the comments. Nothing else ever leaves: no IP hash, challenge or proof (C1).
 *
 * **Export** is paged so one Worker request stays far inside D1 Free's 50 queries (at most 10
 * reads of comments, or 4 for a page of commenters): `cursor` continues where the last page
 * stopped (`c:` comments, then `p:` commenters). Studio's REST export and the deployment-token
 * export use the same pages.
 *
 * **Import** is idempotent: a record whose `id` exists is skipped, and so is one whose `origin`
 * (importers' `{system, id}`) is already stored for the site. Each record must be a valid
 * `Comment`, name a content entry of the target site (otherwise the hourly job would delete it
 * as a comment of a deleted entry) and, as a reply, a parent stored for the same entry. The
 * site comes from the caller, never from the file (C14): `siteId` is rewritten. Imported rows
 * keep their status (the operator's import is the one non-person way to `approved`, C3), carry
 * `proof = 'import'`, no IP hash and no challenge. Commenter lines need the deployment's comments
 * key: the address is hashed and encrypted again under the target's key and linked only to
 * imported comments. Approved comments queue a normal purge of their entry's tag.
 */
import { type Comment, isValid } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import type { CommentKeys } from "../crypto.ts";
import { commentRecordHash, emailHmac, ID_PREFIX, newCommentsId, sealEmail } from "../hashes.ts";
import { type CommentCounts, num } from "../model.ts";
import { checkEmail, normalizeEmail } from "../normalize.ts";
import { commentsCacheTag, PURGE_LIMITS } from "../purge.ts";
import { withoutScriptAllowed } from "../settings.ts";
import type { SqlCommentStore } from "./store.ts";

/** The first line of an export file. */
export interface CommentsExportHeader {
  readonly cloudhal: "comments";
  readonly version: 1;
  readonly siteId: string;
  readonly exportedAt: string;
  readonly personalData?: true;
}

/** A personal-data line (only with `personal`). */
export interface CommenterExportLine {
  readonly commenter: {
    readonly commenterId: string;
    readonly email: string;
    readonly firstSeen: string;
    readonly commentIds: readonly string[];
  };
}

export const exportHeader = (
  siteId: string,
  exportedAt: string,
  personal = false,
): CommentsExportHeader => ({
  cloudhal: "comments",
  version: 1,
  siteId,
  exportedAt,
  ...(personal ? { personalData: true as const } : {}),
});

/** Comments per export page: 10 indexed reads of 50. */
export const EXPORT_PAGE_COMMENTS = 500;
/** Commenters per export page: four reads for the whole page (`SqlCommentStore.commenters`). */
export const EXPORT_PAGE_COMMENTERS = 100;
/** Lines one import call accepts (the CLI sends batches of this size or less). */
export const IMPORT_MAX_LINES = 200;
/** Records written per statement, and the size of their JSON parameter. */
const IMPORT_CHUNK = 50;
const IMPORT_CHUNK_BYTES = 512 * 1024;

export interface ExportPage {
  /** JSON lines without trailing newlines (the header only on the first page). */
  readonly lines: string[];
  /** Pass back as `cursor` for the next page; absent when the export is complete. */
  readonly next?: string;
  readonly comments: number;
  readonly commenters: number;
}

/**
 * One page of a site's export. Without `cursor` the page starts with the header. With
 * `personal`, commenter lines follow the comments (needs `keys`).
 */
export async function exportPage(
  store: SqlCommentStore,
  siteId: string,
  o: {
    readonly cursor?: string | undefined;
    readonly personal?: boolean | undefined;
    readonly keys?: CommentKeys | undefined;
    readonly now?: Date | undefined;
    readonly maxComments?: number | undefined;
    readonly maxCommenters?: number | undefined;
  } = {},
): Promise<ExportPage> {
  const lines: string[] = [];
  if (o.cursor === undefined || o.cursor === "")
    lines.push(
      JSON.stringify(exportHeader(siteId, (o.now ?? new Date()).toISOString(), o.personal)),
    );
  const cursor = o.cursor ?? "";
  if (cursor !== "" && !/^[cp]:/.test(cursor)) throw new CommentImportError("invalid cursor");
  let comments = 0;
  let commenters = 0;
  if (!cursor.startsWith("p:")) {
    let list: string | undefined = cursor.startsWith("c:") ? cursor.slice(2) : undefined;
    if (list === "") list = undefined;
    const max = o.maxComments ?? EXPORT_PAGE_COMMENTS;
    while (comments < max) {
      const page = await store.list(siteId, {
        order: "oldest",
        limit: Math.min(50, max - comments),
        ...(list ? { cursor: list } : {}),
      });
      for (const x of page.comments) lines.push(JSON.stringify(x));
      comments += page.comments.length;
      list = page.nextCursor;
      if (!list) break;
    }
    if (list) return { lines, next: `c:${list}`, comments, commenters };
    if (!o.personal) return { lines, comments, commenters };
  }
  if (!o.keys)
    throw new CommentImportError(
      "exporting personal data needs the deployment's CLOUDHAL_COMMENTS_KEY",
    );
  const after = cursor.startsWith("p:") ? cursor.slice(2) : "";
  const [at, id] = after ? after.split("|") : ["", ""];
  const max = o.maxCommenters ?? EXPORT_PAGE_COMMENTERS;
  const rows = await store.sql.all<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM commenter_emails WHERE site_id = ?${after ? " AND (created_at > ? OR (created_at = ? AND id > ?))" : ""}
     ORDER BY created_at, id LIMIT ?`,
    [siteId, ...(after ? [at ?? "", at ?? "", id ?? ""] : []), max + 1],
  );
  // three reads for the whole page, whatever its size
  for (const who of await store.commenters(
    siteId,
    rows.slice(0, max).map((r) => r.id),
    o.keys,
  )) {
    commenters++;
    const line: CommenterExportLine = {
      commenter: {
        commenterId: who.id,
        email: who.email,
        firstSeen: who.firstSeen,
        commentIds: who.commentIds,
      },
    };
    lines.push(JSON.stringify(line));
  }
  const last = rows.slice(0, max).at(-1);
  return {
    lines,
    ...(rows.length > max && last ? { next: `p:${last.created_at}|${last.id}` } : {}),
    comments,
    commenters,
  };
}

export class CommentImportError extends Error {
  override readonly name = "CommentImportError";
}

export interface ImportProblem {
  /** 1-based line number within the lines given to this call. */
  readonly line: number;
  readonly id?: string;
  readonly error: string;
}

export interface ImportReport {
  /** Comment records stored by this call. */
  readonly imported: number;
  /** Records already there (same id, or same importer origin): nothing changed. */
  readonly skipped: number;
  /** Commenter lines whose address was stored or linked. */
  readonly commenters: number;
  /** Lines refused, with why (the rest of the call still applies). */
  readonly invalid: readonly ImportProblem[];
  /** Entries whose comments tag was queued for a purge (new approved comments). */
  readonly purged: readonly string[];
}

/** The refusal a caller may retry once the rest of the file is in (a parent in a later call). */
export const PARENT_MISSING = "the parent comment is not stored for this entry";

const SOURCES_V1 = new Set(["native", "import"]);
const COMMENTER_ID = /^cmr_[A-Za-z0-9]{6,32}$/;
const COMMENT_ID = /^cmt_[A-Za-z0-9]{6,32}$/;

interface Row {
  id: string;
  nodeId: string;
  parentId: string | null;
  inReplyToId: string | null;
  source: string;
  origin: string | null;
  author: string;
  body: string | null;
  status: string;
  labels: string;
  moderation: string | null;
  hash: string;
  createdAt: string;
  editedAt: string | null;
  rev: number;
}

/** Cross-field rules the contract cannot state (RFC-0007 §5.4), for imported records. */
function crossFieldProblem(c: Comment): string | undefined {
  if (!SOURCES_V1.has(c.source)) return `source ${c.source} is not accepted yet`;
  if (c.inReplyToId && !c.parentId) return "inReplyToId needs parentId";
  if (c.parentId === c.id) return "a comment cannot answer itself";
  if (!c.body && c.status !== "deleted" && c.author.kind !== "erased")
    return "only a deleted comment or an erased author may have no text";
  const m = c.moderation;
  if (m && ["hide", "spam", "delete", "erase"].includes(m.action) && !m.reasonCode)
    return `moderation ${m.action} needs a reasonCode`;
  return undefined;
}

/**
 * Imports JSON lines into a site (see the module comment). `entries` answers which node ids are
 * content entries of the site. At most `IMPORT_MAX_LINES` lines per call.
 */
export async function importLines(
  store: SqlCommentStore,
  siteId: string,
  input: readonly string[],
  o: {
    readonly entries: (nodeIds: readonly string[]) => Promise<ReadonlySet<string>>;
    readonly keys?: CommentKeys | undefined;
    readonly now?: Date | undefined;
  },
): Promise<ImportReport> {
  if (input.length > IMPORT_MAX_LINES)
    throw new CommentImportError(`at most ${IMPORT_MAX_LINES} lines per call`);
  const now = (o.now ?? new Date()).toISOString();
  const invalid: ImportProblem[] = [];
  const records: { line: number; c: Comment }[] = [];
  const people: { line: number; email: string; commentIds: string[] }[] = [];
  input.forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();
    if (text === "") return;
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      invalid.push({ line, error: "not JSON" });
      return;
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      invalid.push({ line, error: "not a JSON object" });
      return;
    }
    const obj = v as Record<string, unknown>;
    if ("cloudhal" in obj) {
      if (obj.cloudhal !== "comments" || obj.version !== 1)
        throw new CommentImportError("not a Cloudhal comments export (version 1)");
      return;
    }
    if ("commenter" in obj) {
      const p = obj.commenter as Record<string, unknown> | null;
      const email = typeof p?.email === "string" ? normalizeEmail(p.email) : undefined;
      const ids = Array.isArray(p?.commentIds)
        ? p.commentIds.filter((x): x is string => typeof x === "string" && COMMENT_ID.test(x))
        : [];
      if (!email || checkEmail(email)) invalid.push({ line, error: "invalid commenter email" });
      else if (p?.commenterId !== undefined && !COMMENTER_ID.test(String(p.commenterId)))
        invalid.push({ line, error: "invalid commenterId" });
      else people.push({ line, email, commentIds: ids });
      return;
    }
    // C14: the target site is the caller's, whatever the file says
    const c = { ...obj, siteId } as unknown;
    if (!isValid("comment", c)) {
      invalid.push({
        line,
        ...(typeof obj.id === "string" ? { id: obj.id } : {}),
        error: "not a valid Comment record",
      });
      return;
    }
    const problem = crossFieldProblem(c);
    if (problem) invalid.push({ line, id: c.id, error: problem });
    else records.push({ line, c });
  });

  // Entries and parents: reads only, before anything is written.
  const known = await o.entries([...new Set(records.map((r) => r.c.nodeId))]);
  const parents = [...new Set(records.flatMap((r) => (r.c.parentId ? [r.c.parentId] : [])))];
  const stored = new Map<string, string>();
  for (let i = 0; i < parents.length; i += IMPORT_CHUNK) {
    const rows = await store.sql.all<{ id: string; node_id: string }>(
      "SELECT id, node_id FROM comments WHERE site_id = ? AND id IN (SELECT value FROM json_each(?))",
      [siteId, JSON.stringify(parents.slice(i, i + IMPORT_CHUNK))],
    );
    for (const r of rows) stored.set(r.id, r.node_id);
  }
  const seenOrigins = new Set<string>();
  const accepted: { line: number; row: Row; approved: boolean }[] = [];
  // top-level comments first: a reply may come before its parent when their times tie
  const ordered = [...records].sort((x, y) => Number(!!x.c.parentId) - Number(!!y.c.parentId));
  for (const { line, c } of ordered) {
    if (!known.has(c.nodeId)) {
      invalid.push({
        line,
        id: c.id,
        error: `entry ${c.nodeId} is not a content entry of this site`,
      });
      continue;
    }
    if (c.parentId && (stored.get(c.parentId) ?? "") !== c.nodeId) {
      invalid.push({ line, id: c.id, error: PARENT_MISSING });
      continue;
    }
    const origin = c.origin ? JSON.stringify({ system: c.origin.system, id: c.origin.id }) : null;
    if (origin && seenOrigins.has(origin)) continue;
    if (origin) seenOrigins.add(origin);
    // later lines of the same call may answer this one
    if (!c.parentId) stored.set(c.id, c.nodeId);
    accepted.push({
      line,
      approved: c.status === "approved",
      row: {
        id: c.id,
        nodeId: c.nodeId,
        parentId: c.parentId ?? null,
        inReplyToId: c.inReplyToId ?? null,
        source: c.source,
        origin,
        author: JSON.stringify(c.author),
        body: c.body?.text ?? null,
        status: c.status,
        labels: JSON.stringify(c.labels ?? []),
        moderation: c.moderation ? JSON.stringify(c.moderation) : null,
        hash: await commentRecordHash(c as Comment),
        createdAt: c.createdAt,
        editedAt: c.editedAt ?? null,
        rev: c.rev,
      },
    });
  }

  let imported = 0;
  const purge = new Set<string>();
  let chunk: typeof accepted = [];
  let bytes = 0;
  const flush = async () => {
    if (chunk.length === 0) return;
    const rows = chunk.map((x) => x.row);
    const j = "json_extract(j.value, ";
    const statements: SqlStatement[] = [
      {
        sql: `INSERT OR IGNORE INTO comments (id, site_id, node_id, parent_id, in_reply_to_id, source, origin, author, body, status, labels, moderation, email_id, ip_hmac, challenge_id, proof, op, hash, created_at, edited_at, rev)
              SELECT ${j}'$.id'), ?, ${j}'$.nodeId'), ${j}'$.parentId'), ${j}'$.inReplyToId'), ${j}'$.source'), ${j}'$.origin'), ${j}'$.author'), ${j}'$.body'), ${j}'$.status'), ${j}'$.labels'), ${j}'$.moderation'), NULL, NULL, NULL, 'import', NULL, ${j}'$.hash'), ${j}'$.createdAt'), ${j}'$.editedAt'), ${j}'$.rev')
              FROM json_each(?) j
              WHERE ${j}'$.origin') IS NULL
                 OR NOT EXISTS (SELECT 1 FROM comments c WHERE c.site_id = ? AND c.origin = ${j}'$.origin'))`,
        params: [siteId, JSON.stringify(rows), siteId],
      },
    ];
    const [res] = await store.sql.batch(statements);
    imported += res?.changes ?? 0;
    if ((res?.changes ?? 0) > 0)
      for (const x of chunk) if (x.approved) purge.add(commentsCacheTag(x.row.nodeId));
    chunk = [];
    bytes = 0;
  };
  for (const x of accepted) {
    const size = JSON.stringify(x.row).length;
    if (chunk.length >= IMPORT_CHUNK || (chunk.length > 0 && bytes + size > IMPORT_CHUNK_BYTES))
      await flush();
    chunk.push(x);
    bytes += size;
  }
  await flush();
  // a stored approved comment appears on the cached page at the next coalesced purge
  const tags = [...purge];
  for (let i = 0; i < tags.length; i += PURGE_LIMITS.tagsPerRequest)
    await store.purgeQueue.enqueue(
      siteId,
      tags.slice(i, i + PURGE_LIMITS.tagsPerRequest),
      "normal",
    );

  let commenters = 0;
  if (people.length > 0) {
    if (!o.keys) {
      for (const p of people)
        invalid.push({
          line: p.line,
          error: "storing commenter emails needs the deployment's CLOUDHAL_COMMENTS_KEY",
        });
    } else {
      const statements: SqlStatement[] = [];
      for (const p of people) {
        const hmac = await emailHmac(o.keys, p.email);
        const sealed = await sealEmail(o.keys, siteId, p.email);
        statements.push(
          {
            sql: "INSERT OR IGNORE INTO commenter_emails (id, site_id, email_hmac, email_ciphertext, email_iv, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            params: [
              newCommentsId(ID_PREFIX.commenter),
              siteId,
              hmac,
              sealed.ciphertext,
              sealed.iv,
              now,
            ],
          },
          {
            // only imported comments, never a native comment of this deployment
            sql: `UPDATE comments SET email_id = (SELECT id FROM commenter_emails WHERE site_id = ? AND email_hmac = ?)
                  WHERE site_id = ? AND proof = 'import' AND email_id IS NULL AND id IN (SELECT value FROM json_each(?))`,
            params: [siteId, hmac, siteId, JSON.stringify(p.commentIds)],
          },
        );
        commenters++;
      }
      for (let i = 0; i < statements.length; i += 20)
        await store.sql.batch(statements.slice(i, i + 20));
    }
  }
  invalid.sort((a, b) => a.line - b.line);
  return {
    imported,
    skipped: accepted.length - imported,
    commenters,
    invalid,
    purged: tags,
  };
}

/** What `cloudhal comments status` shows (RFC-0007 §15.4): counts and budgets, never reader text. */
export interface CommentsStatus {
  readonly siteId: string;
  readonly settings: {
    readonly enabled: boolean;
    readonly collections: readonly string[];
    readonly protection: "pow" | "turnstile";
    readonly allowWithoutScript: boolean;
    readonly closeAfterDays: number | null;
    /** The settings row exists (else: the defaults, comments off). */
    readonly stored: boolean;
  };
  readonly counts: CommentCounts;
  readonly pending: { readonly count: number; readonly oldestAt: string | null };
  /** Today's (UTC) stored guest submissions against the daily cap (§6.5). */
  readonly today: {
    readonly stored: number;
    readonly withoutScript: number;
    readonly cap: number;
    readonly paused: boolean;
  };
  /** The comment purge queue and the shared purge budget (§8.4). */
  readonly purge: {
    readonly queued: number;
    readonly takedowns: number;
    readonly oldestAt: string | null;
    /** Purge requests (publishing and comments) in the last 60 s; Free allows 5 a minute. */
    readonly lastMinute: number;
  };
}

export async function commentsStatus(
  store: SqlCommentStore,
  siteId: string,
  now: Date = new Date(),
): Promise<CommentsStatus> {
  const day = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const [settings, counts, stats, today, queue, recent] = await Promise.all([
    store.settings(siteId),
    store.counts(siteId),
    store.summary(siteId, day),
    store.storedSince(siteId, day),
    store.purgeQueue.queued(siteId),
    store.purgeQueue.recent(now),
  ]);
  return {
    siteId,
    settings: {
      enabled: settings.enabled,
      collections: Object.entries(settings.collections)
        .filter(([, c]) => c.enabled)
        .map(([name]) => name),
      protection: settings.protection,
      allowWithoutScript: withoutScriptAllowed(settings),
      closeAfterDays: settings.closeAfterDays,
      stored: settings.rev > 0,
    },
    counts,
    pending: { count: stats.pending.count, oldestAt: stats.pending.oldestAt },
    today: {
      stored: today.total,
      withoutScript: today.withoutScript,
      cap: settings.dailyCap,
      paused: settings.enabled && today.total >= settings.dailyCap,
    },
    purge: {
      queued: queue.length,
      takedowns: queue.filter((r) => r.priority === "takedown").length,
      oldestAt: queue[0]?.enqueuedAt ?? null,
      lastMinute: recent.reduce((a, r) => a + num(r.requests), 0),
    },
  };
}
