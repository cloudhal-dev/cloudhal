/**
 * Shared suite for RFC-0044 §1 (Phase 1): what an OAuth MCP client sees on a deployment before it
 * has a token. The `WWW-Authenticate` challenge on the 401 of `/mcp`, the RFC 9728 metadata at
 * both well-known forms, and the `insufficient_scope` step-up for a token principal. Runs on
 * better-sqlite3 and Miniflare D1 (the step-up's key-principal case reads the key from the
 * database).
 */
import { type Principal, scopesForMode } from "@cloudhal/agent-runtime";
import { seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { ApiDeps } from "./context.ts";
import { type McpOauthOptions, PROTECTED_RESOURCE_PATH } from "./mcp-oauth.ts";
import type { RolesBackend } from "./testing-roles.ts";

type Json = Record<string, unknown>;
const ORIGIN = "http://studio.test";
const OAUTH: McpOauthOptions = {
  issuer: `${ORIGIN}/api/auth`,
  resource: `${ORIGIN}/mcp/`, // the trailing slash is dropped by the canonical form
  resourceName: "Cloudhal test",
};
const METADATA_URL = `${ORIGIN}${PROTECTED_RESOURCE_PATH}/mcp`;

/** A tool call as a 2026-07-28 client sends it: one JSON-RPC message per request. */
function toolCall(name: string, args: Json): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  };
}

