/**
 * `/api/sites/:siteId/theme-settings` (RFC-0017 §1): the theme's design settings — its schema
 * (`src/settings.ts`), and the site's values in `Site.theme.config`, for Studio's Appearance
 * form. `GET` needs `content:read`; `PUT { rev, values }` needs `site:settings` and writes the
 * site (checked by the store against the schema: 422 `invalid_props`; a stale `rev` is 409).
 */
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const themeSettings: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    return c.json({
      theme: site.theme.name,
      schema: store.themeSettings ?? null,
      values: site.theme.config ?? {},
      rev: site.rev,
    });
  })
  .put("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    if (!store.themeSettings) throw badRequest("this theme declares no design settings");
    const body = (await c.req.json().catch(() => ({}))) as { rev?: unknown; values?: unknown };
    if (typeof body.rev !== "number")
      throw badRequest("rev: the site revision the values were read at");
    if (typeof body.values !== "object" || body.values === null || Array.isArray(body.values))
      throw badRequest("values: an object");
    const saved = await store.updateSite({
      ...site,
      rev: body.rev,
      theme: { ...site.theme, config: body.values as Record<string, unknown> },
    });
    return c.json({ values: saved.theme.config ?? {}, rev: saved.rev });
  });
