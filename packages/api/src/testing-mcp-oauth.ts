/**
 * Shared suite for RFC-0044 §1 (Phase 1): what an OAuth MCP client sees on a deployment before it
 * has a token. The `WWW-Authenticate` challenge on the 401 of `/mcp`, the RFC 9728 metadata at
 * both well-known forms, and the `insufficient_scope` step-up for a token principal. Runs on
 * better-sqlite3 and Miniflare D1 (the step-up's key-principal case reads the key from the
 * database).
 */
import { AuditLog, type PersonRef, type Principal, scopesForMode } from "@cloudhal/agent-runtime";
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

const entryArgs = (siteId: string): Json => ({ siteId, slug: "x", title: "X", body: "x" });

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
    const setupWithPrincipal = async (
      principal: Principal | undefined | ((siteId: string) => Principal),
    ) => {
      const b = await backend.create();
      const site = await seedStarterSite(b.store, { name: "Blog", slug: "blog" });
      const audit = new AuditLog(b.sql);
      const resolved = typeof principal === "function" ? principal(site.id) : principal;
      const deps: ApiDeps = {
        store: b.store,
        resolvePrincipal: async () => resolved,
        mcp: { stateKey: "mcp-oauth-state-key-0123456789abcdefghij", oauth: OAUTH, audit },
      };
      return { app: createApi(deps), siteId: site.id, audit };
    };

    const grantPrincipal = (
      role: PersonRef["role"],
      scopes: Principal["scopes"],
      sites?: PersonRef["sites"],
    ): Principal => ({
      actor: { kind: "agent", id: "agent_grant0001", name: "Claude" },
      scopes,
      mode: "edits",
      grantId: "grant_0001",
      keyScopes: scopes,
      person: {
        id: "user_owner1",
        userId: "owner1",
        role,
        name: "Olive Owner",
        ...(sites ? { sites } : {}),
      },
    });

    /** The scopes a step-up 403 names, or undefined when the call was not challenged. */
    const challenged = async (
      principal: Principal | ((siteId: string) => Principal),
      tool: string,
      args: (siteId: string) => Json,
    ) => {
      const { app, siteId } = await setupWithPrincipal(principal);
      const res = await app.request(`${ORIGIN}/mcp`, toolCall(tool, args(siteId)));
      if (res.status !== 403) return undefined;
      return ((await res.json()) as { details: { scope: string[] } }).details.scope;
    };

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

    it("asks for the own variant an Author's or Contributor's role holds", async () => {
      const read: Principal["scopes"] = ["site:read", "content:read"];
      expect(await challenged(grantPrincipal("author", read), "create_entry", entryArgs)).toEqual([
        "content:write:own",
      ]);
      expect(
        await challenged(grantPrincipal("contributor", read), "create_entry", entryArgs),
      ).toEqual(["content:draft:own"]);
      expect(
        await challenged(grantPrincipal("author", read), "publish", (siteId) => ({ siteId })),
      ).toEqual(["site:publish:own"]);
    });

    it("asks a propose call for the propose scopes, not the write", async () => {
      const propose = (siteId: string) => ({ siteId, entryId: "e1", ops: [], mode: "propose" });
      expect(
        await challenged(grantPrincipal("editor", ["site:read"]), "edit_body", propose),
      ).toEqual(["content:read", "content:propose"]);
    });

    it("judges the member's role on the call's site, not the installation role", async () => {
      // An Editor of the installation who is a Contributor on this site: no publish to ask for,
      // and the draft variant (not content:write) for a new entry.
      const read: Principal["scopes"] = ["site:read", "content:read"];
      const limited = (siteId: string) =>
        grantPrincipal("editor", read, { [siteId]: "contributor" });
      const { app, siteId } = await setupWithPrincipal(limited);
      const res = await app.request(`${ORIGIN}/mcp`, toolCall("publish", { siteId }));
      expect(res.status).not.toBe(403);
      expect(res.headers.get("www-authenticate")).toBeNull();
      const entry = await app.request(`${ORIGIN}/mcp`, toolCall("create_entry", entryArgs(siteId)));
      expect(entry.status).toBe(403);
      expect(await entry.json()).toMatchObject({ details: { scope: ["content:draft:own"] } });
      // An installation Contributor who is an Editor here: consent caps the token at the
      // Contributor's scopes, so the challenge names what it can issue (content:draft:own), not
      // content:write, which would come back narrowed and loop. With it the call goes through.
      const editorOn = (siteId: string) =>
        grantPrincipal("contributor", read, { [siteId]: "editor" });
      expect(await challenged(editorOn, "create_entry", entryArgs)).toEqual(["content:draft:own"]);
      const consented = (siteId: string) =>
        grantPrincipal("contributor", [...read, "content:draft:own"], { [siteId]: "editor" });
      expect(await challenged(consented, "create_entry", entryArgs)).toBeUndefined();
      // A site the member cannot open answers not_found from the handler, never a challenge.
      const elsewhere = grantPrincipal("editor", read, { site_other: "editor" });
      expect(await challenged(elsewhere, "create_entry", entryArgs)).toBeUndefined();
    });

    it("never challenges a plan-mode token for a write plan mode refuses anyway", async () => {
      const plan: Principal = {
        ...grantPrincipal("editor", scopesForMode("plan")),
        mode: "plan",
      };
      expect(await challenged(plan, "create_entry", entryArgs)).toBeUndefined();
    });

    it("records the step-up 403 in the audit log, like any other denial", async () => {
      const { app, siteId, audit } = await setupWithPrincipal(
        grantPrincipal("editor", ["site:read", "content:read"]),
      );
      const res = await app.request(`${ORIGIN}/mcp`, toolCall("publish", { siteId }));
      expect(res.status).toBe(403);
      const rows = await audit.list({ tool: "publish" });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor: { kind: "agent", id: "agent_grant0001" },
        siteId,
        tool: "publish",
        decision: "deny",
        outcome: "error",
        reason: "insufficient_scope: this connection needs site:publish",
      });
    });

    it("refuses at createApi time an oauth.resource that is not the /mcp endpoint", async () => {
      const b = await backend.create();
      const make = (resource: string) =>
        createApi({
          store: b.store,
          mcp: {
            stateKey: "mcp-oauth-state-key-0123456789abcdefghij",
            oauth: { issuer: `${ORIGIN}/api/auth`, resource },
          },
        });
      expect(() => make(`${ORIGIN}/`)).toThrow(
        /mcp\.oauth\.resource must be the public URL of \/mcp/,
      );
      expect(() => make(`${ORIGIN}/api/mcp-tools`)).toThrow(/mcp\.oauth\.resource/);
      expect(() => make(`${ORIGIN}/mcp?x=1`)).toThrow(/mcp\.oauth\.resource/);
      expect(() => make(`${ORIGIN}/mcp/`)).not.toThrow();
      expect(() => make("https://example.com/studio/mcp")).not.toThrow();
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
