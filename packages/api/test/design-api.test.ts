/** RFC-0021 §1, §5: the design rules over REST, and Build chat reading them. */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { buildSystemPrompt } from "../src/build-turn.ts";

const human = { kind: "human" as const, id: "user_designer001", name: "Halil" };

describe("design rules API", () => {
  it("reads the theme's and the site's rules, saves the site's with warnings, and conflicts on a stale rev", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      themeDesign: "## Brand\nThe theme.",
    });
    await store.init();
    const site = await seedStarterSite(store, { name: "Rules", slug: "rules" });
    const app = createApi({ store, resolveActor: async () => human });
    const url = `/api/sites/${site.id}/design`;
    const json = { "content-type": "application/json" };
    const first = (await (await app.request(url)).json()) as {
      theme: string;
      site: null;
      rev: number;
    };
    expect(first).toMatchObject({ theme: "## Brand\nThe theme.", site: null, warnings: [] });
    const put = (body: unknown) =>
      app.request(url, { method: "PUT", headers: json, body: JSON.stringify(body) });
    const saved = await put({ rev: first.rev, markdown: "  Use `Hero` everywhere.  " });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { site: string; warnings: string[]; rev: number };
    expect(body.site).toBe("Use `Hero` everywhere.");
    expect(body.warnings[0]).toBe("Not in this site's catalog: Hero");
    expect((await store.getSite(site.id))?.design).toEqual({ markdown: "Use `Hero` everywhere." });
    expect((await put({ rev: first.rev, markdown: "x" })).status).toBe(409);
    expect((await put({ rev: body.rev, markdown: 42 })).status).toBe(400);
    expect((await put({ rev: body.rev, markdown: "x".repeat(24_001) })).status).toBe(400);
    expect((await put({ rev: body.rev, markdown: null })).status).toBe(200);
    expect((await store.getSite(site.id))?.design).toBeUndefined();
  });

  it("gives Build chat the rules before the catalog, cut to their limit", () => {
    const page = { title: "Home", sections: [] } as never;
    const catalog = createCatalog({ name: "blog", major: 1 });
    const prompt = buildSystemPrompt(catalog, page, "en", `## Brand\nWarm.${"x".repeat(9_000)}`);
    expect(prompt).toContain("Design rules for this site (the owner's design preferences");
    expect(prompt).toContain("## Brand\nWarm.");
    expect(prompt.indexOf("Cloudhal design guidance")).toBeLessThan(
      prompt.indexOf("## Components"),
    );
    expect(prompt).not.toContain("x".repeat(8_001));
    expect(buildSystemPrompt(catalog, page, "en")).not.toContain("Design rules for this site");
  });
});
