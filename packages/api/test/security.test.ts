/**
 * Regression tests for the pre-launch security review (Sprint 7). Each case is an exploit the
 * review confirmed against the earlier code.
 */
import { AuditLog } from "@cloudhal/agent-runtime";
import { ConflictError, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const human = { kind: "human" as const, id: "user_secreview01", name: "Owner" };
const agent = { kind: "agent" as const, id: "agent_secreview1", name: "bot" };

async function setup(extra: Partial<Parameters<typeof createApi>[0]> = {}) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Sec", slug: "sec" });
  const app = createApi({
    store,
    resolvePrincipal: async (c) => {
      const who = c.req.header("x-test-as");
      if (who === "agent")
        return { actor: agent, scopes: ["site:read", "content:read", "content:write"] };
      if (who === "human") return { actor: human, scopes: ["*"] };
      return undefined;
    },
    ...extra,
  });
  return { sql, store, site, app };
}

const json = { "content-type": "application/json" };

describe("agents cannot use the REST API (C1)", () => {
  it("refuses an agent key on reads, writes and publish; people are unaffected", async () => {
    const { app, site, store } = await setup();
    const as = (who: string) => ({ ...json, "x-test-as": who });
    for (const [method, path, body] of [
      ["GET", "/api/sites", undefined],
      ["GET", `/api/sites/${site.id}/pages`, undefined],
      ["POST", `/api/sites/${site.id}/snapshots`, { publish: true }],
      ["GET", "/api/instance", undefined],
      ["GET", "/api/agent-keys", undefined],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: as("agent"),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect((await store.getSite(site.id))?.publishedSnapshotId).toBeUndefined();
    expect((await app.request("/api/me", { headers: as("agent") })).status).toBe(200);
    expect((await app.request("/api/sites", { headers: as("human") })).status).toBe(200);
  });
});

describe("cross-origin protection (M1, M5)", () => {
  it("refuses state-changing requests from other origins or cross-site fetches", async () => {
    const { app, site } = await setup();
    const post = (headers: Record<string, string>) =>
      app.request(`http://studio.example/api/sites/${site.id}/snapshots`, {
        method: "POST",
        headers: { ...json, "x-test-as": "human", ...headers },
        body: JSON.stringify({ label: "x" }),
      });
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await post({ origin: "http://studio.example" })).status).toBe(201);
    expect((await post({})).status).toBe(201); // non-browser clients send neither header
    // reads are not affected
    const read = await app.request(`http://studio.example/api/sites/${site.id}`, {
      headers: { "x-test-as": "human", origin: "https://evil.example" },
    });
    expect(read.status).toBe(200);
  });

  it("allows configured trusted origins (Studio dev server)", async () => {
    const { app, site } = await setup({ trustedOrigins: ["http://localhost:5173"] });
    const res = await app.request(`http://localhost:8787/api/sites/${site.id}/snapshots`, {
      method: "POST",
      headers: { ...json, "x-test-as": "human", origin: "http://localhost:5173" },
      body: "{}",
    });
    expect(res.status).toBe(201);
  });

  it("a server without auth answers only its allowed host names (DNS rebinding)", async () => {
    const { app } = await setup({ allowedHosts: ["localhost", "127.0.0.1"] });
    expect((await app.request("http://localhost:8787/api/health")).status).toBe(200);
    expect((await app.request("http://attacker.example:8787/api/health")).status).toBe(403);
  });
});

describe("input hardening", () => {
  it("preview links only accept site paths (L8)", async () => {
    const { app, site } = await setup({
      preview: { secret: "security-preview-secret-0123456789abcd" },
    });
    const create = (path: unknown) =>
      app.request(`/api/sites/${site.id}/preview-links`, {
        method: "POST",
        headers: { ...json, "x-test-as": "human" },
        body: JSON.stringify({ path }),
      });
    for (const bad of ["//evil.example/x", "/\\evil.example", "https://evil.example", "about", 5])
      expect((await create(bad)).status, String(bad)).toBe(400);
    expect((await create("/posts/a?b=1")).status).toBe(201);
  });

  it("snapshot limits are validated and diffs stay within the site (L5, L11)", async () => {
    const { app, site, store } = await setup();
    const h = { "x-test-as": "human" };
    expect(
      (await app.request(`/api/sites/${site.id}/snapshots?limit=0`, { headers: h })).status,
    ).toBe(400);
    expect(
      (await app.request(`/api/sites/${site.id}/snapshots?limit=abc`, { headers: h })).status,
    ).toBe(400);
    const other = await seedStarterSite(store, { name: "Other", slug: "other" });
    const a = await store.createSnapshot(site.id, { actor: human, reason: "manual" });
    const b = await store.createSnapshot(other.id, { actor: human, reason: "manual" });
    expect(
      (await app.request(`/api/sites/${site.id}/snapshots/${a.id}/diff/${b.id}`, { headers: h }))
        .status,
    ).toBe(404);
  });

  it("compare-and-swap cannot write one kind of node into another's row (M3)", async () => {
    const { store, site } = await setup();
    const page = (await store.listPages(site.id))[0] as NonNullable<
      Awaited<ReturnType<typeof store.listPages>>[number]
    >;
    const entry = (await store.listContentEntries(site.id, "posts"))[0];
    // an entry body carrying the page's id and rev
    await expect(
      store.updateContentEntry({
        ...(entry as NonNullable<typeof entry>),
        id: page.id,
        rev: page.rev,
      }),
    ).rejects.toThrow(ConflictError);
    expect((await store.getPage(page.id))?.title).toBe(page.title);
  });

  it("oversized audit inputs stay readable (M2)", async () => {
    const { sql, app, site } = await setup();
    const audit = new AuditLog(sql);
    const appWithAudit = createApi({
      store: new SiteGraphStore({ sql, blobs: new MemoryBlobStore() }),
      audit,
      resolveActor: async () => human,
    });
    await audit.record({
      at: new Date().toISOString(),
      actor: agent,
      siteId: site.id,
      tool: "create_entry",
      decision: "allow",
      input: { body: "x".repeat(20_000) },
    });
    const res = await appWithAudit.request(`/api/sites/${site.id}/activity`);
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: { input: { truncated?: boolean } }[] };
    expect(items[0]?.input.truncated).toBe(true);
    void app;
  });
});
