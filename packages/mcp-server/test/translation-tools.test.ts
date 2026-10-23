/** RFC-0033 §6: agents translate with their own model; the server links, checks and guards. */
import { AuditLog, defaultScopes, PolicyEngine } from "@cloudhal/agent-runtime";
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { createEdition, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { makePng } from "@cloudhal/core-ts/media/fixtures";
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

  it("publishes and unpublishes one translation with update_page (RFC-0035)", async () => {
    const node = (await call("save_translation", spanish())).result.node as Page;
    const published = (
      await call("update_page", {
        siteId: site.id,
        pageId: node.id,
        rev: node.rev,
        status: "published",
      })
    ).result.page as Page;
    expect(published).toMatchObject({ status: "published", title: "Lanzamiento" });
    const back = (
      await call("update_page", {
        siteId: site.id,
        pageId: node.id,
        rev: published.rev,
        status: "draft",
      })
    ).result.page as Page;
    expect(back.status).toBe("draft");
    // A collection whose machine translations need a person's review: refused until reviewed.
    const latest = (await store.getSite(site.id)) as Site;
    await store.updateSite({
      ...latest,
      localization: { ...latest.localization, review: { required: ["pages"] } },
    });
    await expect(
      call("update_page", { siteId: site.id, pageId: node.id, rev: back.rev, status: "published" }),
    ).rejects.toMatchObject({ code: "review_required" });
    expect((await store.getPage(node.id))?.status).toBe("draft");
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

  it("saves an article on a language edition with its image and the edition's terms (RFC-0034 §6)", async () => {
    const { asset } = await store.ingestAsset({
      siteId: site.id,
      bytes: makePng({ width: 8, height: 8 }),
      declaredType: "image/png",
      filename: "cover.png",
      uploadedBy: person,
      source: { kind: "upload" },
      fields: { alt: { en: "A cover" } },
    });
    const post = (await store.listContentEntries(site.id, "posts"))[0] as ContentEntry;
    const withCover = await store.updateContentEntry({
      ...post,
      coverImage: { assetId: asset.id, src: "/x.png", alt: "A cover" },
    });
    const edition = (
      await createEdition(store, { fromSiteId: site.id, name: "日本語", slug: "ja", locale: "ja" })
    ).site;
    const args = {
      siteId: site.id,
      nodeId: withCover.id,
      locale: "ja",
      targetSiteId: edition.id,
      title: "こんにちは、世界",
      slug: "hello-world",
      body: "# こんにちは、世界\n\nこの投稿は `cloudhal init` で作成されました。次の投稿はエージェントに頼みましょう。",
      summary: "この Cloudhal サイトの最初の投稿。",
      engine: "claude-opus-5-5",
    };
    // The edition lacks the article's category and tag: named, so they can be created there.
    await expect(call("save_translation", args)).rejects.toMatchObject({ code: "required_term" });
    const [category, tag] = await Promise.all(
      ["category", "tag"].map((k) => store.getTaxonomyByKey(edition.id, k)),
    );
    await store.createTerm({
      siteId: edition.id,
      taxonomyId: category?.id as string,
      slug: "news",
      status: "active",
      visibility: "public",
      labels: { ja: { name: "ニュース" } },
    });
    await store.createTerm({
      siteId: edition.id,
      taxonomyId: tag?.id as string,
      slug: "cloudhal",
      status: "active",
      visibility: "public",
      labels: { ja: { name: "Cloudhal" } },
    });
    const saved = (await call("save_translation", args)).result.node as ContentEntry;
    expect(saved).toMatchObject({ siteId: edition.id, locale: "ja", status: "draft" });
    expect(saved.translation?.source).toMatchObject({ id: withCover.id, siteId: site.id });
    // The cover is the edition's own copy of the image; the terms are the edition's.
    const cover = await store.getAsset(saved.coverImage?.assetId as string);
    expect(cover?.siteId).toBe(edition.id);
    expect(cover?.sha256).toBe(asset.sha256);
    // The source's English cover alt is not copied: the edition's image alt shows instead.
    expect(saved.coverImage?.alt).toBe("");
    const again = await call("save_translation", { ...args, coverAlt: "表紙" });
    expect((again.result.node as ContentEntry).coverImage?.alt).toBe("表紙");
    const news = await store.getTermBySlug(edition.id, "category", "news");
    expect(saved.terms?.category?.ids).toEqual([news?.id]);
    // A site outside the project is not a target.
    const other = await seedStarterSite(store, { name: "Other", slug: "other" });
    await expect(
      call("save_translation", { ...args, targetSiteId: other.id }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("translates only localized text fields and refuses shared ones (RFC-0041 §5)", async () => {
    const label = (en: string) => ({ en: { label: en } });
    site = await store.updateSite({
      ...site,
      collections: {
        events: {
          labels: { en: { singular: "Event", plural: "Events" } },
          fields: [
            { key: "speaker", type: "text", labels: label("Speaker"), localized: true },
            { key: "agenda", type: "richText", labels: label("Agenda"), localized: true },
            { key: "seats", type: "number", labels: label("Seats"), localized: true },
            { key: "day", type: "date", labels: label("Day"), localized: false },
            { key: "host", type: "text", labels: label("Host"), localized: false },
          ],
        },
      },
    });
    const event = await store.createContentEntry({
      siteId: site.id,
      collection: "events",
      slug: "launch",
      locale: "en",
      status: "draft",
      title: "Launch",
      body: { format: "markdown", value: "Join the newsroom." },
      fields: {
        speaker: "Ada",
        agenda: "Talks about *Cloudhal*",
        seats: 120,
        day: "2026-11-05",
        host: "Hall A",
      },
      tags: [],
      author: person,
    } as never);
    const src = await call("get_translation_source", {
      siteId: site.id,
      nodeId: event.id,
      locale: "es",
    });
    expect(src.result.fields).toEqual({ speaker: "Ada", agenda: "Talks about *Cloudhal*" });
    expect(src.result.sharedFields).toEqual(["day", "host"]);
    expect(src.result.source).not.toHaveProperty("fields");
    expect(src.result.glossary).toEqual(
      expect.arrayContaining([expect.objectContaining({ term: "Cloudhal" })]),
    );

    const base = { siteId: site.id, nodeId: event.id, locale: "es", title: "Lanzamiento" };
    const shared = await call("save_translation", {
      ...base,
      fields: { speaker: "Ada", day: "2027-01-01" },
    }).catch((e) => e as { code: string; details: { issues: { path: string }[] } });
    expect(shared).toMatchObject({ code: "field_not_localized" });
    expect((shared as { details: { issues: { path: string }[] } }).details.issues).toEqual([
      expect.objectContaining({ path: "fields/day", code: "field_not_localized" }),
    ]);
    // Refused before anything was written: the source is not even marked as the original yet.
    expect((await store.getContentEntry(event.id))?.translation).toBeUndefined();

    const saved = (
      await call("save_translation", {
        ...base,
        fields: { speaker: "Ada", agenda: "Charlas sobre *Cloudhal*" },
      })
    ).result.node as ContentEntry;
    // Shared values are never copied; the untranslated localized number falls back to the original.
    expect(saved.fields).toEqual({ speaker: "Ada", agenda: "Charlas sobre *Cloudhal*" });
    const again = (await call("save_translation", { ...base, fields: { speaker: "Ada L." } }))
      .result.node as ContentEntry;
    expect(again.fields).toEqual({ speaker: "Ada L.", agenda: "Charlas sobre *Cloudhal*" });
  });
});
