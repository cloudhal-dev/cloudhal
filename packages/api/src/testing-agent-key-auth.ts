/**
 * Shared suite for how an agent key reaches the API: `x-api-key` or `Authorization: Bearer <key>`
 * (what most MCP clients and Codex's `bearer_token_env_var` send), on REST and `/mcp`, next to the
 * deployment-token bearer of `/api/admin/*` and browser sessions. Runs on better-sqlite3 and
 * Miniflare D1.
 */
import { AuditLog } from "@cloudhal/agent-runtime";
import { seedStarterSite } from "@cloudhal/core-ts";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { RolesBackend } from "./testing-roles.ts";

type Json = Record<string, unknown>;
const ORIGIN = "http://studio.test";
const DEPLOY_TOKEN = "key-auth-deploy-token-0123456789abcdefghij";

export function describeAgentKeyAuthApi(label: string, backend: RolesBackend): void {
  describe(`agent key headers: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });

    const setup = async () => {
      const b = await backend.create();
      await seedStarterSite(b.store, { name: "Blog", slug: "blog" });
      const auth = createAuth({
        database: b.database,
        sql: b.sql,
        baseURL: ORIGIN,
        secret: "key-auth-secret-0123456789abcdefghijkl",
        signUp: "first-user",
      });
      const audit = new AuditLog(b.sql);
      const app = createApi({
        store: b.store,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        audit,
        mcp: { stateKey: "key-auth-state-key-0123456789abcdefghi", audit },
        admin: { deployToken: DEPLOY_TOKEN, storage: { sql: b.sql, blobs: b.blobs } },
      });
      let ip = 0;
      const call = async (method: string, path: string, headers: Record<string, string> = {}) => {
        const res = await app.request(`${ORIGIN}${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.2.0.${ip++ % 250}`,
            ...headers,
          },
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json, res };
      };
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
      const created = await app.request(`${ORIGIN}/api/agent-keys`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "bearer agent" }),
      });
      expect(created.status).toBe(201);
      const key = ((await created.json()) as { key: string }).key;
      const connect = async (headers: Record<string, string>) => {
        const client = new Client(
          { name: "key-auth-agent", version: "1.0.0" },
          { capabilities: {}, versionNegotiation: { mode: "auto" } },
        );
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
            requestInit: { headers },
            fetch: async (input, init) => app.fetch(new Request(input, init as RequestInit)),
          }),
        );
        return client;
      };
      return { call, cookie, key, connect };
    };

    it("accepts the key as x-api-key or as Authorization: Bearer on REST", async () => {
      const { call, key } = await setup();
      for (const headers of [
        { "x-api-key": key },
        { authorization: `Bearer ${key}` },
        { authorization: `bearer  ${key}` },
      ]) {
        const me = await call("GET", "/api/me", headers);
        expect(me.status, JSON.stringify(me.body)).toBe(200);
        expect(me.body.actor).toMatchObject({ kind: "agent", name: "bearer agent" });
      }
      // Bearer is only another header: REST still sends agents to /mcp (ADR-0011).
      const sites = await call("GET", "/api/sites", { authorization: `Bearer ${key}` });
      expect(sites.body.message).toMatch(/\/mcp/);
    });

    it("refuses an unknown bearer and does not fall back to the session", async () => {
      const { call, cookie } = await setup();
      expect((await call("GET", "/api/me", { authorization: "Bearer not-a-key" })).status).toBe(
        401,
      );
      expect(
        (await call("GET", "/api/me", { authorization: "Bearer not-a-key", cookie })).status,
      ).toBe(401);
      // A browser session without a bearer still answers as the person.
      const me = await call("GET", "/api/me", { cookie });
      expect(me.status).toBe(200);
      expect(me.body.actor).toMatchObject({ kind: "human" });
    });

    it("connects an MCP client with Authorization: Bearer", async () => {
      const { key, connect } = await setup();
      const client = await connect({ authorization: `Bearer ${key}` });
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("get_mode");
      await client.close();
      await expect(connect({ authorization: "Bearer not-a-key" })).rejects.toThrow();
    });

    it("keeps /api/admin on the deployment token; an agent key is not one", async () => {
      const { call, key } = await setup();
      const sites = await call("GET", "/api/admin/sites", {
        authorization: `Bearer ${DEPLOY_TOKEN}`,
      });
      expect(sites.status, JSON.stringify(sites.body)).toBe(200);
      expect(
        (await call("GET", "/api/admin/sites", { authorization: `Bearer ${key}` })).status,
      ).toBe(401);
      expect((await call("GET", "/api/admin/sites", { "x-api-key": key })).status).toBe(401);
      // The deployment token is not an agent key elsewhere either.
      expect(
        (await call("GET", "/api/me", { authorization: `Bearer ${DEPLOY_TOKEN}` })).status,
      ).toBe(401);
    });
  });
}
