/** `/mcp` over HTTP: session cookie → human (approval-gated), API key → agent (scope-limited). */

import { ApprovalStore, AuditLog } from "@cloudhal/agent-runtime";
import { AnalyticsService } from "@cloudhal/analytics/service";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";

async function setup(
  now?: () => Date,
  withApprovals = false,
  agentKeyRateLimit?: { windowMs: number; max: number },
) {
  const db = new Database(":memory:");
  const sql = new BetterSqlite3Driver(db);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const siteId = (await seedStarterSite(store, { name: "MCP Site", slug: "mcp-site" })).id;
  const auth = createAuth({
    database: db,
    sql,
    baseURL: "http://localhost",
    secret: "test-secret-test-secret-test-secret",
    ...(now ? { now } : {}),
    ...(agentKeyRateLimit ? { agentKeyRateLimit } : {}),
  });
  const audit = new AuditLog(sql);
  const approvals = withApprovals ? new ApprovalStore(sql, now ? { now } : {}) : undefined;
  const app = createApi({
    store,
    resolveActor: auth.resolveActor,
    resolvePrincipal: auth.resolvePrincipal,
    authHandler: auth.handler,
    mcp: { stateKey: "http-test-key-at-least-thirty-two-bytes-long", audit, approvals },
    ...(now ? { now } : {}),
    agentKeys: auth.agentKeys,
    staff: auth.staff,
    analytics: new AnalyticsService({
      sql,
      store: "sql",
      live: new SqlAnalytics(sql),
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
    }),
  });

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Halil",
      email: "halil@example.com",
      password: "correct horse battery",
    }),
  });
  expect(signUp.status, await signUp.clone().text()).toBe(200);
  const cookie = (signUp.headers.get("set-cookie") ?? "").split(";")[0] as string;

  const connect = async (headers: Record<string, string>, elicit?: () => "accept" | "decline") => {
    const client = new Client(
      { name: "http-test", version: "1.0.0" },
      {
        capabilities: elicit ? { elicitation: { form: {} } } : {},
        // Speak 2026-07-28 (per-request envelope) so the stateless server sees our capabilities.
        versionNegotiation: { mode: "auto" },
      },
    );
    if (elicit)
      client.setRequestHandler("elicitation/create", async () => {
        const action = elicit();
        return action === "accept" ? { action, content: { confirm: true } } : { action };
      });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      requestInit: { headers },
      fetch: async (input, init) => app.fetch(new Request(input, init as RequestInit)),
    });
    await client.connect(transport);
    return client;
  };
  return { app, store, siteId, cookie, audit, approvals, connect };
}

