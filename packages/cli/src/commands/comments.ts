/**
 * `cloudhal comments status|export|import` (RFC-0007 §9.4, §15.4, D8). Comments are not in
 * push/pull bundles: they move as JSON lines (a header, then `Comment` records oldest first, then,
 * with `--with-personal-data`, commenter lines with their email).
 *
 * Locally the commands work on the project's SQLite; `--remote` talks to the deployment's admin
 * Worker with the deployment token (`/api/admin/sites/:siteId/comments/…`): the export is fetched
 * page by page, the import sent in batches of at most 50 lines. Import is idempotent (by id, and
 * by importer origin), so an interrupted import can simply be run again. Replies whose parent
 * arrives in a later batch are retried once at the end.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CommentsStatus,
  commentsStatus,
  exportPage,
  type ImportProblem,
  type ImportReport,
  importLines,
  PARENT_MISSING,
  SqlCommentStore,
} from "@cloudhal/comments/sql";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { commentsAvailable, readProjectConfig } from "../config.ts";
import { localComments, localCommentsKeys } from "./comments-local.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface CommentsCliOptions extends SyncOptions {
  /** Talk to the deployment (deployment token) instead of the local SQLite. */
  readonly remote?: boolean;
}

/** Lines per import request, and their size (the admin route takes 200 lines). */
const BATCH_LINES = 50;
const BATCH_BYTES = 1024 * 1024;

export interface CommentsStatusResult extends CommentsStatus {
  /** The comments key is there (emails and stored secrets can be read). */
  readonly key: boolean;
  /** `cloudhal.json` `comments.available` (local), or the deployment answered (remote). */
  readonly available: boolean;
  readonly where: "local" | "remote";
}

async function remote(
  options: SyncOptions,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const url = new URL(
    `/api/admin/sites/${encodeURIComponent(cfg.siteId)}/comments${pathname}`,
    adminUrl,
  );
  const res = await f(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-ndjson" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      res.status === 404 && /not enabled/.test(body)
        ? "reader comments are not available on this deployment (comments.available is false, or the Workers have no CLOUDHAL_COMMENTS_KEY yet: run `cloudhal deploy`)"
        : `${url.pathname} failed (${res.status}): ${brief(body)}`,
    );
  }
  return res;
}

/** `cloudhal comments status [--remote]`: counts, pending, the daily cap and the purge queue. */
export async function commentsStatusCli(
  options: CommentsCliOptions & { readonly now?: () => Date },
): Promise<CommentsStatusResult> {
  if (options.remote) {
    const s = (await (await remote(options, "/status")).json()) as CommentsStatus & {
      key: boolean;
    };
    return { ...s, available: true, where: "remote" };
  }
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const c = await localComments(local.sql, local.dataDir);
    const s = await commentsStatus(c.store, cfg.siteId, options.now?.() ?? new Date());
    return { ...s, key: Boolean(c.keys), available: commentsAvailable(cfg), where: "local" };
  } finally {
    await local.close();
  }
}

export function describeCommentsStatus(s: CommentsStatusResult): string[] {
  const c = s.counts;
  const age = (at: string | null) => {
    if (!at) return "";
    const h = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 3_600_000));
    return h < 1 ? " (oldest under an hour)" : ` (oldest ${h} h)`;
  };
  return [
    `comments: ${s.available ? "available" : "unavailable"} for this ${s.where === "remote" ? "deployment" : "project (cloudhal.json)"}${s.key ? "" : "; no comments key yet, so emails and stored secrets cannot be read"}`,
    `site ${s.siteId}: ${s.settings.enabled ? "on" : "off"}${s.settings.stored ? "" : " (never turned on)"}${s.settings.enabled ? ` · collections ${s.settings.collections.join(", ") || "none"} · ${s.settings.protection === "turnstile" ? "Turnstile" : "proof of work"}${s.settings.allowWithoutScript ? " · posts without JavaScript allowed" : ""} · threads close ${s.settings.closeAfterDays === null ? "never" : `after ${s.settings.closeAfterDays} days`}` : ""}`,
    `comments: ${c.approved} approved · ${c.pending} pending${age(s.pending.oldestAt)} · ${c.reported} reported · ${c.hidden} hidden · ${c.spam} spam · ${c.deleted} deleted`,
    `today (UTC): ${s.today.stored} of ${s.today.cap} stored submissions${s.today.withoutScript ? ` (${s.today.withoutScript} without JavaScript)` : ""}${s.today.paused ? " · PAUSED until midnight UTC" : ""}`,
    `purge queue: ${s.purge.queued} tag(s)${s.purge.takedowns ? `, ${s.purge.takedowns} takedown(s)` : ""}${s.purge.oldestAt ? `, oldest ${s.purge.oldestAt}` : ""} · purge requests in the last minute: ${s.purge.lastMinute} (Workers Cache allows 5 a minute)`,
  ];
}

export interface CommentsExportCliOptions extends CommentsCliOptions {
  /** Also export commenters' emails (`--with-personal-data`). */
  readonly personal?: boolean;
  /** Write here instead of returning the text. */
  readonly out?: string;
  readonly now?: () => Date;
}

