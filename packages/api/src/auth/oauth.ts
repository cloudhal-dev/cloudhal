/**
 * RFC-0044 §2 (Phase 2): the deployment's OAuth 2.1 authorization server. Better Auth's `mcp()`
 * plugin (`@better-auth/mcp`, which composes `@better-auth/oauth-provider` with resource binding)
 * and `jwt()` for the signing key, on the same database as Studio's accounts.
 *
 * - Grants: authorization code with PKCE (S256 only; the plugin refuses `plain`) and refresh
 *   token. No `client_credentials`: an agent always acts for a member (RFC-0005 I1).
 * - Scopes: Cloudhal key scopes verbatim plus `offline_access`; no `openid`, so no OIDC discovery
 *   and no `id_token` (§2).
 * - Tokens: RFC 9068 JWT access tokens (`typ: at+jwt`) for 1 h, `aud` = the `/mcp` resource, `iss`
 *   = the issuer; refresh tokens for 30 d, rotated on every use with `mcp()`'s 30 s reuse window
 *   (Decision 2).
 * - Registration: none in Phase 2 (CIMD and DCR are Phase 3); clients are created server-side
 *   (`adminCreateOAuthClient`), and the session-backed client CRUD endpoints are refused.
 *
 * Worker-safe: the plugins and `jose` use WebCrypto and no `eval`.
 */
import { mcp } from "@better-auth/mcp";
import { KEY_SCOPES } from "@cloudhal/agent-runtime";
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";

/** `offline_access` asks for a refresh token (the plugin issues one only then). */
export const OFFLINE_ACCESS = "offline_access";

/** Every OAuth `scope` value the server knows: key scopes plus `offline_access` (§2). */
export const OAUTH_SCOPES: readonly string[] = [...KEY_SCOPES, OFFLINE_ACCESS];

/** Better Auth's base path, where the issuer lives (`<origin>/api/auth`). */
export const AUTH_BASE_PATH = "/api/auth";

/** The Studio routes the authorize endpoint sends the browser to (§4). */
export const OAUTH_LOGIN_PAGE = "/login";
export const OAUTH_CONSENT_PAGE = "/oauth/consent";

/** The signing algorithm (the `jwt()` plugin's default, Ed25519; WebCrypto on workerd has it). */
export const ACCESS_TOKEN_ALG = "EdDSA";

/** Lifetimes (RFC-0044 §2 table; Decisions 2 and 3). */
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
export const REFRESH_REUSE_WINDOW_S = 30;
/** §2: "authorization code 5 min, single use" (the plugin's default is 10 min). */
export const AUTHORIZATION_CODE_TTL_S = 5 * 60;

export interface McpOauthServerOptions {
  /**
   * The canonical `/mcp` URL tokens are bound to (`aud`, RFC 8707). HTTPS, or HTTP on loopback
   * only (the plugin refuses anything else).
   */
  readonly resource: string;
}

/**
 * Whether a runtime runs the authorization server (RFC-0044 §10), and why not: an issuer must be
 * stable, so it needs the public base URL, over HTTPS or on loopback (the plugin refuses a
 * plain-HTTP resource elsewhere, and so do clients). `setting` is `CLOUDHAL_MCP_OAUTH`; `off`
 * turns it off.
 */
export function mcpOauthFor(
  baseURL: string | undefined,
  setting?: string | undefined,
): { readonly mcpOauth: McpOauthServerOptions } | { readonly off: string } {
  if (setting?.trim().toLowerCase() === "off") return { off: "CLOUDHAL_MCP_OAUTH=off" };
  if (!baseURL)
    return {
      off: "no public base URL (--base-url or CLOUDHAL_BASE_URL): an OAuth issuer must be a stable origin",
    };
  const url = new URL(baseURL);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback)
    return { off: `the base URL ${url.origin} is plain HTTP outside loopback; use https` };
  return { mcpOauth: { resource: oauthEndpoints(url.origin).resource } };
}

/** Issuer and resource of a deployment, both derived from its public base URL (§10). */
export function oauthEndpoints(baseURL: string): { issuer: string; resource: string } {
  const origin = new URL(baseURL).origin;
  return { issuer: `${origin}${AUTH_BASE_PATH}`, resource: `${origin}/mcp` };
}

