/** RFC-0020 surface tools: the catalog, JSON Patch drafts, A2UI / json-render import and export. */

import type { Page } from "@cloudhal/core-contracts";
import { ID_PREFIX, newId } from "@cloudhal/core-ts";
import {
  fromA2ui,
  fromJsonRender,
  InteropError,
  type InteropResult,
  toA2ui,
  toJsonRender,
} from "@cloudhal/core-ts/interop";
import { mediaPath } from "@cloudhal/core-ts/media";
import {
  catalogPrompt,
  type PatchOp,
  patchPage,
  SURFACE_LIMITS,
  SurfacePatchError,
} from "@cloudhal/core-ts/surfaces";
import {
  autoSnapshot,
  id,
  mapError,
  notifyBuild,
  obj,
  requireSite,
  str,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import {
  assertNoHtmlSections,
  mcpWriter,
  PAGE,
  SNAPSHOT,
  siteCatalog,
  unknownBlocks,
  unknownBlocksOf,
} from "./content-shared.ts";
import { PREVIEW_UI_URI } from "./preview-view.ts";

const getCatalogTool: ToolDefinition = {
  name: "get_catalog",
  title: "Get the UI catalog",
  description:
    "The components a page surface may use on this site (RFC-0020): Cloudhal's layout, content and interactive primitives plus the theme's block types, with their props, child rules, bindings ({path}), named functions, visibility conditions and limits, as instructions to follow. Read it before building or changing surfaces with patch_draft.",
  inputSchema: obj({ siteId: id }, ["siteId"]),
  outputSchema: obj(
    {
      catalog: { type: "string" },
      components: { type: "array", items: { type: "string" } },
      instructions: { type: "string" },
    },
    ["catalog", "components", "instructions"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const catalog = siteCatalog(site, ctx);
    return {
      catalog: catalog.id,
      components: catalog.names(),
      instructions: catalogPrompt(catalog, site.defaultLocale),
    };
  },
};

const patchDraftTool: ToolDefinition = {
  name: "patch_draft",
  ui: { resourceUri: PREVIEW_UI_URI },
  title: "Patch a page draft",
  description:
    'Build or change a page step by step with RFC 6902 JSON Patch operations on /title, /sections and /seo, e.g. {"op":"add","path":"/sections/-","value":{…a surface…}}. Every call is checked as a whole: misspelt component names are snapped to the catalog, unknown props dropped and missing required ones filled from the example (all listed in `repairs`), then every surface is validated. Failures come back as `invalid_surface` with VALIDATION_FAILED issues carrying JSON Pointers: fix those parts and send again. Requires the page\'s current `rev`; writes the draft and snapshots afterwards. Never publishes. Read get_catalog first.',
  inputSchema: obj(
    {
      siteId: id,
      pageId: id,
      rev: { type: "integer", minimum: 0 },
      ops: {
        type: "array",
        minItems: 1,
        maxItems: SURFACE_LIMITS.opsPerCall,
        items: obj(
          {
            op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
            path: str("JSON Pointer into the page, under /title, /sections or /seo"),
            from: str("For move and copy: JSON Pointer of the source"),
            value: {},
          },
          ["op", "path"],
        ),
      },
    },
    ["siteId", "pageId", "rev", "ops"],
  ),
  outputSchema: obj(
    {
      page: PAGE,
      snapshot: SNAPSHOT,
      repairs: { type: "array", items: { type: "string" } },
      unknownBlocks,
    },
    ["page", "snapshot", "repairs"],
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  handler: (a, ctx) =>
    applyDraftOps(ctx, "patch_draft", {
      siteId: a.siteId as string,
      pageId: a.pageId as string,
      rev: a.rev as number,
      ops: () => a.ops as PatchOp[],
    }),
};

const importSurfaceTool: ToolDefinition = {
  name: "import_surface",
  ui: { resourceUri: PREVIEW_UI_URI },
  title: "Import a surface",
  description:
    "Add (or replace) a page surface from another generative-UI format: `a2ui` takes A2UI v0.9 messages (createSurface, updateComponents, updateDataModel; basic catalog), `json-render` takes a spec ({root, elements, state?}) written against Cloudhal's catalog. What has no Cloudhal equivalent (server events, text fields, image URLs, unknown functions) is left out and listed in `notes`; the result then goes through the same repairs and validation as patch_draft. Requires the page's current `rev`; writes the draft and snapshots afterwards. Never publishes.",
  inputSchema: obj(
    {
      siteId: id,
      pageId: id,
      rev: { type: "integer", minimum: 0 },
      format: { type: "string", enum: ["a2ui", "json-render"] },
      document: {
        description:
          "a2ui: the array of messages (or JSON Lines text); json-render: the spec object (or its JSON text)",
      },
      surfaceId: str("a2ui: which surface of the messages, when they hold several"),
      replaceSectionId: {
        ...id,
        description: "Replace this surface section instead of adding a new one at the end",
      },
    },
    ["siteId", "pageId", "rev", "format", "document"],
  ),
  outputSchema: obj(
    {
      page: PAGE,
      snapshot: SNAPSHOT,
      sectionId: id,
      notes: { type: "array", items: { type: "string" } },
      repairs: { type: "array", items: { type: "string" } },
      unknownBlocks,
    },
    ["page", "snapshot", "sectionId", "notes", "repairs"],
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  scopes: ["content:write"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== site.id)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    const replace = a.replaceSectionId as string | undefined;
    const at = replace ? page.sections.findIndex((s) => s.id === replace) : -1;
    if (replace && (at < 0 || page.sections[at]?.kind !== "surface"))
      throw new ToolError("not_found", `page ${page.id} has no surface section ${replace}`);
    const sectionId = replace ?? newId(ID_PREFIX.section);
    const converted = convertSurface(a, sectionId, siteCatalog(site, ctx).id);
    const result = await applyDraftOps(ctx, "import_surface", {
      siteId: site.id,
      pageId: page.id,
      rev: a.rev as number,
      ops: () => [
        replace
          ? { op: "replace", path: `/sections/${at}`, value: converted.surface }
          : { op: "add", path: "/sections/-", value: converted.surface },
      ],
    });
    return { ...result, sectionId, notes: converted.notes };
  },
};

const exportSurfaceTool: ToolDefinition = {
  name: "export_surface",
  title: "Export a surface",
  description:
    "A page's surface section in another generative-UI format: `a2ui` (A2UI v0.9 messages for the basic catalog, images as absolute URLs when the site has a primary domain) or `json-render` (a spec with the data as state). What the format cannot express is listed in `notes`. Read-only.",
  inputSchema: obj(
    {
      siteId: id,
      pageId: id,
      sectionId: id,
      format: { type: "string", enum: ["a2ui", "json-render"] },
    },
    ["siteId", "pageId", "sectionId", "format"],
  ),
  outputSchema: obj(
    {
      format: { type: "string" },
      document: {},
      notes: { type: "array", items: { type: "string" } },
    },
    ["format", "document", "notes"],
  ),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const page = await ctx.store.getPage(a.pageId as string);
    if (!page || page.siteId !== site.id)
      throw new ToolError("not_found", `page ${a.pageId} not found`);
    const section = page.sections.find((s) => s.id === a.sectionId);
    if (section?.kind !== "surface")
      throw new ToolError("not_found", `page ${page.id} has no surface section ${a.sectionId}`);
    if (a.format === "json-render") {
      const { spec, notes } = toJsonRender(section);
      return { format: "json-render", document: spec, notes };
    }
    const host = site.domains.find((d) => d.primary)?.hostname;
    const urls = new Map<string, string>();
    if (host)
      for (const c of section.components) {
        const ref = c.component === "Image" ? c.props?.asset : undefined;
        if (typeof ref !== "string" || !ref.startsWith("asset:")) continue;
        const asset = await ctx.store.getAsset(ref.slice("asset:".length));
        if (asset && asset.siteId === site.id) urls.set(ref, `https://${host}${mediaPath(asset)}`);
      }
    const { messages, notes } = toA2ui(section, { assetUrl: (ref) => urls.get(ref) });
    return { format: "a2ui", document: messages, notes };
  },
};

/** get_catalog … export_surface, in `tools/list` order. */
export function surfaceTools(): ToolDefinition[] {
  return [getCatalogTool, patchDraftTool, importSurfaceTool, exportSurfaceTool];
}

/**
 * `patch_draft`'s write path, shared with `import_surface`: CAS on the page's `rev`, repairs and
 * validation (`patchPage`), the store write, one snapshot and the build events.
 */
async function applyDraftOps(
  ctx: ToolContext,
  tool: string,
  input: { siteId: string; pageId: string; rev: number; ops: () => PatchOp[] },
) {
  const site = await requireSite(ctx, input.siteId);
  const page = await ctx.store.getPage(input.pageId);
  if (!page || page.siteId !== site.id)
    throw new ToolError("not_found", `page ${input.pageId} not found`);
  if (page.rev !== input.rev)
    throw new ToolError(
      "conflict",
      `page ${page.id} is at rev ${page.rev}, you sent ${input.rev}; reload with get_page and retry`,
    );
  const ops = input.ops();
  let patched: { value: Page; notes: string[] };
  try {
    patched = patchPage(page, ops, siteCatalog(site, ctx));
  } catch (e) {
    if (e instanceof SurfacePatchError) {
      await notifyBuild(() =>
        ctx.build?.patchRejected({
          siteId: site.id,
          pageId: page.id,
          tool,
          actor: ctx.principal.actor,
          issues: e.issues,
        }),
      );
      throw new ToolError(
        "invalid_surface",
        `${e.message}. Fix the parts at these JSON Pointers and send the operations again; get_catalog lists every component and its props`,
        { issues: e.issues },
      );
    }
    throw e;
  }
  assertNoHtmlSections(patched.value.sections);
  try {
    const saved = await ctx.store.updatePage(patched.value, { writer: mcpWriter(ctx) });
    const snapshot = await autoSnapshot(ctx, page.siteId, tool);
    await notifyBuild(() =>
      ctx.build?.pageChanged({
        siteId: site.id,
        page: saved,
        tool,
        actor: ctx.principal.actor,
        ops: ops as unknown[],
        repairs: patched.notes,
      }),
    );
    return {
      page: saved,
      snapshot,
      repairs: patched.notes,
      ...unknownBlocksOf(ctx, { sections: saved.sections }),
    };
  } catch (e) {
    mapError(e);
  }
}

/** `import_surface`'s document as a Cloudhal surface (A2UI messages or a json-render spec). */
function convertSurface(
  a: Record<string, unknown>,
  sectionId: string,
  catalog: string,
): InteropResult {
  const parse = (raw: unknown, lines: boolean): unknown => {
    if (typeof raw !== "string") return raw;
    try {
      return lines
        ? raw
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => JSON.parse(l))
        : JSON.parse(raw);
    } catch {
      throw new ToolError("invalid", "document is not valid JSON (or JSON Lines for a2ui)");
    }
  };
  try {
    if (a.format === "a2ui") {
      const doc = parse(a.document, true);
      const messages = Array.isArray(doc) ? doc : [doc];
      return fromA2ui(messages, {
        sectionId,
        catalog,
        ...(typeof a.surfaceId === "string" ? { surfaceId: a.surfaceId } : {}),
      });
    }
    return fromJsonRender(parse(a.document, false), { sectionId, catalog });
  } catch (e) {
    if (e instanceof InteropError) throw new ToolError("invalid", e.message);
    throw e;
  }
}
