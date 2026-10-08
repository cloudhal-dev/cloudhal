/**
 * `/api/agent-keys` — API keys that let agents (CI, bots, MCP clients) act with limited scopes in
 * a chosen mode (ADR-0015). People only.
 *
 * - `GET    /`            → AgentKeySummary[]
 * - `POST   /`            {name, mode?, scopes?} → summary + `key` (shown once)
 * - `PATCH  /:id`         {mode} → summary (audited)
 * - `DELETE /:id`
 */
import { isAgentMode, type Scope } from "@cloudhal/agent-runtime";
import { Hono } from "hono";
import type { AgentKeyService } from "../auth.ts";
import type { Env } from "../context.ts";
import { badRequest, unauthorized } from "../errors.ts";
import { param } from "../params.ts";

export function agentKeys(service: AgentKeyService): Hono<Env> {
  return new Hono<Env>()
    .get("/", async (c) => c.json(await service.list({ headers: c.req.raw.headers })))
    .post("/", async (c) => {
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
        name?: unknown;
        scopes?: unknown;
        mode?: unknown;
      };
      if (typeof body.name !== "string" || !body.name.trim()) throw badRequest("name is required");
      if (
        body.scopes !== undefined &&
        (!Array.isArray(body.scopes) || !body.scopes.every((s) => typeof s === "string"))
      )
        throw badRequest("scopes must be a list of strings");
      if (body.mode !== undefined && !isAgentMode(body.mode)) throw badRequest("unknown mode");
      const created = await service.create({
        headers: c.req.raw.headers,
        name: body.name.trim(),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.scopes !== undefined ? { scopes: body.scopes as Scope[] } : {}),
      });
      return c.json(created, 201);
    })
    .patch("/:id", async (c) => {
      const actor = c.get("actor");
      if (!actor) throw unauthorized();
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { mode?: unknown };
      if (!isAgentMode(body.mode)) throw badRequest("mode is required (plan, manual, edits, auto)");
      const before = (await service.list({ headers: c.req.raw.headers })).find(
        (k) => k.id === param(c, "id"),
      );
      const updated = await service.setMode({
        headers: c.req.raw.headers,
        id: param(c, "id"),
        mode: body.mode,
      });
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor,
        tool: "agent-key.mode",
        decision: "allow",
        outcome: "ok",
        reason: `${updated.name ?? updated.id}: ${before?.mode ?? "?"} → ${updated.mode}`,
        mode: updated.mode,
      });
      return c.json(updated);
    })
    .delete("/:id", async (c) => {
      await service.delete({ headers: c.req.raw.headers, id: param(c, "id") });
      return c.body(null, 204);
    });
}