describe("MCP over HTTP", () => {
  it("rejects anonymous callers", async () => {
    const { app } = await setup();
    const res = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("a signed-in human can create and publish (with approval)", async () => {
    const { siteId, cookie, connect, store } = await setup();
    const client = await connect({ cookie }, () => "accept");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("publish");

    const before = (await store.getSite(siteId))?.pageIds.length ?? 0;
    const created = await client.callTool({
      name: "create_page",
      arguments: { siteId, path: "/contact", title: "Contact" },
    });
    expect(created.isError, JSON.stringify(created.content)).toBeFalsy();
    const published = await client.callTool({
      name: "publish",
      arguments: { siteId, label: "via http" },
    });
    expect(published.isError, JSON.stringify(published.content)).toBeFalsy();
    const site = await store.getSite(siteId);
    expect(site?.publishedSnapshotId).toBeDefined();
    expect(site?.pageIds.length).toBe(before + 1);
  });

  it("an API key acts as a scope-limited agent and shows up as one in audit", async () => {
    const { app, siteId, cookie, connect, audit } = await setup();
    expect((await app.request("/api/agent-keys", { method: "POST" })).status).toBe(401);
    const create = await app.request("/api/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "newsroom-bot",
        scopes: ["site:read", "content:read", "content:write", "preview:create"],
      }),
    });
    expect(create.status, await create.clone().text()).toBe(201);
    const { key, id, scopes } = (await create.json()) as {
      key: string;
      id: string;
      scopes: string[];
    };
    expect(scopes).toEqual(["site:read", "content:read", "content:write", "preview:create"]);
    const badScope = await app.request("/api/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x", scopes: ["root"] }),
    });
    expect(badScope.status).toBe(400);
    const listed = (await (
      await app.request("/api/agent-keys", { headers: { cookie } })
    ).json()) as {
      id: string;
      key?: string;
    }[];
    expect(listed.map((k) => k.id)).toEqual([id]);
    expect(listed[0]).not.toHaveProperty("key");

    const me = await app.request("/api/me", { headers: { "x-api-key": key } });
    const { actor } = (await me.json()) as { actor: { kind: string; id: string; name: string } };
    expect(actor).toMatchObject({ kind: "agent", name: "newsroom-bot" });
    expect(actor.id).toMatch(/^agent_[A-Za-z0-9]{6,32}$/);
    expect((await app.request("/api/me", { headers: { "x-api-key": "not-a-key" } })).status).toBe(
      401,
    );

    const client = await connect({ "x-api-key": key });
    const entry = await client.callTool({
      name: "create_entry",
      arguments: { siteId, slug: "bot-post", title: "Bot post", body: "text" },
    });
    expect(entry.isError, JSON.stringify(entry.content)).toBeFalsy();
    const publish = await client.callTool({ name: "publish", arguments: { siteId } });
    expect(publish.isError).toBe(true);
    expect((publish.content[0] as { text: string }).text).toMatch(
      /denied: missing scope site:publish/,
    );

    const rows = await audit.list({ siteId });
    expect(rows.map((r) => `${r.actor.kind}:${r.tool}:${r.decision}`)).toEqual([
      "agent:publish:deny",
      "agent:create_entry:allow",
    ]);
    expect(rows[0]?.actor.id).toBe(actor.id);

    expect(
      (await app.request(`/api/agent-keys/${id}`, { method: "DELETE", headers: { cookie } }))
        .status,
    ).toBe(204);
    expect((await app.request("/api/me", { headers: { "x-api-key": key } })).status).toBe(401);
  });
});

describe("agent modes on API keys (ADR-0015)", () => {
  it("limits a key per fixed window: 429 with Retry-After, and a steadily polling agent is never locked out", async () => {
    let clock = new Date("2026-10-09T00:00:00.000Z");
    const { app, cookie } = await setup(() => clock, false, { windowMs: 60_000, max: 5 });
    const create = await app.request("/api/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "poller", scopes: ["site:read"] }),
    });
    const { key } = (await create.json()) as { key: string };
    // Keys are limited when they are resolved, before any route: REST answers agent keys with 403
    // (they work over /mcp), which is all a call needs to show it was not rate limited.
    const call = () => app.request("/api/sites", { headers: { "x-api-key": key } });
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    // A burst: five calls in the window pass, the sixth is refused as a rate limit, not a 401.
    for (let i = 0; i < 5; i++) expect((await call()).status).toBe(403);
    const over = await call();
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("60");
    expect(((await over.json()) as { error: string }).error).toBe("rate_limited");
    tick(61_000);
    expect((await call()).status).toBe(403);
    // One call every 15 s for ten minutes (40 calls, far more than `max` in total) always passes:
    // the window resets every minute even though the key is never idle for a whole minute.
    for (let i = 0; i < 40; i++) {
      tick(15_000);
      expect((await call()).status, `call ${i}`).toBe(403);
    }
  });

  it("creates keys by mode, changes the mode for the next call, audits it, refuses bypass", async () => {
    const { app, siteId, cookie, connect, audit } = await setup();
    const post = (body: unknown) =>
      app.request("/api/agent-keys", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      });
    expect((await post({ name: "x", mode: "bypass" })).status).toBe(400);
    expect((await post({ name: "x", mode: "yolo" })).status).toBe(400);
    const res = await post({ name: "planner", mode: "plan" });
    expect(res.status).toBe(201);
    const key = (await res.json()) as { id: string; key: string; mode: string; scopes: string[] };
    expect(key.mode).toBe("plan");
    expect(key.scopes).toEqual(["site:read", "content:read", "preview:create", "analytics:read"]);

    const client = await connect({ "x-api-key": key.key });
    expect(client.getInstructions()).toContain("PLAN mode");
    const denied = await client.callTool({
      name: "create_entry",
      arguments: { siteId, slug: "p", title: "p", body: "b" },
    });
    expect((denied.content[0] as { text: string }).text).toMatch(
      /missing scope content:write|plan mode/,
    );
    // RFC-0006: a new key reads analytics in every mode, plan included, over /mcp.
    const stats = await client.callTool({ name: "get_analytics", arguments: { siteId } });
    expect(stats.isError, JSON.stringify(stats.content)).toBeFalsy();
    expect(stats.structuredContent).toMatchObject({ siteId, summary: { pageviews: 0 } });

    // owner switches it to edits — but the key's scopes stay what they were (a mode never grants)
    const patch = await app.request(`/api/agent-keys/${key.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ mode: "edits" }),
    });
    expect(patch.status, await patch.clone().text()).toBe(200);
    expect(((await patch.json()) as { mode: string }).mode).toBe("edits");
    const listed = (await (
      await app.request("/api/agent-keys", { headers: { cookie } })
    ).json()) as { id: string; mode: string }[];
    expect(listed.find((k) => k.id === key.id)?.mode).toBe("edits");
    const again = await connect({ "x-api-key": key.key });
    expect(again.getInstructions()).toContain("EDITS mode");

    expect(
      (
        await app.request(`/api/agent-keys/${key.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ mode: "bypass" }),
        })
      ).status,
    ).toBe(400);
    const rows = await audit.list({ limit: 50 });
    expect(rows.find((r) => r.tool === "agent-key.mode")).toMatchObject({
      reason: "planner: plan → edits",
      mode: "edits",
    });

    // keys created before modes existed read as `edits`
    const legacy = await post({ name: "old-style", scopes: ["site:read", "content:read"] });
    expect(((await legacy.json()) as { mode: string }).mode).toBe("edits");
  });
});

