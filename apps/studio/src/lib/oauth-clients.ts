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

export interface OauthRegistration {
  readonly cimd: boolean;
  readonly dcr: boolean;
}

/**
 * Whether the client can connect with this server's registration switches: `ok`, `needsDcr` (it
 * only registers itself and DCR is off), or `unavailable` (neither way is on).
 */
export function oauthClientStatus(
  client: OauthClient,
  registration: OauthRegistration,
): "ok" | "needsDcr" | "unavailable" {
  if (!registration.cimd && !registration.dcr) return "unavailable";
  if (REGISTRATION[client] === "dcr" && !registration.dcr) return "needsDcr";
  return "ok";
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
