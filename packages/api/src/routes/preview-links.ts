/**
 * `POST /api/sites/:siteId/preview-links` — mints a signed, expiring link that makes the deployed
 * site render drafts (`target: "live"`) or a specific snapshot (`target: { snapshot }`).
 */
import { mintPreviewToken, previewUrl } from "@cloudhal/core-ts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const previewLinks: Hono<Env> = new Hono<Env>().post("/", async (c) => {
  const secret = c.get("previewSecret");
  if (!secret) throw notFound("preview links are not enabled on this server");
  const store = c.get("store");
  const site = await store.getSite(param(c, "siteId"));
  if (!site) throw notFound("site not found");
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
    target?: unknown;
    path?: unknown;
    ttlSeconds?: unknown;
  };
  let target: "live" | { snapshot: string } = "live";
  if (body.target !== undefined && body.target !== "live") {
    const snapshotId = (body.target as { snapshot?: unknown })?.snapshot;
    if (typeof snapshotId !== "string") throw badRequest('target must be "live" or { snapshot }');
    const snap = await store.getSnapshot(snapshotId);
    if (!snap || snap.siteId !== site.id) throw notFound("snapshot not found");
    target = { snapshot: snapshotId };
  }
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
  if (body.ttlSeconds !== undefined && (typeof body.ttlSeconds !== "number" || body.ttlSeconds <= 0))
    throw badRequest("ttlSeconds must be a positive number");
  const token = await mintPreviewToken(secret, {
    site: site.id,
    target,
    ...(typeof body.ttlSeconds === "number" ? { ttlSeconds: body.ttlSeconds } : {}),
  });
  const exp = JSON.parse(atob((token.split(".")[0] as string).replace(/-/g, "+").replace(/_/g, "/"))).exp as number;
  return c.json(
    {
      token,
      target,
      path,
      url: previewUrl(site, path, token) ?? null,
      expiresAt: new Date(exp * 1000).toISOString(),
    },
    201,
  );
});
