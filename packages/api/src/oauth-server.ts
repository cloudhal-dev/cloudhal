/**
 * RFC-0044 Phase 2, the HTTP side of the authorization server that is not Better Auth's own
 * routing:
 *
 * - §2: the RFC 8414 metadata at the path-inserted well-known URL
 *   (`/.well-known/oauth-authorization-server/api/auth`) and at the root alias (Decision 6), both
 *   outside `/api` and cacheable like the protected resource metadata;
 * - §4: Studio's consent API and `/api/agent-grants` (list and revoke; mode changes and
 *   elevations are Phase 3's "Connected agents");
 * - §3 (Phase 3): Cloudhal's `POST /api/auth/oauth2/register` when DCR is on
 *   (`mountClientRegistration`, before Better Auth's catch-all);
 * - the fence: provider endpoints that are not part of the code flow answer 404 over HTTP.
 */
import { isAgentMode } from "@cloudhal/agent-runtime";
import { trimEndChar } from "@cloudhal/core-ts/names";
import { type Context, Hono } from "hono";
import { personActor } from "./auth/agent-grants.ts";
import { DCR_MAX_BODY_BYTES, RegistrationError } from "./auth/dcr.ts";
import type { OauthServer } from "./auth/types.ts";
import type { Env } from "./context.ts";
import { badRequest, unauthorized } from "./errors.ts";
import { param } from "./params.ts";
import { clientIp } from "./tokens.ts";

/** RFC 8414 §3: the well-known path; the path-inserted form appends the issuer's path. */
export const AUTHORIZATION_SERVER_PATH = "/.well-known/oauth-authorization-server";

/**
 * The provider endpoints a client or Studio reaches over HTTP. Everything else under
 * `/api/auth/oauth2/` (client and consent CRUD, introspection, userinfo) and the `jwt()` plugin's
 * session-token endpoint `/api/auth/token` answer 404, like the organization, admin and api-key
 * endpoints (RFC-0005 I3). Consent goes through `/api/agent-grants/consent`, never the provider's
 * own endpoint; registration through Cloudhal's route, open only with DCR on.
 */
const OPEN_OAUTH_PATHS = new Set([
  "/api/auth/oauth2/authorize",
  "/api/auth/oauth2/token",
  "/api/auth/oauth2/revoke",
]);

/** RFC-0044 §3: where clients register (RFC 7591); Cloudhal's route, not the provider's. */
export const REGISTER_PATH = "/api/auth/oauth2/register";

/**
 * True for a Better Auth path of the authorization server that HTTP callers may not reach.
 * `register`: DCR is on, so `REGISTER_PATH` is open (Cloudhal's route answers it).
 */
export function fencedOauthPath(pathname: string, open: { register?: boolean } = {}): boolean {
  // Exactly this path: a variant (a trailing slash) would miss Cloudhal's route and reach the
  // provider's own endpoint through Better Auth's catch-all.
  if (pathname === REGISTER_PATH) return !open.register;
  const path = trimEndChar(pathname, "/");
  if (path === "/api/auth/token") return true;
  // The provider also answers its metadata under the issuer (`/api/auth/.well-known/…`), with
  // DPoP listed; clients use the RFC 8414 documents `createApi` serves at the root.
  if (path.startsWith("/api/auth/.well-known")) return true;
  return path.startsWith("/api/auth/oauth2") && !OPEN_OAUTH_PATHS.has(path);
}

/** Serves the AS metadata at the path-inserted URL and the root alias (`ROUTE_SCOPES`: public). */
export function mountAuthorizationServerMetadata(app: Hono<Env>, server: OauthServer): void {
  const handler = async (c: Context<Env>) =>
    c.body(JSON.stringify(await server.metadata()), 200, {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    });
  const issuerPath = trimEndChar(new URL(server.issuer).pathname, "/");
  app.get(`${AUTHORIZATION_SERVER_PATH}${issuerPath}`, handler);
  app.get(AUTHORIZATION_SERVER_PATH, handler);
}

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" } as const;

/** The body as text, at most `max + 1` bytes read (so an oversized body is refused unread). */
async function cappedText(req: Request, max: number): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * RFC-0044 §3: `POST /api/auth/oauth2/register` (RFC 7591, `ROUTE_SCOPES` public as all of
 * `/api/auth/*`), mounted before Better Auth's catch-all. JSON only; 201 with the client, or the
 * RFC 7591 error body; never cached.
 */
