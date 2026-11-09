/**
 * RFC-0044 §3 and §6 ("Open redirect"): which redirect URIs an OAuth client may use, for both
 * registration paths (a Client ID Metadata Document and dynamic registration).
 *
 * - `https://` on a host that is not loopback, or `http://` on exactly `localhost`, `127.0.0.1` or
 *   `[::1]` (RFC 8252 §7.3; the port is free there: the provider matches loopback redirects
 *   without the port, §8.3). Nothing else: no private-use schemes, no plain HTTP elsewhere, no
 *   fragment, no userinfo, at most 2,048 characters.
 * - With `CLOUDHAL_MCP_CLIENT_HOSTS` set (`clientHosts`), a dynamically registered client's
 *   redirect host must be on it (`claude.ai` or `*.example.com`); a loopback redirect then needs
 *   `localhost` on the list. CIMD clients are matched on their document's host instead.
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

/** Why a redirect URI is refused, or `undefined` when it may be used. */
export function redirectProblem(
  uri: string,
  clientHosts?: readonly string[] | undefined,
): string | undefined {
  if (uri.length > MAX_URI_LENGTH) return "a redirect URI is longer than 2,048 characters";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri.slice(0, 100)} is not an absolute URI`;
  }
  if (uri.includes("#")) return "a redirect URI must not have a fragment";
  if (url.username || url.password) return "a redirect URI must not carry credentials";
  const loopback = url.protocol === "http:" && LOOPBACK_HOSTS.has(rawHttpHost(uri) ?? "");
  if (url.protocol === "http:" && !loopback)
    return `http redirect URIs are allowed on localhost, 127.0.0.1 and [::1] only: ${url.host}`;
  if (url.protocol === "https:" && LOOPBACK_HOSTS.has(url.hostname))
    return "a loopback redirect URI uses http (RFC 8252 §7.3)";
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return `redirect URIs use https (or http on loopback), not ${url.protocol}`;
  if (clientHosts && clientHosts.length > 0) {
    const host = loopback ? "localhost" : url.hostname;
    if (!clientHosts.some((p) => hostMatches(host, p)))
      return `${host} is not on this server's list of client hosts (CLOUDHAL_MCP_CLIENT_HOSTS)`;
  }
  return undefined;
}

/** Why a client's redirect URIs are refused as a whole (1–10, each allowed), or `undefined`. */
export function redirectUrisProblem(
  uris: unknown,
  clientHosts?: readonly string[] | undefined,
): string | undefined {
  if (!Array.isArray(uris) || uris.length === 0) return "redirect_uris is required";
  if (uris.length > MAX_REDIRECT_URIS)
    return `at most ${MAX_REDIRECT_URIS} redirect URIs may be registered`;
  for (const uri of uris) {
    if (typeof uri !== "string") return "redirect_uris must be strings";
    const problem = redirectProblem(uri, clientHosts);
    if (problem) return problem;
  }
  return undefined;
}
