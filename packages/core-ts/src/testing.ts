/** Shared SiteGraphStore test suite, run against every storage backend. */
import type { Actor, Page, Site } from "@cloudhal/core-contracts";
import { ContractValidationError } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, UniqueConstraintError } from "./errors.ts";
import { nodeHash } from "./hash.ts";
import { SiteGraphStore } from "./store.ts";

export interface StoreFactory {
  create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>;
  dispose?(): Promise<void>;
}

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const agent: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

export function describeSiteGraphStore(label: string, factory: StoreFactory): void {
  describe(`SiteGraphStore: ${label}`, () => {
    let store: SiteGraphStore;
    let sql: SqlDriver;
    let blobs: BlobStore;
    let tick = 0;

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      for (const t of ["nodes", "snapshots", "projects", "_migrations"])
        await sql.exec(`DROP TABLE IF EXISTS ${t}`);
      tick = 0;
      store = new SiteGraphStore({
        sql,
        blobs,
        now: () => new Date(Date.UTC(2026, 9, 7, 20, 0, tick++)),
      });
      await store.init();
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    async function bootstrap(): Promise<{ site: Site; page: Page }> {
      const project = await store.createProject({
        name: "Demo",
        slug: "demo",
        ownerId: human.id,
        siteIds: [],
      });
      const site = await store.createSite({
        projectId: project.id,
        name: "Demo Newsroom",
        slug: "demo-newsroom",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const { page, site: site2 } = await store.createPage(site, {
        siteId: site.id,
        path: "/",
        title: "Home",
        locale: "en",
        status: "draft",
        sections: [{ id: "sec_01HZX8K3Q9OP", kind: "hero", heading: "Hello" }],
      });
      return { site: site2, page };
    }

    it("creates and reads project, site and page; createPage appends to pageIds atomically", async () => {
      const { site, page } = await bootstrap();
      expect(site.rev).toBe(1);
      expect(site.pageIds).toEqual([page.id]);
      expect(await store.getSite(site.id)).toEqual(site);
      expect(await store.getPage(page.id)).toEqual(page);
      expect((await store.listPages(site.id)).map((p) => p.id)).toEqual([page.id]);
    });

    it("rejects documents that violate the contracts before touching storage", async () => {
      await expect(
        store.createProject({ name: "", slug: "demo", ownerId: human.id, siteIds: [] }),
      ).rejects.toThrow(ContractValidationError);
      expect(await sql.get("SELECT count(*) AS n FROM projects")).toEqual({ n: 0 });
    });

    it("optimistic locking: a stale revision raises ConflictError and leaves data untouched", async () => {
      const { page } = await bootstrap();
      const v1 = await store.updatePage({ ...page, title: "Home v1" });
      expect(v1.rev).toBe(1);
      await expect(store.updatePage({ ...page, title: "stale write" })).rejects.toMatchObject({
        name: "ConflictError",
        expectedRev: 0,
        actualRev: 1,
      });
      expect((await store.getPage(page.id))?.title).toBe("Home v1");
    });

    it("createPage with a stale site revision changes nothing", async () => {
      const { site } = await bootstrap();
      const stale = { ...site, rev: site.rev - 1 };
      await expect(
        store.createPage(stale, {
          siteId: site.id,
          path: "/about",
          title: "About",
          locale: "en",
          status: "draft",
          sections: [],
        }),
      ).rejects.toThrow(ConflictError);
      expect((await store.listPages(site.id)).length).toBe(1);
      expect((await store.getSite(site.id))?.rev).toBe(site.rev);
    });

    it("enforces (site, locale, path) uniqueness for pages", async () => {
      const { site } = await bootstrap();
      await expect(
        store.createPage(site, {
          siteId: site.id,
          path: "/",
          title: "Dup",
          locale: "en",
          status: "draft",
          sections: [],
        }),
      ).rejects.toThrow(UniqueConstraintError);
      // the failed batch must not have bumped the site
      expect((await store.getSite(site.id))?.rev).toBe(site.rev);
      const { site: s2 } = await store.createPage(site, {
        siteId: site.id,
        path: "/",
        title: "TR Home",
        locale: "tr",
        status: "draft",
        sections: [],
      });
      expect(s2.pageIds.length).toBe(2);
    });

    it("deletePage removes the page and its id from the site atomically", async () => {
      const { site, page } = await bootstrap();
      const s2 = await store.deletePage(site, page);
      expect(s2.pageIds).toEqual([]);
      expect(await store.getPage(page.id)).toBeUndefined();
      await expect(store.deletePage(site, page)).rejects.toThrow(ConflictError);
    });

    it("content entries: create, unique (collection, locale, slug), update, delete", async () => {
      const { site } = await bootstrap();
      const entry = await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "hello",
        locale: "en",
        status: "draft",
        title: "Hello",
        body: { format: "markdown", value: "# Hi" },
        fields: { readingMinutes: 2 },
        tags: ["intro"],
        author: agent,
      });
      await expect(
        store.createContentEntry({
          ...entry,
          id: undefined as unknown as string,
          title: "Dup",
        } as never),
      ).rejects.toThrow(UniqueConstraintError);
      const e2 = await store.updateContentEntry({ ...entry, status: "published" });
      expect(e2.rev).toBe(1);
      expect((await store.listContentEntries(site.id, "posts")).map((e) => e.status)).toEqual([
        "published",
      ]);
      await store.deleteContentEntry(e2);
      expect(await store.listContentEntries(site.id)).toEqual([]);
    });

    it("snapshots capture node hashes, copy bodies to the blob store and summarise changes", async () => {
      const { site, page } = await bootstrap();
      const s1 = await store.createSnapshot(site.id, {
        actor: agent,
        reason: "agentMutation",
        label: "initial",
      });
      expect(s1.parentId).toBeUndefined();
      expect(s1.summary).toEqual({ added: 2, changed: 0, removed: 0 });
      expect(s1.nodes.map((n) => n.kind).sort()).toEqual(["page", "site"]);
      const pageRef = s1.nodes.find((n) => n.id === page.id) as (typeof s1.nodes)[number];
      expect(pageRef.hash).toBe(await nodeHash(page));
      expect(await blobs.head(`nodes/${pageRef.hash}.json`)).not.toBeNull();
      expect(await store.readSnapshotNode<Page>(pageRef)).toEqual(page);

      await store.updatePage({ ...page, title: "Edited" });
      const s2 = await store.createSnapshot(site.id, { actor: agent, reason: "agentMutation" });
      expect(s2.parentId).toBe(s1.id);
      expect(s2.summary).toEqual({ added: 0, changed: 1, removed: 0 });
      const diff = await store.diffSnapshots(s1.id, s2.id);
      expect(diff.changed.map((c) => c.after.id)).toEqual([page.id]);
      expect(diff.changed[0]?.before.rev).toBe(0);
      expect(diff.changed[0]?.after.rev).toBe(1);
      expect((await store.listSnapshots(site.id)).map((s) => s.id)).toEqual([s2.id, s1.id]);
    });

    it("publish points the site at a snapshot; rollback requires an ancestor and records history", async () => {
      const { site, page } = await bootstrap();
      const s1 = await store.createSnapshot(site.id, { actor: human, reason: "manual" });
      const published = await store.publish(site, s1.id);
      expect(published.publishedSnapshotId).toBe(s1.id);

      await store.updatePage({ ...page, title: "Breaking change" });
      const s2 = await store.createSnapshot(site.id, { actor: agent, reason: "agentMutation" });
      const live2 = await store.publish(published, s2.id);
      expect(live2.publishedSnapshotId).toBe(s2.id);

      // s1 is an ancestor of s2 → rollback allowed
      const { site: rolled, snapshot: rb } = await store.rollback(live2, s1.id, human);
      expect(rolled.publishedSnapshotId).toBe(s1.id);
      expect(rb.reason).toBe("rollback");
      expect(rb.parentId).toBe(s2.id);

      // an unrelated snapshot is not an ancestor
      const other = await store.createSnapshot(site.id, { actor: human, reason: "manual" });
      await expect(store.rollback(rolled, other.id, human)).rejects.toThrow(/not an ancestor/);
      await expect(store.publish(rolled, "snap_doesnotexist1")).rejects.toThrow(/not found/);
    });
  });
}
