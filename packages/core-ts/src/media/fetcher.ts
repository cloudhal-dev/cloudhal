/**
 * The server-side fetcher behind `fetch_asset_url`, Studio's "From URL", `cloudhal media
 * import-urls` and `cloudhal media verify` (RFC-0004 §5.7). Worker-safe; the network goes through a
 * `FetchTransport`:
 *
 * - `nodeTransport()` (`@cloudhal/core-ts/media-node`): resolves every A/AAAA record itself, checks
 *   them all and pins the TLS connection to the vetted address, so a DNS-rebinding answer between
 *   check and connect is never used.
 * - `workersTransport()` (here): Workers cannot choose the address `fetch` connects to, so it cannot
 *   pin. It resolves through DNS-over-HTTPS and refuses names with private answers (which stops
 *   `127.0.0.1.nip.io`-style names), and relies on the platform for the rest: outbound `fetch` runs
 *   from Cloudflare's network, which has no route to the operator's private networks, loopback or
 *   cloud metadata endpoints. Every other rule (scheme, port, IP literals, internal names,
 *   redirects, size, time, content type, allowlist) applies unchanged.
 *
 * Rules: https on port 443 only, no userinfo, ≤ 2,048 characters; DNS names only (IP literals in
 * any notation are refused); internal names refused; every resolved address must be public; at most
 * 3 redirects, each re-checked; status 200; Content-Type in the allowlist; bytes counted while
 * streaming; connect/headers and total time limits; no cookies or credentials sent; errors never
 * echo the response body.
 */
import { InvariantError } from "../errors.ts";
import { normalizeMediaType } from "./types.ts";

export const FETCH_USER_AGENT = "Cloudhal-Fetch/1 (+https://cloudhal.dev/fetch)";

export interface TransportResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
}

export interface FetchTransport {
  readonly name: string;
  /** True when `request` connects to exactly the `address` it is given (DNS pinning). */
  readonly pins: boolean;
  /** Every A and AAAA address of a name. Without it the transport cannot check addresses. */
  resolve?(hostname: string): Promise<string[]>;
  /** One GET, never following redirects. `address` is the vetted address to connect to. */
  request(
    url: URL,
    init: { address?: string; headers: Record<string, string>; signal: AbortSignal },
  ): Promise<TransportResponse>;
}

export interface SafeFetchOptions {
  readonly transport: FetchTransport;
  /** Bytes, counted while streaming (Content-Length is advisory). */
  readonly maxBytes: number;
  /** Accepted media types (Content-Type must be one of them). Empty = any (verify only). */
  readonly accept: readonly string[];
  /** When set, every hop's host must be on it (`example.com` or `*.example.com`). */
  readonly allowHosts?: readonly string[] | undefined;
  /** This deployment's own hosts (site, Studio, workers.dev): never fetched. */
  readonly blockedHosts?: readonly string[] | undefined;
  readonly maxRedirects?: number;
  /** Connect and response headers. Default 5 s (RFC-0004 §5.7 rule 5). */
  readonly headersTimeoutMs?: number;
  /** Whole fetch including the body. Default 30 s. */
  readonly totalTimeoutMs?: number;
  /** Test seam; defaults to `isPublicAddress`. */
  readonly isAllowedAddress?: (address: string) => boolean;
  /**
   * Streams the body to this callback instead of buffering it (`cloudhal media verify` hashes
   * multi-gigabyte external files this way); `bytes` is then empty and `size` counts the body.
   */
  readonly onChunk?: (chunk: Uint8Array) => void;
}

export interface SafeFetchResult {
  readonly bytes: Uint8Array;
  /** The response's media type (normalised, no parameters). */
  readonly contentType: string | undefined;
  /** The URL the bytes came from (after redirects). */
  readonly url: string;
  /** Every URL requested, in order (the first is the input). */
  readonly chain: readonly string[];
  /** The vetted address the last hop connected to (pinning transports). */
  readonly address?: string;
  /** Bytes received (also when streamed to `onChunk`). */
  readonly size: number;
}

// ───────────────────────────── addresses ─────────────────────────────

