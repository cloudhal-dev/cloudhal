/**
 * RFC-0044 §3 (pre-registered clients): a public client created by the server itself. Phase 2
 * has no registration endpoint (CIMD and DCR are Phase 3), so this is how tests, and later
 * `cloudhal mcp clients create`, get a `client_id`. The provider's `adminCreateOAuthClient` runs
 * with the member's session and the server key, the only caller `clientPrivileges` admits.
 */
import type { AuthDeps } from "./deps.ts";
import { SERVER_KEY_HEADER } from "./instance.ts";
import { OAUTH_SCOPES } from "./oauth.ts";
import type { OauthClientInput } from "./types.ts";

function isLoopback(uri: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(uri).hostname);
  } catch {
    return false;
  }
}

export async function createOauthClient(
  d: AuthDeps,
  input: OauthClientInput,
): Promise<{ clientId: string }> {
  if (!d.endpoints) throw new Error("the authorization server is off");
  const headers = new Headers(input.headers);
  headers.set(SERVER_KEY_HEADER, d.internal.serverKey);
  const api = d.instance.api as unknown as {
    adminCreateOAuthClient(input: {
      headers: Headers;
      body: Record<string, unknown>;
    }): Promise<{ client_id: string }>;
  };
  const created = await api.adminCreateOAuthClient({
    headers,
    body: {
      client_name: input.name,
      redirect_uris: [...input.redirectUris],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // RFC 8252: a loopback callback is a native app's; `web` needs HTTPS redirect URIs.
      application_type: input.redirectUris.every(isLoopback) ? "native" : "web",
      scope: OAUTH_SCOPES.join(" "),
      resources: [d.endpoints.resource],
    },
  });
  return { clientId: created.client_id };
}
