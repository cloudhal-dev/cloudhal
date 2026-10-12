/**
 * Comments middleware (added by the `cloudhal()` integration in `cloudhal dev`; RFC-0007 §15.2):
 * answers the comment endpoints and serves the built module and worker, writing into the local
 * SQLite store (`comments-node.ts`). The Cloudflare Site Worker does the same in its entry
 * (`cloudflare-entry.ts`).
 */
import client from "virtual:cloudhal/comments-client";
import config from "virtual:cloudhal/config";
import { analyticsBackend } from "@cloudhal/astro-renderer/runtime";
import { createNodeComments, localCommentsKey, type NodeCommentsBackend } from "./comments-node.ts";

interface MiddlewareContext {
  request: Request;
  clientAddress?: string;
}

const handler = createNodeComments({
  siteId: config.siteId,
  // the same local store, site row and published snapshots analytics read
  backend: analyticsBackend(config.siteId, config) as NodeCommentsBackend,
  client: config.comments?.available === false ? null : client,
  secret: () => localCommentsKey(config.dataDir),
  onError: (m, e) => console.warn(`cloudhal: ${m}`, e),
});

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  // The socket address (Astro's `clientAddress`), never a request header.
  let ip: string | undefined;
  try {
    ip = context.clientAddress;
  } catch {
    ip = undefined;
  }
  return handler(context.request, next, ip);
}