function parseIpv4(s: string): number | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return undefined;
  return (
    (((parts[0] as number) << 24) |
      ((parts[1] as number) << 16) |
      ((parts[2] as number) << 8) |
      (parts[3] as number)) >>>
    0
  );
}

function parseIpv6(input: string): bigint | undefined {
  let s = input.toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s.includes("%")) return undefined; // zone ids: link-local by definition
  let tail: number[] = [];
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (v4) {
    const n = parseIpv4(v4[1] as string);
    if (n === undefined) return undefined;
    tail = [n >>> 16, n & 0xffff];
    s = s.slice(0, -(v4[1] as string).length);
    if (s.endsWith(":") && !s.endsWith("::")) s = s.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return undefined;
  const parse = (part: string) =>
    part === ""
      ? []
      : part
          .split(":")
          .map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? Number.parseInt(h, 16) : Number.NaN));
  const head = parse(halves[0] as string);
  const rest = halves.length === 2 ? parse(halves[1] as string) : [];
  const given = head.length + rest.length + tail.length;
  if ([...head, ...rest].some(Number.isNaN)) return undefined;
  let groups: number[];
  if (halves.length === 2) {
    if (given > 7) return undefined;
    groups = [...head, ...Array(8 - given).fill(0), ...rest, ...tail];
  } else {
    if (given !== 8) return undefined;
    groups = [...head, ...tail];
  }
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Public(n: number): boolean {
  return V4_BLOCKED.every(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 !== ((parseIpv4(base) as number) & mask) >>> 0;
  });
}

const inPrefix = (n: bigint, base: bigint, bits: number) =>
  n >> BigInt(128 - bits) === base >> BigInt(128 - bits);

function v6Public(n: bigint): boolean {
  const low32 = Number(n & 0xffffffffn);
  // IPv4-mapped ::ffff:0:0/96 and NAT64 64:ff9b::/96 are checked as the IPv4 address they carry.
  if (inPrefix(n, 0xffffn << 32n, 96) || inPrefix(n, 0x64ff9bn << 96n, 96)) return v4Public(low32);
  // 6to4 2002::/16 carries an IPv4 address in bits 16–48.
  if (inPrefix(n, 0x2002n << 112n, 16)) return v4Public(Number((n >> 80n) & 0xffffffffn));
  // Only global unicast (2000::/3) is public; documentation, Teredo, ORCHID and benchmarking
  // ranges inside it are not. ::, ::1, fc00::/7, fe80::/10, ff00::/8, 100::/64 fall outside 2000::/3.
  if (!inPrefix(n, 0x1n << 125n, 3)) return false;
  const blocked: [bigint, number][] = [
    [0x20010db8n << 96n, 32], // documentation
    [0x2001n << 112n, 32], // Teredo
    [0x20010010n << 96n, 28], // ORCHID
    [0x20010020n << 96n, 28], // ORCHIDv2
    [0x20010002n << 96n, 48], // benchmarking
    [0x3fff0000n << 96n, 20], // documentation (RFC 9637)
  ];
  return blocked.every(([base, bits]) => !inPrefix(n, base, bits));
}

/** Whether an address is publicly routable (RFC-0004 §5.7 rule 3, IPv4 and IPv6). */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4 !== undefined) return v4Public(v4);
  const v6 = parseIpv6(address);
  return v6 !== undefined && v6Public(v6);
}

/** Whether a string is an IP literal in any notation the URL parser or a resolver accepts. */
export function isIpLiteral(host: string): boolean {
  const h = host.toLowerCase();
  if (h.startsWith("[") || h.includes(":")) return true;
  // Dotted, decimal, octal and hex forms (`2130706433`, `0x7f.1`, `0177.0.0.1`, `127.1`).
  return /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}\.?$/.test(h);
}

// ───────────────────────────── names and URLs ─────────────────────────────

const BLOCKED_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "home.arpa",
  "arpa",
  "localdomain",
  "lan",
  "intranet",
  "corp",
  "private",
  "test",
  "invalid",
  "example",
  "onion",
];

function blocked(message: string, details: Record<string, unknown> = {}): never {
  throw new InvariantError("fetch_blocked", message, details);
}

