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

import type { ClientDiscovery } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccessTokenKeyCache } from "./auth/access-token.ts";
import { type CimdGuard, guardedResolve } from "./auth/cimd-discovery.ts";
import { pruneCimdClients } from "./auth/oauth-client-rows.ts";
import { CIMD_LIMITS, type OauthRegistration } from "./auth/oauth-registration.ts";
import { oauthClientsPruneJob } from "./oauth-prune-job.ts";
import {
  DOC,
  document,
  FETCH_FAILED,
  type Served,
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
  RESOURCE,
  registerClient,
  type Server,
  setupServer,
  token,
} from "./testing-oauth-harness.ts";
import type { RolesBackend } from "./testing-roles.ts";

const READ = "site:read content:read";
/** Claude Code's metadata document (RFC-0044 §3). */
const CLAUDE_CODE = "https://claude.ai/oauth/claude-code-client-metadata";
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
      // The caller's own budget spent too: that caller is told to wait (429), never served an
      // outdated row it could make the server use by spending its own budget.
      await ageRow(s, DOC, 2 * HOUR);
      for (let i = 0; i < 4; i++)
        await anonymousAuthorize(w, `https://g${i}.example.com/c.json`, "unknown");
      const waiting = await token(
        { ...w, clientId: DOC },
        { grant_type: "refresh_token", refresh_token: refreshed.body.refresh_token as string },
      );
      expect(waiting.status).toBe(429);
      expect(fetches()).toBe(2);
      // A new document from that caller is refused too.
      const blocked = await tryAuthorize(w, "https://agents.example.com/new.json");
      expect(blocked.status).toBe(429);
    });

    it("keeps a stored client refreshing on the same process after junk URLs on its origin", async () => {
      // Node keeps one auth instance for the life of the process: no redeploy here.
      const transport = stubTransport((url) =>
        url.toString() === CLAUDE_CODE
          ? { body: document({ client_id: CLAUDE_CODE }) }
          : { status: 404 },
      );
      const s = await setupServer(backend, withCimd(transport));
      const claude = { ...s, clientId: CLAUDE_CODE };
      const first = await connect(claude, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      // Two hours later (every cache the old code kept has expired), about 30 a minute of new
      // URLs on claude.ai, from enough addresses to pass each one's budget.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 2 * HOUR);
      for (let i = 0; i < 30; i++)
        await anonymousAuthorize(s, `https://claude.ai/x${i}`, `198.51.100.${i % 10}`);
      const renewed = await token(claude, {
        grant_type: "refresh_token",
        refresh_token: first.refresh ?? "",
      });
      expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
      expect(transport.requests.filter((u) => u === CLAUDE_CODE).length).toBe(2);
      expect(proceeds(await tryAuthorize(s, CLAUDE_CODE))).toBe(true);
    });

    it("follows a changed document after the freshness window and drops a removed one", async () => {
      let served: Served = { body: document() };
      const transport = stubTransport(() => served);
      const s = await setupServer(backend, withCimd(transport));
      const claude = { ...s, clientId: DOC };
      const first = await connect(claude, {
        cookie: s.owner.cookie,
        scope: `${READ} offline_access`,
      });
      // The document moves its callback: once the stored row is older than an hour, only the new
      // one is accepted.
      const moved = "http://127.0.0.1/moved";
      served = { body: document({ redirect_uris: [moved] }) };
      await ageRow(s, DOC, 2 * HOUR);
      expect((await tryAuthorize(s, DOC, REDIRECT)).reason).toBe("invalid redirect uri");
      expect(proceeds(await tryAuthorize(s, DOC, "http://127.0.0.1:5000/moved"))).toBe(true);
      // The document disappears: after the window the client is refused, at refresh too, and
      // stays refused (the failure is recorded on the row), whatever budget the caller spends.
      served = { status: 404 };
      await ageRow(s, DOC, 2 * HOUR);
      const gone = await token(claude, {
        grant_type: "refresh_token",
        refresh_token: first.refresh ?? "",
      });
      expect(gone.status).not.toBe(200);
      const row = await s.sql.get<{ updatedAt: string }>(
        `SELECT "updatedAt" FROM "oauthClient" WHERE "clientId" = ?`,
        [DOC],
      );
      expect(Date.parse(row?.updatedAt ?? "")).toBe(0);
      for (let i = 0; i < 25; i++)
        await anonymousAuthorize(s, `https://h${i}.example.com/c.json`, "unknown");
      const again = await token(claude, {
        grant_type: "refresh_token",
        refresh_token: first.refresh ?? "",
      });
      expect(again.status).not.toBe(200);
      expect((await tryAuthorize(s, DOC, "http://127.0.0.1:5000/moved")).consentScreen).toBe(false);
    });

    it("serves a stored row the plugin declines to refetch only within 24 hours, never after a failure", async () => {
      const failed: string[] = [];
      const guard: CimdGuard = {
        limits: CIMD_LIMITS,
        count: async () => 0,
        evict: async () => 0,
        markFailed: async (id) => {
          failed.push(id);
        },
        hit: async () => true,
        address: () => "203.0.113.9",
        now: () => new Date(),
      };
      const declined = new APIError("TOO_MANY_REQUESTS", { error: "temporarily_unavailable" });
      const inner = (error: unknown) =>
        ({
          id: "cimd",
          matches: () => true,
          resolve: async () => {
            throw error;
          },
        }) as unknown as ClientDiscovery;
      const stored = (hours: number) =>
        ({ clientId: DOC, updatedAt: new Date(Date.now() - hours * HOUR) }) as never;
      const ctx = { headers: new Headers() } as never;
      const run = (error: unknown, hours: number) =>
        guardedResolve(inner(error), guard, { ctx, clientId: DOC, existing: stored(hours) });
      expect(await run(declined, 2)).toMatchObject({ clientId: DOC });
      await expect(run(declined, 25)).rejects.toBe(declined);
      const fetchFailed = new APIError("BAD_REQUEST", { error: "invalid_client" });
      await expect(run(fetchFailed, 2)).rejects.toBe(fetchFailed);
      expect(failed).toEqual([DOC]);
    });

    it("evicts by the client's real host: a path that names a well-known host is still junk", async () => {
      const transport = stubTransport((url) => ({ body: document({ client_id: url.toString() }) }));
      const s = await setupServer(backend, withCimd(transport, { cimdLimits: { maxClients: 3 } }));
      // `%` in SQL LIKE spans `/`: these would pass for claude.ai with a pattern over the URL.
      for (let i = 0; i < 3; i++)
        await anonymousAuthorize(
          s,
          `https://junk${i}.example.com/x.claude.ai/c.json`,
          `192.0.2.${i}`,
        );
      await s.sql.run(
        `UPDATE "oauthClient" SET "updatedAt" = ? WHERE "clientId" LIKE 'https://junk%'`,
        [new Date(Date.now() - HOUR).toISOString()],
      );
      // A third-party client (not well-known) still gets its first connection: one junk row goes.
      expect(
        (await tryAuthorize(s, "https://agents.example.com/inspector.json")).consentScreen,
      ).toBe(true);
      const left = await s.sql.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "oauthClient" WHERE "clientId" LIKE 'https://junk%'`,
      );
      expect(Number(left?.n)).toBe(2);
    });

    it("never evicts a client with a live connection or a well-known host's, however old", async () => {
      const transport = stubTransport((url) => ({ body: document({ client_id: url.toString() }) }));
      const s = await setupServer(backend, withCimd(transport, { cimdLimits: { maxClients: 2 } }));
      await connect({ ...s, clientId: DOC }, { cookie: s.owner.cookie, scope: READ }); // live grant
      await anonymousAuthorize(s, CLAUDE_CODE, "192.0.2.50"); // stored, no grant, exempt host
      await s.sql.run(
        `UPDATE "oauthClient" SET "updatedAt" = ? WHERE "clientDiscoveryId" = 'cimd'`,
        [new Date(Date.now() - DAY).toISOString()],
      );
      const refused = await anonymousAuthorize(s, "https://junk.example.com/c.json", "192.0.2.51");
      expect(refused.status).toBe(503);
      const kept = await s.sql.all<{ clientId: string }>(
        `SELECT "clientId" FROM "oauthClient" WHERE "clientDiscoveryId" = 'cimd' ORDER BY "clientId"`,
      );
      expect(kept.map((r) => r.clientId)).toEqual([DOC, CLAUDE_CODE].sort());
    });

    it("prunes more than one batch of unused document clients in a run, with the operator's hours", async () => {
      const s = await setupServer(backend);
      const old = new Date(Date.now() - 2 * HOUR).toISOString();
      for (let i = 0; i < 120; i++)
        await s.sql.run(
          `INSERT INTO "oauthClient" ("id", "clientId", "clientDiscoveryId", "redirectUris", "createdAt", "updatedAt") VALUES (?, ?, 'cimd', '[]', ?, ?)`,
          [`junk${i}`, `https://junk${i}.example.com/c.json`, old, old],
        );
      const count = async () =>
        Number(
          (
            await s.sql.get<{ n: number }>(
              `SELECT COUNT(*) AS n FROM "oauthClient" WHERE "clientDiscoveryId" = 'cimd'`,
            )
          )?.n,
        );
      const lines: string[] = [];
      const run = (limits: { cimdUnusedHours?: number }) =>
        oauthClientsPruneJob(s.sql, (l) => lines.push(l), limits).run({
          now: new Date(),
          trigger: "cron",
        });
      await run({}); // two hours old: under the default three
      expect(await count()).toBe(120);
      await run({ cimdUnusedHours: 1 });
      expect(await count()).toBe(0);
      expect(lines).toEqual([
        "oauth clients: 0 unused registration(s), 120 unused document client(s) deleted",
      ]);
    });

    it("makes room for a well-known client's first connection when the cap is full of junk", async () => {
      const transport = stubTransport((url) => ({ body: document({ client_id: url.toString() }) }));
      const s = await setupServer(backend, withCimd(transport, { cimdLimits: { maxClients: 3 } }));
      for (let i = 0; i < 3; i++)
        await anonymousAuthorize(s, `https://junk${i}.example.com/c.json`, `192.0.2.${i}`);
      // Full, and every junk row was fetched just now: a fourth unknown document waits.
      const fourth = await anonymousAuthorize(s, "https://junk3.example.com/c.json", "192.0.2.3");
      expect(fourth.status).toBe(503);
      // Claude Code's first connection here is exempt from the cap.
      const first = await connect(
        { ...s, clientId: CLAUDE_CODE },
        { cookie: s.owner.cookie, scope: READ },
      );
      expect(first.access).toBeTruthy();
      // Junk older than the eviction window makes way for a new document, one at a time.
      await s.sql.run(
        `UPDATE "oauthClient" SET "updatedAt" = ? WHERE "clientId" LIKE 'https://junk%'`,
        [new Date(Date.now() - HOUR).toISOString()],
      );
      expect((await tryAuthorize(s, "https://agents.example.com/new.json")).consentScreen).toBe(
        true,
      );
      const left = await s.sql.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "oauthClient" WHERE "clientId" LIKE 'https://junk%'`,
      );
      expect(Number(left?.n)).toBe(2);
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
      // A web client never gets a private-use redirect, whatever the provider would infer.
      for (const uri of ["cursor://anysphere.cursor-mcp/oauth/callback", "com.example.app:/cb"]) {
        const web = await s.call("POST", "/api/auth/oauth2/register", {
          body: { ...CURSOR_BODY, application_type: "web", redirect_uris: [uri] },
        });
        expect(web.status, uri).toBe(400);
        expect(web.body.error, uri).toBe("invalid_redirect_uri");
      }
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

    it("shows a client's name plain and short, its kind, and flags look-alikes of document clients", async () => {
      const name = `Claude\u202e edoC\u200b ${"\u2003".repeat(400)}from claude.ai · sends you back to claude.ai ${"x".repeat(300)}`;
      const transport = stubTransport((url) => ({
        body: document({
          client_id: url.toString(),
          client_name: url.toString() === CLAUDE_CODE ? "Claude Code" : name,
        }),
      }));
      const s = await setupServer(backend, {
        registration: {
          ...withCimd(transport).registration,
          limits: { perAddressPerHour: 100 },
        },
      });
      const consent = async (clientId: string, redirectUri = REDIRECT) => {
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
        ).body;
      };
      const info = async (clientId: string) => (await consent(clientId)).client as Json;
      const doc = await info(DOC);
      expect(doc).toMatchObject({ kind: "document", host: "agents.example.com" });
      expect([...(doc.name as string)].length).toBeLessThanOrEqual(100);
      expect(doc.name).not.toMatch(/[\u202e\u200b\u2003]/);
      expect(doc.name).toMatch(/^Claude edoC from claude\.ai/);
      // A document named like Claude on another host is flagged; Claude Code's own is not.
      expect(doc.lookalike).toBe("Claude");
      expect(await info(CLAUDE_CODE)).toMatchObject({
        kind: "document",
        host: "claude.ai",
        name: "Claude Code",
      });
      expect((await info(CLAUDE_CODE)).lookalike).toBeUndefined();
      // Self-registered names: confusables are folded before comparing; Cursor's own name is not
      // a look-alike (Cursor always registers itself).
      for (const fake of [
        "Claude · Identified by claude.ai",
        "\u0421laude",
        "\uff23\uff4c\uff41\uff55\uff44\uff45",
        "C1aude",
        "CIaude",
        "Chat\u0047\u0420T",
        "VS \u0421ode",
        "Cl\u00e1ude",
        "Cla\u0307ude",
        "\u1d04\u029f\u1d00\u1d1c\u1d05\u1d07",
        "\u13dflaude",
        "Cl\u0430\u057dde",
      ]) {
        const id = await registerClient(s, { client_name: fake });
        expect((await info(id)).lookalike, fake).toBeDefined();
      }
      const cursor = await registerClient(s, { client_name: "Cursor" });
      expect(await info(cursor)).toMatchObject({ kind: "self-registered", name: "Cursor" });
      expect((await info(cursor)).lookalike).toBeUndefined();
      expect((await info(s.clientId)).lookalike).toBeUndefined(); // "Test Agent"
      // Stacked combining marks: a few per character at most.
      const marks = await registerClient(s, { client_name: `Z${"\u0301".repeat(30)}oe` });
      expect([...((await info(marks)).name as string)].length).toBe(5);
      // A private-use redirect is an app on this computer, never a web host.
      const app = "cursor://claude.ai/oauth/callback";
      const native = await registerClient(s, { client_name: "Cursor", redirect_uris: [app] });
      expect((await consent(native, app)).redirect).toEqual({
        host: "",
        loopback: true,
        app: "cursor",
      });
      // The connection keeps the shown name.
      await connect({ ...s, clientId: DOC }, { cookie: s.owner.cookie, scope: READ });
      const grants = (await s.call("GET", "/api/agent-grants", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      expect(grants.find((g) => g.clientId === DOC)?.clientName).toBe(doc.name);
      // "Connected agents" names a connection as the consent screen did (Phase 3b).
      expect(grants.find((g) => g.clientId === DOC)?.client).toEqual({
        kind: "document",
        host: "agents.example.com",
        lookalike: "Claude",
      });
      const fakeId = await registerClient(s, { client_name: "Claude \u00b7 from claude.ai" });
      await connect({ ...s, clientId: fakeId }, { cookie: s.owner.cookie, scope: READ });
      const all = (await s.call("GET", "/api/agent-grants?all=1", { cookie: s.owner.cookie }))
        .body as unknown as Json[];
      expect(all.find((g) => g.clientId === fakeId)).toMatchObject({
        client: { kind: "self-registered", lookalike: "Claude" },
        owner: { userId: s.owner.userId, role: "owner" },
      });
      // Studio's "Connect by URL" notes: the resource and the registrations that work here.
      const instance = (await s.call("GET", "/api/instance", { cookie: s.owner.cookie })).body as {
        features: Json;
      };
      expect(instance.features.mcpOauthClients).toEqual({
        resource: RESOURCE,
        cimd: true,
        dcr: true,
      });
      void FETCH_FAILED;
    });
  });
}
