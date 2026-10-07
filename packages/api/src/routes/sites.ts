import type { Site } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const sites: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => c.json(await c.get("store").listSites()))
  .get("/:siteId", async (c) => {
    const site = await c.get("store").getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json(site);
  })
  .put("/:siteId", async (c) => {
    const body = (await c.req.json()) as Site;
    if (body.id !== param(c, "siteId")) throw badRequest("body.id must match the URL");
    const store = c.get("store");
    const current = await store.getSite(body.id);
    if (!current) throw notFound("site not found");
    // The published pointer only moves through publish/rollback (approval, ancestry, cache purge).
    if ((body.publishedSnapshotId ?? null) !== (current.publishedSnapshotId ?? null))
      throw badRequest(
        "publishedSnapshotId changes go through /snapshots/:id/publish or /rollback",
      );
    return c.json(await store.updateSite(body));
  });
