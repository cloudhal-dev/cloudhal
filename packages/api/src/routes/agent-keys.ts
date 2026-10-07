/** `/api/agent-keys` — API keys that let agents (CI, bots, MCP clients) act with limited scopes. */
import type { Scope } from "@cloudhal/agent-runtime";
import { Hono } from "hono";
import type { AgentKeyService } from "../auth.ts";
import type { Env } from "../context.ts";
import { badRequest } from "../errors.ts";
import { param } from "../params.ts";

export function agentKeys(service: AgentKeyService): Hono<Env> {
  return new Hono<Env>()
    .get("/", async (c) => c.json(await service.list({ headers: c.req.raw.headers })))
    .post("/", async (c) => {
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
        name?: unknown;
        scopes?: unknown;
      };
      if (typeof body.name !== "string" || !body.name.trim()) throw badRequest("name is required");
      if (!Array.isArray(body.scopes) || !body.scopes.every((s) => typeof s === "string"))
        throw badRequest("scopes must be a list of strings");
      const created = await service.create({
        headers: c.req.raw.headers,
        name: body.name.trim(),
        scopes: body.scopes as Scope[],
      });
      return c.json(created, 201);
    })
    .delete("/:id", async (c) => {
      await service.delete({ headers: c.req.raw.headers, id: param(c, "id") });
      return c.body(null, 204);
    });
}
