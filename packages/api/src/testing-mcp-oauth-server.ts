/**
 * Shared suite for RFC-0044 Phase 2 (§2, §4, §5, §8): the authorization server, Studio's consent
 * API and the token path on `/mcp`, on better-sqlite3 and Miniflare D1. Discovery leads to the
 * AS metadata; the code flow with PKCE (S256 only); the token on `/mcp`; refresh rotation with
 * its reuse window; revocation; `aud` and `iss` bound to the deployment; step-up then a new
 * consent; scopes narrowed by the member's installation role. The client registers through DCR
 * (`registerClient`); registration itself is `testing-mcp-oauth-registration.ts`'s.
 */
import { narrow, roleScopes, scopesForMode } from "@cloudhal/agent-runtime";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessTokenKeyCache } from "./auth/access-token.ts";
import { agentIdForGrant } from "./auth/grants.ts";
import { OAUTH_SCOPES } from "./auth/oauth.ts";
import {
  authorize,
  connect,
  consent,
  consentRequest,
  cookieOf,
  deploy,
  ISSUER,
  type Json,
  mcpCall,
  mcpClient,
  ORIGIN,
  REDIRECT,
  RESOURCE,
  setupServer,
  token,
} from "./testing-oauth-harness.ts";
import type { RolesBackend } from "./testing-roles.ts";

const READ = "site:read content:read";

