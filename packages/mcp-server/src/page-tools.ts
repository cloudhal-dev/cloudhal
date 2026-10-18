import { visibleSites } from "@cloudhal/agent-runtime";
/** Site and page tools: list, read, create, update and delete pages. */

import type { Page, Section } from "@cloudhal/core-contracts";
import {
  autoSnapshot,
  id,
  type JsonSchema,
  mapError,
  notifyBuild,
  obj,
  requireSite,
  str,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import {
  assertNoHtmlSections,
  mcpWriter,
  PAGE,
  type Seo,
  SITE,
  SNAPSHOT,
  sectionInput,
  unknownBlocks,
  unknownBlocksOf,
} from "./content-shared.ts";
import { menuHint, menuItemsHiddenBy } from "./menu-tools.ts";

const listSitesTool: ToolDefinition = {
  name: "list_sites",
  title: "List sites",
  description: "Sites this principal can operate.",
  inputSchema: obj({}),
  outputSchema: obj({ sites: { type: "array", items: SITE } }, ["sites"]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["site:read"],
  // RFC-0034 A2: only the sites the principal's person may open.
  handler: async (_a, ctx) => {
    const all = await ctx.store.listSites();
    const ids = visibleSites(
      ctx.principal,
      all.map((s) => s.id),
    );
    return { sites: all.filter((s) => ids.includes(s.id)) };
  },
};

const getSiteTool: ToolDefinition = {
  name: "get_site",
  title: "Get site",
  description: "A site with its page order, locales, theme and published snapshot.",
  inputSchema: obj({ siteId: id }, ["siteId"]),
  outputSchema: obj({ site: SITE }, ["site"]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["site:read"],
  handler: async (a, ctx) => ({ site: await requireSite(ctx, a.siteId as string) }),
};

const listPagesTool: ToolDefinition = {
  name: "list_pages",
  title: "List pages",
  description: "Pages of a site in navigation order (all statuses).",
  inputSchema: obj({ siteId: id }, ["siteId"]),
  outputSchema: obj({ pages: { type: "array", items: PAGE } }, ["pages"]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const order = new Map(site.pageIds.map((pid, i) => [pid, i]));
    const pages = (await ctx.store.listPages(site.id)).sort(
      (x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9),
    );
    return { pages };
  },
};

const getPageTool: ToolDefinition = {
  name: "get_page",
  title: "Get page",
  description: "One page with its sections and current revision (send `rev` back when updating).",
  inputSchema: obj({ siteId: id, pageId: id }, ["siteId", "pageId"]),
  outputSchema: obj({ page: PAGE }, ["page"]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== a.siteId)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    return { page };
  },
};

const createPageTool: ToolDefinition = {
  name: "create_page",
  title: "Create page",
  description:
    "Create a draft page and append it to the site's navigation. Snapshots the site afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      path: str("Absolute lower-case path, e.g. /about", {
        pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
      }),
      title: str("Page title"),
      locale: str("BCP 47 locale; defaults to the site's default locale"),
      sections: sectionInput,
      seo: PAGE.$defs ? ((PAGE.$defs as JsonSchema).Seo as JsonSchema) : { type: "object" },
    },
    ["siteId", "path", "title"],
  ),
  outputSchema: obj(
    { page: PAGE, site: SITE, snapshot: SNAPSHOT, hint: { type: "string" }, unknownBlocks },
    ["page", "site", "snapshot"],
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  handler: async (a, ctx) => {
    assertNoHtmlSections(a.sections);
    const site = await requireSite(ctx, a.siteId as string);
    try {
      const result = await ctx.store.createPage(
        site,
        {
          siteId: site.id,
          path: a.path as string,
          title: a.title as string,
          locale: (a.locale as string | undefined) ?? site.defaultLocale,
          status: "draft",
          sections: (a.sections as Section[] | undefined) ?? [],
          ...(a.seo ? { seo: a.seo as Seo } : {}),
        },
        { writer: mcpWriter(ctx) },
      );
      const snapshot = await autoSnapshot(ctx, site.id, "create_page");
      const hint = await menuHint(ctx, site.id, { kind: "page", id: result.page.id });
      return {
        ...result,
        snapshot,
        ...(hint ? { hint } : {}),
        ...unknownBlocksOf(ctx, { sections: result.page.sections }),
      };
    } catch (e) {
      mapError(e);
    }
  },
};

