/**
 * `/api/sites/:siteId/chrome` (RFC-0025 §5): the site's header, footer and brand for Studio's
 * Header and footer form. `GET` (content:read) gives the values (logos as `asset:<id>`), the form
 * schemas and the menu keys; `PUT { rev, header, footer, brand }` (site:settings) replaces the
 * parts sent (an empty part goes back to the default) after `applyChromeForm`'s checks (400), then
 * the store's contract check (400) and `rev` (409).
 */
import {
  applyChromeForm,
  brandToForm,
  chromeMenuKeys,
  chromeSchemas,
  logoAsset,
} from "@cloudhal/core-ts/chrome";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const chrome: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json({
      header: site.chrome?.header ?? {},
      footer: site.chrome?.footer ?? {},
      brand: brandToForm(site.brand),
      schemas: chromeSchemas,
      menus: chromeMenuKeys(await store.listMenus(site.id)),
      rev: site.rev,
    });
  })
  .put("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.rev !== "number")
      throw badRequest("rev: the site revision the values were read at");
    const { site: next, issues } = await applyChromeForm(site, body, {
      menus: chromeMenuKeys(await store.listMenus(site.id)),
      resolve: async (assetId) => logoAsset(await store.getAsset(assetId), site),
    });
    if (issues.length > 0)
      throw badRequest(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    const saved = await store.updateSite({ ...next, rev: body.rev });
    return c.json({
      header: saved.chrome?.header ?? {},
      footer: saved.chrome?.footer ?? {},
      brand: brandToForm(saved.brand),
      rev: saved.rev,
    });
  });
