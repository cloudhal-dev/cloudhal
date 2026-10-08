/** `/mcp` over HTTP: session cookie → human (approval-gated), API key → agent (scope-limited). */
import { AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";

async function setup(now?: () => Date) {
  const db = new Database(":memory:");
  const sql = new BetterSqlite3Driver(db);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const siteId = (await seedStarterSite(store, { name: "MCP Site", slug: "mcp-site" })).id;
  const auth = createAuth({
    database: db,
    baseURL: "http://localhost",
    secret: "test-secret-test-secret-test-secret",
    ...(now ? { now } : {}),
  });
  const audit = new AuditLog(sql);
  const app = createApi({
    store,
    resolveActor: auth.resolveActor,
    resolvePrincipal: auth.resolvePrincipal,
    authHandler: auth.handler,
    mcp: { stateKey: "http-test-key-at-least-thirty-two-bytes-long", audit },
    agentKeys: auth.agentKeys,
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
  return { app, store, siteId, cookie, audit, connect };
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
    expect(key.scopes).toEqual(["site:read", "content:read", "preview:create"]);

    const client = await connect({ "x-api-key": key.key });
    expect(client.getInstructions()).toContain("PLAN mode");
    const denied = await client.callTool({
      name: "create_entry",
      arguments: { siteId, slug: "p", title: "p", body: "b" },
    });
    expect((denied.content[0] as { text: string }).text).toMatch(
      /missing scope content:write|plan mode/,
    );

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
    expect(
      (await json("POST", "/api/agent-keys/nope/elevation", { mode: "auto", minutes: 60 })).status,
    ).toBe(400);
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
    ).toMatchObject({ reason: "desk: auto → manual (ended early)" });
    // ending when nothing is in force is harmless and not audited again
    expect((await json("DELETE", `/api/agent-keys/${created.id}/elevation`)).status).toBe(200);
    expect(
      (await audit.list({ limit: 50 })).filter((r) => r.tool === "agent-key.elevation-end"),
    ).toHaveLength(1);
  });
});
