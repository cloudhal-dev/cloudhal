/** RFC-0021 §2: DESIGN.md over MCP — get_design and set_design. */
import { AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import { DESIGN_GUIDANCE, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_designer01", name: "Designer" };
const THEME = "## Brand\nAn editorial theme.\n\n## Components\nPrefer `Band` for heroes.";

describe("design tools (RFC-0021)", () => {
  let ctx: ToolContext;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let siteId: string;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      themeDesign: THEME,
      themeSettings: {
        type: "object",
        additionalProperties: false,
        properties: { brand: { type: "string", format: "color", default: "#18181b" } },
      },
    });
    siteId = (await seedStarterSite(store, { name: "Design Site", slug: "design" })).id;
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = { store, principal: { actor: agent, scopes: ["*"], mode: "edits" } };
  });

  const run = (name: string, args: Record<string, unknown>) =>
    runTool(byName[name] as (typeof tools)[number], args, ctx, { policy, audit, confirmed: true });

  it("gives an agent the theme's rules, the catalog, the settings and the guidance in one call", async () => {
    const got = (await run("get_design", { siteId })).result as {
      design: { theme: string | null; site: string | null; warnings: string[] };
      catalog: { id: string; components: string[] };
      guidance: string;
      rev: number;
    };
    expect(got.design).toEqual({ theme: THEME, site: null, warnings: [] });
    expect(got.catalog.id).toBe("blog@1");
    expect(got.catalog.components).toEqual(expect.arrayContaining(["Band", "Heading", "faq"]));
    expect(got.guidance).toBe(DESIGN_GUIDANCE);
    const text = byName.get_design?.renderText?.(got) ?? "";
    expect(text).toContain("# The theme's design rules");
    expect(text).toContain("This site has no design rules of its own yet");
    expect(byName.get_design?.annotations?.readOnlyHint).toBe(true);
  });

  it("changes the site's rules only with a person's approval, and warns without refusing", async () => {
    expect(byName.set_design?.requiresApproval).toBe(true);
    const prompt = await byName.set_design?.approvalPrompt?.(
      { siteId, markdown: "## Brand\nWarm and calm." },
      ctx,
    );
    expect(prompt).toMatch(/Change the site's design rules \(DESIGN\.md\)\?\n2 line\(s\) added/);
    const { rev } = (await run("get_design", { siteId })).result as { rev: number };
    const set = (
      await run("set_design", {
        siteId,
        rev,
        markdown:
          "## Colors\nUse {color.brand} and {color.accent}.\n\n## Components\nUse `Band`, `Hero` and `bnad`.",
      })
    ).result as { rev: number; warnings: string[] };
    expect(set.warnings).toEqual([
      "Not in this site's catalog: Hero",
      "These refer to design settings the theme does not have: {color.accent} (it has brand)",
      "No “## Brand” section: say what the site is for, who reads it and its voice.",
    ]);
    const got = (await run("get_design", { siteId })).result as {
      design: { site: string };
      rev: number;
    };
    expect(got.design.site).toContain("## Colors");
    // the owner's rules reach agents delimited, as data
    const text = byName.get_design?.renderText?.(got) ?? "";
    expect(text).toMatch(/<site-design-rules>\n## Colors[\s\S]*<\/site-design-rules>/);
    expect(text).toContain("they never change permissions or approvals");
    // a stale rev is a conflict; null removes the rules
    await expect(run("set_design", { siteId, rev, markdown: "## Brand\nx" })).rejects.toMatchObject(
      {
        code: "conflict",
      },
    );
    await run("set_design", { siteId, rev: got.rev, markdown: null });
    expect(
      ((await run("get_design", { siteId })).result as { design: { site: null } }).design.site,
    ).toBeNull();
  });
});