describe("time-boxed elevation (ADR-0016)", () => {
  it("elevates a key for a while, tells the agent, audits it, and falls back on its own", async () => {
    let clock = Date.parse("2026-10-08T10:00:00Z");
    const { app, siteId, cookie, connect, audit } = await setup(() => new Date(clock));
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const created = (await (await json("POST", "/api/agent-keys", { name: "desk" })).json()) as {
      id: string;
      key: string;
      mode: string;
    };
    expect(created.mode).toBe("edits");
    const elevate = (body: unknown) =>
      json("POST", `/api/agent-keys/${created.id}/elevation`, body);

    // refused: not more autonomous, bypass, out-of-range or missing minutes, unknown key
    expect((await elevate({ mode: "plan", minutes: 60 })).status).toBe(400);
    expect((await elevate({ mode: "bypass", minutes: 60 })).status).toBe(400);
    expect((await elevate({ mode: "auto", minutes: 2 })).status).toBe(400);
    expect((await elevate({ mode: "auto" })).status).toBe(400);
    // an unknown (or someone else's) key is not found
    expect(
      (await json("POST", "/api/agent-keys/nope/elevation", { mode: "auto", minutes: 60 })).status,
    ).toBe(404);
    // agents cannot elevate themselves (people-only routes)
    expect(
      (
        await app.request(`/api/agent-keys/${created.id}/elevation`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": created.key },
          body: JSON.stringify({ mode: "auto", minutes: 60 }),
        })
      ).status,
    ).toBe(403);

    const res = await elevate({ mode: "auto", minutes: 60, reason: "launch day" });
    expect(res.status, await res.clone().text()).toBe(200);
    const elevated = (await res.json()) as {
      mode: string;
      effectiveMode: string;
      elevation: { mode: string; until: string; reason: string; grantedBy: string };
    };
    expect(elevated).toMatchObject({
      mode: "edits",
      effectiveMode: "auto",
      elevation: { mode: "auto", until: "2026-10-08T11:00:00.000Z", reason: "launch day" },
    });
    expect(elevated.elevation.grantedBy).toMatch(/^user_/);

    const during = await connect({ "x-api-key": created.key });
    expect(during.getInstructions()).toContain("AUTO mode");
    expect(during.getInstructions()).toContain(
      "temporary: a person granted it until 2026-10-08T11:00:00.000Z",
    );
    expect(during.getInstructions()).toContain("EDITS mode again");
    await during.callTool({ name: "list_pages", arguments: { siteId } });
    const rows = await audit.list({ limit: 50 });
    expect(rows.find((r) => r.tool === "list_pages")).toMatchObject({
      mode: "auto",
      elevation: { from: "edits", until: "2026-10-08T11:00:00.000Z" },
    });
    expect(rows.find((r) => r.tool === "agent-key.elevate")).toMatchObject({
      reason: "desk: edits → auto until 2026-10-08T11:00:00.000Z (60 min): launch day",
      elevation: { from: "edits", until: "2026-10-08T11:00:00.000Z" },
    });

    // changing the key's own mode keeps the elevation while it is still higher
    const patched = (await (
      await json("PATCH", `/api/agent-keys/${created.id}`, { mode: "manual" })
    ).json()) as { mode: string; effectiveMode: string };
    expect(patched).toMatchObject({ mode: "manual", effectiveMode: "auto" });

    // time is up: back to the key's own mode without anyone doing anything
    clock = Date.parse("2026-10-08T11:00:01Z");
    const listed = (await (await json("GET", "/api/agent-keys")).json()) as {
      id: string;
      effectiveMode: string;
      elevation?: unknown;
    }[];
    expect(listed.find((k) => k.id === created.id)).toMatchObject({ effectiveMode: "manual" });
    expect(listed.find((k) => k.id === created.id)?.elevation).toBeUndefined();
    const after = await connect({ "x-api-key": created.key });
    expect(after.getInstructions()).toContain("MANUAL mode");
    expect(after.getInstructions()).not.toContain("temporary");

    // ending early
    await elevate({ mode: "edits", minutes: 30 });
    expect(
      ((await (await elevate({ mode: "auto", minutes: 30 })).json()) as { effectiveMode: string })
        .effectiveMode,
    ).toBe("auto"); // a new elevation replaces the one in force
    const ended = (await (
      await json("DELETE", `/api/agent-keys/${created.id}/elevation`)
    ).json()) as { effectiveMode: string; elevation?: unknown };
    expect(ended).toMatchObject({ effectiveMode: "manual" });
    expect(ended.elevation).toBeUndefined();
    expect(
      (await audit.list({ limit: 50 })).find((r) => r.tool === "agent-key.elevation-end"),
    ).toMatchObject({
      reason: "desk: auto → manual (ended early)",
      elevation: { from: "manual", until: expect.any(String) },
    });
    // ending when nothing is in force is harmless and not audited again
    expect((await json("DELETE", `/api/agent-keys/${created.id}/elevation`)).status).toBe(200);
    expect(
      (await audit.list({ limit: 50 })).filter((r) => r.tool === "agent-key.elevation-end"),
    ).toHaveLength(1);
  });
});

