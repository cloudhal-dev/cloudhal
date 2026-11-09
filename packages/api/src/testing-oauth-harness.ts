/**
 * Test harness for RFC-0044 Phase 2: a deployment that runs the authorization server, a
 * pre-registered public client (Phase 2 has no registration endpoint; `OauthServer.createClient`
 * is server-side only), and the browser and client halves of the code flow with PKCE, driven
 * with `app.request` and a signed-in session cookie. Used by `testing-mcp-oauth-server.ts`.
 */
import { AuditLog } from "@cloudhal/agent-runtime";
import { seedStarterSite } from "@cloudhal/core-ts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { RolesBackend } from "./testing-roles.ts";

export type Json = Record<string, unknown>;
/** Loopback: the plugin accepts a plain-HTTP resource only there (RFC-0044 §10). */
export const ORIGIN = "http://localhost:8787";
export const ISSUER = `${ORIGIN}/api/auth`;
export const RESOURCE = `${ORIGIN}/mcp`;
/** A native client's loopback callback (RFC 8252 §7.3). */
export const REDIRECT = "http://127.0.0.1:33418/callback";
const SECRET = "mcp-oauth-server-secret-0123456789abcdefgh";
const PASSWORD = "correct horse battery staple";

export interface DeploymentOptions {
  /** Better Auth's base URL (the issuer is its origin plus `/api/auth`). */
  readonly baseURL?: string;
  /** The `/mcp` resource tokens are bound to. */
  readonly resource?: string;
  /** The trusted client-address header (`AuthOptions.clientAddressHeader`; turns rate limits on). */
  readonly clientAddressHeader?: string;
}

export type Deployment = Awaited<ReturnType<typeof deploy>>;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export const cookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0] as string)
    .filter((c) => c.startsWith("better-auth.session_token="))
    .join("; ");

/** A tool call as a 2026-07-28 client sends it. */
export function mcpCall(token: string, method: string, params: Json = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  };
}

/** An MCP client on `app`'s `/mcp` with the access token (fails to connect on a 401). */
export async function mcpClient(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  accessToken: string,
): Promise<Client> {
  const client = new Client(
    { name: "oauth-agent", version: "1.0.0" },
    { capabilities: {}, versionNegotiation: { mode: "auto" } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      fetch: async (input, init) => app.fetch(new Request(input, init as RequestInit)),
    }),
  );
  return client;
}

