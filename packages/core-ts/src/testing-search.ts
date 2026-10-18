/**
 * RFC-0019 §3 search in the store: the index follows publish, rollback, releases and imports;
 * drafts are never in it; time gates are applied at query time; queries are words, never FTS5
 * syntax. Part of the shared suite, so it runs on SQLite and Miniflare D1.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import { ftsQuery, MARK_CLOSE, MARK_OPEN, searchText } from "./search.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const T0 = Date.UTC(2026, 9, 16, 9, 0, 0);
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

export function searchSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`RFC-0019 search in the store: ${label}`, () => {
    let sql: SqlDriver;
    let now = T0;
    let store: SiteGraphStore;
    let site: Site;
    let news: string;

    beforeEach(async () => {
      const opened = await factory.create();
      sql = opened.sql;
      await dropAllTables(sql);
      now = T0;
      store = new SiteGraphStore({
        sql,
        blobs: opened.blobs,
        now: () => new Date(now),
        gates: GATES_ENFORCED,
      });
      await store.init();
      site = await seedStarterSite(store, { name: "Search", slug: "search" });
      news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const fresh = async () => (await store.getSite(site.id)) as Site;
    const publish = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish(await fresh(), snap.id);
      return snap.id;
    };
    const article = (slug: string, title: string, body: string, over: Partial<ContentEntry> = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status: "published",
        title,
        body: { format: "markdown", value: body },
        fields: {},
        tags: [],
        terms: { category: { ids: [news], primary: news } },
        author: human,
        publishedAt: iso(T0 - HOUR),
        ...over,
      });
    const find = async (q: string, extra: { snapshotId?: string; page?: number } = {}) =>
      store.search(site.id, q, { locale: "en", now, ...extra });
    const hrefs = async (q: string) => (await find(q)).hits.map((h) => h.href);

    it("indexes published articles on publish, not drafts, with ranked snippets", async () => {
      await article(
        "cay",
        "Çay, the glass that never empties",
        "Tea gardens on the **Bosphorus**.",
      );
      await article("coffee", "Turkish coffee", "Forty years of friendship, and a little çay.");
      await article("draft", "A çay draft", "Not yet.", { status: "draft" });
      expect((await find("cay")).total).toBe(0); // nothing published yet
      const snap = await publish();
      const r = await find("cay", { snapshotId: snap });
      expect(r.stale).toBe(false);
      // diacritics fold; the title match outranks the body match; the draft is not there
      expect(r.hits.map((h) => h.href)).toEqual(["/posts/cay", "/posts/coffee"]);
      expect(r.hits[1]?.snippet).toContain(`${MARK_OPEN}çay${MARK_CLOSE}`);
      expect(await hrefs("bosphorus")).toEqual(["/posts/cay"]);
      expect(await hrefs("bosph")).toEqual(["/posts/cay"]); // prefixes match
      expect(await hrefs("tea coffee")).toEqual([]); // every word must match
      expect((await find("")).total).toBe(0);
    });

    it("follows edits, deletions and rollbacks, and says when it lags behind", async () => {
      const a = await article("first", "Hagia Sophia", "Fifteen centuries under one dome.");
      const b = await article("second", "Ephesus", "Walking a Roman street.");
      const s1 = await publish();
      await store.updateContentEntry({ ...a, title: "Ayasofya" });
      await store.deleteContentEntry(b);
      // not published yet: readers still see (and find) the live version
      expect(await hrefs("ephesus")).toEqual(["/posts/second"]);
      const s2 = await publish();
      expect(await hrefs("hagia")).toEqual([]);
      expect(await hrefs("ayasofya")).toEqual(["/posts/first"]);
      expect(await hrefs("ephesus")).toEqual([]);
      expect((await find("dome", { snapshotId: s1 })).stale).toBe(true);
      expect((await find("dome", { snapshotId: s2 })).stale).toBe(false);
      site = (await store.rollback(await fresh(), s1, human)).site;
      expect(await hrefs("hagia")).toEqual(["/posts/first"]);
      expect(await hrefs("ephesus")).toEqual(["/posts/second"]);
      // a full rebuild agrees with the incremental index
      const before = (await find("centuries")).total + (await find("roman")).total;
      await store.refreshSearch(site.id, { full: true });
      expect((await find("centuries")).total + (await find("roman")).total).toBe(before);
      expect(before).toBe(2);
      expect(await hrefs("walking")).toEqual(["/posts/second"]);
    });

    it("applies time gates at query time and keeps the reader's locale", async () => {
      await article("embargoed", "Election results", "Embargoed until noon.", {
        availability: { from: iso(T0 + 3 * HOUR) },
      });
      await article("expiring", "Flash sale", "Ends soon.", {
        availability: { until: iso(T0 + HOUR) },
      });
      site = await store.updateSite({
        ...((await store.getSite(site.id)) as Site),
        locales: ["en", "tr"],
      });
      await article("turkce", "Seçim sonuçları", "Election results in Turkish.", { locale: "tr" });
      await publish();
      expect(await hrefs("election")).toEqual([]);
      expect(await hrefs("flash")).toEqual(["/posts/expiring"]);
      now = T0 + 4 * HOUR;
      expect(await hrefs("election")).toEqual(["/posts/embargoed"]);
      expect(await hrefs("flash")).toEqual([]);
      const tr = await store.search(site.id, "seçim", { locale: "tr", now });
      expect(tr.hits.map((h) => h.href)).toEqual(["/posts/turkce"]);
    });

    it("finds Japanese and Chinese without spaces: trigrams, and LIKE for short words (RFC-0033 §5)", async () => {
      site = await store.updateSite({ ...(await fresh()), locales: ["en", "ja", "zh-Hans"] });
      await article("tokyo", "東京都の地下鉄", "東京都は毎日たくさんの人が地下鉄に乗ります。", {
        locale: "ja",
      });
      await article("kyoto", "京都の庭", "京都には古い庭がたくさんあります。", { locale: "ja" });
      await article("beijing", "北京的胡同", "北京有很多胡同。", { locale: "zh-Hans" });
      await article("subway", "The subway", "Tokyo has a large subway.");
      await publish();
      const jaFind = (q: string) => store.search(site.id, q, { locale: "ja", now });
      // three characters or more: a trigram match, inside a word, with a snippet
      const long = await jaFind("地下鉄");
      expect(long.hits.map((h) => h.href)).toEqual(["/posts/tokyo"]);
      expect(long.hits[0]?.snippet).toContain(`${MARK_OPEN}地下鉄${MARK_CLOSE}`);
      // two characters: LIKE over the same rows ("京都" is also inside "東京都")
      expect((await jaFind("京都")).hits.map((h) => h.href).sort()).toEqual([
        "/posts/kyoto",
        "/posts/tokyo",
      ]);
      expect((await jaFind("庭 京都")).hits.map((h) => h.href)).toEqual(["/posts/kyoto"]);
      // each locale keeps to its own rows; English still uses words
      expect((await store.search(site.id, "胡同", { locale: "zh-Hans", now })).total).toBe(1);
      expect((await jaFind("胡同")).total).toBe(0);
      expect(await hrefs("subway")).toEqual(["/posts/subway"]);
      expect((await find("東京都")).total).toBe(0);
      // punctuation never becomes a LIKE pattern: "%" alone finds nothing, "京_" is "京"
      expect((await jaFind("%")).total).toBe(0);
      expect((await jaFind("京_")).total).toBe(2);
    });

    it("pages results and treats FTS5 syntax as words", async () => {
      for (let i = 0; i < 23; i++) await article(`p-${i}`, `Istanbul note ${i}`, "Street food.");
      await publish();
      const one = await find("istanbul");
      expect(one).toMatchObject({ total: 23, pages: 2, page: 1 });
      expect(one.hits).toHaveLength(20);
      expect((await find("istanbul", { page: 2 })).hits).toHaveLength(3);
      expect((await find("istanbul", { page: 3 })).hits).toHaveLength(0);
      for (const q of [
        "title:istanbul",
        "NEAR(street food)",
        '"unbalanced',
        "istanbul*) OR (",
        "-food",
        "^street",
      ])
        await expect(find(q)).resolves.toMatchObject({ query: expect.any(String) });
      expect(ftsQuery('title:x NEAR(a b) "q')).toBe('"title"* "x"* "NEAR"* "a"* "b"* "q"*');
      expect(ftsQuery("  ** ")).toBeUndefined();
    });

    it("reserves /search for the search page", async () => {
      const page = {
        siteId: site.id,
        path: "/search",
        title: "Search",
        locale: "en",
        status: "published" as const,
        sections: [],
      };
      await expect(store.createPage(await fresh(), page)).rejects.toMatchObject({
        code: "reserved_path",
      });
    });
  });
}

/** Unit checks that need no database. */
export function searchTextCases(): void {
  describe("searchText", () => {
    it("keeps words, drops code, URLs and markup", () => {
      const text = searchText({
        format: "markdown",
        value: [
          "# Title with [a link](https://example.com/x) and ![an image](asset:asset_1)",
          "",
          '```surface {"id":"x"}',
          '{"id":"root","component":"Text"}',
          "```",
          "",
          ':::callout{tone="warning" title="Before you start"}',
          "Back up your **database** first: https://docs.example.com",
          ":::",
          "",
          '::button{label="Start here" href="/start"}',
          "<b>bold</b> &amp; done",
        ].join("\n"),
      });
      expect(text).toBe(
        "Title with a link and an image warning Before you start Back up your database first: Start here /start bold & done",
      );
      expect(searchText({ format: "html", value: "<p>Hello&nbsp;<em>world</em></p>" })).toBe(
        "Hello world",
      );
    });
  });
}
