/** Search reindex and media placeholders (RFC-0019 §3, RFC-0028 §5). */

import { candidateOf, needsPlaceholder, type PlaceholderCandidate } from "@cloudhal/core-ts/media";
import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { param } from "../../params.ts";
import { NO_STORE } from "./shared.ts";

/** Reindex and placeholders. */
export function siteOpsAdminRoutes(): Hono<Env> {
  return (
    new Hono<Env>()
      // RFC-0019 §3: `cloudhal search reindex --remote` rebuilds the index from the live snapshot.
      .post("/sites/:siteId/search/reindex", async (c) => {
        const store = c.get("store");
        const siteId = param(c, "siteId");
        const site = await store.getSite(siteId);
        if (!site) return c.json({ error: "not_found", message: "site not found" }, 404, NO_STORE);
        await store.refreshSearch(siteId, { full: true });
        const status = await store.searchStatus(siteId);
        return c.json(
          { published: site.publishedSnapshotId ?? null, index: status ?? null },
          200,
          NO_STORE,
        );
      })
      // RFC-0028 §5: `cloudhal media placeholders --remote` draws placeholders in a local Chrome
      // for images nothing drew one for (agents, imports), and writes them back here.
      .get("/sites/:siteId/media-placeholders", async (c) => {
        const store = c.get("store");
        const siteId = param(c, "siteId");
        if (!(await store.getSite(siteId)))
          return c.json({ error: "not_found", message: "not found: site" }, 404, NO_STORE);
        const all = c.req.query("all") === "1";
        const assets: PlaceholderCandidate[] = [];
        let cursor: string | undefined;
        do {
          const page = await store.listAssets(siteId, {
            kind: ["image"],
            status: ["active", "retired"],
            ...(cursor ? { cursor } : {}),
          });
          for (const a of page.assets) if (needsPlaceholder(a, all)) assets.push(candidateOf(a));
          cursor = page.nextCursor;
        } while (cursor);
        return c.json({ assets }, 200, NO_STORE);
      })
      .put("/sites/:siteId/media-placeholders/:assetId", async (c) => {
        const store = c.get("store");
        const asset = await store.getAsset(param(c, "assetId"));
        if (!asset || asset.siteId !== param(c, "siteId") || !asset.image)
          return c.json({ error: "not_found", message: "not found: image" }, 404, NO_STORE);
        const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!b || b.rev !== asset.rev)
          return c.json(
            { error: "conflict", message: `the image is at rev ${asset.rev}; list again` },
            409,
            NO_STORE,
          );
        const lqip = b.lqip;
        const color = b.color;
        if (
          (lqip !== undefined &&
            (typeof lqip !== "string" ||
              !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(lqip) ||
              lqip.length > 4096)) ||
          (color !== undefined && (typeof color !== "string" || !/^#[0-9a-f]{6}$/.test(color)))
        )
          throw badRequest("lqip must be a small raster data: URL and color a lower-case #rrggbb");
        const { lqip: _l, color: _c, ...kept } = asset.image;
        const saved = await store.updateAsset({
          ...asset,
          image: {
            ...kept,
            ...(typeof lqip === "string" ? { lqip } : {}),
            ...(typeof color === "string" ? { color } : {}),
          },
        });
        return c.json({ asset: saved }, 200, NO_STORE);
      })
  );
}
