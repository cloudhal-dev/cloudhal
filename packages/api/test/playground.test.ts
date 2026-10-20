/**
 * RFC-0036 §5: playground mode. Every declared route is either blocked or allowed (never both,
 * never neither), allowed routes work for the playground principal, and the guard, the principal
 * and `features.playground` hold end to end.
 */
import { holds } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import {
  isBlockedInPlayground,
  PLAYGROUND_ALLOW,
  PLAYGROUND_PRINCIPAL,
  PLAYGROUND_SCOPES,
  playgroundDenyRule,
} from "../src/playground.ts";
import { ROUTE_SCOPES } from "../src/scopes.ts";

const key = (method: string, pattern: string) => `${method} ${pattern}`;

describe("the playground route table", () => {
  it("classifies every declared route exactly once", () => {
    const unclassified: string[] = [];
    const both: string[] = [];
    for (const [method, pattern] of ROUTE_SCOPES) {
      const denied = playgroundDenyRule(method, pattern) !== undefined;
      const allowed = PLAYGROUND_ALLOW.has(key(method, pattern));
      if (!denied && !allowed) unclassified.push(key(method, pattern));
      if (denied && allowed) both.push(key(method, pattern));
    }
    expect(unclassified, "routes neither blocked nor allowed in a playground").toEqual([]);
    expect(both, "routes both blocked and allowed").toEqual([]);
    const declared = new Set(ROUTE_SCOPES.map(([m, p]) => key(m, p)));
    expect(
      [...PLAYGROUND_ALLOW].filter((r) => !declared.has(r)),
      "stale allow entries",
    ).toEqual([]);
  });

  it("allows only routes the playground principal can pass", () => {
    for (const [method, pattern, req] of ROUTE_SCOPES) {
      if (!PLAYGROUND_ALLOW.has(key(method, pattern))) continue;
      const ok =
        req === "public" ||
        req === "signed-in" ||
        req === "member" ||
        (req !== "owner" && req !== "deploy-token" && holds(PLAYGROUND_SCOPES, req));
      expect(ok, `${key(method, pattern)} requires ${req}`).toBe(true);
    }
  });

  it("gives the principal nothing installation-wide and no uploads", () => {
    for (const scope of [
      "*",
      "asset:upload",
      "asset:manage",
      "members:manage",
      "members:invite",
      "agents:manage",
      "site:create",
    ] as const)
      expect(holds(PLAYGROUND_PRINCIPAL.scopes, scope), scope).toBe(false);
    for (const scope of [
      "site:settings",
      "content:write",
      "site:publish",
      "site:rollback",
    ] as const)
      expect(holds(PLAYGROUND_PRINCIPAL.scopes, scope), scope).toBe(true);
  });

  it.each([
    ["GET", "/api/auth/get-session", "auth"],
    ["POST", "/api/password-reset/request", "auth"],
    ["GET", "/api/members", "people"],
    ["POST", "/api/invites", "people"],
    ["POST", "/api/agent-keys", "keys"],
    ["POST", "/mcp", "mcp"],
    ["GET", "/mcp/", "mcp"],
    ["POST", "/api/sites/s1/assets/uploads", "uploads"],
    ["PUT", "/api/sites/s1/assets/uploads/u1", "uploads"],
    ["DELETE", "/api/sites/s1/assets/a1", "uploads"],
    ["POST", "/api/sites/s1/assets/a1/purge", "uploads"],
    ["PUT", "/api/admin/sites/s1/bundle", "transfer"],
    ["PUT", "/api/admin/sites/s1/domains", "domains"],
    ["POST", "/api/sites", "sites"],
    ["POST", "/api/sites/s1/preview-links", "outbound"],
    ["GET", "/api/sites/s1/analytics/summary", "outbound"],
    ["GET", "/api/sites/s1/comments", "outbound"],
    ["POST", "/api/sites/s1/ai/commands", "agent"],
    ["POST", "/api/sites/s1/ai/build/p1", "agent"],
    ["GET", "/api/sites/s1/pages/p1/build/events", "agent"],
    ["GET", "/api/sites/s1/approvals", "agent"],
    ["POST", "/api/sites/s1/releases", "schedules"],
    ["GET", "/api/scheduler", "schedules"],
    ["GET", "/api/brand-new-route", "unclassified"],
    ["GET", "/api/sites/s1/brand-new", "unclassified"],
  ])("blocks %s %s (%s)", (method, path, block) => {
    expect(isBlockedInPlayground(method, path)).toBe(block);
  });

  it.each([
    ["GET", "/api/me"],
    ["HEAD", "/api/instance"],
    ["GET", "/api/sites/s1"],
    ["PUT", "/api/sites/s1/entries/e1"],
    ["POST", "/api/sites/s1/snapshots/sn1/publish"],
    ["POST", "/api/sites/s1/menus/m1/ops"],
    ["GET", "/api/sites/s1/assets/a1/content"],
    ["GET", "/api/sites/s1/search/"],
    // not the API's to judge: Studio and the rendered site
    ["GET", "/studio/members"],
    ["GET", "/s/01J0000000/blog/"],
  ])("allows %s %s", (method, path) => {
    expect(isBlockedInPlayground(method, path)).toBeUndefined();
  });
});

