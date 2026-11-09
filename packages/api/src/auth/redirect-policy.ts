/**
 * RFC-0044 §3 and §6 ("Open redirect"): which redirect URIs an OAuth client may use, for both
 * registration paths (a Client ID Metadata Document and dynamic registration).
 *
 * - `https://` on a host that is not loopback, or `http://` on exactly `localhost`, `127.0.0.1` or
 *   `[::1]` (RFC 8252 §7.3; the port is free there: the provider matches loopback redirects
 *   without the port, §8.3).
 * - A native app's private-use scheme (RFC 8252 §7.1), matched exactly: `scheme:/…` where the
 *   scheme is reverse-domain (has a dot, `com.example.app:/cb`) or on the short list of known
 *   apps (`cursor`, `vscode`) plus `CLOUDHAL_MCP_REDIRECT_SCHEMES`. Never a scheme a browser or
 *   the system runs or reads (`javascript`, `data`, `file`, `blob`, …) or one that looks like
 *   http. Every client here is public or native, which RFC 8252 §8.4 requires of such schemes.
 * - Nothing else: no plain HTTP elsewhere, no fragment, no userinfo, at most 2,048 characters.
 * - With `CLOUDHAL_MCP_CLIENT_HOSTS` set (`clientHosts`), every redirect host must be on it
 *   (`claude.ai` or `*.example.com`): a loopback redirect then needs `localhost` on the list, and a
 *   private-use redirect a scheme of the known list (reverse-domain schemes are refused).
 * - The rules run at registration (DCR) and at every authorization (`validateRedirectUri`), so a
 *   host taken off the list, or a document's refused URI, is never used.
 *
 * Linear checks only (AGENTS.md rule 13): the URL parser, `indexOf` and comparisons.
 */

/** RFC-0044 §3: the most redirect URIs one client may register. */
export const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2048;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The host part of an `http://` URI as written (the parser would normalise `127.1`). */
function rawHttpHost(uri: string): string | undefined {
  if (uri.slice(0, 7).toLowerCase() !== "http://") return undefined;
  const rest = uri.slice(7);
  let end = rest.length;
  for (const c of ["/", "?", "#"]) {
    const at = rest.indexOf(c);
    if (at >= 0 && at < end) end = at;
  }
  const authority = rest.slice(0, end);
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    return close < 0 ? undefined : authority.slice(0, close + 1).toLowerCase();
  }
  const colon = authority.indexOf(":");
  return (colon < 0 ? authority : authority.slice(0, colon)).toLowerCase();
}

/** True for a host pattern match: `example.com` exactly, `*.example.com` any subdomain. */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith("*.")) {
    const suffix = p.slice(1);
    return h.length > suffix.length && h.endsWith(suffix);
  }
  return h === p;
}

/** Private-use schemes of well-known native MCP clients (Cursor, VS Code). */
export const KNOWN_REDIRECT_SCHEMES: readonly string[] = ["cursor", "vscode"];

/** Schemes a browser or the system acts on itself: never a redirect target. */
const DANGEROUS_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "vbscript",
  "data",
  "file",
  "about",
  "blob",
  "filesystem",
  "view-source",
  "jar",
  "intent",
  "chrome",
  "mailto",
  "tel",
  "sms",
  "ftp",
]);

/** Why `scheme` (lower case, no `:`) can never be a private-use redirect scheme, if it cannot. */
export function schemeProblem(scheme: string): string | undefined {
  if (scheme.length === 0 || scheme.length > 64) return "a redirect scheme is 1–64 characters";
  const first = scheme.charCodeAt(0);
  if (first < 97 || first > 122) return "a redirect scheme starts with a letter";
  for (const c of scheme)
    if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "+" || c === "-" || c === "."))
      return "a redirect scheme has letters, digits, + - . only";
  if (DANGEROUS_SCHEMES.has(scheme)) return `${scheme}: is never a redirect target`;
  // `http`, `https` and lookalikes (`https-app`, `httpx`), and WebSocket schemes.
  if (scheme.startsWith("http") || scheme === "ws" || scheme === "wss")
    return `${scheme}: looks like a web scheme`;
  return undefined;
}

export interface RedirectPolicy {
  /** `CLOUDHAL_MCP_CLIENT_HOSTS`; empty or absent: any host. */
  readonly clientHosts?: readonly string[] | undefined;
  /** `CLOUDHAL_MCP_REDIRECT_SCHEMES`, added to `KNOWN_REDIRECT_SCHEMES`. */
  readonly schemes?: readonly string[] | undefined;
}

/** The problem with a private-use redirect (`scheme` lower case), or `undefined`. */
function privateUseProblem(
  uri: string,
  scheme: string,
  policy: RedirectPolicy,
): string | undefined {
  const problem = schemeProblem(scheme);
  if (problem) return problem;
  if (uri.slice(scheme.length, scheme.length + 2) !== ":/")
    return `a private-use redirect URI is ${scheme}:/… (RFC 8252 §7.1)`;
  const listed = [...KNOWN_REDIRECT_SCHEMES, ...(policy.schemes ?? [])].includes(scheme);
  const restricted = (policy.clientHosts?.length ?? 0) > 0;
  if (listed) return undefined;
  if (restricted)
    return `${scheme}: is not a known app scheme, and CLOUDHAL_MCP_CLIENT_HOSTS is set (add it to CLOUDHAL_MCP_REDIRECT_SCHEMES)`;
  if (!scheme.includes("."))
    return `${scheme}: is not reverse-domain (com.example.app) or a known app scheme (CLOUDHAL_MCP_REDIRECT_SCHEMES)`;
  return undefined;
}

/** Why a redirect URI is refused, or `undefined` when it may be used. */
export function redirectProblem(uri: string, policy: RedirectPolicy = {}): string | undefined {
  if (uri.length > MAX_URI_LENGTH) return "a redirect URI is longer than 2,048 characters";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri.slice(0, 100)} is not an absolute URI`;
  }
  if (uri.includes("#")) return "a redirect URI must not have a fragment";
  if (url.username || url.password) return "a redirect URI must not carry credentials";
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme !== "http" && scheme !== "https") return privateUseProblem(uri, scheme, policy);
  const loopback = scheme === "http" && LOOPBACK_HOSTS.has(rawHttpHost(uri) ?? "");
  if (scheme === "http" && !loopback)
    return `http redirect URIs are allowed on localhost, 127.0.0.1 and [::1] only: ${url.host}`;
  if (scheme === "https" && LOOPBACK_HOSTS.has(url.hostname))
    return "a loopback redirect URI uses http (RFC 8252 §7.3)";
  const hosts = policy.clientHosts;
  if (hosts && hosts.length > 0) {
    const host = loopback ? "localhost" : url.hostname;
    if (!hosts.some((p) => hostMatches(host, p)))
      return `${host} is not on this server's list of client hosts (CLOUDHAL_MCP_CLIENT_HOSTS)`;
  }
  return undefined;
}

/**
 * Why a client's redirect URIs are refused as a whole (1–10, each allowed), or `undefined`. One
 * bad entry refuses the registration: entries are never dropped silently.
 */
export function redirectUrisProblem(
  uris: unknown,
  policy: RedirectPolicy = {},
): string | undefined {
  if (!Array.isArray(uris) || uris.length === 0) return "redirect_uris is required";
  if (uris.length > MAX_REDIRECT_URIS)
    return `at most ${MAX_REDIRECT_URIS} redirect URIs may be registered`;
  for (const uri of uris) {
    if (typeof uri !== "string") return "redirect_uris must be strings";
    const problem = redirectProblem(uri, policy);
    if (problem) return problem;
  }
  return undefined;
}
