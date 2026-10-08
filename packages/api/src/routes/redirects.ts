import type { Redirect } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { requireSite, snapshotAfter } from "../governance.ts";
import { param } from "../params.ts";

/** What a person sends: the reason is always `manual` and there is no source node. */
type RedirectInput = Pick<Redirect, "from" | "to" | "status" | "match"> &
  Partial<Pick<Redirect, "note" | "metadata">>;

async function loadRedirect(c: Context<Env>): Promise<Redirect> {
  const r = await c.get("store").getRedirect(param(c, "redirectId"));
  if (!r || r.siteId !== param(c, "siteId")) throw notFound("redirect not found");
  return r;
}

/**
 * `/api/sites/:siteId/redirects` (RFC-0002 §6.1). People create manual redirects (302 allowed,
 * external https targets allowed); automatic ones come from slug changes, merges and retirements.
 * Each write takes one snapshot.
 */
export const redirects: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const site = await requireSite(c);
    return c.json(await c.get("store").listRedirects(site.id));
  })
  .post("/", async (c) => {
    const site = await requireSite(c);
    const input = (await c.req.json()) as RedirectInput;
    const redirect = await c.get("store").createRedirect({
      siteId: site.id,
      from: input.from,
      to: input.to,
      status: input.status ?? 301,
      match: input.match ?? "exact",
      reason: "manual",
      ...(input.note ? { note: input.note } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    const snapshot = await snapshotAfter(c, site.id, "create_redirect");
    return c.json({ redirect, snapshot }, 201);
  })
  .get("/:redirectId", async (c) => c.json(await loadRedirect(c)))
  .put("/:redirectId", async (c) => {
    const stored = await loadRedirect(c);
    const next = (await c.req.json()) as Redirect;
    if (next.id !== stored.id || next.siteId !== stored.siteId)
      throw badRequest("ids must match the URL");
    const redirect = await c.get("store").updateRedirect(next);
    const snapshot = await snapshotAfter(c, redirect.siteId, "update_redirect");
    return c.json({ redirect, snapshot });
  })
  .delete("/:redirectId", async (c) => {
    const stored = await loadRedirect(c);
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    await c.get("store").deleteRedirect({ ...stored, rev });
    const snapshot = await snapshotAfter(c, stored.siteId, "delete_redirect");
    return c.json({ snapshot });
  });
