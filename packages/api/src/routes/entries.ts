import type { ContentEntry } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const entries: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const collection = c.req.query("collection");
    return c.json(await c.get("store").listContentEntries(param(c, "siteId"), collection));
  })
  .post("/", async (c) => {
    const siteId = param(c, "siteId");
    if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
    const input = (await c.req.json()) as Omit<
      ContentEntry,
      "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
    >;
    const actor = c.get("actor");
    const entry = await c.get("store").createContentEntry({
      ...input,
      siteId,
      author: input.author ?? actor ?? { kind: "system", id: "sys_api00000001" },
    });
    return c.json(entry, 201);
  })
  .get("/:entryId", async (c) => {
    const entry = await c.get("store").getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== param(c, "siteId")) throw notFound("entry not found");
    return c.json(entry);
  })
  .put("/:entryId", async (c) => {
    const body = (await c.req.json()) as ContentEntry;
    if (body.id !== param(c, "entryId") || body.siteId !== param(c, "siteId"))
      throw badRequest("ids must match the URL");
    return c.json(await c.get("store").updateContentEntry(body));
  })
  .delete("/:entryId", async (c) => {
    const store = c.get("store");
    const entry = await store.getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== param(c, "siteId")) throw notFound("entry not found");
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    await store.deleteContentEntry({ ...entry, rev });
    return c.body(null, 204);
  });
