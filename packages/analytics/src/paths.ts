/**
 * Path, host and UTM normalisation (RFC-0006 §5.2–§5.3). Everything a visitor sends is reduced to
 * a published route, a hostname, an enum or a small token alphabet; anything else is dropped.
 */

/** The graph's `Path` pattern (common.schema.json): lower-case slug segments, no trailing slash. */
export const ROUTE_PATH_RE = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
/** `AnalyticsRequestPath`: percent-encoded printable ASCII. */
export const REQUEST_PATH_RE = /^\/[!-~]*$/;
export const REQUEST_PATH_MAX = 256;
/** `AnalyticsHostname`. */
export const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** `AnalyticsUtmValue`. */
export const UTM_RE = /^[a-z0-9][a-z0-9._+-]{0,63}$/;
const REDIRECT_RE = /^(?:\/|https:\/\/)[!-~]*$/;

/**
 * The route a beacon's `location.pathname` names: percent-decoded, lower-cased, trailing slashes
 * dropped (core-ts `normalisePath`'s rule). `undefined` when it cannot be a published route.
 */
export function normaliseBeaconPath(raw: string): string | undefined {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 1024) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  // no query split after decoding: an encoded "?" is part of the path, and the route pattern refuses it
  const trimmed = decoded.length > 1 ? decoded.replace(/\/+$/, "") || "/" : decoded;
  const path = trimmed.toLowerCase();
  return ROUTE_PATH_RE.test(path) ? path : undefined;
}

/** A requested path as stored on render events: as received (percent-encoded), no query, ≤ 256. */
export function toRequestPath(pathname: string): string | undefined {
  const p = (pathname.split(/[?#]/, 1)[0] ?? "").slice(0, REQUEST_PATH_MAX);
  return REQUEST_PATH_RE.test(p) ? p : undefined;
}

/** A redirect target without query or fragment: a site path or an https URL, ≤ 512. */
export function toRedirectTarget(location: string | null | undefined): string | undefined {
  if (!location) return undefined;
  const t = location.split(/[?#]/, 1)[0] ?? "";
  return t.length <= 512 && REDIRECT_RE.test(t) ? t : undefined;
}

/** Lower case, port and `www.` dropped; `undefined` unless it is a hostname. */
export function normaliseHost(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let h = raw.trim().toLowerCase();
  if (!h) return undefined;
  // a bracketed IPv6 literal or anything with a scheme/path is not a referrer host
  if (h.includes("/") || h.includes("@") || h.startsWith("[")) return undefined;
  h = h.replace(/:\d+$/, "").replace(/\.$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  return h.length <= 253 && HOSTNAME_RE.test(h) ? h : undefined;
}

/** The hostname of a URL header (`Origin`, `Referer`), lower case; `undefined` if unparsable. */
export function hostOfUrl(value: string | null | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}

/** Compares hosts the way the site's domains are listed: lower case, without `www.` and port. */
export function sameSiteHost(host: string, hosts: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  const bare = h.startsWith("www.") ? h.slice(4) : h;
  return hosts.some((x) => {
    const y = x.toLowerCase().replace(/:\d+$/, "");
    const yb = y.startsWith("www.") ? y.slice(4) : y;
    return y === h || yb === bare;
  });
}

/** Lower-cased and trimmed, spaces to `-`; kept only if it fits `[a-z0-9][a-z0-9._+-]{0,63}`. */
export function normaliseUtm(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return UTM_RE.test(v) ? v : undefined;
}
