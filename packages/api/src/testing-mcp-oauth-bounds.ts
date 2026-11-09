/**
 * Shared suite for the review of RFC-0044 Phase 3a (PR #178): the bounds around client
 * registration, on better-sqlite3 and Miniflare D1. Next to `testing-mcp-oauth-registration.ts`.
 *
 * 1. Document clients are capped and pruned like DCR's.
 * 2. Anonymous calls cannot spend the fetch budgets members' clients need: a stored, fresh client
 *    is never fetched; a stored one is never blocked by a budget (stale-if-exhausted); only new
 *    documents spend the per-origin budget. A second deployment over the same database stands in
 *    for a Worker, which rebuilds the plugin (and its cache) on every request.
 * 3. Cursor registers with its real body, a private-use scheme included; dangerous schemes never.
 * 4. The client host list applies at every authorization, to clients registered before it.
 * 5. With DCR off, clients it registered earlier start no new authorization; connections they
 *    already have keep working.
 * 6. The consent screen's identity: names made plain and short, the kind, look-alike names.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessTokenKeyCache } from "./auth/access-token.ts";
import { pruneCimdClients } from "./auth/oauth-client-rows.ts";
import type { OauthRegistration } from "./auth/oauth-registration.ts";
import {
  DOC,
  document,
  FETCH_FAILED,
  stubTransport,
  tryAuthorize,
  withCimd,
} from "./testing-mcp-oauth-registration.ts";
import {
  authorize,
  connect,
  consentRequest,
  deploy,
  ISSUER,
  type Json,
  mcpClient,
  REDIRECT,
  registerClient,
  type Server,
  setupServer,
  token,
} from "./testing-oauth-harness.ts";
import type { RolesBackend } from "./testing-roles.ts";

const READ = "site:read content:read";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Cursor 3.14.27's registration as observed (forum.cursor.com/t/167608). */
const CURSOR_BODY = {
  client_name: "Cursor",
  redirect_uris: [
    "cursor://anysphere.cursor-mcp/oauth/callback",
    "https://www.cursor.com/agents/mcp/oauth/callback",
    "http://localhost:8787/callback",
  ],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

/** The same database and owner, served by another deployment (a Worker's next request). */
async function redeploy(s: Server, options: { registration: OauthRegistration }): Promise<Server> {
  return { ...s, ...(await deploy(s.backend, options)) };
}

/** An anonymous `/authorize` for `clientId` from `address`; the response status and text. */
async function anonymousAuthorize(s: Server, clientId: string, address: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: READ,
    code_challenge: "x".repeat(43),
    code_challenge_method: "S256",
  });
  const res = await s.app.request(`${ISSUER}/oauth2/authorize?${params}`, {
    headers: { "cf-connecting-ip": address },
  });
  return { status: res.status, text: await res.text() };
}

/** Authorize went on: the consent screen, or (consent remembered, Decision 8) a code. */
const proceeds = (r: Awaited<ReturnType<typeof tryAuthorize>>) =>
  r.consentScreen || Boolean(r.location?.searchParams.get("code"));

const ageRow = (s: Server, clientId: string, ms: number) =>
  s.sql.run(`UPDATE "oauthClient" SET "updatedAt" = ? WHERE "clientId" = ?`, [
    new Date(Date.now() - ms).toISOString(),
    clientId,
  ]);

