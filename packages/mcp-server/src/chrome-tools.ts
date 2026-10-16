/**
 * Site chrome over MCP (RFC-0025 §5): `get_chrome` reads the header, footer and brand with the
 * form schemas and the menu keys they may name; `set_chrome` and `set_brand` change them and
 * always wait for a person (the chrome is on every page). Both are checked against the contract
 * and `checkChrome` before they are saved, and show on the site after a publish.
 */

import type { Site } from "@cloudhal/core-contracts";
import {
  brandFromForm,
  brandToForm,
  checkChrome,
  chromeMenuKeys,
  chromeSchemas,
  logoAsset,
  resolveChrome,
  type SiteChrome,
} from "@cloudhal/core-ts/chrome";
import { id, mapError, obj, type ToolContext, type ToolDefinition, ToolError } from "./common.ts";

async function requireSite(ctx: ToolContext, siteId: string): Promise<Site> {
  const site = await ctx.store.getSite(siteId);
  if (!site) throw new ToolError("not_found", `site ${siteId} not found`);
  return site;
}

/** `patch` onto `current`: a value replaces the part, null removes it. */
function merge<T extends object>(current: T | undefined, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch))
    if (v === null) delete out[k];
    else out[k] = v;
  return out as T;
}

const PART = {
  anyOf: [{ type: "object" }, { type: "null" }],
  description: "Fields to change (see get_chrome's schemas); null removes a field or the part",
};

export function chromeTools(): ToolDefinition[] {
  return [
    {
      name: "get_chrome",
      title: "Read the header and footer",
      description:
        "The site's header, footer and brand (RFC-0025): what is set, what pages show (the defaults filled in), the form schemas with every allowed value, and the menu keys the header and footer may name (primary is derived from pages when the site has no menu). Change them with set_chrome and set_brand; a page can hide its header or footer, or make the header transparent over its first band, with its own chrome field (update_page). A transparent header (overHero, or a page's chrome) only applies where the page opens with a Band painted inverse, brand, accent or gradient: it takes that surface's text color; elsewhere it stays solid. Below collapseAt the menus move behind a Menu button (mobileStyle: dropdown, drawer-start, drawer-end, fullscreen); render_page checks skip-link, landmarks, header-contrast and focus-obscured.",
      inputSchema: obj({ siteId: id }, ["siteId"]),
      outputSchema: obj(
        {
          chrome: { type: "object" },
          brand: { type: "object" },
          resolved: { type: "object" },
          schemas: { type: "object" },
          menus: { type: "array", items: { type: "string" } },
          rev: { type: "integer" },
        },
        ["chrome", "brand", "resolved", "schemas", "menus", "rev"],
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const { header, footer } = resolveChrome(site);
        return {
          chrome: site.chrome ?? {},
          brand: brandToForm(site.brand),
          resolved: { header, footer },
          schemas: chromeSchemas,
          menus: chromeMenuKeys(await ctx.store.listMenus(site.id)),
          rev: site.rev,
        };
      },
    },
    {
      name: "set_chrome",
      title: "Change the header and footer",
      description:
        "Change the site's header and footer (get_chrome lists the fields and allowed values). Each part's fields are merged onto the current ones; null removes a field, or the whole part (back to the default). Menus are named by key and must exist; a button action needs a label and a link; the copyright line knows {year} and {site}. Shows on every page after a publish. Always waits for a person.",
      inputSchema: obj(
        {
          siteId: id,
          rev: { type: "integer", minimum: 0, description: "The site's rev from get_chrome" },
          header: PART,
          footer: PART,
        },
        ["siteId", "rev"],
      ),
      outputSchema: obj({ chrome: { type: "object" }, rev: { type: "integer" } }, [
        "chrome",
        "rev",
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a) => {
        const parts = (["header", "footer"] as const).filter((k) => a[k] !== undefined);
        return `Change the site's ${parts.join(" and ") || "chrome"} (shown on every page)?`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const chrome: SiteChrome = { ...(site.chrome ?? {}) };
        for (const part of ["header", "footer"] as const) {
          const v = a[part];
          if (v === undefined) continue;
          if (v === null) delete chrome[part];
          else if (typeof v === "object" && !Array.isArray(v))
            (chrome as Record<string, unknown>)[part] = merge(
              chrome[part],
              v as Record<string, unknown>,
            );
          else throw new ToolError("invalid", `${part} must be an object or null`);
        }
        const issues = checkChrome(chrome, chromeMenuKeys(await ctx.store.listMenus(site.id)));
        if (issues.length > 0)
          throw new ToolError("invalid", issues.map((i) => `${i.path}: ${i.message}`).join("; "));
        const { chrome: _old, ...rest } = site;
        try {
          const saved = await ctx.store.updateSite({
            ...rest,
            rev: a.rev as number,
            ...(Object.keys(chrome).length > 0 ? { chrome } : {}),
          });
          return { chrome: saved.chrome ?? {}, rev: saved.rev };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "set_brand",
      title: "Change the logo and social links",
      description:
        "Change the site's brand (get_chrome lists the fields): logo and logoDark as an image asset of the site (asset:<id>, from list_assets or upload_asset; the site's name shows without one), logoHeight s|m|l, and social links (network and href, up to 8, shown in footers that ask for them). Fields are merged onto the current ones; null removes one. Always waits for a person.",
      inputSchema: obj(
        {
          siteId: id,
          rev: { type: "integer", minimum: 0, description: "The site's rev from get_chrome" },
          brand: { type: "object", description: "Fields to change; null removes one" },
        },
        ["siteId", "rev", "brand"],
      ),
      outputSchema: obj({ brand: { type: "object" }, rev: { type: "integer" } }, ["brand", "rev"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["site:write"],
      requiresApproval: true,
      approvalPrompt: async (a) => {
        const keys = Object.keys((a.brand ?? {}) as Record<string, unknown>);
        return `Change the site's brand (${keys.join(", ") || "none"}, shown on every page)?`;
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const values = merge<Record<string, unknown>>(
          brandToForm(site.brand),
          (a.brand ?? {}) as Record<string, unknown>,
        );
        const { brand, issues } = await brandFromForm(values, async (assetId) =>
          logoAsset(await ctx.store.getAsset(assetId), site),
        );
        if (issues.length > 0)
          throw new ToolError("invalid", issues.map((i) => `${i.path}: ${i.message}`).join("; "));
        const { brand: _old, ...rest } = site;
        try {
          const saved = await ctx.store.updateSite({
            ...rest,
            rev: a.rev as number,
            ...(brand ? { brand } : {}),
          });
          return { brand: brandToForm(saved.brand), rev: saved.rev };
        } catch (e) {
          mapError(e);
        }
      },
    },
  ];
}
