/** RFC-0021 §4: render_page — screenshots and checks from a browser, over a fake one here. */
import { AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type PageRenderer,
  RENDER_CHECK_IDS,
  RENDER_CHECK_SCRIPT,
  RenderLimiter,
} from "../src/render.ts";
import { createCloudhalMcpServer } from "../src/server.ts";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const def = tools.find((t) => t.name === "render_page") as (typeof tools)[number];
const agent = { kind: "agent" as const, id: "agent_renderer01", name: "Renderer" };
const SECRET = "render-preview-secret-at-least-32-bytes-long";

/** A browser that reports a 2,000 px page and a contrast problem on phones. */
function fakeRenderer(log: string[], options: { hang?: boolean } = {}): PageRenderer {
  return {
    async session() {
      log.push("session");
      return {
        async open(url, viewport) {
          if (options.hang) await new Promise(() => {});
          log.push(
            `open ${viewport.width}x${viewport.height} ${viewport.scheme}${viewport.reducedMotion === false ? " full" : ""} ${url}`,
          );
          let y = 0;
          return {
            async evaluate<T>(expression: string): Promise<T> {
              if (expression === RENDER_CHECK_SCRIPT)
                return RENDER_CHECK_IDS.map((id) =>
                  id === "contrast" && viewport.width === 390
                    ? { id, count: 2, examples: ["section sec_hero p — 2.1:1, needs 4.5:1"] }
                    : id === "contrast" && viewport.scheme === "dark"
                      ? { id, count: 1, examples: ["section sec_cta a — 3.2:1, needs 4.5:1"] }
                      : { id, count: 0, examples: [] },
                ) as T;
              const scroll = /scrollTo\(0, (\d+)\)/.exec(expression);
              if (scroll) {
                y = Number(scroll[1]);
                return y as T;
              }
              return 2000 as T;
            },
            async screenshot() {
              return new Uint8Array([0xff, 0xd8, viewport.width % 256, y % 256]);
            },
            async close() {
              log.push(`close ${viewport.width}`);
            },
          };
        },
        async close() {
          log.push("session closed");
        },
      };
    },
  };
}