export function mountClientRegistration(
  app: Hono<Env>,
  register: NonNullable<OauthServer["register"]>,
): void {
  app.post(REGISTER_PATH, async (c) => {
    const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json")
      return c.json(
        {
          error: "invalid_client_metadata",
          error_description: "send the metadata as application/json",
        },
        400,
        NO_STORE,
      );
    const declared = Number(c.req.header("content-length") ?? 0);
    const text =
      declared > DCR_MAX_BODY_BYTES
        ? "x".repeat(DCR_MAX_BODY_BYTES + 1)
        : await cappedText(c.req.raw, DCR_MAX_BODY_BYTES);
    try {
      return c.json(await register({ text, address: clientIp(c) }), 201, NO_STORE);
    } catch (e) {
      if (e instanceof RegistrationError) return c.json(e.body(), e.status, NO_STORE);
      throw e;
    }
  });
}

/** RFC-0044 Phase 2: the metadata documents and `/api/agent-grants`. */
export function mountOauthServer(app: Hono<Env>, server: OauthServer): void {
  mountAuthorizationServerMetadata(app, server);
  app.route("/api/agent-grants", agentGrantRoutes(server));
}

/** The signed authorization request (`oauth_query`), as the consent page received it. */
function requestOf(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192)
    throw badRequest("request is required");
  return value.startsWith("?") ? value.slice(1) : value;
}

/**
 * `/api/agent-grants` (people only, `member` in `ROUTE_SCOPES`; agents are refused there):
 *
 * - `GET    /consent?request=<oauth_query>` → `ConsentInfo` for Studio's consent screen
 * - `POST   /consent` {request, accept, scopes, mode} → `{redirect}`: the URL the browser goes to
 *   (the client's redirect URI with the code, or with `access_denied`); audited `connect_agent`
 * - `GET    /` → the caller's connections; `?all=1` every one with its owner (`agents:manage`)
 * - `DELETE /:id` → 204 (own connections, or any with `agents:manage`; audited `revoke_agent`)
 */
export function agentGrantRoutes(server: OauthServer): Hono<Env> {
  const grants = server.grants;
  return new Hono<Env>()
    .get("/consent", async (c) =>
      c.json(await grants.info(c.req.raw.headers, requestOf(c.req.query("request")))),
    )
    .post("/consent", async (c) => {
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      const actor = c.get("actor");
      const person = c.get("principal")?.person;
      if (!actor || !person) throw unauthorized();
      if (typeof body.accept !== "boolean") throw badRequest("accept must be true or false");
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.filter((s): s is string => typeof s === "string")
        : [];
      const mode = body.mode ?? "edits";
      if (!isAgentMode(mode)) throw badRequest("unknown mode");
      const now = c.get("now");
      const result = await grants.consent({
        headers: c.req.raw.headers,
        oauthQuery: requestOf(body.request),
        accept: body.accept,
        scopes,
        mode,
        audit: ({ agentId, scopes: kept }) => ({
          at: now().toISOString(),
          actor: personActor(person.userId, person.name ?? null),
          tool: "connect_agent",
          decision: "allow",
          outcome: "ok",
          mode,
          reason: `connected ${agentId}`,
          input: { agentId, scopes: kept, mode },
        }),
      });
      return c.json({ redirect: result.redirect });
    })
    .get("/", async (c) => c.json(await grants.list(c.req.raw.headers, c.req.query("all") === "1")))
    .delete("/:id", async (c) => {
      const person = c.get("principal")?.person;
      if (!person) throw unauthorized();
      const now = c.get("now");
      await grants.revoke({
        headers: c.req.raw.headers,
        id: param(c, "id"),
        audit: (grant) => ({
          at: now().toISOString(),
          actor: personActor(person.userId, person.name ?? null),
          tool: "revoke_agent",
          decision: "allow",
          outcome: "ok",
          reason: `${grant.clientName} disconnected`,
          input: { grantId: grant.id, clientId: grant.clientId, owner: grant.userId },
        }),
      });
      return c.body(null, 204);
    });
}
