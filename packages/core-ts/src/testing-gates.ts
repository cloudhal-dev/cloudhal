/**
 * RFC-0008 time gates in the store (rollout steps 4–5): the gate write rules of `createPage`,
 * `updatePage`, `createContentEntry` and `updateContentEntry` (§4.1), the writer guard (S15), and
 * `publishedAt = from` (§7.5). Part of the shared suite, so it runs on SQLite and Miniflare D1.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GATES_ENFORCED, type GateSupport } from "./availability.ts";
import { canonicalJson, nodeHash } from "./hash.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";
import { exportSite, importSite } from "./sync.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
/** The store's clock: 2026-10-12T12:00:00Z plus whatever the test moves it by. */
const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;

export function gatesSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`time gates in the store: ${label}`, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let now = T0;
    const open = (gates?: GateSupport) =>
      new SiteGraphStore({
        sql,
        blobs,
        now: () => new Date(now),
        ...(gates ? { gates } : {}),
      });
    let store: SiteGraphStore;
    let site: Site;
    let news: string;

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      await dropAllTables(sql);
      now = T0;
      store = open(GATES_ENFORCED);
      await store.init();
      site = await seedStarterSite(store, { name: "Gates", slug: "gates" });
      news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const entry = (over: Partial<ContentEntry> = {}, on: SiteGraphStore = store) =>
      on.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "embargoed",
        locale: "en",
        status: "draft",
        title: "Embargoed story",
        body: { format: "markdown", value: "Under embargo." },
        fields: {},
        tags: [],
        terms: { category: { ids: [news], primary: news } },
        author: human,
        ...over,
      });

    const publishSite = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    };

    it("refuses availability until the renderer confirms gates (S15), and allows removing it", async () => {
      const gate = { from: iso(T0 + HOUR) };
      // no capability at all: refused, nothing written
      await expect(entry({ slug: "x", availability: gate }, open())).rejects.toMatchObject({
        name: "InvariantError",
        code: "gates_unsupported",
      });
      expect((await store.listContentEntries(site.id)).map((e) => e.slug)).not.toContain("x");
      // a renderer that says no
      const no = open({ enforced: () => false });
      const draft = await entry();
      await expect(no.updateContentEntry({ ...draft, availability: gate })).rejects.toMatchObject({
        code: "gates_unsupported",
      });
      expect((await store.getContentEntry(draft.id))?.availability).toBeUndefined();
      const home = (await store.listPages(site.id)).find((p) => p.path === "/");
      if (!home) throw new Error("no home page");
      await expect(no.updatePage({ ...home, availability: gate })).rejects.toMatchObject({
        code: "gates_unsupported",
      });
      // confirmed: written; an unrelated edit of a gated node needs no confirmation again
      const asked: string[] = [];
      const yes = open({
        enforced: (id) => {
          asked.push(id);
          return true;
        },
      });
      const gated = await yes.updateContentEntry({ ...draft, availability: gate });
      expect(gated.availability).toEqual(gate);
      expect(asked).toEqual([site.id]);
      const retitled = await no.updateContentEntry({ ...gated, title: "Retitled" });
      expect(retitled.availability).toEqual(gate);
      // removing gates is never refused here (who may lift an embargo is policy, D8)
      const { availability: _a, ...ungated } = retitled;
      expect((await no.updateContentEntry(ungated)).availability).toBeUndefined();
    });

    it("checks the cross-field rules: a gate that parses, from before until", async () => {
      const draft = await entry();
      await expect(
        store.updateContentEntry({
          ...draft,
          availability: { from: iso(T0 + 2 * HOUR), until: iso(T0 + HOUR) },
        }),
      ).rejects.toMatchObject({ code: "invalid_availability" });
      await expect(
        store.updateContentEntry({
          ...draft,
          availability: { from: iso(T0 + HOUR), until: iso(T0 + HOUR) },
        }),
      ).rejects.toMatchObject({ code: "invalid_availability" });
      const home = (await store.listPages(site.id)).find((p) => p.path === "/");
      if (!home) throw new Error("no home page");
      const page = await store.updatePage({
        ...home,
        availability: { until: iso(T0 + 24 * HOUR) },
      });
      expect(page.availability).toEqual({ until: iso(T0 + 24 * HOUR) });
    });

    it("dates an embargoed entry at its embargo when it is first published (§7.5)", async () => {
      const from = iso(T0 + 21 * HOUR);
      const created = await entry({ status: "published", availability: { from } });
      expect(created.publishedAt).toBe(from);
      // a draft gets its date when it is marked published, from its embargo
      const draft = await entry({ slug: "later", availability: { from } });
      expect(draft.publishedAt).toBeUndefined();
      const marked = await store.updateContentEntry({ ...draft, status: "published" });
      expect(marked.publishedAt).toBe(from);
      // an explicit date (an import) is kept
      const imported = await entry({
        slug: "imported",
        status: "published",
        publishedAt: "2020-01-01T00:00:00.000Z",
        availability: { from },
      });
      expect(imported.publishedAt).toBe("2020-01-01T00:00:00.000Z");
    });

    it("lets the date follow a moved embargo until the entry has been shown", async () => {
      const first = iso(T0 + 2 * HOUR);
      const created = await entry({ status: "published", availability: { from: first } });
      // published but still embargoed on the live site: moving the embargo moves the date
      await publishSite();
      const later = iso(T0 + 5 * HOUR);
      const moved = await store.updateContentEntry({ ...created, availability: { from: later } });
      expect(moved.publishedAt).toBe(later);
      // a published entry dated before an embargo was added, never live: the date follows too
      const plain = await entry({ slug: "plain", status: "published" });
      expect(plain.publishedAt).toBe(iso(T0));
      const embargoed = await store.updateContentEntry({ ...plain, availability: { from: later } });
      expect(embargoed.publishedAt).toBe(later);
      // once the live version has been shown, the date stays (no "evergreen republish")
      await publishSite();
      now = T0 + 6 * HOUR;
      const live = (await store.getContentEntry(moved.id)) as ContentEntry;
      const again = await store.updateContentEntry({
        ...live,
        availability: { from: iso(T0 + 30 * HOUR) },
      });
      expect(again.publishedAt).toBe(later);
      // a caller that sets the date itself wins
      const own = await store.updateContentEntry({
        ...again,
        publishedAt: "2026-10-01T00:00:00.000Z",
        availability: { from: iso(T0 + 31 * HOUR) },
      });
      expect(own.publishedAt).toBe("2026-10-01T00:00:00.000Z");
    });

    it("imports bundles with gates only into a site whose renderer enforces them", async () => {
      await entry({ status: "published", availability: { until: iso(T0 + HOUR) } });
      const bundle = await exportSite({ sql, blobs }, site.id);
      await expect(
        importSite({ sql, blobs }, bundle, { gates: { enforced: () => false } }),
      ).rejects.toMatchObject({ code: "gates_unsupported" });
      const result = await importSite({ sql, blobs }, bundle, { gates: GATES_ENFORCED });
      expect(result.nodes.unchanged).toBe(true);
      // the cross-field rules hold for bundles too
      const broken = structuredClone(bundle);
      const row = broken.nodes.find((n) => n.kind === "contentEntry" && n.body.includes("until"));
      if (!row) throw new Error("no gated row");
      const body = {
        ...(JSON.parse(row.body) as ContentEntry),
        availability: { from: iso(T0 + 2 * HOUR), until: iso(T0) },
      };
      row.body = canonicalJson(body);
      row.hash = await nodeHash(body);
      await expect(
        importSite({ sql, blobs }, broken, { mode: "replace", gates: GATES_ENFORCED }),
      ).rejects.toMatchObject({ code: "invalid_availability" });
    });
  });
}
