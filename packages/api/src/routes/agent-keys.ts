/**
 * `/api/agent-keys` — API keys that let agents (CI, bots, MCP clients) act with limited scopes in
 * a chosen mode (ADR-0015). People only.
 *
 * - `GET    /`            → AgentKeySummary[] (own keys); `?all=1` every key with its `owner`
 *   (`agents:manage`, RFC-0005)
 * - `POST   /`            {name, mode?, scopes?} → summary + `key` (shown once). Scopes must fit
 *   the caller's role (400 `scope_above_role`), the mode its cap (400 `mode_above_role`)
 * - `PATCH  /:id`         {mode} → summary (own keys; audited)
 * - `POST   /:id/elevation` {mode, minutes, reason?} → summary: a more autonomous mode until the
 *   time is up, then the key's own mode again (ADR-0016; only the key's creator; audited)
 * - `DELETE /:id/elevation` → summary: ends it early (own keys, or any with `agents:manage`; audited)
 * - `DELETE /:id` → 204 (own keys, or any with `agents:manage`; audited `agent-key.revoke`)
 *
 * Someone else's key answers 404 unless the caller holds `agents:manage`.
 */
import { isAgentMode, type Scope } from "@cloudhal/agent-runtime";
import { Hono } from "hono";
import type { AgentKeyService } from "../auth.ts";
import type { Env } from "../context.ts";
import { badRequest, unauthorized } from "../errors.ts";
import { param } from "../params.ts";

export function agentKeys(service: AgentKeyService): Hono<Env> {
  return new Hono<Env>()
    .get("/", async (c) =>
      c.json(
        await service.list({
          headers: c.req.raw.headers,
          ...(c.req.query("all") === "1" ? { all: true } : {}),
        }),
      ),
    )
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
    .post("/:id/elevation", async (c) => {
      const actor = c.get("actor");
      if (!actor) throw unauthorized();
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
        mode?: unknown;
        minutes?: unknown;
        reason?: unknown;
      };
      if (!isAgentMode(body.mode)) throw badRequest("mode is required (manual, edits, auto)");
      if (typeof body.minutes !== "number") throw badRequest("minutes is required");
      if (body.reason !== undefined && typeof body.reason !== "string")
        throw badRequest("reason must be a string");
      const updated = await service.elevate({
        headers: c.req.raw.headers,
        id: param(c, "id"),
        mode: body.mode,
        minutes: body.minutes,
        reason: body.reason,
      });
      const until = updated.elevation?.until ?? "";
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor,
        tool: "agent-key.elevate",
        decision: "allow",
        outcome: "ok",
        reason: `${updated.name ?? updated.id}: ${updated.mode} → ${updated.effectiveMode} until ${until} (${body.minutes} min)${updated.elevation?.reason ? `: ${updated.elevation.reason}` : ""}`,
        mode: updated.effectiveMode,
        elevation: { from: updated.mode, until },
      });
      return c.json(updated);
    })
    .delete("/:id/elevation", async (c) => {
      const actor = c.get("actor");
      if (!actor) throw unauthorized();
      // Own keys first; Administrators may end others' elevations too (agents:manage).
      const id = param(c, "id");
      const before =
        (await service.list({ headers: c.req.raw.headers })).find((k) => k.id === id) ??
        (await service
          .list({ headers: c.req.raw.headers, all: true })
          .then((all) => all.find((k) => k.id === id))
          .catch(() => undefined));
      const updated = await service.endElevation({
        headers: c.req.raw.headers,
        id: param(c, "id"),
      });
      if (before?.elevation)
        await c.get("audit")?.record({
          at: new Date().toISOString(),
          actor,
          tool: "agent-key.elevation-end",
          decision: "allow",
          outcome: "ok",
          reason: `${updated.name ?? updated.id}: ${before.elevation.mode} → ${updated.mode} (ended early)`,
          mode: updated.mode,
          elevation: { from: updated.mode, until: before.elevation.until },
        });
      return c.json(updated);
    })
    .delete("/:id", async (c) => {
      const actor = c.get("actor");
      if (!actor) throw unauthorized();
      const removed = await service.delete({ headers: c.req.raw.headers, id: param(c, "id") });
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor,
        tool: "agent-key.revoke",
        decision: "allow",
        outcome: "ok",
        reason: `${removed?.name ?? param(c, "id")} revoked`,
        input: { keyId: param(c, "id"), agentId: removed?.agentId },
      });
      return c.body(null, 204);
    });
}
