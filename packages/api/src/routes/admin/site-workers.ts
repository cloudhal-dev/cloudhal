/**
 * RFC-0034 §4: the site Workers attached to this installation (`site_workers`), written by
 * `cloudhal deploy` in a project with `cloudhal.json` `installation`, read by the installation's
 * own deploy to bind them to the admin Worker so a site's purges reach the Worker that serves it.
 *
 * - `GET    /site-workers` → {workers: [{name, url, theme, siteIds, updatedAt}]}
 * - `PUT    /site-workers/:name` ← {url, theme, siteIds} → the row (upsert)
 * - `DELETE /site-workers/:name`
 */

import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { param } from "../../params.ts";
import { type AdminDeps, NO_STORE } from "./shared.ts";

/** A Worker script name, as Cloudflare accepts it. */
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type Row = {
  name: string;
  url: string;
  theme: string;
  site_ids: string;
  updated_at: string;
};

const view = (r: Row) => ({
  name: r.name,
  url: r.url,
  theme: r.theme,
  siteIds: JSON.parse(r.site_ids) as string[],
  updatedAt: r.updated_at,
});

export function siteWorkersAdminRoutes(deps: AdminDeps): Hono<Env> {
  const sql = deps.storage.sql;
  return new Hono<Env>()
    .get("/site-workers", async (c) => {
      const rows = await sql.all<Row>("SELECT * FROM site_workers ORDER BY name");
      return c.json({ workers: rows.map(view) }, 200, NO_STORE);
    })
    .put("/site-workers/:name", async (c) => {
      const name = param(c, "name");
      if (!NAME.test(name)) throw badRequest("name: a Worker script name");
      const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      if (typeof b.url !== "string" || !/^https:\/\/[^\s]+$/.test(b.url))
        throw badRequest("url: the Worker's https address");
      if (typeof b.theme !== "string" || !b.theme || b.theme.length > 200)
        throw badRequest("theme: the theme the Worker renders");
      const ids = b.siteIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === "string"))
        throw badRequest("siteIds: the sites the Worker serves");
      const known = new Set((await c.get("store").listSites()).map((s) => s.id));
      const unknown = (ids as string[]).filter((i) => !known.has(i));
      if (unknown.length > 0) throw badRequest(`unknown site(s): ${unknown.join(", ")}`);
      const at = new Date().toISOString();
      await sql.run(
        "INSERT INTO site_workers (name, url, theme, site_ids, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET url = excluded.url, theme = excluded.theme, site_ids = excluded.site_ids, updated_at = excluded.updated_at",
        [name, b.url, b.theme, JSON.stringify([...new Set(ids as string[])]), at],
      );
      const row = await sql.get<Row>("SELECT * FROM site_workers WHERE name = ?", [name]);
      return c.json({ worker: view(row as Row) }, 200, NO_STORE);
    })
    .delete("/site-workers/:name", async (c) => {
      const r = await sql.run("DELETE FROM site_workers WHERE name = ?", [param(c, "name")]);
      return c.json({ deleted: r.changes === 1 }, 200, NO_STORE);
    });
}
