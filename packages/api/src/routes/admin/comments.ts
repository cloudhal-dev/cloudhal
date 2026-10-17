/** Reader comments status, export and import (RFC-0007 §15.4, §9.4). */

import {
  CommentImportError,
  commentsStatus,
  exportPage,
  IMPORT_MAX_LINES,
  importLines,
} from "@cloudhal/comments/sql";
import { type CommentsDeps, commentsAvailable } from "@cloudhal/mcp-server/comments";
import { type Context, Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { param } from "../../params.ts";
import { OPERATOR_ACTOR } from "./shared.ts";

/** One comments import call: at most this many bytes of JSON lines. */
const MAX_COMMENTS_IMPORT = 8 * 1024 * 1024;

/** The deployment's comments and the route's site, or a 404 answer. */
async function commentsSite(
  c: Context<Env>,
): Promise<{ d: CommentsDeps; siteId: string } | Response> {
  const d = c.get("comments");
  if (!commentsAvailable(d))
    return c.json({ error: "not_found", message: "reader comments are not enabled" }, 404);
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId)))
    return c.json({ error: "not_found", message: "site not found" }, 404);
  return { d, siteId };
}

/** Status, export and import. */
export function commentsAdminRoutes(): Hono<Env> {
  return (
    new Hono<Env>()
      // RFC-0007 §15.4: the operator's comments status, export and import (deployment token).
      .get("/sites/:siteId/comments/status", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        return c.json({
          ...(await commentsStatus(s.d.store, s.siteId, c.get("now")())),
          key: Boolean(s.d.keys),
        });
      })
      .get("/sites/:siteId/comments/export", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        const personal = c.req.query("personal") === "1";
        if (personal && !s.d.keys)
          return c.json(
            {
              error: "comments_key_missing",
              message: "this deployment has no CLOUDHAL_COMMENTS_KEY, so emails cannot be read",
            },
            503,
          );
        let page: Awaited<ReturnType<typeof exportPage>>;
        try {
          page = await exportPage(s.d.store, s.siteId, {
            cursor: c.req.query("cursor"),
            personal,
            keys: s.d.keys,
            now: c.get("now")(),
          });
        } catch (e) {
          if (e instanceof CommentImportError) throw badRequest(e.message);
          throw e;
        }
        await c.get("audit")?.record({
          at: c.get("now")().toISOString(),
          actor: OPERATOR_ACTOR,
          siteId: s.siteId,
          tool: "comments.export",
          decision: "allow",
          outcome: "ok",
          input: {
            via: "deploy-token",
            personal,
            comments: page.comments,
            commenters: page.commenters,
            ...(c.req.query("cursor") ? { continued: true } : {}),
          },
        });
        return new Response(page.lines.length ? `${page.lines.join("\n")}\n` : "", {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
            ...(page.next ? { "cloudhal-next-cursor": page.next } : {}),
          },
        });
      })
      .post("/sites/:siteId/comments/import", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        const size = Number(c.req.header("content-length") ?? "0");
        if (size > MAX_COMMENTS_IMPORT)
          throw badRequest(`at most ${MAX_COMMENTS_IMPORT} bytes per import call`);
        const text = await c.req.text();
        if (text.length > MAX_COMMENTS_IMPORT)
          throw badRequest(`at most ${MAX_COMMENTS_IMPORT} bytes per import call`);
        const lines = text.split("\n").filter((l) => l.trim() !== "");
        if (lines.length > IMPORT_MAX_LINES)
          throw badRequest(`at most ${IMPORT_MAX_LINES} lines per import call`);
        const store = c.get("store");
        let report: Awaited<ReturnType<typeof importLines>>;
        try {
          report = await importLines(s.d.store, s.siteId, lines, {
            keys: s.d.keys,
            now: c.get("now")(),
            entries: async (ids) => {
              const wanted = new Set(ids);
              const found = new Set<string>();
              if (wanted.size === 0) return found;
              for (const e of await store.listContentEntries(s.siteId))
                if (wanted.has(e.id)) found.add(e.id);
              return found;
            },
          });
        } catch (e) {
          if (e instanceof CommentImportError) throw badRequest(e.message);
          throw e;
        }
        if (report.purged.length > 0) s.d.onQueued?.(s.siteId, "normal");
        await c.get("audit")?.record({
          at: c.get("now")().toISOString(),
          actor: OPERATOR_ACTOR,
          siteId: s.siteId,
          tool: "comments.import",
          decision: "allow",
          outcome: "ok",
          input: {
            via: "deploy-token",
            imported: report.imported,
            skipped: report.skipped,
            commenters: report.commenters,
            invalid: report.invalid.length,
          },
        });
        return c.json(report);
      })
  );
}
