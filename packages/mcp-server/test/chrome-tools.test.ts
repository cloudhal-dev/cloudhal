/** RFC-0025 §5: the header, footer and brand over MCP — get_chrome, set_chrome, set_brand. */
import { AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_designer01", name: "Designer" };

describe("chrome tools (RFC-0025)", () => {
  let ctx: ToolContext;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let store: SiteGraphStore;
  let siteId: string;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    siteId = (await seedStarterSite(store, { name: "Chrome Site", slug: "chrome" })).id;
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = { store, principal: { actor: agent, scopes: ["*"], mode: "edits" } };
  });

  const run = (name: string, args: Record<string, unknown>) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, audit, confirmed: true });

  it("reads the defaults, the schemas and the menu keys", async () => {
    const got = (await run("get_chrome", { siteId })).result as {
      chrome: object;
      resolved: { header: { layout: string; actions: unknown[] }; footer: { layout: string } };
      schemas: { header: { properties: Record<string, unknown> } };
      menus: string[];
    };
    expect(got.chrome).toEqual({});
    expect(got.resolved.header).toMatchObject({
      layout: "logo-left",
      actions: [{ kind: "search" }],
    });
    expect(got.resolved.footer.layout).toBe("simple");
    expect(Object.keys(got.schemas.header.properties)).toContain("behavior");
    expect(got.menus[0]).toBe("primary");
    expect(byName.get_chrome?.annotations?.readOnlyHint).toBe(true);
    expect(byName.set_chrome?.requiresApproval).toBe(true);
    expect(byName.set_brand?.requiresApproval).toBe(true);
  });

  it("merges header and footer changes, checks them, and removes a part with null", async () => {
    const { rev } = (await run("get_chrome", { siteId })).result as { rev: number };
    const set = await run("set_chrome", {
      siteId,
      rev,
      header: {
        behavior: "sticky",
        actions: [{ kind: "search" }, { kind: "button", label: "Start", href: "/start" }],
      },
      footer: { layout: "minimal", copyright: "© {year} {site}" },
    });
    const saved = set.result as { chrome: Record<string, unknown>; rev: number };
    expect(saved.chrome).toMatchObject({
      header: { behavior: "sticky" },
      footer: { layout: "minimal" },
    });

    await expect(
      run("set_chrome", { siteId, rev: saved.rev, header: { nav: "nowhere" } }),
    ).rejects.toThrow('no menu "nowhere"');
    await expect(
      run("set_chrome", {
        siteId,
        rev: saved.rev,
        header: { actions: [{ kind: "button", label: "No link" }] },
      }),
    ).rejects.toThrow("a button needs label and href");
    await expect(
      run("set_chrome", { siteId, rev: saved.rev, header: { layout: "zigzag" } }),
    ).rejects.toThrow();

    const merged = (
      await run("set_chrome", { siteId, rev: saved.rev, header: { width: "wide" }, footer: null })
    ).result as { chrome: Record<string, unknown> };
    expect(merged.chrome).toEqual({
      header: {
        behavior: "sticky",
        width: "wide",
        actions: [{ kind: "search" }, { kind: "button", label: "Start", href: "/start" }],
      },
    });
  });

  it("turns a logo asset into an image reference and refuses what is not an image of the site", async () => {
    const person = { kind: "human" as const, id: "user_owner000001", name: "Owner" };
    const { asset } = await store.createAsset({
      siteId,
      kind: "image",
      mediaType: "image/svg+xml",
      bytes: 1200,
      sha256: "cd".repeat(32),
      slug: "logo",
      image: { width: 120, height: 32 },
      alt: { en: "Chrome Site" },
      storage: { kind: "external", url: "https://cdn.example.com/logo.svg", checksum: "declared" },
      status: "active",
      uploadedBy: person,
      source: { kind: "link" },
    });
    const { rev } = (await run("get_chrome", { siteId })).result as { rev: number };
    const set = await run("set_brand", {
      siteId,
      rev,
      brand: {
        logo: `asset:${asset.id}`,
        logoHeight: "l",
        social: [{ network: "github", href: "https://github.com/x" }],
      },
    });
    expect(set.result).toMatchObject({ brand: { logo: `asset:${asset.id}` } });
    const site = await store.getSite(siteId);
    expect(site?.brand?.logo).toEqual({
      assetId: asset.id,
      src: "https://cdn.example.com/logo.svg",
      alt: "Chrome Site",
      width: 120,
      height: 32,
    });
    const read = (await run("get_chrome", { siteId })).result as { brand: Record<string, unknown> };
    expect(read.brand).toMatchObject({ logo: `asset:${asset.id}`, logoHeight: "l" });

    await expect(
      run("set_brand", { siteId, rev: site?.rev, brand: { logo: "/logo.png" } }),
    ).rejects.toThrow("an image asset of this site");
    await run("set_brand", { siteId, rev: site?.rev, brand: { logo: null } });
    expect((await store.getSite(siteId))?.brand).toEqual({
      logoHeight: "l",
      social: [{ network: "github", href: "https://github.com/x" }],
    });
  });

  it("lets update_page set a page's own chrome and remove it with null", async () => {
    const page = (await store.listPages(siteId))[0];
    const out = (
      await run("update_page", {
        siteId,
        pageId: page?.id,
        rev: page?.rev,
        chrome: { header: "transparent", footer: "minimal" },
      })
    ).result as { page: { chrome?: unknown; rev: number } };
    expect(out.page.chrome).toEqual({ header: "transparent", footer: "minimal" });
    const cleared = (
      await run("update_page", { siteId, pageId: page?.id, rev: out.page.rev, chrome: null })
    ).result as { page: { chrome?: unknown } };
    expect(cleared.page.chrome).toBeUndefined();
  });
});