describe("render_page (RFC-0021 §4)", () => {
  let store: SiteGraphStore;
  let siteId: string;
  let pageId: string;
  let policy: PolicyEngine;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const seeded = await seedStarterSite(store, { name: "Render", slug: "render" });
    await store.updateSite({
      ...seeded,
      domains: [{ hostname: "news.example.com", primary: true }],
    });
    siteId = seeded.id;
    pageId = ((await store.listPages(siteId)).find((p) => p.path === "/about") as { id: string })
      .id;
    policy = new PolicyEngine(toolPolicies(tools));
  });

  const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({
    store,
    principal: { actor: agent, scopes: ["*"] },
    previewSecret: SECRET,
    ...extra,
  });

  it("is read-only, needs preview:create, and says when there is no browser", async () => {
    expect(def.scopes).toEqual(["preview:create"]);
    expect(def.annotations.readOnlyHint).toBe(true);
    await expect(runTool(def, { siteId, pageId }, ctx(), { policy })).rejects.toMatchObject({
      code: "render_unavailable",
      message: expect.stringContaining("https://news.example.com/about?cloudhal-preview="),
    });
  });

  it("opens the signed preview link at each width and pages down a viewport at a time", async () => {
    const log: string[] = [];
    const out = await runTool(
      def,
      { siteId, pageId },
      ctx({ render: { renderer: fakeRenderer(log), limiter: new RenderLimiter() } }),
      { policy },
    );
    const result = out.result as {
      url: string;
      widths: { width: number; height: number; truncated: boolean; images: number }[];
      checks: { id: string; ok: boolean; count: number; widths: number[]; examples: string[] }[];
      images: { width: number; jpegs: Uint8Array[] }[];
    };
    expect(new URL(result.url).pathname).toBe("/about");
    expect(log[0]).toBe("session");
    expect(log[1]).toMatch(
      /^open 1440x900 light https:\/\/news\.example\.com\/about\?cloudhal-preview=/,
    );
    expect(log).toContain("close 390");
    expect(log.at(-1)).toBe("session closed");
    expect(result.widths).toEqual([
      { width: 1440, height: 2000, truncated: false, images: 3 },
      { width: 390, height: 2000, truncated: false, images: 3 },
    ]);
    // the last screenshot ends at the page's end
    expect(result.images[0]?.jpegs.map((j) => j[3])).toEqual([0, 900 % 256, 1100 % 256]);
    const contrast = result.checks.find((c) => c.id === "contrast");
    expect(contrast).toEqual({
      id: "contrast",
      ok: false,
      count: 2,
      widths: [390],
      examples: ["@390: section sec_hero p — 2.1:1, needs 4.5:1"],
    });
    expect(result.checks.filter((c) => c.ok)).toHaveLength(RENDER_CHECK_IDS.length - 1);

    const { content, structured } = def.renderContent?.(result) ?? { content: [], structured: {} };
    expect(structured).not.toHaveProperty("images");
    expect(content[0]).toMatchObject({ type: "text" });
    const text = (content[0] as { text: string }).text;
    expect(text).toContain(
      "Rendered /about (the draft) at 1440, 390 px, light scheme, motion static.",
    );
    expect(text).toContain("✗ contrast (text contrast): 2 at 390 px");
    expect(content.filter((c) => c.type === "image")).toHaveLength(6);
    expect(content[2]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
  });

  it("renders in the dark scheme when asked (RFC-0023)", async () => {
    const log: string[] = [];
    const out = await runTool(
      def,
      { siteId, pageId, widths: [390], fullPage: false, scheme: "dark" },
      ctx({ render: { renderer: fakeRenderer(log), limiter: new RenderLimiter() } }),
      { policy },
    );
    expect(log[1]).toMatch(/^open 390x\d+ dark /);
    expect((out.result as { scheme: string }).scheme).toBe("dark");
  });

  it("checks a dark or automatic site's contrast in the other scheme too (RFC-0023)", async () => {
    const site = await store.getSite(siteId);
    if (!site) throw new Error("no site");
    await store.updateSite({ ...site, theme: { ...site.theme, config: { mode: "auto" } } });
    const log: string[] = [];
    const render = { renderer: fakeRenderer(log), limiter: new RenderLimiter() };
    const out = await runTool(
      def,
      { siteId, pageId, widths: [1440], fullPage: false },
      ctx({ render }),
      {
        policy,
      },
    );
    expect(log.filter((l) => l.startsWith("open"))).toEqual([
      expect.stringMatching(/^open 1440x900 light /),
      expect.stringMatching(/^open 1440x900 dark /),
    ]);
    const contrast = (
      out.result as { checks: { id: string; ok: boolean; examples: string[] }[] }
    ).checks.find((c) => c.id === "contrast");
    expect(contrast).toMatchObject({
      ok: false,
      examples: ["dark @1440: section sec_cta a — 3.2:1, needs 4.5:1"],
    });

    // a dark site renders dark by default and checks light as well
    const now = await store.getSite(siteId);
    if (!now) throw new Error("no site");
    await store.updateSite({ ...now, theme: { ...now.theme, config: { mode: "dark" } } });
    const dark = await runTool(
      def,
      { siteId, pageId, widths: [1440], fullPage: false },
      ctx({ render }),
      {
        policy,
      },
    );
    expect((dark.result as { scheme: string }).scheme).toBe("dark");
    expect(log.filter((l) => l.startsWith("open")).length).toBe(3);
  });

  it("renders with reduced motion unless motion full is asked for (RFC-0024)", async () => {
    const log: string[] = [];
    const render = { renderer: fakeRenderer(log), limiter: new RenderLimiter() };
    const still = await runTool(
      def,
      { siteId, pageId, widths: [390], fullPage: false },
      ctx({ render }),
      {
        policy,
      },
    );
    expect((still.result as { motion: string }).motion).toBe("static");
    const full = await runTool(
      def,
      { siteId, pageId, widths: [390], fullPage: false, motion: "full" },
      ctx({ render }),
      { policy },
    );
    expect((full.result as { motion: string }).motion).toBe("full");
    expect(log.filter((l) => l.startsWith("open"))).toEqual([
      expect.stringMatching(/^open 390x\d+ light http/),
      expect.stringMatching(/^open 390x\d+ light full http/),
    ]);
  });

  it("is rate-limited per key, and a browser that hangs fails within the timeout", async () => {
    const log: string[] = [];
    const limiter = new RenderLimiter({ perKeyPerMinute: 1 });
    const render = { renderer: fakeRenderer(log), limiter };
    await runTool(def, { siteId, pageId, widths: [390], fullPage: false }, ctx({ render }), {
      policy,
    });
    await expect(
      runTool(def, { siteId, pageId }, ctx({ render }), { policy }),
    ).rejects.toMatchObject({ code: "render_limited" });
    expect(log.find((l) => l.startsWith("open 390"))).toContain(" light ");

    const hung = { renderer: fakeRenderer(log, { hang: true }), timeoutMs: 50 };
    await expect(
      runTool(def, { siteId, pageId }, ctx({ render: hung }), { policy }),
    ).rejects.toMatchObject({ code: "render_failed", message: expect.stringContaining("0.05 s") });
    expect(log.at(-1)).toBe("session closed");
  });

  it("reaches MCP clients as text plus JPEG image content, structured without the bytes", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const server = createCloudhalMcpServer({
      store,
      principal: { actor: agent, scopes: ["*"] },
      audit: new AuditLog(sql),
      previewSecret: SECRET,
      render: { renderer: fakeRenderer([]), limiter: new RenderLimiter() },
      stateKey: "render-test-key-at-least-thirty-two-bytes-long",
    });
    const client = new Client({ name: "render", version: "1.0.0" }, { capabilities: {} });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    const res = await client.callTool({
      name: "render_page",
      arguments: { siteId, pageId, widths: [768] },
    });
    expect(res.isError).toBeFalsy();
    const content = res.content as { type: string; mimeType?: string; data?: string }[];
    expect(content.map((c) => c.type)).toEqual(["text", "text", "image", "text", "image"]);
    expect(content[2]?.data).toBe(btoa(String.fromCharCode(0xff, 0xd8, 768 % 256, 0)));
    expect(res.structuredContent).toMatchObject({
      widths: [{ width: 768, height: 2000, truncated: false, images: 2 }],
    });
    expect(res.structuredContent).not.toHaveProperty("images");
  });
});
