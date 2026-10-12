import type { Taxonomy } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { requireSite, snapshotAfter } from "../governance.ts";
import { param } from "../params.ts";

type TaxonomyInput = Omit<
  Taxonomy,
  "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion" | "siteId"
>;

/**
 * `/api/sites/:siteId/taxonomies` (RFC-0002 §6.1, people only). Taxonomies are structure: each
 * write takes one snapshot.
 */
export const taxonomies: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const site = await requireSite(c);
    return c.json(await c.get("store").listTaxonomies(site.id));
  })
  .post("/", async (c) => {
    const site = await requireSite(c);
    const input = (await c.req.json()) as TaxonomyInput;
    const taxonomy = await c.get("store").createTaxonomy({ ...input, siteId: site.id });
    const snapshot = await snapshotAfter(c, site.id, "create_taxonomy");
    return c.json({ taxonomy, snapshot }, 201);
  })
  .get("/:taxonomyId", async (c) => {
    const tax = await c.get("store").getTaxonomy(param(c, "taxonomyId"));
    if (!tax || tax.siteId !== param(c, "siteId")) throw notFound("taxonomy not found");
    return c.json(tax);
  })
  .put("/:taxonomyId", async (c) => {
    const site = await requireSite(c);
    const body = (await c.req.json()) as Taxonomy;
    if (body.id !== param(c, "taxonomyId") || body.siteId !== site.id)
      throw badRequest("ids must match the URL");
    const stored = await c.get("store").getTaxonomy(body.id);
    if (!stored || stored.siteId !== site.id) throw notFound("taxonomy not found");
    const taxonomy = await c.get("store").updateTaxonomy(body);
    const snapshot = await snapshotAfter(c, site.id, "update_taxonomy");
    return c.json({ taxonomy, snapshot });
  });
