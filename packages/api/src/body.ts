/**
 * REST `PATCH …/body` (RFC-0014 §4): `edit_body`'s apply mode for people and their scripts —
 * operations on blocks, one write, a stale `rev` rebased when every named block still carries
 * the `ifHash` read. Agents edit and propose through MCP (REST refuses API keys).
 *
 * - `PATCH /api/sites/:siteId/entries/:entryId/body` — own limits apply (RFC-0005 §9)
 * - `PATCH /api/sites/:siteId/pages/:pageId/sections/:sectionId/body` — a markdown rich-text section
 *
 * Body `{ rev, ops }` → `{ rev, changed, added, removed, words }`. Errors: 400 `invalid` (with
 * `details.op`), 403 `denied`, 404 `not_found`, 409 `conflict` (read the body again).
 */
import type { Principal } from "@cloudhal/agent-runtime";
import { BodyOpError, parseBodyOps } from "@cloudhal/core-ts";
import { editBody } from "@cloudhal/mcp-server/body";
import { type ToolContext, ToolError } from "@cloudhal/mcp-server/tools";
import type { Context } from "hono";
import type { Env } from "./context.ts";
import { apiError } from "./errors.ts";
import { API_ACTOR, writerOf } from "./governance.ts";
import { entryLimit } from "./own.ts";
import { param } from "./params.ts";

const STATUS = { not_found: 404, conflict: 409, denied: 403 } as const;

export type BodyTarget = { entryId: string } | { pageId: string; sectionId: string };

export async function patchBody(c: Context<Env>, target: BodyTarget): Promise<Response> {
  const raw = (await c.req.json().catch(() => ({}))) as { rev?: unknown; ops?: unknown };
  if (typeof raw.rev !== "number" || !Number.isInteger(raw.rev) || raw.rev < 0)
    throw apiError(400, "invalid", "rev: the revision the operations were read at");
  let ops: ReturnType<typeof parseBodyOps>;
  try {
    ops = parseBodyOps(raw.ops);
  } catch (e) {
    if (e instanceof BodyOpError)
      throw apiError(400, "invalid", e.message, e.op === undefined ? undefined : { op: e.op });
    throw e;
  }
  const principal: Principal = c.get("principal") ?? {
    actor: c.get("actor") ?? API_ACTOR,
    scopes: ["*"],
  };
  // Pages need full content:write (the route); articles may be limited to one's own.
  const limit = "entryId" in target ? entryLimit(c.get("principal")) : undefined;
  const ctx: ToolContext = {
    store: c.get("store"),
    principal,
    ownership: c.get("ownership"),
    ...(limit ? { limit } : {}),
  };
  try {
    const result = await editBody(
      { siteId: param(c, "siteId"), ...target, rev: raw.rev, ops },
      ctx,
      writerOf(c),
    );
    return c.json(result);
  } catch (e) {
    if (e instanceof ToolError)
      throw apiError(
        STATUS[e.code as keyof typeof STATUS] ?? 400,
        e.code,
        e.message,
        Object.keys(e.details).length ? e.details : undefined,
      );
    throw e;
  }
}