function failed(message: string, details: Record<string, unknown> = {}): never {
  throw new InvariantError("fetch_failed", message, details);
}

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/\.$/, "");
  if (p.startsWith("*.")) return host.endsWith(p.slice(1)) && host.length > p.length - 1;
  return host === p;
}

/** Rules 1, 2 and 4 (allowlist) for one URL; returns the parsed URL. */
export function checkFetchUrl(
  input: string | URL,
  options: Pick<SafeFetchOptions, "allowHosts" | "blockedHosts"> = {},
): URL {
  const raw = String(input);
  if (raw.length > 2048) blocked("the URL is longer than 2,048 characters");
  if (/[\s\\]/.test(raw.trim())) blocked("the URL contains whitespace or backslashes");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    blocked("that is not a valid URL");
  }
  if (url.protocol !== "https:") blocked("only https URLs can be fetched");
  if (url.username || url.password) blocked("URLs with credentials are not fetched");
  if (url.port !== "" && url.port !== "443")
    blocked("only the default https port (443) is allowed");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host) || isIpLiteral(url.host))
    blocked("IP addresses are not fetched; use the host name");
  if (BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`)))
    blocked(`${host} is an internal name`);
  if (
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
  )
    blocked("the host must be a public DNS name");
  if ((options.blockedHosts ?? []).some((p) => hostMatches(host, p)))
    blocked(`${host} belongs to this deployment and is never fetched`);
  if (
    options.allowHosts &&
    options.allowHosts.length > 0 &&
    !options.allowHosts.some((p) => hostMatches(host, p))
  )
    blocked(`${host} is not on this site's list of hosts media may be fetched from`, {
      allowHosts: [...options.allowHosts],
    });
  return url;
}

// ───────────────────────────── the fetch ─────────────────────────────

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

async function readBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
  onChunk?: (chunk: Uint8Array) => void,
): Promise<{ bytes: Uint8Array; size: number }> {
  if (!body) return { bytes: new Uint8Array(0), size: 0 };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => reader.cancel().catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) failed("the download took too long");
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new InvariantError(
          "too_large",
          `the file is larger than ${Math.round(maxBytes / 1048576)} MB`,
          {
            limit: maxBytes,
          },
        );
      }
      if (onChunk) onChunk(value);
      else chunks.push(value);
    }
  } catch (e) {
    if (e instanceof InvariantError) throw e;
    if (signal.aborted) failed("the download took too long");
    failed("the download was interrupted");
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  const out = new Uint8Array(onChunk ? 0 : total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return { bytes: out, size: total };
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  controller: AbortController,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new InvariantError("fetch_failed", what));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Fetches a URL under every rule of RFC-0004 §5.7. */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const { transport } = options;
  const maxRedirects = options.maxRedirects ?? 3;
  const allowed = options.isAllowedAddress ?? isPublicAddress;
  const controller = new AbortController();
  const total = setTimeout(() => controller.abort(), options.totalTimeoutMs ?? 30_000);
  const chain: string[] = [];
  try {
    let url = checkFetchUrl(input, options);
    for (let hop = 0; ; hop++) {
      chain.push(url.toString());
      let address: string | undefined;
      if (transport.resolve) {
        let addresses: string[];
        try {
          addresses = await withTimeout(
            transport.resolve(url.hostname),
            options.headersTimeoutMs ?? 5_000,
            controller,
            `${url.hostname} did not resolve in time`,
          );
        } catch (e) {
          if (e instanceof InvariantError) throw e;
          failed(`${url.hostname} could not be resolved`);
        }
        if (addresses.length === 0) failed(`${url.hostname} could not be resolved`);
        // Every address must be public, not just the one we would use (rule 3).
        const bad = addresses.find((a) => !allowed(a));
        if (bad !== undefined)
          blocked(`${url.hostname} resolves to a private or reserved address`, {
            host: url.hostname,
          });
        address = addresses[0];
      }
      const accept = options.accept.length ? options.accept.join(", ") : "*/*";
      let res: TransportResponse;
      try {
        res = await withTimeout(
          transport.request(url, {
            ...(address !== undefined ? { address } : {}),
            headers: { accept, "user-agent": FETCH_USER_AGENT },
            signal: controller.signal,
          }),
          options.headersTimeoutMs ?? 5_000,
          controller,
          `${url.hostname} did not answer in time`,
        );
      } catch (e) {
        if (e instanceof InvariantError) throw e;
        if (controller.signal.aborted) failed("the download took too long");
        failed(`could not connect to ${url.hostname}`);
      }
      if (REDIRECTS.has(res.status)) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (!location) failed(`${url.hostname} answered ${res.status} without a location`);
        if (hop >= maxRedirects) blocked(`more than ${maxRedirects} redirects`, { chain });
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          failed("the redirect target is not a valid URL");
        }
        // Every hop is re-validated, and must stay https (rules 1, 2, 4).
        url = checkFetchUrl(next, options);
        continue;
      }
      if (res.status !== 200) {
        await res.body?.cancel().catch(() => {});
        failed(`the server answered ${res.status}`, { status: res.status });
      }
      const contentType = normalizeMediaType(res.headers.get("content-type"));
      if (options.accept.length > 0) {
        if (contentType === "text/html" || contentType === "application/xhtml+xml") {
          await res.body?.cancel().catch(() => {});
          failed("that URL is a web page; pass the address of the image itself");
        }
        if (!contentType || !options.accept.includes(contentType)) {
          await res.body?.cancel().catch(() => {});
          failed(
            `the server says this is ${contentType ?? "an unknown type"}, which is not accepted`,
            {
              contentType: contentType ?? null,
            },
          );
        }
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        await res.body?.cancel().catch(() => {});
        throw new InvariantError(
          "too_large",
          `the file is larger than ${Math.round(options.maxBytes / 1048576)} MB`,
          {
            limit: options.maxBytes,
          },
        );
      }
      const { bytes, size } = await readBody(
        res.body,
        options.maxBytes,
        controller.signal,
        options.onChunk,
      );
      return {
        bytes,
        size,
        contentType,
        url: url.toString(),
        chain,
        ...(address !== undefined && transport.pins ? { address } : {}),
      };
    }
  } finally {
    clearTimeout(total);
  }
}

