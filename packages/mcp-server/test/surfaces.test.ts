/** RFC-0020 §6: an agent builds a page surface op by op over MCP. */
import { AuditLog, defaultScopes, PolicyEngine } from "@cloudhal/agent-runtime";
import type { Page, SurfaceSection } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, ToolError, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_builder01", name: "Builder" };

describe("surface tools", () => {
  let ctx: ToolContext;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let siteId: string;
  let home: Page;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    siteId = (await seedStarterSite(store, { name: "Build Site", slug: "build" })).id;
    home = (await store.listPages(siteId)).find((p) => p.path === "/") as Page;
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = {
      store,
      principal: { actor: agent, scopes: defaultScopes(agent) },
      previewBaseUrl: "http://localhost:4321",
    };
  });

  const call = async (name: string, args: Record<string, unknown>) =>
    (await runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, audit })).result;

  it("get_catalog returns the theme's catalog as instructions", async () => {
    const r = (await call("get_catalog", { siteId })) as {
      catalog: string;
      components: string[];
      instructions: string;
    };
    expect(r.catalog).toBe("blog@1");
    expect(r.components).toEqual(
      expect.arrayContaining(["Stack", "Heading", "Tabs", "callout", "faq"]),
    );
    expect(r.instructions).toContain("## Components");
  });

  it("patch_draft builds a surface over calls, repairs and reports, and snapshots", async () => {
    const first = (await call("patch_draft", {
      siteId,
      pageId: home.id,
      rev: home.rev,
      ops: [
        {
          op: "add",
          path: "/sections/-",
          value: {
            id: "sec_pricing0001",
            kind: "surface",
            catalog: "blog@1",
            components: [{ id: "root", component: "stack", children: [] }],
            data: { headline: "Pricing" },
          },
        },
      ],
    })) as { page: Page; repairs: string[]; snapshot: { id: string } };
    expect(first.repairs).toEqual(['root: component "stack" → "Stack"']);
    expect(first.snapshot.id).toMatch(/^snap_/);
    const at = first.page.sections.length - 1;
    const second = (await call("patch_draft", {
      siteId,
      pageId: home.id,
      rev: first.page.rev,
      ops: [
        {
          op: "add",
          path: `/sections/${at}/components/-`,
          value: {
            id: "title",
            component: "Heading",
            props: { text: { path: "/headline" }, level: 2 },
          },
        },
        { op: "add", path: `/sections/${at}/components/0/children/-`, value: "title" },
      ],
    })) as { page: Page; repairs: string[] };
    const s = second.page.sections[at] as SurfaceSection;
    expect(s.components.map((c) => c.id)).toEqual(["root", "title"]);
    expect(s.components[0]?.children).toEqual(["title"]);
    expect(second.page.status).toBe(home.status);
  });

  it("answers invalid_surface with JSON Pointers, and conflicts on a stale rev", async () => {
    const bad = call("patch_draft", {
      siteId,
      pageId: home.id,
      rev: home.rev,
      ops: [
        {
          op: "add",
          path: "/sections/-",
          value: {
            id: "sec_broken00001",
            kind: "surface",
            catalog: "blog@1",
            components: [{ id: "root", component: "Heading", props: { level: 7 } }],
          },
        },
      ],
    });
    await expect(bad).rejects.toBeInstanceOf(ToolError);
    await expect(bad).rejects.toMatchObject({
      code: "invalid_surface",
      details: {
        // `text` was filled from the example (a repair); the level cannot be guessed.
        issues: [
          {
            code: "VALIDATION_FAILED",
            path: `/sections/${home.sections.length}/components/0/props/level`,
            message: "at most 4",
          },
        ],
      },
    });
    await expect(
      call("patch_draft", {
        siteId,
        pageId: home.id,
        rev: home.rev + 5,
        ops: [{ op: "replace", path: "/title", value: "x" }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      call("patch_draft", {
        siteId,
        pageId: home.id,
        rev: home.rev,
        ops: [{ op: "replace", path: "/status", value: "published" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_surface" });
  });
});

describe("build observer (RFC-0020 §6)", () => {
  it("patch_draft reports applied changes and refused builds", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const siteId = (await seedStarterSite(store, { name: "Watched", slug: "watched" })).id;
    const home = (await store.listPages(siteId)).find((p) => p.path === "/") as Page;
    const seen: string[] = [];
    const ctx: ToolContext = {
      store,
      principal: { actor: agent, scopes: defaultScopes(agent) },
      build: {
        pageChanged: (c) => {
          seen.push(`changed ${c.tool} rev ${c.page.rev} repairs ${c.repairs?.length}`);
        },
        // An observer may be async (a Durable Object round trip): the tool waits for it.
        patchRejected: async (r) => {
          await Promise.resolve();
          seen.push(`rejected ${r.tool} ${r.issues.length}`);
        },
      },
    };
    const policy = new PolicyEngine(toolPolicies(tools));
    const audit = new AuditLog(sql);
    const run = (args: Record<string, unknown>) =>
      runTool(byName.patch_draft as (typeof tools)[number], args, ctx, { policy, audit });
    await run({
      siteId,
      pageId: home.id,
      rev: home.rev,
      ops: [{ op: "replace", path: "/title", value: "Live" }],
    });
    await expect(
      run({
        siteId,
        pageId: home.id,
        rev: home.rev + 1,
        ops: [
          {
            op: "add",
            path: "/sections/-",
            value: {
              id: "sec_x00000001",
              kind: "surface",
              catalog: "blog@1",
              components: [{ id: "root", component: "Hologram" }],
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_surface" });
    expect(seen).toEqual([
      `changed patch_draft rev ${home.rev + 1} repairs 0`,
      "rejected patch_draft 1",
    ]);
  });
});