/**
 * The plugins `createInstance` adds when the deployment runs the authorization server. `issuer`
 * pins the JWT `iss` (and the metadata's `issuer`) to Better Auth's base URL.
 */
export function oauthPlugins(
  issuer: string,
  options: McpOauthServerOptions,
  hooks: OauthServerHooks,
): BetterAuthPlugin[] {
  const { fromServer, grantOf } = hooks;
  return [
    jwt({
      jwks: { keyPairConfig: { alg: ACCESS_TOKEN_ALG, crv: "Ed25519" } },
      jwt: { issuer },
      // Session payloads are never signed (the plugin's advice next to an OAuth provider): the
      // only JWTs this key signs are access tokens.
      disableSettingJwtHeader: true,
    }),
    mcp({
      resource: options.resource,
      loginPage: OAUTH_LOGIN_PAGE,
      consentPage: OAUTH_CONSENT_PAGE,
      scopes: [...OAUTH_SCOPES],
      // `scopes_supported` in the AS metadata: all key scopes plus `offline_access` (§2).
      advertisedMetadata: { scopes_supported: [...OAUTH_SCOPES] },
      grantTypes: ["authorization_code", "refresh_token"],
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_S,
      refreshTokenExpiresIn: REFRESH_TOKEN_TTL_S,
      refreshTokenReuseInterval: REFRESH_REUSE_WINDOW_S,
      codeExpiresIn: AUTHORIZATION_CODE_TTL_S,
      // Registration is Phase 3: no DCR, and no member may create or edit clients through the
      // session-backed endpoints (they are also fenced in `createApi`); only the server itself
      // (`OauthServer.createClient`) creates a pre-registered client.
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      clientPrivileges: ({ headers, action }) => action === "create" && fromServer(headers),
      resourcePrivileges: ({ headers, action }) => action === "link" && fromServer(headers),
      // Tokens are stored under a hash Cloudhal can compute too, so the refresh path can find a
      // token's family and enforce the absolute lifetime (`oauth-hooks.ts`).
      storeTokens: { hash: (token) => hashToken(token) },
      extensions: [
        {
          // The grant an access token belongs to (§5): `/mcp` compares it with the live
          // `agent_grants` row, so a token issued before a revoke never works for a later grant
          // of the same member and client. No live grant, no claim: `/mcp` refuses the token.
          claims: {
            accessToken: async ({ user, client }) => {
              const grant = user ? await grantOf(user.id, client.clientId) : undefined;
              return grant ? { [GRANT_CLAIM]: grant } : {};
            },
          },
        },
      ],
    }),
  ];
}

/** What `oauthPlugins` asks of Cloudhal. */
export interface OauthServerHooks {
  /** True for the server's own calls (`SERVER_KEY_HEADER`): only they may create clients. */
  readonly fromServer: (headers: Headers) => boolean;
  /** The id of the member's live grant for a client, if any. */
  readonly grantOf: (userId: string, clientId: string) => Promise<string | undefined>;
}

/** The access-token claim that names the grant (RFC-0044 §5; a private claim name, RFC 7519 §4.3). */
export const GRANT_CLAIM = "cloudhal_grant";

/** How the provider stores codes and refresh tokens: base64url(SHA-256(token)). */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  let s = "";
  for (const b of digest) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** A log line from Better Auth, routed through Cloudhal's logging (`AuthOptions.log`). */
export type AuthLog = (level: "error" | "warn" | "info" | "debug", message: string) => void;

/**
 * Messages that describe an expected refusal the caller already gets as a response, so they are
 * not errors of the server: a wrong API key is a 401 (security sweep, #159).
 */
const EXPECTED = ["Failed to validate API key"];

/** Better Auth's `logger` option: expected refusals dropped, the rest forwarded. */
export function betterAuthLogger(log: AuthLog | undefined) {
  return {
    level: "warn" as const,
    log: (level: "error" | "warn" | "info" | "debug", message: string, ...args: unknown[]) => {
      if (EXPECTED.some((m) => message.includes(m))) return;
      // Only an error's message: arguments may carry request data, never credentials in logs.
      const detail = args.find((a): a is Error => a instanceof Error)?.message;
      const line = detail ? `${message}: ${detail}` : message;
      if (log) log(level, line);
      else if (level === "error") console.error(`[Better Auth] ${line}`);
      else console.warn(`[Better Auth] ${line}`);
    },
  };
}
