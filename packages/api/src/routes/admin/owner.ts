/** `POST /owner`: `cloudhal owner transfer`. */

import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { OPERATOR_ACTOR } from "./shared.ts";

/** Owner transfer by email. */
export function ownerAdminRoutes(): Hono<Env> {
  return (
    new Hono<Env>()
      // Owner lockout recovery (RFC-0005 §3, open question 7): the operator, already root for site
      // data, makes an existing member the Owner; the current Owner becomes an Administrator.
      .post("/owner", async (c) => {
        const staff = c.get("staff");
        if (!staff)
          return c.json(
            { error: "not_found", message: "members are not enabled on this server" },
            404,
          );
        const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { email?: unknown };
        if (typeof body.email !== "string" || !body.email.trim())
          throw badRequest("email is required");
        const user = await staff.userByEmail(body.email.trim());
        const member = user ? await staff.store.member(user.id) : undefined;
        if (!user || !member)
          return c.json(
            { error: "not_found", message: `no member with the email ${body.email.trim()}` },
            404,
          );
        const moved = await staff.store.forceOwner(user.id);
        if (!moved)
          return c.json(
            { error: "conflict", message: "the members changed meanwhile; try again" },
            409,
          );
        await c.get("audit")?.record({
          at: new Date().toISOString(),
          actor: OPERATOR_ACTOR,
          tool: "member.transfer-ownership",
          decision: "allow",
          outcome: "ok",
          input: { from: moved.from, to: user.id, via: "deploy-token" },
          reason: `operator made ${member.name} the Owner`,
        });
        return c.json({ from: moved.from, to: user.id, name: member.name, email: user.email });
      })
  );
}
