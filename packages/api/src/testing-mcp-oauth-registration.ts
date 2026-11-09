/**
 * Shared suite for RFC-0044 Phase 3a (§3, §6, §8): how clients get a `client_id`, on
 * better-sqlite3 and Miniflare D1.
 *
 * - CIMD with a stubbed transport (`cimdFetch` over `safeFetch`, the media import's SSRF rules): a
 *   good document connects all the way to `/mcp`; a wrong `client_id`, a private address, an
 *   oversized document, a redirect, a timeout and a host off the allow-list are refused; the
 *   metadata advertises `client_id_metadata_document_supported`.
 * - DCR: the full flow to `/mcp`; the metadata rules (public only, redirect URIs, size); the rate
 *   limits per address and per day; the cap; pruning; the off switch; the allow-list.
 * - Loopback redirects match without the port (RFC 8252 §7.3), nothing else does.
 * - With CIMD and DCR off, an unknown client is refused.
 */
import type { FetchTransport } from "@cloudhal/core-ts/media";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessTokenKeyCache } from "./auth/access-token.ts";
import { cimdFetch } from "./auth/cimd-fetch.ts";
import { pruneDcrClients } from "./auth/oauth-client-rows.ts";
import type { OauthRegistration } from "./auth/oauth-registration.ts";
import { redirectProblem } from "./auth/redirect-policy.ts";
import { oauthClientsPruneJob } from "./oauth-prune-job.ts";
import {
  authorize,
  connect,
  ISSUER,
  type Json,
  mcpClient,
  REDIRECT,
  registerClient,
  type Server,
  setupServer,
} from "./testing-oauth-harness.ts";
import type { RolesBackend } from "./testing-roles.ts";

const READ = "site:read content:read";
const DAY = 86_400_000;
/** A client metadata document URL (RFC-0044 §3: HTTPS with a path). */
export const DOC = "https://agents.example.com/oauth/client.json";
/** A public address the stub resolver answers (TEST-NET-3 is not public: use a real range). */
const PUBLIC = "93.184.215.14";

interface Served {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  /** Never answers (the timeout case). */
  readonly hang?: boolean;
}