// ───────────────────────────── Workers transport ─────────────────────────────

/** A, AAAA lookups over DNS-over-HTTPS (JSON API). Used where the runtime has no resolver. */
export function dohResolver(
  options: { endpoint?: string; fetch?: typeof fetch } = {},
): (hostname: string) => Promise<string[]> {
  const endpoint = options.endpoint ?? "https://cloudflare-dns.com/dns-query";
  const f = options.fetch ?? fetch;
  const query = async (name: string, type: "A" | "AAAA") => {
    const res = await f(`${endpoint}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) throw new Error(`DoH ${res.status}`);
    const body = (await res.json()) as {
      Status?: number;
      Answer?: { type: number; data: string }[];
    };
    if (body.Status !== 0) return [];
    const want = type === "A" ? 1 : 28;
    return (body.Answer ?? []).filter((a) => a.type === want).map((a) => a.data);
  };
  return async (hostname) => {
    const [a, aaaa] = await Promise.all([query(hostname, "A"), query(hostname, "AAAA")]);
    return [...a, ...aaaa];
  };
}

/**
 * The Workers transport: `fetch` with `redirect: "manual"` (Workers keep no cookie jar, and no
 * credential headers are set), and DoH address checks.
 * It cannot pin the connection (see the module comment for what protects it instead).
 */
export function workersTransport(
  options: {
    fetch?: typeof fetch;
    resolve?: ((hostname: string) => Promise<string[]>) | false;
  } = {},
): FetchTransport {
  const f = options.fetch ?? fetch;
  const resolve =
    options.resolve === false ? undefined : (options.resolve ?? dohResolver({ fetch: f }));
  return {
    name: "workers",
    pins: false,
    ...(resolve ? { resolve } : {}),
    async request(url, init) {
      const res = await f(url.toString(), {
        method: "GET",
        redirect: "manual",
        headers: init.headers,
        signal: init.signal,
      });
      return { status: res.status, headers: res.headers, body: res.body };
    },
  };
}
