/**
 * `@cloudhal/core-ts/media-node` — the Node transport of the SSRF-safe fetcher (RFC-0004 §5.7).
 * Node only (never import it from Worker code; AGENTS.md rule 5).
 *
 * It resolves every A and AAAA record with the system resolver (`safeFetch` refuses the name if any
 * address is not public), then connects to exactly the vetted address through the request's
 * `lookup` hook, so a DNS answer that changes between check and connect (rebinding) is never used.
 * TLS still verifies the certificate against the host name (SNI `servername`). One connection per
 * request (`agent: false`): no pooled socket to another host can be reused.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import type { FetchTransport, TransportResponse } from "./media/fetcher.ts";

export interface NodeTransportOptions {
  /** Resolver (tests inject a fake one). Default: the system resolver, every address. */
  readonly resolve?: (hostname: string) => Promise<string[]>;
  /** TCP + TLS connect timeout. Default 5 s. */
  readonly connectTimeoutMs?: number;
  /**
   * Tests only: where the pinned address actually connects (a local plain-HTTP server). The URL
   * rules still require https; this replaces only the socket target and the protocol.
   */
  readonly testConnect?: (address: string) => { host: string; port: number };
}

function pinnedLookup(address: string): LookupFunction {
  const family = address.includes(":") ? 6 : 4;
  return ((
    _hostname: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  }) as unknown as LookupFunction;
}

export function nodeTransport(options: NodeTransportOptions = {}): FetchTransport {
  const resolve =
    options.resolve ??
    (async (hostname: string) =>
      (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address));
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
  return {
    name: "node",
    pins: true,
    resolve,
    request(url, init) {
      const address = init.address;
      if (!address) return Promise.reject(new Error("the node transport needs a vetted address"));
      return new Promise<TransportResponse>((resolvePromise, reject) => {
        const test = options.testConnect?.(address);
        const common = {
          method: "GET",
          path: `${url.pathname}${url.search}`,
          headers: { ...init.headers, host: url.host },
          agent: false as const,
          signal: init.signal,
        };
        const req = test
          ? http.request({ ...common, host: test.host, port: test.port })
          : https.request({
              ...common,
              host: url.hostname,
              port: 443,
              servername: url.hostname,
              lookup: pinnedLookup(address),
            });
        const timer = setTimeout(() => req.destroy(new Error("connect timeout")), connectTimeoutMs);
        req.once("socket", (socket) => {
          socket.once(test ? "connect" : "secureConnect", () => clearTimeout(timer));
        });
        req.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        req.once("response", (res) => {
          clearTimeout(timer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) for (const x of v) headers.append(k, x);
            else if (v !== undefined) headers.set(k, v);
          }
          resolvePromise({
            status: res.statusCode ?? 0,
            headers,
            body: Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>,
          });
        });
        req.end();
      });
    },
  };
}