/** `cloudhal comments export [--remote] [--with-personal-data] [--out file]`. */
export async function commentsExportCli(
  options: CommentsExportCliOptions,
): Promise<{ text: string; comments: number; commenters: number }> {
  const lines: string[] = [];
  let comments = 0;
  let commenters = 0;
  const count = (page: string[]) => {
    for (const l of page) {
      if (l.startsWith('{"commenter"')) commenters++;
      else if (!l.startsWith('{"cloudhal"')) comments++;
    }
  };
  if (options.remote) {
    let cursor: string | undefined;
    for (let calls = 0; calls < 100_000; calls++) {
      const q = new URLSearchParams({
        ...(cursor ? { cursor } : {}),
        ...(options.personal ? { personal: "1" } : {}),
      });
      const res = await remote(options, `/export${q.size ? `?${q}` : ""}`);
      const page = (await res.text()).split("\n").filter((l) => l.trim() !== "");
      count(page);
      lines.push(...page);
      cursor = res.headers.get("cloudhal-next-cursor") ?? undefined;
      options.log?.(
        `exported ${comments} comment(s)${commenters ? `, ${commenters} commenter(s)` : ""}`,
      );
      if (!cursor) break;
    }
  } else {
    const cfg = await readProjectConfig(options.projectDir);
    const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
    try {
      const c = await localComments(local.sql, local.dataDir);
      if (options.personal && !c.keys)
        throw new Error(
          "no comments key in this project (.cloudhal/comments.key or CLOUDHAL_COMMENTS_KEY), so there are no readable emails to export",
        );
      let cursor: string | undefined;
      for (;;) {
        const page = await exportPage(c.store, cfg.siteId, {
          cursor,
          personal: options.personal,
          keys: c.keys,
          now: options.now?.() ?? new Date(),
        });
        count(page.lines);
        lines.push(...page.lines);
        cursor = page.next;
        if (!cursor) break;
      }
    } finally {
      await local.close();
    }
  }
  const text = `${lines.join("\n")}\n`;
  if (options.out)
    await writeFile(path.resolve(options.projectDir, options.out), text, {
      // personal data: readable by the owner only
      mode: options.personal ? 0o600 : 0o644,
    });
  return { text, comments, commenters };
}

export interface CommentsImportCliOptions extends CommentsCliOptions {
  /** The JSON-lines file (`--in`). */
  readonly file: string;
  readonly now?: () => Date;
}

export interface CommentsImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly commenters: number;
  /** Line numbers are the file's. */
  readonly invalid: readonly ImportProblem[];
}

/** `cloudhal comments import --in <file> [--remote]`: idempotent; safe to run again. */
export async function commentsImportCli(
  options: CommentsImportCliOptions,
): Promise<CommentsImportResult> {
  const text = await readFile(path.resolve(options.projectDir, options.file), "utf8");
  const all = text.split("\n").map((l, i) => ({ line: i + 1, text: l }));
  const filled = all.filter((l) => l.text.trim() !== "");
  const first = filled[0];
  if (!first) throw new Error(`${options.file} is empty`);
  try {
    const head = JSON.parse(first.text) as { cloudhal?: unknown; version?: unknown };
    if (head.cloudhal !== "comments" || head.version !== 1) throw new Error("no header");
  } catch {
    throw new Error(
      `${options.file} is not a Cloudhal comments export (the first line must be {"cloudhal":"comments","version":1,…})`,
    );
  }

  let send: (lines: string[]) => Promise<ImportReport>;
  let close = async () => {};
  if (options.remote) {
    send = async (lines) =>
      (await (
        await remote(options, "/import", { method: "POST", body: `${lines.join("\n")}\n` })
      ).json()) as ImportReport;
  } else {
    const cfg = await readProjectConfig(options.projectDir);
    const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
    close = () => local.close();
    const personal = filled.some((l) => l.text.startsWith('{"commenter"'));
    // emails are encrypted under the project's key: create it when the file brings some
    const keys = await localCommentsKeys(local.dataDir, { create: personal });
    const store = new SqlCommentStore(local.sql);
    send = (lines) =>
      importLines(store, cfg.siteId, lines, {
        keys,
        now: options.now?.() ?? new Date(),
        entries: async (ids) => {
          const wanted = new Set(ids);
          const found = new Set<string>();
          for (const e of await local.store.listContentEntries(cfg.siteId))
            if (wanted.has(e.id)) found.add(e.id);
          return found;
        },
      });
  }

  let imported = 0;
  let skipped = 0;
  let commenters = 0;
  const invalid: ImportProblem[] = [];
  const run = async (batch: { line: number; text: string }[]) => {
    const r = await send(batch.map((l) => l.text));
    imported += r.imported;
    skipped += r.skipped;
    commenters += r.commenters;
    const refused = r.invalid.map((p) => ({ ...p, line: batch[p.line - 1]?.line ?? p.line }));
    options.log?.(`imported ${imported}, already there ${skipped}`);
    return refused;
  };
  try {
    const later: { line: number; text: string }[] = [];
    const lineOf = new Map(filled.map((l) => [l.line, l]));
    let batch: { line: number; text: string }[] = [];
    let bytes = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      for (const p of await run(batch)) {
        // a reply whose parent is in a later batch: once more at the end
        const l = lineOf.get(p.line);
        if (p.error === PARENT_MISSING && l) later.push(l);
        else invalid.push(p);
      }
      batch = [];
      bytes = 0;
    };
    for (const l of filled) {
      if (batch.length >= BATCH_LINES || (batch.length > 0 && bytes + l.text.length > BATCH_BYTES))
        await flush();
      batch.push(l);
      bytes += l.text.length;
    }
    await flush();
    for (let i = 0; i < later.length; i += BATCH_LINES)
      invalid.push(...(await run(later.slice(i, i + BATCH_LINES))));
  } finally {
    await close();
  }
  invalid.sort((a, b) => a.line - b.line);
  return { imported, skipped, commenters, invalid };
}