export function describeMcpOauthDiscovery(label: string, backend: RolesBackend): void {
  describe(`MCP OAuth discovery: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });

    /** The deployment with Better Auth, with or without `mcp.oauth`. */
    const setup = async (oauth: McpOauthOptions | undefined) => {
      const b = await backend.create();
      const site = await seedStarterSite(b.store, { name: "Blog", slug: "blog" });
      const auth = createAuth({
        database: b.database,
        sql: b.sql,
        baseURL: ORIGIN,
        secret: "mcp-oauth-secret-0123456789abcdefghijklm",
        signUp: "first-user",
      });
      const app = createApi({
        store: b.store,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        mcp: { stateKey: "mcp-oauth-state-key-0123456789abcdefghij", oauth },
      });
      const signUp = await app.request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Olive Owner",
          email: "owner@example.com",
          password: "correct horse battery staple",
        }),
      });
      const cookie =
        (signUp.headers.getSetCookie?.() ?? [])
          .map((c) => c.split(";")[0] as string)
          .find((c) => c.startsWith("better-auth.session_token=")) ?? "";
      return { app, cookie, siteId: site.id };
    };

    /** A deployment whose principal is injected: a token principal of Phase 2, before Phase 2. */
    const setupWithPrincipal = async (principal: Principal | undefined) => {
      const b = await backend.create();
      const site = await seedStarterSite(b.store, { name: "Blog", slug: "blog" });
      const deps: ApiDeps = {
        store: b.store,
        resolvePrincipal: async () => principal,
        mcp: { stateKey: "mcp-oauth-state-key-0123456789abcdefghij", oauth: OAUTH },
      };
      return { app: createApi(deps), siteId: site.id };
    };

    const grantPrincipal = (
      role: "editor" | "contributor",
      scopes: Principal["scopes"],
    ): Principal => ({
      actor: { kind: "agent", id: "agent_grant0001", name: "Claude" },
      scopes,
      mode: "edits",
      grantId: "grant_0001",
      keyScopes: scopes,
      person: { id: "user_owner1", userId: "owner1", role, name: "Olive Owner" },
    });

    it("answers 401 with the RFC 9728 challenge and the scopes to request", async () => {
      const { app } = await setup(OAUTH);
      const res = await app.request(`${ORIGIN}/mcp`, toolCall("get_mode", {}));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized", message: "sign in required" });
      const header = res.headers.get("www-authenticate") ?? "";
      expect(header).toMatch(/^Bearer /);
      expect(header).toContain(`resource_metadata="${METADATA_URL}"`);
      expect(header).toContain(`scope="${scopesForMode("edits").join(" ")}"`);
      expect(header).not.toContain("error=");
    });

    it("names invalid_token when a bearer was presented, for keys and tokens alike", async () => {
      const { app } = await setup(OAUTH);
      const res = await app.request(`${ORIGIN}/mcp`, {
        ...toolCall("get_mode", {}),
        headers: { ...(toolCall("get_mode", {}).headers as Json), authorization: "Bearer nope" },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    });

    it("serves the protected resource metadata at both well-known forms, cacheable", async () => {
      const { app } = await setup(OAUTH);
      const docs = await Promise.all(
        [`${PROTECTED_RESOURCE_PATH}/mcp`, PROTECTED_RESOURCE_PATH].map(async (path) => {
          const res = await app.request(`${ORIGIN}${path}`);
          expect(res.status, path).toBe(200);
          expect(res.headers.get("content-type")).toMatch(/^application\/json/);
          expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
          return (await res.json()) as Json;
        }),
      );
      expect(docs[0]).toEqual(docs[1]);
      expect(docs[0]).toEqual({
        resource: `${ORIGIN}/mcp`,
        authorization_servers: [`${ORIGIN}/api/auth`],
        scopes_supported: scopesForMode("edits"),
        bearer_methods_supported: ["header"],
        resource_name: "Cloudhal test",
      });
    });

    it("stays a bare 401 without metadata when oauth is not configured", async () => {
      const { app } = await setup(undefined);
      const res = await app.request(`${ORIGIN}/mcp`, toolCall("get_mode", {}));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBeNull();
      expect((await app.request(`${ORIGIN}${PROTECTED_RESOURCE_PATH}`)).status).toBe(404);
      expect((await app.request(`${ORIGIN}${PROTECTED_RESOURCE_PATH}/mcp`)).status).toBe(404);
    });

    it("challenges a token principal for a scope its member's role holds (step-up)", async () => {
      const { app, siteId } = await setupWithPrincipal(
        grantPrincipal("editor", ["site:read", "content:read"]),
      );
      const res = await app.request(`${ORIGIN}/mcp`, toolCall("publish", { siteId }));
      expect(res.status).toBe(403);
      const header = res.headers.get("www-authenticate") ?? "";
      expect(header).toContain('error="insufficient_scope"');
      expect(header).toContain('scope="site:publish"');
      expect(header).toContain(`resource_metadata="${METADATA_URL}"`);
      expect(await res.json()).toMatchObject({
        error: "insufficient_scope",
        details: { scope: ["site:publish"] },
      });
      // With the scope, the call reaches the handler (and waits for approval, as policy says).
      const ok = await app.request(`${ORIGIN}/mcp`, toolCall("publish", { siteId }));
      expect(ok.status).toBe(403); // same request, same answer: the challenge is deterministic
      const allowed = await setupWithPrincipal(
        grantPrincipal("editor", ["site:read", "content:read", "site:publish"]),
      );
      const reached = await allowed.app.request(
        `${ORIGIN}/mcp`,
        toolCall("publish", { siteId: allowed.siteId }),
      );
      expect(reached.status).not.toBe(403);
      expect(reached.headers.get("www-authenticate")).toBeNull();
    });

    it("never challenges for a scope the role lacks, and never challenges a key", async () => {
      // A Contributor's role has no site:publish: a challenge would make the client loop.
      const contributor = await setupWithPrincipal(
        grantPrincipal("contributor", ["site:read", "content:read"]),
      );
      const denied = await contributor.app.request(
        `${ORIGIN}/mcp`,
        toolCall("publish", { siteId: contributor.siteId }),
      );
      expect(denied.status).not.toBe(403);
      expect(denied.headers.get("www-authenticate")).toBeNull();
      // An agent key narrowed to read scopes: the policy denial stays a JSON-RPC result.
      const { app, cookie, siteId } = await setup(OAUTH);
      const created = await app.request(`${ORIGIN}/api/agent-keys`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "reader", scopes: ["site:read", "content:read"] }),
      });
      expect(created.status).toBe(201);
      const key = ((await created.json()) as { key: string }).key;
      const res = await app.request(`${ORIGIN}/mcp`, {
        ...toolCall("publish", { siteId }),
        headers: { ...(toolCall("publish", { siteId }).headers as Json), "x-api-key": key },
      });
      expect(res.status).not.toBe(403);
      expect(res.headers.get("www-authenticate")).toBeNull();
    });
  });
}
