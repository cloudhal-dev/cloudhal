import { holds } from "@cloudhal/agent-runtime";
import { SITE_SEARCH_KINDS, type SiteSearchKind, searchSiteNodes } from "@cloudhal/core-ts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { requireSite } from "../governance.ts";

/** Kinds whose own screens need `site:read` (media, menus, redirects): left out for those without. */
const SITE_READ_KINDS = new Set<SiteSearchKind>(["asset", "menu", "redirect"]);

/**
 * `GET /api/sites/:siteId/search?q=&kinds=&limit=` (RFC-0029 §7): Studio's search over the site's
 * own nodes, drafts included, for the command palette. `content:read`; media, menus and redirects
 * only for people who may open their screens.
 */
export const siteSearch: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const site = await requireSite(c);
  const asked = (c.req.query("kinds") ?? "")
    .split(",")
    .filter((k): k is SiteSearchKind => (SITE_SEARCH_KINDS as readonly string[]).includes(k));
  const principal = c.get("principal");
  const mayRead = !principal || holds(principal.scopes, "site:read");
  const kinds = (asked.length > 0 ? asked : SITE_SEARCH_KINDS).filter(
    (k) => mayRead || !SITE_READ_KINDS.has(k),
  );
  const limit = Number(c.req.query("limit"));
  return c.json(
    await searchSiteNodes(c.get("store"), site.id, c.req.query("q") ?? "", {
      kinds,
      ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    }),
  );
});