export function describeMcpOauthBounds(label: string, backend: RolesBackend): void {
  describe(`MCP OAuth registration bounds: ${label}`, { timeout: 180_000 }, () => {
    afterAll(async () => {
      await backend.dispose?.();
    });
    afterEach(() => {
      vi.useRealTimers();
      clearAccessTokenKeyCache();
    });

    it("caps stored document clients and prunes unused ones (the next authorize recreates them)", async () => {
      const other = "https://agents.example.com/other.json";
      const transport = stubTransport((url) => ({ body: document({ client_id: url.toString() }) }));
      const s = await setupServer(backend, withCimd(transport, { cimdLimits: { maxClients: 1 } }));
      const { access } = await connect(
        { ...s, clientId: DOC },
        { cookie: s.owner.cookie, scope: READ },
      );
      const full = await tryAuthorize(s, other);
      expect(full.status).toBe(503);
      expect(full.reason).toContain("stores no more clients");
      // A live connection keeps its client however idle; an unused one goes after a day.
      await registerClient(s); // a DCR client is not a document client: untouched here
      const stored = async () =>
        (
          await s.sql.all<{ clientId: string }>(
            `SELECT "clientId" FROM "oauthClient" WHERE "clientDiscoveryId" = 'cimd'`,
          )
        ).map((r) => r.clientId);
      expect(await pruneCimdClients(s.sql, { now: new Date(Date.now() + 2 * DAY) })).toBe(0);
      expect(await stored()).toEqual([DOC]);
      const grants = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      await s.call("DELETE", `/api/agent-grants/${grants.find((g) => g.clientId === DOC)?.id}`, {
        cookie: s.owner.cookie,
        headers: { origin: s.origin },
      });
      expect(await pruneCimdClients(s.sql, { now: new Date(Date.now() + 2 * DAY) })).toBe(1);
      expect(await stored()).toEqual([]);
      void access;
      // Room again: another document can connect.
      expect((await tryAuthorize(s, other)).consentScreen).toBe(true);
    });

    it("keeps stored clients connecting and refreshing while anonymous calls drain the budgets", async () => {
      const transport = stubTransport((url) =>
        url.toString() === DOC ? { body: document() } : { status: 404 },
      );
      const registration = withCimd(transport, {
        cimdLimits: { perAddressPerMinute: 4, perOriginPerMinute: 3, perMinute: 5 },
      });
      const s = await setupServer(backend, registration);
      const claude = { ...s, clientId: DOC };
      const first = await connect(claude, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      const fetches = () => transport.requests.filter((u) => u === DOC).length;
      expect(fetches()).toBe(1);
      // Anonymous callers from many addresses exhaust the per-origin and the total budget.
      const answers: number[] = [];
      for (let i = 0; i < 8; i++)
        answers.push(
          (await anonymousAuthorize(s, `https://f${i}.example.com/c.json`, `203.0.113.${i}`))
            .status,
        );
      expect(answers.at(-1)).toBe(429);
      // A new request on another deployment (a Worker rebuilds the plugin): the stored, fresh
      // client is used from its row, with no fetch, for authorize and for a refresh.
      const w = await redeploy(s, registration);
      expect(proceeds(await tryAuthorize(w, DOC))).toBe(true);
      const refreshed = await token(
        { ...w, clientId: DOC },
        { grant_type: "refresh_token", refresh_token: first.refresh ?? "" },
      );
      expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
      expect(fetches()).toBe(1);
      // Older than the freshness window: it is fetched again, and only the caller's budget counts.
      await ageRow(s, DOC, 2 * HOUR);
      expect(proceeds(await tryAuthorize(w, DOC))).toBe(true);
      expect(fetches()).toBe(2);
      // The caller's own budget spent too: the stored client is served from its row.
      await ageRow(s, DOC, 2 * HOUR);
      for (let i = 0; i < 4; i++)
        await anonymousAuthorize(w, `https://g${i}.example.com/c.json`, "unknown");
      const stale = await token(
        { ...w, clientId: DOC },
        { grant_type: "refresh_token", refresh_token: refreshed.body.refresh_token as string },
      );
      expect(stale.status, JSON.stringify(stale.body)).toBe(200);
      expect(fetches()).toBe(2);
      expect(proceeds(await tryAuthorize(w, DOC))).toBe(true);
      await (await mcpClient(w.app, stale.body.access_token as string)).listTools();
      // A new document from that caller is refused while its budget is spent.
      const blocked = await tryAuthorize(w, "https://agents.example.com/new.json");
      expect(blocked.status).toBe(429);
    });

    it("registers Cursor with its real body, and refuses dangerous or unknown schemes", async () => {
      const s = await setupServer(backend, {
        registration: { dcr: true, limits: { perAddressPerHour: 100 } },
      });
      const cursor = await s.call("POST", "/api/auth/oauth2/register", { body: CURSOR_BODY });
      expect(cursor.status, JSON.stringify(cursor.body)).toBe(201);
      expect(cursor.body.redirect_uris).toEqual(CURSOR_BODY.redirect_uris);
      const id = cursor.body.client_id as string;
      // Private-use redirects match exactly: no port or path relaxation.
      expect(
        (await tryAuthorize(s, id, CURSOR_BODY.redirect_uris[0] as string)).consentScreen,
      ).toBe(true);
      expect(
        (await tryAuthorize(s, id, "cursor://anysphere.cursor-mcp/oauth/other")).consentScreen,
      ).toBe(false);
      expect((await tryAuthorize(s, id, "http://localhost:9999/callback")).consentScreen).toBe(
        true,
      );
      const register = (uri: string) =>
        s.call("POST", "/api/auth/oauth2/register", {
          body: { ...CURSOR_BODY, redirect_uris: [uri] },
        });
      for (const uri of [
        "javascript://x/%0aalert(1)",
        "data:/text/html,x",
        "file:///etc/passwd",
        "vbscript://x/y",
        "about:/blank",
        "blob:/x",
        "httpx://evil.example/cb",
        "https-app://cb/x",
        "cursor:callback",
        "myapp://app/callback",
      ]) {
        const r = await register(uri);
        expect(r.status, uri).toBe(400);
        expect(r.body.error, uri).toBe("invalid_redirect_uri");
      }
      expect((await register("com.example.app:/oauth/callback")).status).toBe(201);
      expect(
        (await register("vscode://vscode.github-authentication/did-authenticate")).status,
      ).toBe(201);
      // An operator's own scheme, and the host list's narrower rule.
      const t = await setupServer(backend, {
        registration: { dcr: true, redirectSchemes: ["myapp"], clientHosts: ["localhost"] },
      });
      const to = (uri: string) =>
        t.call("POST", "/api/auth/oauth2/register", {
          body: { ...CURSOR_BODY, redirect_uris: [uri] },
        });
      expect((await to("myapp://app/callback")).status).toBe(201);
      expect((await to("cursor://anysphere.cursor-mcp/oauth/callback")).status).toBe(201);
      expect((await to("com.example.app:/oauth/callback")).status).toBe(400);
    });

    it("applies the client host list at every authorization, to clients registered before it", async () => {
      const s = await setupServer(backend);
      const evil = "https://cursor-login.evil.example/cb";
      const client = await registerClient(s, { client_name: "Cursor", redirect_uris: [evil] });
      expect((await tryAuthorize(s, client, evil)).consentScreen).toBe(true);
      const listed = await redeploy(s, {
        registration: { dcr: true, clientHosts: ["cursor.com", "localhost"] },
      });
      const r = await tryAuthorize(listed, client, evil);
      expect(r.consentScreen).toBe(false);
      expect(r.reason).toBe("invalid redirect uri");
      // A loopback redirect still passes with `localhost` listed.
      expect((await tryAuthorize(listed, s.clientId)).consentScreen).toBe(true);
    });

    it("refuses new authorizations of DCR clients once DCR is off; their connections keep working", async () => {
      const s = await setupServer(backend);
      const { access, refresh } = await connect(s, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      const off = await redeploy(s, { registration: { dcr: false } });
      const r = await tryAuthorize(off, s.clientId);
      expect(r.consentScreen).toBe(false);
      expect(r.reason).toContain("dynamic client registration is off");
      await (await mcpClient(off.app, access)).listTools();
      const renewed = await token(off, {
        grant_type: "refresh_token",
        refresh_token: refresh ?? "",
      });
      expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
    });

    it("shows a client's name plain and short, its kind, and flags look-alike self-registrations", async () => {
      const name = `Claude‮ edoC​ ${" ".repeat(400)}from claude.ai · sends you back to claude.ai ${"x".repeat(300)}`;
      const transport = stubTransport(() => ({ body: document({ client_name: name }) }));
      const s = await setupServer(backend, withCimd(transport));
      const info = async (clientId: string, redirectUri = REDIRECT) => {
        const start = await authorize(s, {
          cookie: s.owner.cookie,
          scope: READ,
          clientId,
          redirectUri,
        });
        const request = consentRequest(start.location as URL);
        return (
          await s.call("GET", `/api/agent-grants/consent?request=${encodeURIComponent(request)}`, {
            cookie: s.owner.cookie,
          })
        ).body.client as Json;
      };
      const doc = await info(DOC);
      expect(doc).toMatchObject({ kind: "document", host: "agents.example.com" });
      expect([...(doc.name as string)].length).toBeLessThanOrEqual(100);
      expect(doc.name).not.toMatch(/[‮​ ]/);
      expect(doc.name).toMatch(/^Claude edoC from claude\.ai/);
      expect(doc.lookalike).toBeUndefined();
      const fake = await registerClient(s, { client_name: "Claude · Identified by claude.ai" });
      expect(await info(fake)).toMatchObject({ kind: "self-registered", lookalike: "Claude" });
      expect((await info(s.clientId)).lookalike).toBeUndefined(); // "Test Agent"
      // The connection keeps the shown name.
      await connect({ ...s, clientId: DOC }, { cookie: s.owner.cookie, scope: READ });
      const grants = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      expect(grants.find((g) => g.clientId === DOC)?.clientName).toBe(doc.name);
      void FETCH_FAILED;
    });
  });
}
