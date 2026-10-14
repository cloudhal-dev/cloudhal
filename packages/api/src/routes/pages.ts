import { renderPagePreview } from "@cloudhal/astro-renderer/preview";
import type { Page, Site } from "@cloudhal/core-contracts";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { pageDraft } from "../drafts.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";
import { type DraftPreview, previewResponse } from "../preview.ts";

async function requireSite(c: Context<Env>) {
  const site = await c.get("store").getSite(param(c, "siteId"));
  if (!site) throw notFound("site not found");
  return site;
}

async function loadPage(c: Context<Env>) {
  const site = await requireSite(c);
  const page = await c.get("store").getPage(param(c, "pageId"));
  if (!page || page.siteId !== site.id) throw notFound("page not found");
  return { site, page };
}

/** A page as the site renders it, with the entries its content lists show. */
async function pagePreview(c: Context<Env>, site: Site, page: Page): Promise<string> {
  const store = c.get("store");
  const collections = [
    ...new Set(page.sections.flatMap((s) => (s.kind === "contentList" ? [s.collection] : []))),
  ];
  const entries = Object.fromEntries(
    await Promise.all(
      collections.map(async (col) => [col, await store.listContentEntries(site.id, col)]),
    ),
  );
  return renderPagePreview(site, page, entries).html;
}

export const pages: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    await requireSite(c);
    return c.json(await c.get("store").listPages(param(c, "siteId")));
  })
  .post("/", async (c) => {
    const site = await requireSite(c);
    const input = (await c.req.json()) as Omit<
      Page,
      "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
    >;
    const result = await c.get("store").createPage(site, { ...input, siteId: site.id });
    return c.json(result, 201);
  })
  .get("/:pageId/preview", async (c) => {
    const { site, page } = await loadPage(c);
    return previewResponse(c, await pagePreview(c, site, page));
  })
  // The editor's unsaved title, SEO and sections (RFC-0014 phase 1c): writes nothing.
  .post("/:pageId/preview", async (c) => {
    const { site, page } = await loadPage(c);
    const draft = pageDraft(page, await c.req.json().catch(() => ({})));
    return c.json({ html: await pagePreview(c, site, draft) } satisfies DraftPreview);
  })
  .get("/:pageId", async (c) => {
    const page = await c.get("store").getPage(param(c, "pageId"));
    if (!page || page.siteId !== param(c, "siteId")) throw notFound("page not found");
    return c.json(page);
  })
  .put("/:pageId", async (c) => {
    const body = (await c.req.json()) as Page;
    if (body.id !== param(c, "pageId") || body.siteId !== param(c, "siteId"))
      throw badRequest("ids must match the URL");
    return c.json(await c.get("store").updatePage(body));
  })
  .delete("/:pageId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const page = await store.getPage(param(c, "pageId"));
    if (!page || page.siteId !== site.id) throw notFound("page not found");
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    const updated = await store.deletePage(site, { ...page, rev });
    return c.json({ site: updated });
  });