describe("createApi({ playground })", () => {
  const info = {
    expiresAt: "2026-10-20T19:00:00.000Z",
    resetUrl: "/_playground/reset",
    deployUrl: "https://cloudhal.dev/docs/deploy",
  };

  async function setup() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "Try", slug: "try" });
    // A resolver that would grant everything: playground mode must ignore it.
    const app = createApi({
      store,
      resolvePrincipal: async () => ({
        actor: { kind: "human", id: "user_intruder1", name: "x" },
        scopes: ["*"],
      }),
      playground: { info: () => info, maxBodyBytes: 10_000 },
    });
    return { store, site, app };
  }

  const json = { "content-type": "application/json" };

  it("acts as the playground principal and reports features.playground", async () => {
    const { app } = await setup();
    const me = (await (await app.request("/api/me")).json()) as {
      actor: { id: string };
      role: string;
      scopes: string[];
    };
    expect(me.actor.id).toBe("user_playground");
    expect(me.role).toBe("editor");
    expect(me.scopes).not.toContain("*");
    const instance = (await (await app.request("/api/instance")).json()) as {
      features: { playground?: unknown; members: boolean; mcp: boolean };
    };
    expect(instance.features.playground).toEqual(info);
    expect(instance.features.members).toBe(false);
    expect(instance.features.mcp).toBe(false);
  });

  it("edits, snapshots and publishes", async () => {
    const { app, site, store } = await setup();
    expect((await app.request(`/api/sites/${site.id}`)).status).toBe(200);
    const res = await app.request(`/api/sites/${site.id}/snapshots`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ publish: true }),
    });
    expect(res.status).toBeLessThan(300);
    expect((await store.getSite(site.id))?.publishedSnapshotId).toBeDefined();
  });

  it("refuses blocked and unclassified routes with 403 playground", async () => {
    const { app, site } = await setup();
    for (const [method, path] of [
      ["POST", `/api/sites/${site.id}/assets/uploads`],
      ["POST", "/api/sites"],
      ["GET", "/api/members"],
      ["POST", "/api/agent-keys"],
      ["GET", "/api/auth/get-session"],
      ["POST", "/mcp"],
      ["GET", "/api/never-declared"],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: json,
        ...(method === "GET" ? {} : { body: "{}" }),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe("playground");
    }
  });

  it("refuses bodies over the limit", async () => {
    const { app, site } = await setup();
    const res = await app.request(`/api/sites/${site.id}/entries`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ title: "x".repeat(20_000) }),
    });
    expect(res.status).toBe(413);
  });
});
