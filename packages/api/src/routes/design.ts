/**
 * `/api/sites/:siteId/design` (RFC-0021 §1, §5): the site's design rules (DESIGN.md) for Studio's
 * Settings › Design rules. `GET` (`content:read`) answers the theme's DESIGN.md, the site's, the
 * `design_lint` warnings and the site `rev`; `PUT { rev, markdown | null }` (`site:settings`, the
 * same as the design settings) writes `Site.design` and answers the warnings. People change the
 * rules here directly; agents propose them with `set_design`, which waits for a person.
 */
import { DESIGN_MAX_LENGTH, designLint } from "@cloudhal/core-ts/design";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const design: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const own = site.design?.markdown ?? null;
    return c.json({
      theme: store.themeDesign ?? null,
      site: own,
      warnings: own ? designLint(own, lintContext(store, site.theme.name)) : [],
      rev: site.rev,
    });
  })
  .put("/", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const body = (await c.req.json().catch(() => ({}))) as { rev?: unknown; markdown?: unknown };
    if (typeof body.rev !== "number")
      throw badRequest("rev: the site revision the rules were read at");
    if (body.markdown !== null && typeof body.markdown !== "string")
      throw badRequest("markdown: the whole DESIGN.md, or null to remove it");
    const markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
    if (markdown.length > DESIGN_MAX_LENGTH)
      throw badRequest(`markdown: at most ${DESIGN_MAX_LENGTH} characters`);
    const { design: _old, ...rest } = site;
    const saved = await store.updateSite({
      ...rest,
      rev: body.rev,
      ...(markdown ? { design: { markdown } } : {}),
    });
    return c.json({
      site: saved.design?.markdown ?? null,
      warnings: markdown ? designLint(markdown, lintContext(store, saved.theme.name)) : [],
      rev: saved.rev,
    });
  });

function lintContext(store: Env["Variables"]["store"], theme: string) {
  const settings = store.themeSettings as { properties?: Record<string, unknown> } | undefined;
  return {
    components: createCatalog({ name: theme, blocks: store.blocks }).names(),
    settings: Object.keys(settings?.properties ?? {}),
  };
}