const updatePageTool: ToolDefinition = {
  name: "update_page",
  title: "Update page",
  description:
    "Replace a page's title, path, sections or seo, or set its own motion level and chrome (RFC-0025: header default|transparent|hidden, footer default|minimal|hidden; null goes back to the site's). Requires the current `rev` (optimistic locking). Status changes are not allowed here. Snapshots afterwards.",
  inputSchema: obj(
    {
      siteId: id,
      pageId: id,
      rev: { type: "integer", minimum: 0 },
      title: str("New title"),
      path: str("New path"),
      sections: sectionInput,
      seo: { type: "object" },
      motion: {
        type: ["string", "null"],
        enum: ["none", "subtle", "standard", "expressive", null],
        description: "This page's motion level over the site's (RFC-0024); null removes it",
      },
      chrome: {
        type: ["object", "null"],
        properties: {
          header: { type: "string", enum: ["default", "transparent", "hidden"] },
          footer: { type: "string", enum: ["default", "minimal", "hidden"] },
        },
        additionalProperties: false,
        description: "This page's header and footer (RFC-0025); null removes it",
      },
    },
    ["siteId", "pageId", "rev"],
  ),
  outputSchema: obj({ page: PAGE, snapshot: SNAPSHOT, unknownBlocks }, ["page", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  handler: async (a, ctx) => {
    assertNoHtmlSections(a.sections);
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== a.siteId)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    if (page.rev !== a.rev)
      throw new ToolError(
        "conflict",
        `page ${page.id} is at rev ${page.rev}, you sent ${a.rev}; reload and retry`,
      );
    const { motion: _motion, chrome: _chrome, ...kept } = page;
    const next: Page = {
      ...kept,
      ...(a.motion === undefined
        ? page.motion
          ? { motion: page.motion }
          : {}
        : a.motion
          ? { motion: a.motion as NonNullable<Page["motion"]> }
          : {}),
      ...(a.chrome === undefined
        ? page.chrome
          ? { chrome: page.chrome }
          : {}
        : a.chrome
          ? { chrome: a.chrome as NonNullable<Page["chrome"]> }
          : {}),
      ...(a.title ? { title: a.title as string } : {}),
      ...(a.path ? { path: a.path as string } : {}),
      ...(a.sections ? { sections: a.sections as Section[] } : {}),
      ...(a.seo ? { seo: a.seo as Seo } : {}),
    };
    try {
      const saved = await ctx.store.updatePage(next, { writer: mcpWriter(ctx) });
      const snapshot = await autoSnapshot(ctx, page.siteId, "update_page");
      await notifyBuild(() =>
        ctx.build?.pageChanged({
          siteId: page.siteId,
          page: saved,
          tool: "update_page",
          actor: ctx.principal.actor,
        }),
      );
      return { page: saved, snapshot, ...unknownBlocksOf(ctx, { sections: saved.sections }) };
    } catch (e) {
      mapError(e);
    }
  },
};

const deletePageTool: ToolDefinition = {
  name: "delete_page",
  title: "Delete page",
  description:
    "Delete a page and remove it from navigation. Destructive: requires approval. Snapshots afterwards.",
  inputSchema: obj({ siteId: id, pageId: id, rev: { type: "integer", minimum: 0 } }, [
    "siteId",
    "pageId",
    "rev",
  ]),
  outputSchema: obj({ site: SITE, snapshot: SNAPSHOT }, ["site", "snapshot"]),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  approvalPrompt: async (a, ctx) => {
    const page = await ctx.store.getPage(a.pageId as string);
    const menus = page
      ? await menuItemsHiddenBy(ctx, page.siteId, { kind: "page", id: page.id })
      : "";
    return `Delete page "${page?.title ?? a.pageId}" (${page?.path ?? ""})? This removes it from navigation; earlier snapshots keep a copy.${menus}`;
  },
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== site.id)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    try {
      const updated = await ctx.store.deletePage(site, { ...page, rev: a.rev as number });
      const snapshot = await autoSnapshot(ctx, site.id, "delete_page");
      return { site: updated, snapshot };
    } catch (e) {
      mapError(e);
    }
  },
};

/** list_sites … update_page, in `tools/list` order. */
export function siteAndPageTools(): ToolDefinition[] {
  return [listSitesTool, getSiteTool, listPagesTool, getPageTool, createPageTool, updatePageTool];
}

/** delete_page, listed after the surface tools. */
export function pageRemovalTools(): ToolDefinition[] {
  return [deletePageTool];
}
