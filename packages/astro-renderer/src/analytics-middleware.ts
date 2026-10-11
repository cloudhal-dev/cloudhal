/**
 * Analytics middleware (added by the `cloudhal()` integration in `cloudhal dev`; RFC-0006 §11):
 * answers `POST /__cloudhal/e`, serves the built scripts and injects the tag while recording, and
 * writes into the local SQLite store (`analytics-node.ts`). The Cloudflare Site Worker does the
 * same in its entry (`cloudflare-entry.ts`).
 */
import client from "virtual:cloudhal/analytics-client";
import config from "virtual:cloudhal/config";
import { analyticsBackend } from "@cloudhal/astro-renderer/runtime";
import {
  createNodeAnalytics,
  type NodeAnalyticsBackend,
  nodeAnalyticsSettings,
} from "./analytics-node.ts";

interface MiddlewareContext {
  request: Request;
  clientAddress?: string;
  isPrerendered?: boolean;
}

const { defaults, record } = nodeAnalyticsSettings(config);
const handler = createNodeAnalytics({
  siteId: config.siteId,
  backend: analyticsBackend(config.siteId, config) as NodeAnalyticsBackend,
  client,
  defaults,
  record,
  onError: (m, e) => console.warn(`cloudhal: ${m}`, e),
});

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  if (context.isPrerendered) return next();
  let ip: string | undefined;
  try {
    ip = context.clientAddress;
  } catch {
    ip = undefined;
  }
  return handler(context.request, next, ip);
}
