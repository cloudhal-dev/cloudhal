/**
 * `/api/sites/:siteId/collections` (RFC-0040 §5): the collection registry. `GET` (content:read)
 * lists declared collections, those inferred from entries, and `posts`, with entry counts.
 * `PUT /:key { settings, rev }` (site:settings) declares a collection or replaces its settings
 * through the site update, so the store's overlap and permalink-redirect checks run (`rev` is the
 * site's: a stale one is 409); `?dryRun=1` runs them and writes nothing. `DELETE /:key?rev=`
 * (site:settings) undeclares a collection without entries. Field operations (RFC-0041 §6) live
 * under `/:key/fields/operations` (`../field-operations.ts`).
 */
import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { fieldOperations } from "../field-operations.ts";
import { param } from "../params.ts";

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The site with `key` declared with `settings`, or undeclared (`undefined`). */
export function withCollection(
  site: Site,
  key: string,
  settings: CollectionSettings | undefined,
): Site {
  const { [key]: _old, ...others } = site.collections ?? {};
  const collections = settings ? { ...others, [key]: settings } : others;
  const { collections: _drop, ...base } = site;
  return Object.keys(collections).length ? { ...base, collections } : (base as Site);
}

function keyOf(raw: string): string {
  if (!KEY.test(raw) || raw.length > 128) throw badRequest("the collection key must be a slug");
  return raw;
}

function revOf(raw: unknown): number {
  const rev = typeof raw === "string" ? Number(raw) : raw;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0)
    throw badRequest("rev (the site's revision) is required");
  return rev;
}

export const collections: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const siteId = param(c, "siteId");
    if (!(await store.getSite(siteId))) throw notFound("site not found");
    return c.json(await store.listCollections(siteId));
  })
  .put("/:key", async (c) => {
    const store = c.get("store");
    const key = keyOf(param(c, "key"));
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const body = (await c.req.json().catch(() => ({}))) as { settings?: unknown; rev?: unknown };
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings))
      throw badRequest("settings must be an object");
    const next = withCollection(
      { ...site, rev: revOf(body.rev) },
      key,
      body.settings as CollectionSettings,
    );
    const dryRun = c.req.query("dryRun") === "1";
    const updated = await store.updateSite(next, { dryRun });
    return c.json({ site: updated, dryRun });
  })
  .delete("/:key", async (c) => {
    const store = c.get("store");
    const key = keyOf(param(c, "key"));
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    if (!site.collections?.[key]) throw notFound("collection not declared");
    const next = withCollection({ ...site, rev: revOf(c.req.query("rev")) }, key, undefined);
    return c.json({ site: await store.updateSite(next) });
  })
  .route("/", fieldOperations);
