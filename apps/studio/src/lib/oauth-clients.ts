/**
 * RFC-0044 §11: the MCP clients that connect to this Studio by URL (OAuth), what each one's setup
 * looks like, and how each identifies itself (docs/guides/mcp-oauth.md). A client with a Client ID
 * Metadata Document works when CIMD is on, and falls back to dynamic client registration (DCR)
 * when that is on; Cursor and the MCP Inspector only register themselves (DCR).
 */

export const OAUTH_CLIENTS = [
  "claudeAi",
  "claudeCode",
  "codex",
  "cursor",
  "vscode",
  "inspector",
] as const;
export type OauthClient = (typeof OAUTH_CLIENTS)[number];

/** How a client gets a `client_id`: a metadata document (with a DCR fallback), or DCR only. */
const REGISTRATION: Record<OauthClient, "document" | "dcr"> = {
  claudeAi: "document",
  claudeCode: "document",
  codex: "document",
  cursor: "dcr",
  vscode: "document",
  inspector: "dcr",
};

/**
 * Clients that connect from their provider's servers, not from this computer: they cannot reach
 * a loopback or private `/mcp` URL. (The "codex" entry covers ChatGPT, hosted, and the Codex CLI,
 * local; the warning names ChatGPT.)
 */
const HOSTED: ReadonlySet<OauthClient> = new Set(["claudeAi", "codex"]);

/** The server's `features.mcpOauthClients`: the `/mcp` resource and the registration switches. */
export interface OauthServerInfo {
  readonly resource: string;
  readonly cimd: boolean;
  readonly dcr: boolean;
}

export type OauthClientStatus = "ok" | "needsDcr" | "needsPublicUrl" | "unavailable";

const PRIVATE_V4 = [
  [10, 0, 255],
  [127, 0, 255],
  [169, 254, 254],
  [172, 16, 31],
  [192, 168, 168],
] as const;

/**
 * Whether a hosted client could reach `resource`: `https:` on a name or address that is not
 * loopback, link-local, private or a local-only name (`localhost`, `*.localhost`, `*.local`,
 * `*.internal`). Anything that does not parse counts as not public.
 */
export function isPublicMcpUrl(resource: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  // IPv6: loopback, unique-local (fc00::/7) and link-local (fe80::/10) are not public.
  if (host.startsWith("[")) return host !== "[::1]" && !/^\[(fc|fd|fe8|fe9|fea|feb)/.test(host);
  if (host === "localhost" || !host.includes(".")) return false;
  if ([".localhost", ".local", ".internal"].some((end) => host.endsWith(end))) return false;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  return !PRIVATE_V4.some(([first, from, to]) => a === first && b >= from && b <= to);
}

/**
 * Whether the client can connect to this server: `ok`; `unavailable` (no registration way is on);
 * `needsPublicUrl` (a hosted client, and `/mcp` is local or plain http, so its servers cannot
 * reach it); `needsDcr` (it only registers itself and DCR is off).
 */
export function oauthClientStatus(client: OauthClient, server: OauthServerInfo): OauthClientStatus {
  if (!server.cimd && !server.dcr) return "unavailable";
  if (HOSTED.has(client) && !isPublicMcpUrl(server.resource)) return "needsPublicUrl";
  if (REGISTRATION[client] === "dcr" && !server.dcr) return "needsDcr";
  return "ok";
}

/** The client the picker starts on: Claude.ai, or Claude Code where hosted clients cannot reach. */
export function defaultOauthClient(resource: string): OauthClient {
  return isPublicMcpUrl(resource) ? "claudeAi" : "claudeCode";
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** What the person pastes for each client; `undefined`: the client's own dialog takes the URL. */
const SNIPPETS: Record<OauthClient, ((url: string) => string) | undefined> = {
  claudeAi: undefined,
  claudeCode: (url) => `claude mcp add --transport http cloudhal ${url}`,
  codex: (url) => `codex mcp add cloudhal --url ${url}\ncodex mcp login cloudhal`,
  cursor: (url) => json({ mcpServers: { cloudhal: { url } } }),
  vscode: (url) => json({ servers: { cloudhal: { type: "http", url } } }),
  inspector: () => "npx @modelcontextprotocol/inspector",
};

export function oauthSnippet(client: OauthClient, url: string): string | undefined {
  return SNIPPETS[client]?.(url);
}

export function oauthSnippetLang(client: OauthClient): "json" | "bash" {
  return client === "cursor" || client === "vscode" ? "json" : "bash";
}
