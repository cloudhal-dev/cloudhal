/**
 * `/api/sites/:siteId/block-types` (RFC-0015 §6): the deployment's block registry — the built-ins
 * and the theme's types — for Studio's "Add section" menu and generated forms. `content:read`.
 */
import { Hono } from "hono";
import type { Env } from "../context.ts";

export const blockTypes: Hono<Env> = new Hono<Env>().get("/", (c) =>
  c.json({ types: c.get("store").blocks.list() }),
);