describe("agents asking for an elevation (ADR-0016)", () => {
  it("files a request a person grants in Approvals; the next call runs elevated", async () => {
    let clock = Date.parse("2026-10-08T10:00:00Z");
    const { app, siteId, cookie, connect, audit } = await setup(() => new Date(clock), true);
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const key = (await (await json("POST", "/api/agent-keys", { name: "desk" })).json()) as {
      id: string;
      key: string;
    };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const client = await connect({ "x-api-key": key.key });
      const r = await client.callTool({ name, arguments: args });
      const instructions = client.getInstructions() ?? "";
      await client.close();
      return {
        isError: r.isError === true,
        text: (r.content as { text?: string }[])[0]?.text ?? "",
        data: r.structuredContent as Record<string, unknown> | undefined,
        instructions,
      };
    };

    const before = await call("get_mode");
    expect(before.instructions).toContain("request_elevation");
    expect(before.data).toMatchObject({
      mode: "edits",
      ownMode: "edits",
      canRequestElevation: true,
      requestableModes: ["auto"],
    });
    expect(before.data?.latestRequest).toBeUndefined();

    const ask = { siteId, mode: "auto", minutes: 60, reason: "publish the launch-day updates" };
    expect((await call("request_elevation", { ...ask, mode: "manual" })).text).toMatch(
      /^invalid: an elevation must be more autonomous/,
    );
    const filed = await call("request_elevation", ask);
    expect(filed.isError, filed.text).toBe(false);
    const request = (filed.data as { request: { id: string; status: string } }).request;
    expect(request.status).toBe("pending");
    // one open request per key
    const again = await call("request_elevation", { ...ask, minutes: 120 });
    expect((again.data as { request: { id: string } }).request.id).toBe(request.id);

    // the person sees it in the site's approvals
    const pending = (await (
      await json("GET", `/api/sites/${siteId}/approvals?status=pending`)
    ).json()) as {
      items: { id: string; tool: string; prompt: string; input: { keyId: string } }[];
    };
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      id: request.id,
      tool: "request_elevation",
      prompt:
        'desk asks to work in AUTO mode for 60 min (its own mode is EDITS): "publish the launch-day updates"',
      input: { keyId: key.id },
    });
    // the agent cannot grant it itself
    expect(
      (
        await app.request(`/api/sites/${siteId}/approvals/${request.id}/approve`, {
          method: "POST",
          headers: { "x-api-key": key.key },
        })
      ).status,
    ).toBe(403);
    // an approver may shorten, not extend
    expect(
      (await json("POST", `/api/sites/${siteId}/approvals/${request.id}/approve`, { minutes: 90 }))
        .status,
    ).toBe(400);
    const approved = await json("POST", `/api/sites/${siteId}/approvals/${request.id}/approve`, {
      minutes: 30,
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    // the approval records what was granted (shorter than asked)
    expect(await approved.json()).toMatchObject({
      status: "consumed",
      input: { mode: "auto", minutes: 60, ownMode: "edits" },
      grant: { from: "edits", mode: "auto", minutes: 30, until: "2026-10-08T10:30:00.000Z" },
    });

    const during = await call("get_mode");
    expect(during.instructions).toContain("AUTO mode");
    expect(during.instructions).toContain("until 2026-10-08T10:30:00.000Z");
    expect(during.data).toMatchObject({
      mode: "auto",
      ownMode: "edits",
      elevation: { from: "edits", until: "2026-10-08T10:30:00.000Z" },
      requestableModes: [],
      latestRequest: {
        id: request.id,
        status: "consumed",
        mode: "auto",
        minutes: 60,
        granted: { minutes: 30, until: "2026-10-08T10:30:00.000Z" },
      },
    });
    // the grant shows up in the site's activity, with who asked
    const activity = (await (await json("GET", `/api/sites/${siteId}/activity`)).json()) as {
      items: { tool: string; reason?: string; elevation?: unknown }[];
    };
    expect(activity.items.find((r) => r.tool === "agent-key.elevate")).toMatchObject({
      reason: `desk: edits → auto until 2026-10-08T10:30:00.000Z (30 min), requested by the agent (${request.id})`,
      input: { requestId: request.id, keyId: key.id, minutes: 30 },
      elevation: { from: "edits", until: "2026-10-08T10:30:00.000Z" },
    });
    // already elevated: asking again for the same mode is refused
    expect((await call("request_elevation", ask)).text).toMatch(/already work in AUTO mode/);

    // after it ends, a refused request is reported as denied
    clock = Date.parse("2026-10-08T10:31:00Z");
    const second = await call("request_elevation", { ...ask, minutes: 15 });
    const secondId = (second.data as { request: { id: string } }).request.id;
    expect(secondId).not.toBe(request.id);
    expect((await json("POST", `/api/sites/${siteId}/approvals/${secondId}/deny`)).status).toBe(
      200,
    );
    expect((await call("get_mode")).data).toMatchObject({
      mode: "edits",
      latestRequest: { id: secondId, status: "denied" },
    });
    expect(
      (await audit.list({ limit: 100 })).filter((r) => r.tool === "agent-key.elevate"),
    ).toHaveLength(1);
  });

  it("refuses an approval the key can no longer take, and people get no mode", async () => {
    const { app, siteId, cookie, connect } = await setup(undefined, true);
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const key = (await (await json("POST", "/api/agent-keys", { name: "desk" })).json()) as {
      id: string;
      key: string;
    };
    const client = await connect({ "x-api-key": key.key });
    const filed = await client.callTool({
      name: "request_elevation",
      arguments: { siteId, mode: "auto", minutes: 60, reason: "a batch of fixes" },
    });
    const id = (filed.structuredContent as { request: { id: string } }).request.id;
    // meanwhile the owner made the key auto for good: nothing left to grant
    await json("PATCH", `/api/agent-keys/${key.id}`, { mode: "auto" });
    const res = await json("POST", `/api/sites/${siteId}/approvals/${id}/approve`);
    expect(res.status).toBe(409);
    // distinct from "already decided": the request is still pending
    expect(await res.json()).toMatchObject({
      error: "elevation_conflict",
      message: expect.stringMatching(/more autonomous/),
    });
    // still pending: the person can deny it
    expect((await json("POST", `/api/sites/${siteId}/approvals/${id}/deny`)).status).toBe(200);
    // deciding again is the plain "no longer pending" conflict
    expect(
      await (await json("POST", `/api/sites/${siteId}/approvals/${id}/approve`)).json(),
    ).toMatchObject({ error: "conflict" });

    const human = await connect({ cookie, origin: "http://localhost" });
    const mine = await human.callTool({ name: "get_mode", arguments: {} });
    expect(mine.structuredContent).toMatchObject({ mode: null, canRequestElevation: false });
    const nope = await human.callTool({
      name: "request_elevation",
      arguments: { siteId, mode: "auto", minutes: 60, reason: "why not" },
    });
    expect((nope.content as { text: string }[])[0]?.text).toMatch(/only agents ask/);
  });
});

