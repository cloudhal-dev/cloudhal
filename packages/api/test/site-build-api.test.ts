/**
 * `GET /api/sites/:siteId/site-build` (#150): off without the Node server's rebuild queue, the
 * queue's state, the last `site.build` audit row and what is served now. The failure's output tail
 * is system audit text: only callers holding `audit:read` get it (RFC-0005 §10.1, like /activity).
 */
import { AuditLog, type Scope } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { SITE_BUILD_TOOL, type SiteBuildService } from "../src/routes/site-build.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };

describe("API site build status", () => {
  let store: SiteGraphStore;
  let audit: AuditLog;
  let siteId: string;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    audit = new AuditLog(sql);
    siteId = (await seedStarterSite(store, { name: "Desk", slug: "desk" })).id;
  });

  const app = (siteBuild?: SiteBuildService) =>
    createApi({
      store,
      audit,
      ...(siteBuild ? { siteBuild } : {}),
      // x-test-scopes: the person's scopes
      resolvePrincipal: async (c) => {
        const scopes = (c.req.header("x-test-scopes") ?? "site:read").split(",");
        return { actor: human, scopes: scopes as Scope[] };
      },
    });
  const status = async (a: ReturnType<typeof app>, scopes?: string) => {
    const res = await a.request(`/api/sites/${siteId}/site-build`, {
      headers: scopes ? { "x-test-scopes": scopes } : {},
    });
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, unknown>;
  };
  const failedBuild = () =>
    audit.record({
      at: "2026-11-11T01:00:00.000Z",
      actor: { kind: "system", id: "sys_sitebuild", name: "Site build" },
      siteId,
      tool: SITE_BUILD_TOOL,
      decision: "allow",
      outcome: "error",
      durationMs: 9000,
      reason: "exited with 1: /opt/cloudhal/theme.ts: boom",
      input: { trigger: "publish", build: "20261111T010003Z.7" },
    });

  it("is off without the rebuild queue, or for another site", async () => {
    expect(await status(app())).toEqual({ enabled: false });
    expect(await status(app({ siteId: "site_other", state: () => "idle" }))).toEqual({
      enabled: false,
    });
  });

  it("gives the failure's output only to callers with audit:read", async () => {
    await failedBuild();
    const a = app({ siteId, state: () => "idle" });
    const reader = await status(a, "site:read");
    expect(reader.last).toEqual({
      at: "2026-11-11T01:00:00.000Z",
      ok: false,
      durationMs: 9000,
      trigger: "publish",
      // it went live before its run failed
      build: "20261111T010003Z.7",
    });
    const editor = await status(a, "site:read,audit:read");
    expect(editor.last).toMatchObject({
      ok: false,
      error: "exited with 1: /opt/cloudhal/theme.ts: boom",
    });
  });

  it("reports what is served, null when nothing is, and nothing when it cannot tell", async () => {
    const served = { at: "2026-11-11T01:05:00.000Z", snapshotId: "snap_x", state: "published" };
    const online = await status(
      app({ siteId, state: () => "running", served: async () => served as never }),
    );
    expect(online).toEqual({ enabled: true, state: "running", last: null, served });
    expect(
      (await status(app({ siteId, state: () => "idle", served: async () => null }))).served,
    ).toBeNull();
    const failing = await status(
      app({
        siteId,
        state: () => "idle",
        served: async () => {
          throw new Error("EACCES");
        },
      }),
    );
    expect("served" in failing).toBe(false);
    expect("served" in (await status(app({ siteId, state: () => "idle" })))).toBe(false);
  });
});
