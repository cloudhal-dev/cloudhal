/**
 * RFC-0005 I15: REST is default-deny. Every route the app mounts declares its requirement in
 * `ROUTE_SCOPES`; this test fails for any route without one (and for declarations without a route).
 */
import { AnalyticsService } from "@cloudhal/analytics/service";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
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
    analytics: new AnalyticsService({ sql, store: "sql", live: new SqlAnalytics(sql) }),
    comments: { store: new SqlCommentStore(sql) },
    schedules: { store: new SqlScheduleStore(sql) },
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
    // "Allow analytics" ({addScopes}) is the same PATCH: own keys, the service checks the rest.
    expect(requirementFor("PATCH", "/api/agent-keys/key_x")).toBe("member");
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
    // RFC-0014 phase 1c: the editors' draft previews only read.
    expect(requirementFor("POST", "/api/sites/site_x/entries/entry_y/preview")).toBe(
      "content:read",
    );
    expect(requirementFor("POST", "/api/sites/site_x/pages/page_y/preview")).toBe("content:read");
    expect(requirementFor("GET", "/api/sites/site_x/snapshots/snap_y/nodes/entry_z")).toBe(
      "content:read",
    );
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
    // RFC-0006 §9.2: analytics reads for Authors and above; settings for Administrators; the
    // backfill, status and export for the operator.
    const an = "/api/sites/site_x/analytics";
    for (const read of [
      "status",
      "summary",
      "series",
      "top/node",
      "vitals",
      "renders/errors",
      "nodes/entry_y00001",
      "export",
      "settings",
    ])
      expect(requirementFor("GET", `${an}/${read}`), read).toBe("analytics:read");
    expect(requirementFor("PUT", `${an}/settings`)).toBe("site:settings");
    expect(requirementFor("POST", `${an}/settings`)).toBeUndefined();
    expect(requirementFor("DELETE", `${an}/settings`)).toBeUndefined();
    expect(requirementFor("GET", `${an}/raw`)).toBeUndefined();
    expect(requirementFor("POST", "/api/admin/sites/site_x/analytics/rollup")).toBe("deploy-token");
    expect(requirementFor("GET", "/api/admin/sites/site_x/analytics/status")).toBe("deploy-token");
    expect(requirementFor("GET", "/api/admin/sites/site_x/analytics/export")).toBe("deploy-token");
  });

  it("reader comments (RFC-0007 §12): reads, own moderation, person-only commenter data", () => {
    const s = "/api/sites/site_x";
    const cm = `${s}/comments`;
    const cases: [string, string, string][] = [
      ["GET", cm, "comments:read"],
      ["GET", `${cm}/summary`, "comments:read"],
      ["GET", `${cm}/cmt_abcdef123456`, "comments:read"],
      ["GET", `${cm}/settings`, "comments:read"],
      ["GET", `${s}/comment-threads/entry_y00001`, "comments:read"],
      // literal segments win over :commentId
      ["GET", `${cm}/reports`, "comments:moderate:own"],
      ["GET", `${cm}/export`, "comments:moderate"],
      ["POST", `${cm}/moderate`, "comments:moderate:own"],
      ["POST", `${cm}/reports/rep_x/resolve`, "comments:moderate:own"],
      ["PATCH", `${cm}/cmt_abcdef123456/labels`, "comments:moderate:own"],
      ["PUT", `${s}/comment-threads/entry_y00001`, "comments:moderate:own"],
      ["POST", `${cm}/cmt_abcdef123456/replies`, "comments:reply:own"],
      ["PATCH", `${cm}/cmt_abcdef123456`, "comments:reply:own"],
      ["DELETE", `${cm}/cmt_abcdef123456`, "comments:moderate"],
      ["POST", `${cm}/purge-site-cache`, "comments:moderate"],
      ["GET", `${s}/comment-bans`, "comments:moderate"],
      ["POST", `${s}/comment-bans`, "comments:moderate"],
      ["DELETE", `${s}/comment-bans/ban_x`, "comments:moderate"],
      ["POST", `${cm}/erase`, "commenters:data"],
      ["POST", `${s}/commenters/lookup`, "commenters:data"],
      ["GET", `${s}/commenters/cmr_x`, "commenters:data"],
      ["POST", `${s}/commenters/cmr_x/export`, "commenters:data"],
      ["POST", `${s}/commenters/cmr_x/erase`, "commenters:data"],
      ["PUT", `${cm}/settings`, "site:settings"],
      ["PUT", `${cm}/settings/secrets/turnstile-secret`, "site:settings"],
      ["DELETE", `${cm}/settings/secrets/turnstile-secret`, "site:settings"],
    ];
    for (const [m, p, req] of cases) expect(requirementFor(m, p), `${m} ${p}`).toBe(req);
    for (const [m, p] of [
      ["POST", cm],
      ["PUT", `${cm}/cmt_abcdef123456`],
      ["DELETE", `${s}/commenters/cmr_x`],
      // no lookup by query string: an email never goes in a URL
      ["GET", `${s}/commenters`],
      ["POST", `${cm}/settings`],
      ["GET", `${cm}/cmt_abcdef123456/history`],
    ] as const)
      expect(requirementFor(m, p), `${m} ${p}`).toBeUndefined();
  });
});