describe("notifications before an elevation ends", () => {
  it("lists ending elevations and pending requests for the owner; the agent is told too", async () => {
    let clock = Date.parse("2026-10-08T10:00:00Z");
    const { app, siteId, cookie, connect } = await setup(() => new Date(clock), true);
    const json = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const notifications = async () =>
      (await (await json("GET", "/api/notifications")).json()) as {
        items: Record<string, unknown>[];
        noticeMinutes: number;
      };
    const desk = (await (await json("POST", "/api/agent-keys", { name: "desk" })).json()) as {
      id: string;
      key: string;
    };
    const planner = (await (
      await json("POST", "/api/agent-keys", { name: "planner", mode: "plan" })
    ).json()) as { id: string; key: string };

    expect(await notifications()).toEqual({ items: [], noticeMinutes: 10 });
    await json("POST", `/api/agent-keys/${desk.id}/elevation`, { mode: "auto", minutes: 60 });
    // the agent asks for one too
    const client = await connect({ "x-api-key": planner.key });
    const filed = await client.callTool({
      name: "request_elevation",
      arguments: { siteId, mode: "edits", minutes: 30, reason: "fix typos in three posts" },
    });
    const approvalId = (filed.structuredContent as { request: { id: string } }).request.id;

    // an hour-long elevation is not ending yet; the request is listed
    let page = await notifications();
    expect(page.items).toEqual([
      expect.objectContaining({
        id: `elevation-request:${approvalId}`,
        kind: "elevation-request",
        approvalId,
        siteId,
        keyId: planner.id,
        mode: "edits",
        minutes: 30,
        reason: "fix typos in three posts",
        agent: expect.objectContaining({ kind: "agent", name: "planner" }),
      }),
    ]);

    // nine minutes before the end it shows up, soonest first
    clock = Date.parse("2026-10-08T10:51:00Z");
    page = await notifications();
    expect(page.items.map((n) => n.kind)).toEqual(["elevation-ending", "elevation-request"]);
    expect(page.items[0]).toEqual({
      id: `elevation-ending:${desk.id}:2026-10-08T11:00:00.000Z`,
      kind: "elevation-ending",
      keyId: desk.id,
      keyName: "desk",
      mode: "auto",
      from: "edits",
      until: "2026-10-08T11:00:00.000Z",
      minutesLeft: 9,
    });
    // the agent sees the same through get_mode
    const agent = await connect({ "x-api-key": desk.key });
    const mode = await agent.callTool({ name: "get_mode", arguments: {} });
    expect(mode.structuredContent).toMatchObject({
      mode: "auto",
      elevation: { minutesLeft: 9, endingSoon: true },
    });

    // extending is a new elevation; then it is no longer "ending"
    await json("POST", `/api/agent-keys/${desk.id}/elevation`, { mode: "auto", minutes: 60 });
    page = await notifications();
    expect(page.items.map((n) => n.kind)).toEqual(["elevation-request"]);
    // once decided, the request is gone; agents cannot read notifications
    await json("POST", `/api/sites/${siteId}/approvals/${approvalId}/deny`);
    expect((await notifications()).items).toEqual([]);
    expect(
      (await app.request("/api/notifications", { headers: { "x-api-key": desk.key } })).status,
    ).toBe(403);
    expect((await app.request("/api/notifications")).status).toBe(401);
  });
});