export function describeMcpOauthServer(label: string, backend: RolesBackend): void {
  describe(`MCP OAuth authorization server: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });
    afterEach(() => {
      vi.useRealTimers();
      clearAccessTokenKeyCache();
    });

    it("discovery leads from the 401 to the authorization server metadata", async () => {
      const s = await setupServer(backend);
      const first = await s.app.request(`${ORIGIN}/mcp`, mcpCall("", "tools/list"));
      expect(first.status).toBe(401);
      const prmUrl = /resource_metadata="([^"]+)"/.exec(
        first.headers.get("www-authenticate") ?? "",
      )?.[1];
      expect(prmUrl).toBe(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
      const prm = (await (await s.app.request(prmUrl as string)).json()) as Json;
      expect(prm.resource).toBe(RESOURCE);
      expect(prm.authorization_servers).toEqual([ISSUER]);
      // RFC 8414 §3.1: path insertion of the issuer's path.
      const metaRes = await s.app.request(
        `${ORIGIN}/.well-known/oauth-authorization-server/api/auth`,
      );
      expect(metaRes.status).toBe(200);
      expect(metaRes.headers.get("cache-control")).toContain("max-age=3600");
      const meta = (await metaRes.json()) as Json;
      expect(meta.issuer).toBe(ISSUER);
      expect(meta.authorization_endpoint).toBe(`${ISSUER}/oauth2/authorize`);
      expect(meta.token_endpoint).toBe(`${ISSUER}/oauth2/token`);
      expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
      expect(meta.authorization_response_iss_parameter_supported).toBe(true);
      expect(meta.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
      expect(meta.scopes_supported).toEqual(OAUTH_SCOPES);
      // Phase 3: DCR is on in this deployment (the harness's default), CIMD is not.
      expect(meta.registration_endpoint).toBe(`${ISSUER}/oauth2/register`);
      expect(meta.client_id_metadata_document_supported).toBeUndefined();
      // §2: public clients and private_key_jwt only; no client holds a shared secret.
      expect(meta.token_endpoint_auth_methods_supported).toEqual(["none", "private_key_jwt"]);
      // Decision 6: the root alias returns the same document.
      const alias = await s.app.request(`${ORIGIN}/.well-known/oauth-authorization-server`);
      expect(await alias.json()).toEqual(meta);
    });

    it("runs the code flow with PKCE, and the token works on /mcp", async () => {
      const s = await setupServer(backend);
      const start = await authorize(s, { cookie: s.owner.cookie, scope: READ });
      expect(start.location?.pathname).toBe("/oauth/consent");
      const request = consentRequest(start.location as URL);
      const info = await s.call(
        "GET",
        `/api/agent-grants/consent?request=${encodeURIComponent(request)}`,
        { cookie: s.owner.cookie },
      );
      expect(info.status, JSON.stringify(info.body)).toBe(200);
      expect(info.body.client).toEqual({ id: s.clientId, name: "Test Agent" });
      expect(info.body.redirect).toEqual({ host: "127.0.0.1:33418", loopback: true });
      expect(info.body.loopbackOnly).toBe(true);
      expect(info.body.scopes).toEqual([
        { requested: "site:read", granted: "site:read" },
        { requested: "content:read", granted: "content:read" },
      ]);
      expect(info.body.modes).toEqual(["plan", "manual", "edits", "auto"]);
      expect(info.body.defaultMode).toBe("edits");

      const { access, refresh } = await connect(s, { cookie: s.owner.cookie, scope: READ });
      expect(access.split(".")).toHaveLength(3);
      expect(refresh).toBeUndefined(); // no offline_access, no refresh token
      const agent = await mcpClient(s.app, access);
      const { tools } = await agent.listTools();
      expect(tools.map((t) => t.name)).toContain("get_mode");
      const mode = await agent.callTool({ name: "get_mode", arguments: {} });
      expect(mode.isError).toBeFalsy();

      const grants = await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie });
      const [grant] = grants.body as unknown as Json[];
      expect(grant).toMatchObject({
        clientId: s.clientId,
        clientName: "Test Agent",
        scopes: ["site:read", "content:read"],
        mode: "edits",
      });
      const agentId = agentIdForGrant(grant?.id as string);
      expect(
        await s.sql.get("SELECT user_id FROM agent_owner WHERE agent_id = ?", [agentId]),
      ).toEqual({ user_id: s.owner.userId });
      const rows = await s.audit.list({ tool: "connect_agent" });
      expect(rows[0]).toMatchObject({ decision: "allow", actor: { kind: "human" } });
    });

    it("sends a signed-out member to sign in, then on to the consent screen", async () => {
      const s = await setupServer(backend);
      const start = await authorize(s, { cookie: "", scope: READ });
      expect(start.location?.pathname).toBe("/login");
      // Studio's login page posts the signed request with the credentials (`oauth_query`).
      const signIn = await s.call("POST", "/api/auth/sign-in/email", {
        body: {
          email: "owner@example.com",
          password: "correct horse battery staple",
          oauth_query: (start.location as URL).search.slice(1),
        },
      });
      expect(signIn.status, JSON.stringify(signIn.body)).toBe(200);
      const next = new URL(signIn.body.url as string, ORIGIN);
      expect(next.pathname).toBe("/oauth/consent");
      const info = await s.call(
        "GET",
        `/api/agent-grants/consent?request=${encodeURIComponent(next.search.slice(1))}`,
        { cookie: cookieOf(signIn.res) },
      );
      expect(info.status, JSON.stringify(info.body)).toBe(200);
    });

    it("refuses a tampered authorization request on the consent screen", async () => {
      const s = await setupServer(backend);
      const start = await authorize(s, { cookie: s.owner.cookie, scope: READ });
      const tampered = consentRequest(start.location as URL).replace(
        "scope=site%3Aread",
        "scope=site%3Apublish+site%3Aread",
      );
      const info = await s.call(
        "GET",
        `/api/agent-grants/consent?request=${encodeURIComponent(tampered)}`,
        { cookie: s.owner.cookie },
      );
      expect(info.status).toBe(400);
      const posted = await consent(s, s.owner.cookie, tampered, { scopes: ["site:publish"] });
      expect(posted.status).toBe(400);
    });

    it("refuses an authorization request without PKCE, or with plain", async () => {
      const s = await setupServer(backend);
      for (const challengeMethod of [null, "plain"]) {
        const r = await authorize(s, { cookie: s.owner.cookie, scope: READ, challengeMethod });
        expect(r.location?.origin + (r.location?.pathname ?? "")).toBe(REDIRECT);
        expect(r.location?.searchParams.get("error")).toBe("invalid_request");
      }
    });

    it("sends the browser back with access_denied when the member denies", async () => {
      const s = await setupServer(backend);
      const start = await authorize(s, { cookie: s.owner.cookie, scope: READ });
      const denied = await consent(s, s.owner.cookie, consentRequest(start.location as URL), {
        accept: false,
        scopes: [],
      });
      expect(denied.status).toBe(200);
      expect(new URL(denied.body.redirect as string).searchParams.get("error")).toBe(
        "access_denied",
      );
      expect((await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie })).body).toEqual(
        [],
      );
    });

    it("never lets a client or a page reach the provider's consent and client endpoints", async () => {
      const s = await setupServer(backend);
      for (const path of [
        "/api/auth/oauth2/consent",
        "/api/auth/oauth2/create-client",
        // Only Cloudhal's checked route registers: no variant reaches the provider's own.
        "/api/auth/oauth2/register/",
        "/api/auth/oauth2/%72egister",
        "/api/auth/oauth2/get-consents",
        "/api/auth/oauth2/introspect",
        "/api/auth/token",
      ]) {
        const r = await s.call("POST", path, { cookie: s.owner.cookie, body: {} });
        expect(r.status, path).toBe(404);
      }
    });

    it("rotates refresh tokens, with a 30 s reuse window, then revokes the family", async () => {
      const s = await setupServer(backend);
      const { refresh } = await connect(s, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      expect(refresh).toBeTruthy();
      const first = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.refresh_token).not.toBe(refresh);
      // A concurrent retry within the window gets the same response (Decision 2).
      const retry = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(retry.status).toBe(200);
      expect(retry.body.refresh_token).toBe(first.body.refresh_token);
      // Beyond the window the rotated token is a replay: refused, and the family revoked.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 31_000);
      const replay = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe("invalid_grant");
      const next = await token(s, {
        grant_type: "refresh_token",
        refresh_token: first.body.refresh_token as string,
      });
      expect(next.body.error).toBe("invalid_grant");
    });

    it("refuses a revoked connection at its next call, and its refresh token (inv. 4)", async () => {
      const s = await setupServer(backend);
      const { access, refresh } = await connect(s, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      const [grant] = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      const del = await s.call("DELETE", `/api/agent-grants/${grant?.id}`, {
        cookie: s.owner.cookie,
        headers: { origin: s.origin },
      });
      expect(del.status, JSON.stringify(del.body)).toBe(204);
      const res = await s.app.request(`${ORIGIN}/mcp`, mcpCall(access, "tools/list"));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
      const again = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(again.body.error).toBe("invalid_grant");
      expect((await s.audit.list({ tool: "revoke_agent" }))[0]).toMatchObject({
        decision: "allow",
      });
    });

    it("refuses a removed member's token (inv. 2)", async () => {
      const s = await setupServer(backend);
      const editor = await s.join("editor");
      const { access } = await connect(s, { cookie: editor.cookie, scope: READ });
      await (await mcpClient(s.app, access)).listTools();
      const removed = await s.call("DELETE", `/api/members/${editor.userId}`, {
        cookie: s.owner.cookie,
        headers: { origin: s.origin },
      });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      expect((await s.app.request(`${ORIGIN}/mcp`, mcpCall(access, "tools/list"))).status).toBe(
        401,
      );
    });

    it("refuses a token for another resource (aud) or from another issuer (iss) (inv. 3)", async () => {
      const s = await setupServer(backend);
      const { access } = await connect(s, { cookie: s.owner.cookie, scope: READ });
      // Same database, same signing key; only the audience differs.
      const otherAud = await deploy(s.backend, { resource: `${ORIGIN}/other/mcp` });
      const a = await otherAud.app.request(`${ORIGIN}/mcp`, mcpCall(access, "tools/list"));
      expect(a.status).toBe(401);
      expect(a.headers.get("www-authenticate")).toContain('error="invalid_token"');
      // Same key and the same resource, another issuer.
      const otherIss = await deploy(s.backend, {
        baseURL: "http://127.0.0.1:8787",
        resource: RESOURCE,
      });
      const i = await otherIss.app.request(`${ORIGIN}/mcp`, mcpCall(access, "tools/list"));
      expect(i.status).toBe(401);
      // The deployment itself still accepts it.
      await (await mcpClient(s.app, access)).listTools();
    });

    it("challenges a missing scope (step-up), then a new consent widens the connection", async () => {
      const s = await setupServer(backend);
      const { access } = await connect(s, { cookie: s.owner.cookie, scope: READ });
      const call = mcpCall(access, "tools/call", {
        name: "publish",
        arguments: { siteId: s.siteId },
      });
      const denied = await s.app.request(`${ORIGIN}/mcp`, call);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
      expect(denied.headers.get("www-authenticate")).toContain('scope="site:publish"');
      // The client re-authorizes with the union; the screen pre-checks what was granted.
      const union = `${READ} site:publish`;
      const start = await authorize(s, { cookie: s.owner.cookie, scope: union });
      expect(start.location?.pathname).toBe("/oauth/consent");
      const info = await s.call(
        "GET",
        `/api/agent-grants/consent?request=${encodeURIComponent(consentRequest(start.location as URL))}`,
        { cookie: s.owner.cookie },
      );
      expect(info.body.existing).toEqual({ scopes: ["site:read", "content:read"], mode: "edits" });
      const widened = await connect(s, { cookie: s.owner.cookie, scope: union });
      expect(
        (
          await s.app.request(
            `${ORIGIN}/mcp`,
            mcpCall(widened.access, "tools/call", {
              name: "publish",
              arguments: { siteId: s.siteId },
            }),
          )
        ).status,
      ).not.toBe(403);
      const published = await (await mcpClient(s.app, widened.access)).callTool({
        name: "publish",
        arguments: { siteId: s.siteId },
      });
      expect(JSON.stringify(published)).not.toContain("insufficient_scope");
    });

    it("skips the screen for a subset of what was granted (Decision 8)", async () => {
      const s = await setupServer(backend);
      await connect(s, { cookie: s.owner.cookie, scope: READ });
      const again = await authorize(s, { cookie: s.owner.cookie, scope: "site:read" });
      expect(again.location?.origin + (again.location?.pathname ?? "")).toBe(REDIRECT);
      expect(again.location?.searchParams.get("code")).toBeTruthy();
    });

    it("narrows the requested scopes by the member's installation role at consent", async () => {
      const s = await setupServer(backend);
      const requested = scopesForMode("edits");
      // An installation Contributor who is an Editor on the site: consent caps by the installation
      // role, which the step-up cap of #173 relies on; the site role only narrows further.
      const contributor = await s.join("contributor", { sites: { [s.siteId]: "editor" } });
      const start = await authorize(s, {
        cookie: contributor.cookie,
        scope: [...requested, "site:publish"].join(" "),
      });
      const request = consentRequest(start.location as URL);
      const info = await s.call(
        "GET",
        `/api/agent-grants/consent?request=${encodeURIComponent(request)}`,
        { cookie: contributor.cookie },
      );
      const scopes = info.body.scopes as { requested: string; granted: string | null }[];
      expect(scopes.find((x) => x.requested === "content:write")?.granted).toBe(
        "content:draft:own",
      );
      expect(scopes.find((x) => x.requested === "site:publish")?.granted).toBeNull();
      expect(info.body.modes).toEqual(["plan", "manual", "edits"]);
      // `auto` is above a Contributor's cap, as for a key.
      const tooMuch = await consent(s, contributor.cookie, request, {
        scopes: requested,
        mode: "auto",
      });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.error).toBe("mode_above_role");
      const { access } = await connect(s, {
        cookie: contributor.cookie,
        scope: [...requested, "site:publish"].join(" "),
        keep: [...requested, "site:publish"],
      });
      const [grant] = (await s.call("GET", "/api/agent-grants", { cookie: contributor.cookie }))
        .body as unknown as Json[];
      const expected = narrow([...requested, "site:publish"], roleScopes("contributor"));
      expect(grant?.scopes).toEqual(expected);
      expect(grant?.scopes).not.toContain("content:write");
      // The token path: never more than the installation role gives (inv. 1).
      const raw = await s.app.request(
        `${ORIGIN}/mcp`,
        mcpCall(access, "tools/call", { name: "publish", arguments: { siteId: s.siteId } }),
      );
      // Not a step-up: the installation role cannot give site:publish, so no challenge (§1).
      expect(raw.status).not.toBe(403);
      const agent = await mcpClient(s.app, access);
      const publish = await agent.callTool({ name: "publish", arguments: { siteId: s.siteId } });
      expect(publish.isError).toBe(true);
    });

    it("keeps other members' connections invisible without agents:manage", async () => {
      const s = await setupServer(backend);
      const editor = await s.join("editor");
      await connect(s, { cookie: s.owner.cookie, scope: READ });
      const [ownerGrant] = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      expect((await s.call("GET", "/api/agent-grants", { cookie: editor.cookie })).body).toEqual(
        [],
      );
      const steal = await s.call("DELETE", `/api/agent-grants/${ownerGrant?.id}`, {
        cookie: editor.cookie,
        headers: { origin: s.origin },
      });
      expect(steal.status).toBe(404);
      const all = await s.call("GET", "/api/agent-grants?all=1", { cookie: s.owner.cookie });
      expect((all.body as unknown as Json[])[0]?.owner).toMatchObject({ userId: s.owner.userId });
    });
  });
}
