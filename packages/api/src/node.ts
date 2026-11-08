import { isIP } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import type { CloudhalApi } from "./app.ts";
import { CLIENT_ADDRESS_HEADER } from "./tokens.ts";

export { CLIENT_ADDRESS_HEADER } from "./tokens.ts";

export interface ServeNodeOptions {
  readonly port: number;
  /** Address to listen on (default `127.0.0.1`; `0.0.0.0` for every IPv4 address, e.g. a container). */
  readonly hostname?: string | undefined;
  /**
   * Behind a reverse proxy that terminates TLS: take the request's scheme and host from
   * `X-Forwarded-Proto` / `X-Forwarded-Host` and the client's address from the last
   * `X-Forwarded-For` hop (the one the proxy appended), so the API's own origin (its CSRF and MCP
   * origin checks, upload tickets, links) is the public one and rate limits count the real client.
   * Only when the proxy is the only way in: anyone who can reach the port directly can then claim
   * any origin and any address.
   */
  readonly trustProxy?: boolean | undefined;
}

/**
 * Serves the API on Node. Every request reaches the app through `inboundRequest`: at its forwarded
 * URL when the proxy is trusted, and carrying the client's address in `CLIENT_ADDRESS_HEADER`
 * (#165). Resolves once listening; returns the server for shutdown.
 */
export function serveNode(
  app: CloudhalApi,
  options: ServeNodeOptions,
): Promise<{ server: ServerType; port: number }> {
  const trustProxy = options.trustProxy === true;
  const fetch: typeof app.fetch = (request, env, ctx) =>
    app.fetch(inboundRequest(request, { remoteAddress: socketAddress(env), trustProxy }), env, ctx);
  return new Promise((resolve) => {
    const server = serve(
      { fetch, port: options.port, hostname: options.hostname ?? "127.0.0.1" },
      (info) => {
        resolve({ server, port: info.port });
      },
    );
  });
}

/** `@hono/node-server` hands the Node request to `fetch` as its env (`HttpBindings.incoming`). */
function socketAddress(env: unknown): string | undefined {
  const incoming = (env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress;
}

/** The last value of a comma-separated forwarded header: the one the trusted proxy itself wrote. */
function lastHop(value: string | null | undefined): string | undefined {
  const v = value?.split(",").at(-1)?.trim();
  return v ? v : undefined;
}

/** A host name or IP, optionally with a port, as a proxy writes it (no path, no userinfo). */
const FORWARDED_HOST = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/;

/**
 * The URL a request had at the proxy, from `X-Forwarded-Proto` and `X-Forwarded-Host`: the last
 * value of each, which is the one the trusted proxy added (a client may send the header too, and a
 * chain appends; #165). Unchanged when neither header says anything usable.
 */
export function forwardedUrl(url: string, headers: Headers): string {
  const proto = lastHop(headers.get("x-forwarded-proto"))?.toLowerCase();
  const host = lastHop(headers.get("x-forwarded-host"));
  const u = new URL(url);
  if (proto === "http" || proto === "https") u.protocol = `${proto}:`;
  if (host && FORWARDED_HOST.test(host)) {
    u.host = host;
    // the setter keeps the old port when the new host names none
    if (!/:\d+$/.test(host)) u.port = "";
  }
  return u.href;
}

/**
 * The client's address as the API should count it (#165): the socket's, unless a trusted proxy is
 * in front; then the last `X-Forwarded-For` hop, which the proxy appended (every hop before it is
 * what the client sent), and the socket's again when the header is missing or not an address. An
 * IPv4 address mapped into IPv6 (`::ffff:203.0.113.9`, a dual-stack socket) comes back as IPv4.
 */
export function clientAddress(input: {
  readonly remoteAddress?: string | undefined;
  readonly forwardedFor?: string | null | undefined;
  readonly trustProxy: boolean;
}): string | undefined {
  const own = input.remoteAddress ? asAddress(input.remoteAddress) : undefined;
  if (!input.trustProxy) return own;
  const hop = lastHop(input.forwardedFor);
  return (hop ? asAddress(hop) : undefined) ?? own;
}

/** A bare IP, `[v6]`, `[v6]:port` or `v4:port`, normalised; undefined for anything else. */
function asAddress(value: string): string | undefined {
  let v = value.trim();
  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(v);
  if (bracketed) v = bracketed[1] as string;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  if (isIP(v) === 0) return undefined;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  return mapped ? (mapped[1] as string) : v.toLowerCase();
}

/**
 * The request as the app sees it: at its forwarded URL when the proxy is trusted, and with the
 * client's address in `CLIENT_ADDRESS_HEADER` (the client's own value of that header is dropped).
 * The request itself when nothing changes; the body streams through untouched.
 */
export function inboundRequest(
  request: Request,
  info: { readonly remoteAddress?: string | undefined; readonly trustProxy: boolean },
): Request {
  const url = info.trustProxy ? forwardedUrl(request.url, request.headers) : request.url;
  const address = clientAddress({
    remoteAddress: info.remoteAddress,
    forwardedFor: request.headers.get("x-forwarded-for"),
    trustProxy: info.trustProxy,
  });
  const sent = request.headers.has(CLIENT_ADDRESS_HEADER);
  if (url === request.url && address === undefined && !sent) return request;
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_ADDRESS_HEADER);
  if (address) headers.set(CLIENT_ADDRESS_HEADER, address);
  return rebuild(request, url, headers);
}

/** The same request at its forwarded URL (the body streams through untouched). */
export function forwardedRequest(request: Request): Request {
  const url = forwardedUrl(request.url, request.headers);
  return url === request.url ? request : rebuild(request, url, request.headers);
}

function rebuild(request: Request, url: string, headers: Headers): Request {
  const body = request.method === "GET" || request.method === "HEAD" ? null : request.body;
  return new Request(url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
    // a streamed body needs this (Node's fetch); not in the DOM typing
    ...(body ? { duplex: "half" } : {}),
  } as RequestInit);
}
