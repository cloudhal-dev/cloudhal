/**
 * RFC-0044 §3: how the authorization server fetches a client's metadata document (and, for a
 * `private_key_jwt` client, its `jwks_uri`). The `cimd()` plugin needs a transport that resolves
 * the host once, refuses special-use addresses and refuses redirects; Cloudhal already has one,
 * the SSRF-safe fetcher of media imports (`safeFetch`, RFC-0004 §5.7), so this adapter puts it
 * behind the plugin's `fetch`-shaped interface:
 *
 * - Node (`cloudhal studio`): `nodeTransport()` from `@cloudhal/core-ts/media-node` resolves every
 *   A/AAAA record, refuses the name if any address is not public, and pins the TLS connection to
 *   the vetted address.
 * - Workers: `workersTransport()` from `@cloudhal/core-ts/media` (DoH checks; Workers cannot pin,
 *   and their `fetch` has no route to private networks), with the deployment's own hosts in
 *   `blockedHosts`.
 *
 * Either way: https on port 443 only, DNS names only (no IP literals), no internal names, no
 * redirects followed, at most `CIMD_MAX_BYTES`, `CIMD_TIMEOUT_MS` in all, GET only, no request
 * headers from the plugin forwarded except `Accept` (so no conditional revalidation: every refetch
 * is a full 200 the plugin validates again). The plugin itself checks the JSON media type, the
 * size again, `client_id` = URL, the MCP profile and the cache headers this adapter passes back.
 *
 * Worker-safe: no Node imports (the Node transport is injected by the runtime).
 */
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { type FetchTransport, safeFetch } from "@cloudhal/core-ts/media";

/** RFC-0044 §3: "5 KB limit, 5 s timeout" (the plugin's own limits are the same). */
export const CIMD_MAX_BYTES = 5 * 1024;
export const CIMD_TIMEOUT_MS = 5_000;

/** Response headers the plugin reads (media type and HTTP caching); nothing else is passed on. */
const PASSED_HEADERS = [
  "content-type",
  "cache-control",
  "vary",
  "expires",
  "date",
  "age",
  "etag",
  "last-modified",
] as const;

export interface CimdFetchOptions {
  /** The SSRF-safe transport: `nodeTransport()` on Node, `workersTransport()` on Workers. */
  readonly transport: FetchTransport;
  /**
   * This deployment's own hosts, never fetched (its Studio, every site's domains); a function is
   * asked once per fetch, so the list follows domain changes without a read on other requests.
   */
  readonly blockedHosts?: readonly string[] | (() => Promise<readonly string[]>) | undefined;
  /** Whole fetch (default `CIMD_TIMEOUT_MS`); tests shorten it. */
  readonly timeoutMs?: number | undefined;
  /** Test seam: which resolved addresses count as public (default: `isPublicAddress`). */
  readonly isAllowedAddress?: ((address: string) => boolean) | undefined;
}

function urlOf(input: Parameters<ClientMetadataResourceFetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Rejects as soon as `signal` aborts (the plugin's own 5 s timer), else follows `p`. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** The plugin's `fetchClientMetadataResource` over `safeFetch`. */
export function cimdFetch(options: CimdFetchOptions): ClientMetadataResourceFetch {
  const timeoutMs = options.timeoutMs ?? CIMD_TIMEOUT_MS;
  return async (input, init) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "GET") throw new TypeError("client metadata is fetched with GET only");
    const blocked = options.blockedHosts;
    const blockedHosts = typeof blocked === "function" ? await blocked() : blocked;
    const result = await untilAborted(
      safeFetch(urlOf(input), {
        transport: options.transport,
        maxBytes: CIMD_MAX_BYTES,
        // The plugin checks the JSON media type itself (`application/json` or `+json`).
        accept: [],
        maxRedirects: 0,
        headersTimeoutMs: timeoutMs,
        totalTimeoutMs: timeoutMs,
        ...(blockedHosts ? { blockedHosts } : {}),
        ...(options.isAllowedAddress ? { isAllowedAddress: options.isAllowedAddress } : {}),
      }),
      init?.signal,
    );
    const headers = new Headers();
    for (const name of PASSED_HEADERS) {
      const value = result.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(new Uint8Array(result.bytes), { status: 200, headers });
  };
}
