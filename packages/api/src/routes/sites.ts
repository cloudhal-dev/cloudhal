import { visibleSites } from "@cloudhal/agent-runtime";
import type { Site } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { pendingFor } from "../pending.ts";
import { createSiteRoute } from "./projects.ts";

export const sites: Hono<Env> = new Hono<Env>()
  // RFC-0034 §3: Studio's "New site" (scope `site:create`).
  .route("/", createSiteRoute)
  // RFC-0034 A2: a person limited to sites sees only theirs.
  .get("/", async (c) => {
    const all = await c.get("store").listSites();
    const ids = visibleSites(
      c.get("principal"),
      all.map((s) => s.id),
    );
    return c.json(all.filter((s) => ids.includes(s.id)));
  })
  .get("/:siteId", async (c) => {
    const site = await c.get("store").getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json(site);
  })
  // What a publish would carry, as counts (Studio's badge beside Publish).
  .get("/:siteId/pending", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json(await pendingFor(store, site));
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
