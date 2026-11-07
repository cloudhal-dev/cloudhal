/**
 * RFC-0044 §1, Phase 1: what an OAuth MCP client needs to find the deployment's authorization
 * server. The MCP authorization spec (2026-07-28) makes an MCP server a resource server that
 * "MUST implement OAuth 2.0 Protected Resource Metadata" (RFC 9728) and name that document in the
 * `WWW-Authenticate` challenge of its 401; a call a token cannot make for want of a scope the
 * member's role holds answers `403 insufficient_scope` with the scopes to ask for (step-up).
 *
 * Nothing here verifies a token: that is Phase 2 (the authorization server). Until then a
 * deployment that sets `McpMountOptions.oauth` advertises an issuer whose metadata does not
 * exist, so clients fail at "authorization server metadata", a diagnosable error (RFC-0044 §9).
 */
import {
  holds,
  isKeyScope,
  type PolicyEngine,
  type Principal,
  roleScopes,
  type Scope,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type { Context, Hono } from "hono";
import type { Env } from "./context.ts";

export interface McpOauthOptions {
  /**
   * The authorization server's issuer identifier (RFC 8414): Better Auth's base path on the
   * deployment's public origin, e.g. `https://studio.example.com/api/auth`.
   */
  readonly issuer: string;
  /**
   * The canonical URL of this MCP server (RFC 8707 §2, RFC 9728 `resource`): the public origin
   * plus `/mcp`, no trailing slash, e.g. `https://studio.example.com/mcp`. Tokens are bound to it.
   */
  readonly resource: string;
  /**
   * `scopes_supported`: the minimal set for basic use, which clients request when the challenge
   * names none. Defaults to what a new agent key gets (`scopesForMode("edits")`).
   */
  readonly scopesSupported?: readonly Scope[] | undefined;
  /** `resource_name`, shown by some clients (RFC 9728 §2). */
  readonly resourceName?: string | undefined;
  /** `resource_documentation` (RFC 9728 §2). */
  readonly documentation?: string | undefined;
}

/** RFC 9728 §3: the well-known path; the path-aware form appends the resource's path. */
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";

/** The resource identifier as served: no trailing slash (MCP "Canonical Server URI"). */
export function canonicalResource(resource: string): string {
  const url = new URL(resource);
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

/** The URL of the path-aware metadata document, named in every challenge. */
export function resourceMetadataUrl(oauth: McpOauthOptions): string {
  const url = new URL(canonicalResource(oauth.resource));
  return `${url.origin}${PROTECTED_RESOURCE_PATH}${url.pathname}`;
}

/** The scopes the challenge and `scopes_supported` name (RFC-0044 §1). */
export function supportedScopes(oauth: McpOauthOptions): readonly Scope[] {
  return oauth.scopesSupported ?? scopesForMode("edits");
}

/** The RFC 9728 document. */
export function protectedResourceMetadata(oauth: McpOauthOptions): Record<string, unknown> {
  return {
    resource: canonicalResource(oauth.resource),
    authorization_servers: [oauth.issuer],
    scopes_supported: [...supportedScopes(oauth)],
    bearer_methods_supported: ["header"],
    ...(oauth.resourceName ? { resource_name: oauth.resourceName } : {}),
    ...(oauth.documentation ? { resource_documentation: oauth.documentation } : {}),
  };
}

/**
 * Serves the document at both well-known forms (`ROUTE_SCOPES` declares them `public`): the
 * path-aware one clients try first, and the root one the spec makes them fall back to.
 */
export function mountProtectedResourceMetadata(app: Hono<Env>, oauth: McpOauthOptions): void {
  const body = JSON.stringify(protectedResourceMetadata(oauth));
  const handler = (c: Context<Env>) =>
    c.body(body, 200, {
      "content-type": "application/json",
      // Static per deployment; RFC 9728 §3 and the hardening guide want it cacheable.
      "cache-control": "public, max-age=3600",
    });
  app.get(
    `${PROTECTED_RESOURCE_PATH}${new URL(canonicalResource(oauth.resource)).pathname}`,
    handler,
  );
  app.get(PROTECTED_RESOURCE_PATH, handler);
}

export interface ChallengeOptions {
  /** RFC 6750 §3.1 error code; absent on a first, credential-less request. */
  readonly error?: "invalid_token" | "insufficient_scope" | undefined;
  readonly description?: string | undefined;
  /** The scopes to ask for (RFC 6750 `scope`, space-separated). */
  readonly scope?: readonly string[] | undefined;
}

/** The `WWW-Authenticate: Bearer …` value (RFC 6750 §3, RFC 9728 §5.1). */
export function challengeHeader(oauth: McpOauthOptions, options: ChallengeOptions = {}): string {
  const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
  const params: string[] = [];
  if (options.error) params.push(`error=${quote(options.error)}`);
  if (options.description) params.push(`error_description=${quote(options.description)}`);
  params.push(`resource_metadata=${quote(resourceMetadataUrl(oauth))}`);
  const scope = options.scope ?? supportedScopes(oauth);
  if (scope.length) params.push(`scope=${quote(scope.join(" "))}`);
  return `Bearer ${params.join(", ")}`;
}

/** True when the request presented a bearer credential (RFC 6750 §2.1) that did not resolve. */
export function presentedBearer(request: Request): boolean {
  return /^bearer\s+\S/i.test(request.headers.get("authorization") ?? "");
}

/** The 401 of `/mcp` with the challenge; the JSON body is `unauthorized()`'s. */
export function unauthorizedChallenge(oauth: McpOauthOptions, request: Request): Response {
  return Response.json(
    { error: "unauthorized", message: "sign in required" },
    {
      status: 401,
      headers: {
        "www-authenticate": challengeHeader(
          oauth,
          presentedBearer(request) ? { error: "invalid_token" } : {},
        ),
      },
    },
  );
}

/** The one JSON-RPC message a stateless request carries, when it is a tool call. */
async function toolCallOf(
  request: Request,
): Promise<{ name: string; args: Record<string, unknown> } | undefined> {
  if (request.method !== "POST") return undefined;
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return undefined;
  let message: unknown;
  try {
    message = JSON.parse(await request.clone().text());
  } catch {
    return undefined;
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined;
  const { method, params } = message as { method?: unknown; params?: unknown };
  if (method !== "tools/call" || !params || typeof params !== "object") return undefined;
  const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
  if (typeof name !== "string") return undefined;
  return { name, args: args && typeof args === "object" ? (args as Record<string, unknown>) : {} };
}

/**
 * RFC-0044 §1 step-up: a token principal (`grantId`) calling a tool whose scopes the token lacks
 * but the member's role holds gets `403 insufficient_scope` naming every missing scope at once,
 * so the client re-authorizes with the union (MCP "Scope Challenge Handling"). Every other denial
 * (role, mode, `:own`, approvals) stays a JSON-RPC result from the handler, and a key principal
 * is never challenged: a key cannot re-authorize.
 */
export async function stepUpChallenge(
  request: Request,
  principal: Principal,
  policy: PolicyEngine,
  oauth: McpOauthOptions,
): Promise<Response | undefined> {
  if (!principal.grantId || !principal.person) return undefined;
  const call = await toolCallOf(request);
  if (!call) return undefined;
  const tool = policy.tool(call.name);
  if (!tool) return undefined;
  const decision = policy.evaluate(principal, call.name, { args: call.args });
  if (decision.kind !== "deny" || decision.code !== "missing_scope") return undefined;
  const missing = tool.scopes.filter((s) => !holds(principal.scopes, s));
  const role = roleScopes(principal.person.role);
  // Only scopes a token can carry and the role holds: anything else would make the client loop.
  if (!missing.length || !missing.every((s) => isKeyScope(s) && holds(role, s))) return undefined;
  return Response.json(
    {
      error: "insufficient_scope",
      message: `this connection needs ${missing.join(", ")}; authorize it again to add them`,
      details: { scope: missing },
    },
    {
      status: 403,
      headers: {
        "www-authenticate": challengeHeader(oauth, {
          error: "insufficient_scope",
          scope: missing,
          description: `${call.name} needs ${missing.join(" ")}`,
        }),
      },
    },
  );
}
