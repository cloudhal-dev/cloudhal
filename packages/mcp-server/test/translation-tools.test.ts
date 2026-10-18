/** RFC-0033 §6: agents translate with their own model; the server links, checks and guards. */
import { AuditLog, defaultScopes, PolicyEngine } from "@cloudhal/agent-runtime";
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const agent = { kind: "agent" as const, id: "agent_translate01", name: "Translator" };
const person = { kind: "human" as const, id: "user_translate001", name: "Editor" };

describe("translation tools", () => {
  let ctx: ToolContext;
  let store: SiteGraphStore;
  let policy: PolicyEngine;
  let audit: AuditLog;
  let site: Site;
  let page: Page;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    site = await seedStarterSite(store, { name: "Translate", slug: "translate" });
    site = await store.updateSite({ ...site, locales: ["en", "es"] });
    await store.glossary.save({
      siteId: site.id,
      entries: [
        { term: "Cloudhal", doNotTranslate: true },
        { term: "newsroom", translations: { es: { text: "redacción" } } },
      ],
    });
    ({ page, site } = await store.createPage(site, {
      siteId: site.id,
      path: "/launch",
      title: "Launch",
      locale: "en",
      status: "published",
      sections: [
        {
          id: "sec_launch0hero",
          kind: "hero",
          heading: "Cloudhal for every newsroom",
          subheading: "Ships in 3 days",
        },
        {
          id: "sec_launch0text",
          kind: "richText",
          format: "markdown",
          body: "Read [the guide](/guide).",
        },
      ],
    }));
    policy = new PolicyEngine(toolPolicies(tools));
    audit = new AuditLog(sql);
    ctx = { store, principal: { actor: agent, scopes: defaultScopes(agent) } };
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const out = await runTool(byName[name] as (typeof tools)[number], args, ctx, {
      policy,
      audit,
      confirmed: false,
    });
    return out as unknown as { result: Record<string, unknown> };
  };
  const spanish = (over: Record<string, unknown> = {}) => ({
    siteId: site.id,
    nodeId: page.id,
    locale: "es",
    title: "Lanzamiento",
    path: "/lanzamiento",
    sections: [
      {
        id: "sec_launch0hero",
        kind: "hero",
        heading: "Cloudhal para cada redacción",
        subheading: "Listo en 3 días",
      },
      {
        id: "sec_launch0text",
        kind: "richText",
        format: "markdown",
        body: "Lee [la guía](/guide).",
      },
    ],
    engine: "claude-opus-5-5",
    ...over,
  });

  it("hands over the source with its glossary terms, and saves a checked draft linked to it", async () => {
    const src = await call("get_translation_source", {
      siteId: site.id,
      nodeId: page.id,
      locale: "es",
    });
    expect(src.result.glossary).toEqual([
      { term: "Cloudhal", doNotTranslate: true },
      { term: "newsroom", translation: "redacción" },
    ]);
    const saved = await call("save_translation", spanish());
    const node = saved.result.node as Page;
    expect(node).toMatchObject({ locale: "es", path: "/lanzamiento", status: "draft" });
    expect(node.translation).toMatchObject({
      group: page.id,
      method: "machine",
      layout: "linked",
      source: { id: page.id, locale: "en" },
      provenance: {
        engine: "claude-opus-5-5",
        checks: ["structure", "links", "numbers", "glossary", "length"],
      },
    });
    // The source became the group's original, and the draft is fresh against it.
    expect((await store.getPage(page.id))?.translation).toEqual({
      group: page.id,
      method: "original",
    });
    const list = await call("list_translations", { siteId: site.id, nodeId: node.id });
    const members = (list.result.group as { members: Array<{ locale: string; stale: boolean }> })
      .members;
    expect(members.map((m) => [m.locale, m.stale])).toEqual([
      ["en", false],
      ["es", false],
    ]);
    // Translating again updates the same machine draft.
    const again = await call("save_translation", spanish({ title: "El lanzamiento" }));
    expect((again.result.node as Page).id).toBe(node.id);
  });

  it("lists stale translations and rebuilds a linked one on the source's new layout", async () => {
    const node = (await call("save_translation", spanish())).result.node as Page;
    expect((await call("list_stale_translations", { siteId: site.id })).result.stale).toEqual([]);
    // The source gains a section and drops one.
    const source = (await store.getPage(page.id)) as Page;
    await store.updatePage({
      ...source,
      sections: [
        source.sections[0] as Page["sections"][number],
        { id: "sec_launch0more", kind: "hero", heading: "Now in Spanish" },
      ] as Page["sections"],
    });
    const stale = (await call("list_stale_translations", { siteId: site.id, locale: "es" })).result
      .stale as Array<{ id: string; locale: string }>;
    expect(stale.map((m) => [m.id, m.locale])).toEqual([[node.id, "es"]]);
    const src = await call("get_translation_source", {
      siteId: site.id,
      nodeId: page.id,
      locale: "es",
    });
    expect(src.result.stale).toBe(true);
    const layout = src.result.layout as {
      sections: Page["sections"];
      untranslated: string[];
      removed: string[];
    };
    expect(layout.untranslated).toEqual(["sec_launch0more"]);
    expect(layout.removed).toEqual(["sec_launch0text"]);
    // The kept section keeps its Spanish text.
    expect(layout.sections[0]).toMatchObject({ heading: "Cloudhal para cada redacción" });
  });

  it("records failing checks, and the store keeps such a draft from being published", async () => {
    const saved = await call(
      "save_translation",
      spanish({
        sections: [
          {
            id: "sec_launch0hero",
            kind: "hero",
            heading: "Para cada sala de prensa",
            subheading: "Listo pronto",
          },
          { id: "sec_launch0text", kind: "richText", format: "markdown", body: "Lee la guía." },
        ],
      }),
    );
    const failed = (saved.result.checks as Array<{ name: string; ok: boolean }>).filter(
      (c) => !c.ok,
    );
    expect(failed.map((c) => c.name)).toEqual(["links", "numbers", "glossary"]);
    const node = saved.result.node as Page;
    await expect(store.updatePage({ ...node, status: "published" })).rejects.toMatchObject({
      code: "invalid_translation",
    });
  });

  it("never overwrites a translation a person wrote or reviewed", async () => {
    const node = (await call("save_translation", spanish())).result.node as Page;
    await store.updatePage({
      ...node,
      translation: {
        ...(node.translation as NonNullable<Page["translation"]>),
        method: "machine-reviewed",
        review: { by: person, at: "2026-10-18T12:00:00Z" },
      },
    });
    await expect(call("save_translation", spanish({ title: "Otro" }))).rejects.toMatchObject({
      code: "denied",
    });
  });

  it("translates entries too, and refuses a locale the site does not have", async () => {
    const post = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "hello",
      locale: "en",
      status: "draft",
      title: "Hello",
      summary: "A greeting",
      body: { format: "markdown", value: "Hello from Cloudhal." },
      fields: {},
      tags: [],
      author: person,
    });
    const saved = await call("save_translation", {
      siteId: site.id,
      nodeId: post.id,
      locale: "es",
      title: "Hola",
      slug: "hola",
      body: "Hola desde Cloudhal.",
      summary: "Un saludo",
    });
    expect(saved.result.node).toMatchObject({ slug: "hola", locale: "es", collection: "posts" });
    expect((saved.result.node as ContentEntry).author).toMatchObject({ kind: "agent" });
    await expect(
      call("get_translation_source", { siteId: site.id, nodeId: post.id, locale: "fr" }),
    ).rejects.toMatchObject({ code: "locale_not_enabled" });
  });
});
