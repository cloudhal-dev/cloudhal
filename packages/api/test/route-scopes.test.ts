/**
 * RFC-0005 I15: REST is default-deny. Every route the app mounts declares its requirement in
 * `ROUTE_SCOPES`; this test fails for any route without one (and for declarations without a route).
 */
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { ROUTE_SCOPES, requirementFor } from "../src/scopes.ts";

async function fullApp() {
  const database = new Database(":memory:");
  const sql = new BetterSqlite3Driver(database);
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  const auth = createAuth({
    database,
    sql,
    baseURL: "http://localhost",
    secret: "route-scopes-secret-0123456789abcdefgh",
  });
  // Every optional surface mounted, so every route is enumerated.
  return createApi({
    store,
    resolvePrincipal: auth.resolvePrincipal,
    authHandler: auth.handler,
    agentKeys: auth.agentKeys,
    staff: auth.staff,
    mcp: { stateKey: "route-scopes-state-key-0123456789abcdefg" },
    preview: { secret: "route-scopes-preview-secret-0123456789ab" },
    admin: { deployToken: "route-scopes-deploy-token-0123456789abc", storage: { sql, blobs } },
  });
}

/** Handlers, not middleware: `app.use` registers method ALL with a `(c, next)` handler. */
function mountedRoutes(app: Awaited<ReturnType<typeof fullApp>>) {
  const seen = new Set<string>();
  for (const r of app.routes) {
    if (r.method === "ALL" && r.handler.length >= 2) continue;
    seen.add(`${r.method} ${r.path}`);
  }
  return [...seen].sort();
}

describe("ROUTE_SCOPES (I15)", () => {
  it("declares every mounted route, exactly", async () => {
    const app = await fullApp();
    const mounted = mountedRoutes(app);
    const declared = ROUTE_SCOPES.map(([m, p]) => `${m} ${p}`).sort();
    const undeclared = mounted.filter((r) => !declared.includes(r));
    expect(undeclared, "routes without a declared requirement").toEqual([]);
    const stale = declared.filter((r) => !mounted.includes(r));
    expect(stale, "declarations without a route").toEqual([]);
  });

  it("refuses a route that was mounted without a declaration", async () => {
    const app = await fullApp();
    app.get("/api/undeclared", (c) => c.json({ leaked: true }));
    const res = await app.request("/api/undeclared");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("leaked");
    expect(requirementFor("GET", "/api/undeclared")).toBeUndefined();
  });

  it("resolves literal segments before parameters", () => {
    expect(requirementFor("POST", "/api/members/transfer-ownership")).toBe("owner");
    expect(requirementFor("PATCH", "/api/members/abc")).toBe("members:manage");
    expect(requirementFor("POST", "/api/members/abc/password-reset")).toBe("members:manage");
    expect(requirementFor("POST", "/api/invites/accept")).toBe("public");
    expect(requirementFor("GET", "/api/auth/get-session")).toBe("public");
    expect(requirementFor("HEAD", "/api/sites")).toBe("site:read");
    expect(requirementFor("POST", "/api/sites/site_x/snapshots/snap_y/publish")).toBe(
      "site:publish:own",
    );
    expect(requirementFor("DELETE", "/api/sites")).toBeUndefined();
    // RFC-0003 menus: reads for every member, writes for Editor and above.
    expect(requirementFor("GET", "/api/sites/site_x/menus/references")).toBe("site:read");
    expect(requirementFor("POST", "/api/sites/site_x/menus/preview")).toBe("site:read");
    expect(requirementFor("POST", "/api/sites/site_x/menus/from-pages")).toBe("site:write");
    expect(requirementFor("PUT", "/api/sites/site_x/menus/menu_y")).toBe("site:write");
    expect(requirementFor("POST", "/api/sites/site_x/menus/menu_y/ops")).toBe("site:write");
    expect(requirementFor("DELETE", "/api/sites/site_x/menus/menu_y")).toBe("site:write");
    expect(requirementFor("GET", "/api/sites/site_x/menus/menu_y/resolve")).toBe("site:read");
    // RFC-0004 media: reads for every member, uploads asset:upload, management asset:manage,
    // takedown the Owner.
    const a = "/api/sites/site_x/assets";
    expect(requirementFor("GET", a)).toBe("site:read");
    expect(requirementFor("GET", `${a}/asset_y/content`)).toBe("site:read");
    expect(requirementFor("POST", `${a}/uploads`)).toBe("asset:upload");
    expect(requirementFor("PUT", `${a}/uploads/upl_y`)).toBe("asset:upload");
    expect(requirementFor("PUT", `${a}/asset_y`)).toBe("asset:upload");
    expect(requirementFor("POST", `${a}/asset_y/retire`)).toBe("asset:manage");
    expect(requirementFor("DELETE", `${a}/asset_y`)).toBe("asset:manage");
    expect(requirementFor("POST", `${a}/asset_y/purge`)).toBe("owner");
    expect(requirementFor("POST", `/api/sites/site_x/media/${"a".repeat(64)}/lift-purge`)).toBe(
      "owner",
    );
  });
});
