import { type ServerType, serve } from "@hono/node-server";
import type { CloudhalApi } from "./app.ts";

export interface ServeNodeOptions {
  readonly port: number;
  /** Address to listen on (default `127.0.0.1`; `0.0.0.0` for every interface, e.g. a container). */
  readonly hostname?: string | undefined;
  /**
   * Behind a reverse proxy that terminates TLS: take the request's scheme and host from
   * `X-Forwarded-Proto` / `X-Forwarded-Host`, so the API's own origin (its CSRF and MCP origin
   * checks, upload tickets, links) is the public one. Only when the proxy is the only way in:
   * anyone who can reach the port directly can then claim any origin.
   */
  readonly trustProxy?: boolean | undefined;
}

/** Serves the API on Node. Resolves once listening; returns the server for shutdown. */
export function serveNode(
  app: CloudhalApi,
  options: ServeNodeOptions,
): Promise<{ server: ServerType; port: number }> {
  const fetch: typeof app.fetch = options.trustProxy
    ? (request, ...rest) => app.fetch(forwardedRequest(request), ...rest)
    : app.fetch;
  return new Promise((resolve) => {
    const server = serve(
      { fetch, port: options.port, hostname: options.hostname ?? "127.0.0.1" },
      (info) => {
        resolve({ server, port: info.port });
      },
    );
  });
}

/** A host name or IP, optionally with a port, as a proxy writes it (no path, no userinfo). */
const FORWARDED_HOST = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/;

/**
 * The URL a request had at the proxy, from `X-Forwarded-Proto` and `X-Forwarded-Host` (the first
 * value of each; a proxy chain appends). Unchanged when neither header says anything usable.
 */
export function forwardedUrl(url: string, headers: Headers): string {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const u = new URL(url);
  if (proto === "http" || proto === "https") u.protocol = `${proto}:`;
  if (host && FORWARDED_HOST.test(host)) {
    u.host = host;
    // the setter keeps the old port when the new host names none
    if (!/:\d+$/.test(host)) u.port = "";
  }
  return u.href;
}

/** The same request at its forwarded URL (the body streams through untouched). */
export function forwardedRequest(request: Request): Request {
  const url = forwardedUrl(request.url, request.headers);
  if (url === request.url) return request;
  const body = request.method === "GET" || request.method === "HEAD" ? null : request.body;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
    // a streamed body needs this (Node's fetch); not in the DOM typing
    ...(body ? { duplex: "half" } : {}),
  } as RequestInit);
}
