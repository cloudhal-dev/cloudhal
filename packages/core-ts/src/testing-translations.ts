/**
 * RFC-0033 / ADR-0035 in the store: locales a site has (invariant 1), translation links (2–3),
 * staleness (4), the review gate (5) and provenance (6). Part of the shared suite, so it runs on
 * SQLite and Miniflare D1.
 */
import type { Actor, Page, Site, Translation } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const agent: Actor = { kind: "agent", id: "agent_01HZX8K3Q9AG" };
const AT = "2026-10-18T10:00:00Z";
const provenance = { engine: "workers-ai", score: 88, checks: ["links"], at: AT };

export function translationsSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`translation groups in the store: ${label}`, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let store: SiteGraphStore;
    let site: Site;
    let original: Page;

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      await dropAllTables(sql);
      store = new SiteGraphStore({ sql, blobs });
      await store.init();
      site = await seedStarterSite(store, { name: "Diller", slug: "diller" });
      site = await store.updateSite({ ...site, locales: ["en", "es", "de"] });
      ({ page: original, site } = await store.createPage(site, {
        id: "page_01HZX8K3QORG",
        siteId: site.id,
        path: "/launch",
        title: "Launch",
        locale: "en",
        status: "published",
        sections: [{ id: "sec_01HZX8K3QHRO", kind: "hero", heading: "Ship it" }],
        translation: { group: "page_01HZX8K3QORG", method: "original" },
      }));
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const sourceOf = async (page: Page) => {
      const group = await store.translationGroup(site, page.translation?.group ?? page.id);
      const member = group.members.find((m) => m.id === page.id);
      return { id: page.id, locale: page.locale, rev: page.rev, hash: member?.hash as string };
    };
    const translate = async (
      locale: string,
      over: { [K in keyof Translation]?: Translation[K] | undefined } = {},
      status: Page["status"] = "draft",
    ) =>
      (
        await store.createPage(site, {
          siteId: site.id,
          path: "/launch",
          title: `Launch (${locale})`,
          locale,
          status,
          sections: [{ id: "sec_01HZX8K3QHRO", kind: "hero", heading: `Ship it (${locale})` }],
          translation: {
            group: original.id,
            method: "machine",
            layout: "linked",
            source: await sourceOf(original),
            provenance,
            ...over,
          } as Translation,
        })
      ).page;

    it("keeps pages and entries to the site's locales (invariant 1)", async () => {
      await expect(
        store.createPage(site, {
          siteId: site.id,
          path: "/hola",
          title: "Hola",
          locale: "fr",
          status: "draft",
          sections: [],
        }),
      ).rejects.toMatchObject({ code: "locale_not_enabled" });
    });

    it("lists the group with each member's hash, and marks a translation stale when its source changes", async () => {
      const es = await translate("es");
      let group = await store.translationGroup(site, original.id);
      expect(group.members.map((m) => [m.locale, m.method, m.stale])).toEqual([
        ["en", "original", false],
        ["es", "machine", false],
      ]);
      original = await store.updatePage({
        ...((await store.getPage(original.id)) as Page),
        title: "Launch day",
      });
      group = await store.translationGroup(site, original.id);
      expect(group.members.find((m) => m.id === es.id)?.stale).toBe(true);
      // Re-translating records the new source: fresh again.
      await store.updatePage({
        ...((await store.getPage(es.id)) as Page),
        translation: { ...(es.translation as Translation), source: await sourceOf(original) },
      });
      group = await store.translationGroup(site, original.id);
      expect(group.members.find((m) => m.id === es.id)?.stale).toBe(false);
    });

    it("allows one node per locale in a group (invariant 2)", async () => {
      await translate("es");
      await expect(translate("es")).rejects.toMatchObject({ code: "translation_exists" });
      // Another path in the same locale and group is refused for the group, not the path.
      await expect(
        store.createPage(site, {
          siteId: site.id,
          path: "/lanzamiento",
          title: "Lanzamiento",
          locale: "es",
          status: "draft",
          sections: [],
          translation: { group: original.id, method: "human", source: await sourceOf(original) },
        }),
      ).rejects.toMatchObject({ code: "translation_exists" });
    });

    it("checks the link: source, group, original and locale (invariants 2–3)", async () => {
      const bad = (over: Partial<Translation>) =>
        expect(translate("de", over)).rejects.toMatchObject({ code: "invalid_translation" });
      await bad({
        source: { id: "page_01HZX8K3QNON", locale: "en", rev: 0, hash: "0".repeat(64) },
      });
      await bad({ source: { ...(await sourceOf(original)), locale: "es" } });
      await bad({ group: "page_01HZX8K3QOTH" });
      await bad({ method: "original" });
    });

    it("keeps provenance and only lets a person review (invariant 6)", async () => {
      await expect(translate("de", { provenance: undefined })).rejects.toMatchObject({
        code: "invalid_translation",
      });
      await expect(translate("de", { review: { by: human, at: AT } })).rejects.toMatchObject({
        code: "invalid_translation",
      });
      await expect(
        translate("de", { method: "machine-reviewed", review: { by: agent, at: AT } }),
      ).rejects.toMatchObject({ code: "invalid_translation" });
      const de = await translate("de", {
        method: "machine-reviewed",
        review: { by: human, at: AT },
      });
      const group = await store.translationGroup(site, original.id);
      expect(group.members.find((m) => m.id === de.id)?.reviewed).toBe(true);
    });

    it("publishes machine translations of review-required collections only after review (invariant 5)", async () => {
      // Without a rule, a machine translation may publish (it is labelled to readers).
      await translate("de", {}, "published");
      site = await store.updateSite({
        ...((await store.getSite(site.id)) as Site),
        localization: { review: { required: ["pages"] } },
      });
      await expect(translate("es", {}, "published")).rejects.toMatchObject({
        code: "review_required",
      });
      const es = await translate("es");
      await expect(
        store.updatePage({ ...((await store.getPage(es.id)) as Page), status: "published" }),
      ).rejects.toMatchObject({ code: "review_required" });
      const reviewed = await store.updatePage({
        ...((await store.getPage(es.id)) as Page),
        status: "published",
        translation: {
          ...(es.translation as Translation),
          method: "machine-reviewed",
          review: { by: human, at: AT },
        },
      });
      expect(reviewed.status).toBe("published");
    });

    it("links language editions across sites of one project, never across projects", async () => {
      const edition = await store.createSite({
        projectId: site.projectId,
        name: "Ediciones",
        slug: "ediciones",
        defaultLocale: "es",
        locales: ["es"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const source = { ...(await sourceOf(original)), siteId: site.id };
      const { page } = await store.createPage(edition, {
        siteId: edition.id,
        path: "/",
        title: "Lanzamiento",
        locale: "es",
        status: "draft",
        sections: [],
        translation: { group: original.id, method: "human", layout: "independent", source },
      });
      const group = await store.translationGroup(site, original.id);
      expect(group.members.map((m) => [m.siteId, m.locale])).toEqual([
        [site.id, "en"],
        [edition.id, "es"],
      ]);
      expect(page.translation?.layout).toBe("independent");
      const stranger = await seedStarterSite(store, { name: "Other", slug: "other", locale: "es" });
      await expect(
        store.createPage(stranger, {
          siteId: stranger.id,
          path: "/copia",
          title: "Copia",
          locale: "es",
          status: "draft",
          sections: [],
          translation: { group: original.id, method: "human", source },
        }),
      ).rejects.toMatchObject({ code: "invalid_translation" });
    });

    it("links entries the same way", async () => {
      const post = await store.createContentEntry({
        id: "entry_01HZX8K3QPST",
        siteId: site.id,
        collection: "posts",
        slug: "hello",
        locale: "en",
        status: "draft",
        title: "Hello",
        body: { format: "markdown", value: "Hello." },
        fields: {},
        tags: [],
        author: human,
        translation: { group: "entry_01HZX8K3QPST", method: "original" },
      });
      const hash = (await store.translationGroup(site, post.id)).members[0]?.hash as string;
      const hola = await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "hola",
        locale: "es",
        status: "draft",
        title: "Hola",
        body: { format: "markdown", value: "Hola." },
        fields: {},
        tags: [],
        author: human,
        translation: {
          group: post.id,
          method: "machine",
          source: { id: post.id, locale: "en", rev: post.rev, hash },
          provenance,
        },
      });
      const group = await store.translationGroup(site, post.id);
      expect(group.members.map((m) => [m.id, m.kind, m.stale])).toEqual([
        [post.id, "contentEntry", false],
        [hola.id, "contentEntry", false],
      ]);
    });
  });
}
