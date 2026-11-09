/**
 * Shared suite for the review of RFC-0044 Phase 2 (PR #176): what a connection may never keep
 * after it ends, and what the provider must not do on its own. Runs next to
 * `testing-mcp-oauth-server.ts` on better-sqlite3 and Miniflare D1.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessTokenKeyCache } from "./auth/access-token.ts";
import {
  authorize,
  connect,
  consentRequest,
  type Json,
  mcpCall,
  mcpClient,
  ORIGIN,
  setupServer,
  token,
} from "./testing-oauth-harness.ts";
import type { RolesBackend } from "./testing-roles.ts";

const READ = "site:read content:read";
const DAY = 24 * 60 * 60_000;

export function describeMcpOauthHardening(label: string, backend: RolesBackend): void {
  describe(`MCP OAuth hardening: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });
    afterEach(() => {
      vi.useRealTimers();
      clearAccessTokenKeyCache();
    });

    const grantsOf = async (s: Awaited<ReturnType<typeof setupServer>>, cookie: string) =>
      (await s.call("GET", "/api/agent-grants", { cookie })).body as unknown as Json[];

    it("keeps a token issued before a revoke dead after the member connects the client again", async () => {
      const s = await setupServer(backend);
      const old = await connect(s, { cookie: s.owner.cookie, scope: READ });
      const [grant] = await grantsOf(s, s.owner.cookie);
      const revoked = await s.call("DELETE", `/api/agent-grants/${grant?.id}`, {
        cookie: s.owner.cookie,
        headers: { origin: s.origin },
      });
      expect(revoked.status).toBe(204);
      const fresh = await connect(s, { cookie: s.owner.cookie, scope: READ });
      const stale = await s.app.request(`${ORIGIN}/mcp`, mcpCall(old.access, "tools/list"));
      expect(stale.status).toBe(401);
      expect(stale.headers.get("www-authenticate")).toContain('error="invalid_token"');
      await (await mcpClient(s.app, fresh.access)).listTools();
    });

    it("ends a removed member's refresh tokens and stored consent, so a return shows the screen", async () => {
      const s = await setupServer(backend);
      const editor = await s.join("editor");
      const { refresh } = await connect(s, {
        cookie: editor.cookie,
        scope: `${READ} offline_access`,
      });
      const removed = await s.call("DELETE", `/api/members/${editor.userId}`, {
        cookie: s.owner.cookie,
        headers: { origin: s.origin },
      });
      expect(removed.status, JSON.stringify(removed.body)).toBe(200);
      const again = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(again.body.error).toBe("invalid_grant");
      // Invited back with the same account: the provider must not skip Studio's screen.
      const back = await s.join("editor", {}, editor.email);
      const start = await authorize(s, { cookie: back.cookie, scope: READ });
      expect(start.location?.pathname, start.location?.href).toBe("/oauth/consent");
    });

    it("shows the screen again when a promotion lets a step-up widen the connection", async () => {
      const s = await setupServer(backend);
      const member = await s.join("contributor");
      const scope = `${READ} content:write`;
      await connect(s, { cookie: member.cookie, scope });
      expect((await grantsOf(s, member.cookie))[0]?.scopes).toContain("content:draft:own");
      const promoted = await s.call("PATCH", `/api/members/${member.userId}`, {
        cookie: s.owner.cookie,
        body: { role: "editor" },
      });
      expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
      const start = await authorize(s, { cookie: member.cookie, scope });
      expect(start.location?.pathname, start.location?.href).toBe("/oauth/consent");
      await connect(s, { cookie: member.cookie, scope });
      expect((await grantsOf(s, member.cookie))[0]?.scopes).toContain("content:write");
    });

    it("rate-limits the consent forward per client address, not in one shared bucket", async () => {
      const s = await setupServer(backend, { clientAddressHeader: "x-test-client" });
      const start = await authorize(s, { cookie: s.owner.cookie, scope: READ });
      const approved = await s.call("POST", "/api/agent-grants/consent", {
        cookie: s.owner.cookie,
        headers: { "x-test-client": "203.0.113.9" },
        body: {
          request: consentRequest(start.location as URL),
          accept: true,
          scopes: READ.split(" "),
          mode: "edits",
        },
      });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      const keys = (
        await s.sql.all<{ key: string }>(`SELECT "key" FROM "rateLimit" WHERE "key" LIKE ?`, [
          "%/oauth2/consent",
        ])
      ).map((r) => r.key);
      expect(keys).toEqual(["203.0.113.9|/oauth2/consent"]);
    });

    it("neither advertises nor issues DPoP-bound tokens (no DPoP in v1)", async () => {
      const s = await setupServer(backend);
      const meta = (await (
        await s.app.request(`${ORIGIN}/.well-known/oauth-authorization-server/api/auth`)
      ).json()) as Json;
      expect(meta.dpop_signing_alg_values_supported).toBeUndefined();
      const start = await authorize(s, { cookie: s.owner.cookie, scope: READ });
      const approved = await s.call("POST", "/api/agent-grants/consent", {
        cookie: s.owner.cookie,
        body: {
          request: consentRequest(start.location as URL),
          accept: true,
          scopes: READ.split(" "),
          mode: "edits",
        },
      });
      const code = new URL(approved.body.redirect as string).searchParams.get("code") ?? "";
      const res = await s.app.request(`${ORIGIN}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          dpop: "eyJhbGciOiJFUzI1NiJ9.e30.sig",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: s.clientId,
          redirect_uri: "http://127.0.0.1:33418/callback",
          code_verifier: start.verifier,
          resource: `${ORIGIN}/mcp`,
        }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as Json).error).toBe("invalid_dpop_proof");
    });

    it("ends a refresh token family 90 days after the member authenticated, however often it rotated", async () => {
      const s = await setupServer(backend);
      let { refresh } = await connect(s, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      const start = Date.now();
      vi.useFakeTimers({ toFake: ["Date"] });
      for (const day of [29, 58, 87]) {
        vi.setSystemTime(start + day * DAY);
        const r = await token(s, { grant_type: "refresh_token", refresh_token: refresh as string });
        expect(r.status, `day ${day}: ${JSON.stringify(r.body)}`).toBe(200);
        refresh = r.body.refresh_token as string;
      }
      vi.setSystemTime(start + 92 * DAY);
      const late = await token(s, {
        grant_type: "refresh_token",
        refresh_token: refresh as string,
      });
      expect(late.status).toBe(400);
      expect(late.body.error).toBe("invalid_grant");
    });
  });
}