/** A transport that serves documents from the test and records every request. */
export function stubTransport(
  serve: (url: URL) => Served,
  addresses: readonly string[] = [PUBLIC],
): FetchTransport & { readonly requests: string[] } {
  const requests: string[] = [];
  return {
    name: "stub",
    pins: true,
    requests,
    resolve: async () => [...addresses],
    request: (url, init) => {
      requests.push(url.toString());
      const answer = serve(url);
      if (answer.hang)
        return new Promise((_, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
        );
      return Promise.resolve({
        status: answer.status ?? 200,
        headers: new Headers({ "content-type": "application/json", ...answer.headers }),
        body: new Response(answer.body ?? "").body,
      });
    },
  };
}

export function document(overrides: Json = {}): string {
  return JSON.stringify({
    client_id: DOC,
    client_name: "Claude Code",
    redirect_uris: ["http://127.0.0.1/callback", "http://localhost/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...overrides,
  });
}

/** CIMD (and DCR, unless turned off) over `transport`, with a short timeout. */
export function withCimd(transport: FetchTransport, extra: Partial<OauthRegistration> = {}) {
  return {
    registration: {
      cimd: cimdFetch({ transport, blockedHosts: ["localhost"], timeoutMs: 200 }),
      dcr: true,
      ...extra,
    } satisfies OauthRegistration,
  };
}

/** `authorize` as the member's browser for another client: the consent screen, or the refusal. */
export async function tryAuthorize(s: Server, clientId: string, redirectUri = REDIRECT) {
  const r = await authorize(s, { cookie: s.owner.cookie, scope: READ, clientId, redirectUri });
  const consentScreen = r.location?.pathname === "/oauth/consent";
  const text = consentScreen ? "" : await r.res.text();
  // A refusal is a JSON error, or the authorization server's error page (never the redirect URI).
  const reason = r.location?.searchParams.get("error_description") ?? text;
  return { ...r, consentScreen, status: r.res.status, text, reason };
}

export const FETCH_FAILED = /Failed to fetch metadata document/;

export function describeMcpOauthRegistration(label: string, backend: RolesBackend): void {
  describe(`MCP OAuth client registration: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });
    afterEach(() => {
      vi.useRealTimers();
      clearAccessTokenKeyCache();
    });

    describe("Client ID Metadata Documents", () => {
      it("connects a CIMD client all the way to /mcp, and advertises CIMD", async () => {
        const transport = stubTransport(() => ({
          body: document(),
          headers: { "cache-control": "max-age=600" },
        }));
        const s = await setupServer(backend, withCimd(transport));
        const meta = (await s.call("GET", "/.well-known/oauth-authorization-server/api/auth")).body;
        expect(meta.client_id_metadata_document_supported).toBe(true);
        expect(meta.token_endpoint_auth_methods_supported).toContain("none");
        const client = { ...s, clientId: DOC };
        // RFC 8252 §7.3: the document registers no port; the client picks one at run time.
        const { access } = await connect(client, { cookie: s.owner.cookie, scope: READ });
        await (await mcpClient(s.app, access)).listTools();
        expect(transport.requests[0]).toBe(DOC);
        // The connection is the member's, named as the document names the client.
        const grants = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
          .body as unknown as Json[];
        expect(grants.find((g) => g.clientId === DOC)).toMatchObject({ clientName: "Claude Code" });
      });

      it("refuses a document whose client_id is not its URL", async () => {
        const transport = stubTransport(() => ({
          body: document({ client_id: "https://agents.example.com/other.json" }),
        }));
        const s = await setupServer(backend, withCimd(transport));
        const r = await tryAuthorize(s, DOC);
        expect(r.consentScreen).toBe(false);
        expect(r.reason).toContain("does not match the metadata document URL");
      });

      it("never fetches from a private or loopback address, or an IP literal", async () => {
        const privateDns = stubTransport(() => ({ body: document() }), [PUBLIC, "10.0.0.7"]);
        const s = await setupServer(backend, withCimd(privateDns));
        expect((await tryAuthorize(s, DOC)).reason).toMatch(FETCH_FAILED);
        expect(privateDns.requests).toEqual([]);
        const loopback = stubTransport(() => ({ body: document() }), ["127.0.0.1"]);
        const t = await setupServer(backend, withCimd(loopback));
        expect((await tryAuthorize(t, DOC)).consentScreen).toBe(false);
        expect(loopback.requests).toEqual([]);
        const literal = "https://93.184.215.14/client.json";
        const any = stubTransport(() => ({ body: document({ client_id: literal }) }));
        const u = await setupServer(backend, withCimd(any));
        expect((await tryAuthorize(u, literal)).consentScreen).toBe(false);
        expect(any.requests).toEqual([]);
      });

      it("never fetches from the deployment's own hosts or its sites' domains", async () => {
        const transport = stubTransport(() => ({ body: document() }));
        const s = await setupServer(backend, {
          registration: {
            cimd: cimdFetch({ transport, blockedHosts: async () => ["agents.example.com"] }),
            dcr: true,
          },
        });
        expect((await tryAuthorize(s, DOC)).reason).toMatch(FETCH_FAILED);
        expect(transport.requests).toEqual([]);
      });

      it("refuses an oversized document, a redirect and a server that does not answer", async () => {
        const big = stubTransport(() => ({
          body: document({ client_name: "x".repeat(6 * 1024) }),
        }));
        const s = await setupServer(backend, withCimd(big));
        expect((await tryAuthorize(s, DOC)).reason).toMatch(FETCH_FAILED);
        const moved = stubTransport(() => ({
          status: 302,
          headers: { location: "https://agents.example.com/elsewhere.json" },
        }));
        const t = await setupServer(backend, withCimd(moved));
        expect((await tryAuthorize(t, DOC)).reason).toMatch(FETCH_FAILED);
        expect(moved.requests).toEqual([DOC]);
        const slow = stubTransport(() => ({ hang: true }));
        const u = await setupServer(backend, withCimd(slow));
        const started = Date.now();
        expect((await tryAuthorize(u, DOC)).reason).toMatch(FETCH_FAILED);
        expect(Date.now() - started).toBeLessThan(5_000);
      });

      it("fetches only from allowed hosts when CLOUDHAL_MCP_CLIENT_HOSTS is set", async () => {
        const transport = stubTransport(() => ({ body: document() }));
        const s = await setupServer(
          backend,
          withCimd(transport, { clientHosts: ["claude.ai", "localhost"] }),
        );
        expect((await tryAuthorize(s, DOC)).consentScreen).toBe(false);
        expect(transport.requests).toEqual([]);
        const t = await setupServer(
          backend,
          withCimd(transport, { clientHosts: ["*.example.com", "localhost"] }),
        );
        expect((await tryAuthorize(t, DOC)).consentScreen).toBe(true);
      });

      it("never uses a document's redirect URI that the redirect rules refuse", async () => {
        const transport = stubTransport(() => ({
          body: document({
            redirect_uris: ["http://127.0.0.1/callback", "myapp://app/callback"],
          }),
        }));
        const s = await setupServer(backend, withCimd(transport));
        expect((await tryAuthorize(s, DOC)).consentScreen).toBe(true);
        expect((await tryAuthorize(s, DOC, "myapp://app/callback")).consentScreen).toBe(false);
      });
    });

    describe("dynamic client registration", () => {
      const register = (s: Server, body: Json, headers: Record<string, string> = {}) =>
        s.call("POST", "/api/auth/oauth2/register", {
          body: {
            client_name: "Cursor",
            redirect_uris: ["http://localhost:8787/callback"],
            ...body,
          },
          headers,
        });

      it("registers a public client that connects to /mcp; the metadata names the endpoint", async () => {
        const s = await setupServer(backend);
        const meta = (await s.call("GET", "/.well-known/oauth-authorization-server")).body;
        expect(meta.registration_endpoint).toBe(`${ISSUER}/oauth2/register`);
        const res = await register(s, { redirect_uris: [REDIRECT] });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.res.headers.get("cache-control")).toBe("no-store");
        // Absent, the method is `none`: no secret is ever minted.
        expect(res.body.token_endpoint_auth_method).toBe("none");
        expect(res.body.client_secret).toBeUndefined();
        const client = { ...s, clientId: res.body.client_id as string };
        const { access } = await connect(client, { cookie: s.owner.cookie, scope: READ });
        await (await mcpClient(s.app, access)).listTools();
      });

      it("takes public clients with https, loopback or known app redirect URIs only", async () => {
        const s = await setupServer(backend, {
          registration: { dcr: true, limits: { perAddressPerHour: 100 } },
        });
        const refused: [Json, string][] = [
          [{ token_endpoint_auth_method: "client_secret_basic" }, "invalid_client_metadata"],
          [{ redirect_uris: ["http://cursor.example.com/callback"] }, "invalid_redirect_uri"],
          [{ redirect_uris: ["myapp://app/callback"] }, "invalid_redirect_uri"],
          [{ redirect_uris: [REDIRECT, "javascript://x/%0aalert(1)"] }, "invalid_redirect_uri"],
          [{ redirect_uris: ["https://localhost/callback"] }, "invalid_redirect_uri"],
          [{ redirect_uris: ["https://app.example.com/cb#x"] }, "invalid_redirect_uri"],
          [{ redirect_uris: [] }, "invalid_redirect_uri"],
          [
            { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example.com/${i}`) },
            "invalid_redirect_uri",
          ],
          [{ client_name: "" }, "invalid_client_metadata"],
          [{ client_name: "x".repeat(101) }, "invalid_client_metadata"],
          [{ grant_types: ["client_credentials"] }, "invalid_client_metadata"],
          [{ response_types: ["token"] }, "invalid_client_metadata"],
          [{ scope: "*" }, "invalid_scope"],
        ];
        for (const [body, error] of refused) {
          const r = await register(s, body);
          expect(r.status, JSON.stringify(body)).toBe(400);
          expect(r.body.error, JSON.stringify(body)).toBe(error);
        }
        const big = await register(s, { software_statement: "x".repeat(6 * 1024) });
        expect(big.status).toBe(413);
        // Self-asserted URIs and keys are dropped, never stored or shown (RFC 7591 §5).
        const ok = await register(s, {
          logo_uri: "https://evil.example.com/logo.png",
          jwks_uri: "https://evil.example.com/jwks",
          grant_types: ["authorization_code", "refresh_token", "client_credentials"],
        });
        expect(ok.status, JSON.stringify(ok.body)).toBe(201);
        expect(ok.body.logo_uri).toBeUndefined();
        expect(ok.body.jwks_uri).toBeUndefined();
        expect(ok.body.grant_types).toEqual(["authorization_code", "refresh_token"]);
      });

      it("never reaches the provider's own endpoint over HTTP, even past createApi", async () => {
        const s = await setupServer(backend);
        const direct = await s.auth.handler(
          new Request(`${ISSUER}/oauth2/register`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ client_name: "x", redirect_uris: [REDIRECT] }),
          }),
        );
        expect(direct.status).toBe(404);
      });

      it("limits registrations per address per hour and per installation per day", async () => {
        const s = await setupServer(backend, {
          registration: { dcr: true, limits: { perAddressPerHour: 2, perDay: 4 } },
        });
        const from = (ip: string) => ({ "cf-connecting-ip": ip });
        expect((await register(s, {}, from("203.0.113.1"))).status).toBe(201);
        // Invalid attempts count too.
        expect((await register(s, { client_name: "" }, from("203.0.113.1"))).status).toBe(400);
        const third = await register(s, {}, from("203.0.113.1"));
        expect(third.status).toBe(429);
        expect(third.body.error).toBe("rate_limited");
        expect((await register(s, {}, from("203.0.113.2"))).status).toBe(201);
        // setupServer's own registration was the first of the day: this is the fifth.
        expect((await register(s, {}, from("203.0.113.3"))).status).toBe(429);
      });

      it("refuses registrations beyond the cap with 503", async () => {
        const s = await setupServer(backend, {
          registration: { dcr: true, limits: { maxClients: 2 } },
        });
        expect((await register(s, {})).status).toBe(201);
        const full = await register(s, {});
        expect(full.status).toBe(503);
        expect(full.body.error).toBe("temporarily_unavailable");
      });

      it("prunes clients nobody used for 30 days, never one with a live connection", async () => {
        const s = await setupServer(backend);
        // s.clientId: connected and live. `idle`: never connected. `ended`: connected, revoked.
        await connect(s, { cookie: s.owner.cookie, scope: READ });
        const idle = await registerClient(s);
        const ended = { ...s, clientId: await registerClient(s) };
        await connect(ended, { cookie: s.owner.cookie, scope: `${READ} offline_access` });
        const grants = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
          .body as unknown as Json[];
        const endedGrant = grants.find((g) => g.clientId === ended.clientId);
        await s.call("DELETE", `/api/agent-grants/${endedGrant?.id}`, {
          cookie: s.owner.cookie,
          headers: { origin: s.origin },
        });
        const clients = async () =>
          (await s.sql.all<{ clientId: string }>(`SELECT "clientId" FROM "oauthClient"`)).map(
            (r) => r.clientId,
          );
        // Within 30 days nothing goes.
        expect(await pruneDcrClients(s.sql, { now: new Date(Date.now() + 29 * DAY) })).toBe(0);
        // The scheduler's hourly job does it (Workers and Node), and says so.
        const lines: string[] = [];
        // DCR clients go in even UTC hours (document clients in odd ones).
        const later = new Date(Date.now() + 31 * DAY);
        later.setUTCHours(later.getUTCHours() + (later.getUTCHours() % 2));
        await oauthClientsPruneJob(s.sql, (l) => lines.push(l)).run({
          now: later,
          trigger: "cron",
        });
        expect(lines).toEqual(["oauth clients: 2 unused registration(s) deleted"]);
        expect(await clients()).toEqual([s.clientId]);
        const leftovers = await s.sql.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM "oauthRefreshToken" WHERE "clientId" = ?`,
          [ended.clientId],
        );
        expect(Number(leftovers?.n)).toBe(0);
        // A pruned client is unknown: it registers again.
        expect((await tryAuthorize(s, idle)).consentScreen).toBe(false);
      });

      it("is off with CLOUDHAL_MCP_DCR=off; with CIMD off too, unknown clients are refused", async () => {
        const s = await setupServer(backend, { registration: { dcr: false } });
        const meta = (await s.call("GET", "/.well-known/oauth-authorization-server")).body;
        expect(meta.registration_endpoint).toBeUndefined();
        expect(meta.client_id_metadata_document_supported).toBeUndefined();
        expect((await register(s, {})).status).toBe(404);
        expect((await tryAuthorize(s, "made-up-client")).consentScreen).toBe(false);
        expect((await tryAuthorize(s, DOC)).consentScreen).toBe(false);
      });

      it("takes only redirect hosts on CLOUDHAL_MCP_CLIENT_HOSTS when it is set", async () => {
        // `localhost` on the list admits loopback redirects (setupServer registers one).
        const t = await setupServer(backend, {
          registration: { dcr: true, clientHosts: ["cursor.com", "localhost"] },
        });
        const to = (uri: string) => register(t, { redirect_uris: [uri] });
        expect((await to("https://www.cursor.com/agents/mcp/oauth/callback")).status).toBe(400);
        expect((await to("https://claude.ai/api/mcp/auth_callback")).status).toBe(400);
        expect((await to("https://cursor.com/agents/mcp/oauth/callback")).status).toBe(201);
        expect((await to(REDIRECT)).status).toBe(201);
      });
    });

    describe("loopback redirect matching (RFC 8252 §7.3)", () => {
      it("matches loopback redirects on any port, and nothing else loosely", async () => {
        const s = await setupServer(backend);
        const client = await registerClient(s, { redirect_uris: ["http://127.0.0.1/callback"] });
        for (const port of ["33418", "8080", ""]) {
          const uri = `http://127.0.0.1${port ? `:${port}` : ""}/callback`;
          expect((await tryAuthorize(s, client, uri)).consentScreen, uri).toBe(true);
        }
        for (const uri of [
          "http://localhost:33418/callback",
          "http://127.0.0.1:33418/callback/other",
          "http://127.0.0.1:33418/Callback",
          "http://127.0.0.1:33418/callback?x=1",
          "https://127.0.0.1:33418/callback",
        ])
          expect((await tryAuthorize(s, client, uri)).consentScreen, uri).toBe(false);
        const web = await registerClient(s, { redirect_uris: ["https://app.example.com/cb"] });
        expect((await tryAuthorize(s, web, "https://app.example.com/cb")).consentScreen).toBe(true);
        expect((await tryAuthorize(s, web, "https://app.example.com:8443/cb")).consentScreen).toBe(
          false,
        );
      });

      it("checks redirect URIs with linear rules", () => {
        expect(redirectProblem("http://localhost:1/cb")).toBeUndefined();
        expect(redirectProblem("http://[::1]:1/cb")).toBeUndefined();
        expect(redirectProblem("https://claude.ai/api/mcp/auth_callback")).toBeUndefined();
        expect(redirectProblem("http://127.1/cb")).toBeDefined();
        expect(redirectProblem("http://localhost.evil.com/cb")).toBeDefined();
        expect(redirectProblem("http://user@localhost/cb")).toBeDefined();
        expect(redirectProblem(`https://a.com/${"a".repeat(100_000)}`)).toBeDefined();
        expect(redirectProblem("http://".padEnd(100_000, "["))).toBeDefined();
        expect(
          redirectProblem("https://x.cursor.com/cb", { clientHosts: ["*.cursor.com"] }),
        ).toBeUndefined();
        expect(
          redirectProblem("https://cursor.com/cb", { clientHosts: ["*.cursor.com"] }),
        ).toBeDefined();
        expect(
          redirectProblem("http://localhost:9/cb", { clientHosts: ["claude.ai"] }),
        ).toBeDefined();
        expect(
          redirectProblem("http://localhost:9/cb", { clientHosts: ["localhost"] }),
        ).toBeUndefined();
      });
    });

    it("never takes a client-sent X-Forwarded-For as the address (#165)", async () => {
      const s = await setupServer(backend, {
        registration: { dcr: true, limits: { perAddressPerHour: 1 } },
      });
      // setupServer's registration used the shared bucket of requests without a trusted address.
      const r = await s.call("POST", "/api/auth/oauth2/register", {
        body: { client_name: "x", redirect_uris: [REDIRECT] },
        headers: { "x-forwarded-for": "198.51.100.9" },
      });
      expect(r.status).toBe(429);
    });
  });
}