/** A deployment over `backend`'s database (a second one may share it: same keys, other issuer). */
export async function deploy(
  b: Awaited<ReturnType<RolesBackend["create"]>>,
  options: DeploymentOptions = {},
) {
  const baseURL = options.baseURL ?? ORIGIN;
  const auth = createAuth({
    database: b.database,
    sql: b.sql,
    baseURL,
    secret: SECRET,
    signUp: "first-user",
    mcpOauth: { resource: options.resource ?? `${new URL(baseURL).origin}/mcp` },
    ...(options.clientAddressHeader ? { clientAddressHeader: options.clientAddressHeader } : {}),
  });
  const server = auth.oauth;
  if (!server) throw new Error("the authorization server did not start");
  const audit = new AuditLog(b.sql);
  const app = createApi({
    store: b.store,
    resolvePrincipal: auth.resolvePrincipal,
    authHandler: auth.handler,
    agentKeys: auth.agentKeys,
    staff: auth.staff,
    signUp: auth.signUp,
    audit,
    oauthServer: server,
    mcp: {
      stateKey: "mcp-oauth-state-key-0123456789abcdefghij",
      audit,
      oauth: { issuer: server.issuer, resource: server.resource },
    },
  });
  const origin = new URL(baseURL).origin;
  const call = async (
    method: string,
    path: string,
    init: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const res = await app.request(`${origin}${path}`, {
      method,
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json", origin } : {}),
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    let body: Json = {};
    try {
      body = text ? (JSON.parse(text) as Json) : {};
    } catch {
      body = { text };
    }
    return { res, status: res.status, body };
  };
  return { auth, server, app, audit, call, origin, sql: b.sql, store: b.store };
}

/** A fresh database with the Owner signed up, a site and the test client. */
export async function setupServer(backend: RolesBackend, options: DeploymentOptions = {}) {
  const b = await backend.create();
  const site = await seedStarterSite(b.store, { name: "Blog", slug: "blog" });
  const d = await deploy(b, options);
  const signUp = await d.call("POST", "/api/auth/sign-up/email", {
    body: { name: "Olive Owner", email: "owner@example.com", password: PASSWORD },
  });
  expect(signUp.status, JSON.stringify(signUp.body)).toBe(200);
  const owner = { cookie: cookieOf(signUp.res), userId: (signUp.body.user as Json).id as string };
  const { clientId } = await d.server.createClient({
    headers: new Headers({ cookie: owner.cookie }),
    name: "Test Agent",
    redirectUris: [REDIRECT],
  });
  /** A member who joined through an invite (RFC-0005 §7), signed in. */
  /** `email` again: a removed member invited back keeps their account (RFC-0005 §7.4). */
  const join = async (role: string, extra: Json = {}, again?: string) => {
    const email = again ?? `${role}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const inv = await d.call("POST", "/api/invites", {
      cookie: owner.cookie,
      body: { email, role, ...extra },
    });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const token = (inv.body.url as string).split("#")[1] as string;
    const accepted = await d.call("POST", "/api/invites/accept", {
      body: { token, name: role.toUpperCase(), password: PASSWORD },
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    return {
      email,
      cookie: cookieOf(accepted.res),
      userId: (accepted.body.user as Json).id as string,
    };
  };
  return { ...d, backend: b, siteId: site.id, owner, clientId, join };
}

export type Server = Awaited<ReturnType<typeof setupServer>>;

export interface AuthorizeOptions {
  readonly cookie: string;
  readonly scope: string;
  readonly clientId?: string;
  readonly challengeMethod?: string | null;
  readonly resource?: string;
  /** `POST`: the parameters as a form body (the provider accepts both). */
  readonly method?: "GET" | "POST";
}

/** `GET /oauth2/authorize` as the member's browser: where it is sent next. */
export async function authorize(s: Server, o: AuthorizeOptions) {
  const { verifier, challenge } = await pkce();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: o.clientId ?? s.clientId,
    redirect_uri: REDIRECT,
    scope: o.scope,
    state: "st4te",
    resource: o.resource ?? RESOURCE,
  });
  if (o.challengeMethod !== null) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", o.challengeMethod ?? "S256");
  }
  const res =
    o.method === "POST"
      ? await s.app.request(`${ISSUER}/oauth2/authorize`, {
          method: "POST",
          headers: {
            cookie: o.cookie,
            origin: ORIGIN,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: params,
        })
      : await s.app.request(`${ISSUER}/oauth2/authorize?${params}`, {
          headers: { cookie: o.cookie },
        });
  const location = res.headers.get("location") ?? "";
  return { res, location: location ? new URL(location, ORIGIN) : undefined, verifier };
}

/** The consent screen's request parameter: the signed query the provider sent the browser with. */
export const consentRequest = (location: URL) => location.search.slice(1);

/** Approve (or deny) on the consent screen; the URL the browser goes to next. */
export async function consent(
  s: Server,
  cookie: string,
  request: string,
  body: { accept?: boolean; scopes: readonly string[]; mode?: string },
) {
  return s.call("POST", "/api/agent-grants/consent", {
    cookie,
    body: { request, accept: body.accept ?? true, scopes: body.scopes, mode: body.mode ?? "edits" },
  });
}

/** `POST /oauth2/token` as the client (form-encoded, `resource` named; RFC 8707). */
export async function token(s: Server, form: Record<string, string>) {
  const res = await s.app.request(`${ISSUER}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: s.clientId, resource: RESOURCE, ...form }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}

/** The whole flow: authorize, consent with every requested scope, exchange the code. */
export async function connect(
  s: Server,
  o: { cookie: string; scope: string; mode?: string; keep?: readonly string[] },
) {
  const start = await authorize(s, { cookie: o.cookie, scope: o.scope });
  expect(start.location?.pathname, start.location?.href).toBe("/oauth/consent");
  const request = consentRequest(start.location as URL);
  const approved = await consent(s, o.cookie, request, {
    scopes: o.keep ?? o.scope.split(" "),
    ...(o.mode ? { mode: o.mode } : {}),
  });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  const back = new URL(approved.body.redirect as string);
  expect(back.searchParams.get("iss")).toBe(ISSUER);
  expect(back.searchParams.get("state")).toBe("st4te");
  const code = back.searchParams.get("code") ?? "";
  const tokens = await token(s, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    code_verifier: start.verifier,
  });
  expect(tokens.status, JSON.stringify(tokens.body)).toBe(200);
  return {
    access: tokens.body.access_token as string,
    refresh: tokens.body.refresh_token as string | undefined,
    body: tokens.body,
  };
}
