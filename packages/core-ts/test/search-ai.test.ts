/**
 * RFC-0029 §3: the Cloudflare AI Search provider against an in-memory bucket and a fake instance
 * that honours the filters (folder range, locale, kind) and knows one synonym. Sync follows
 * publishes; hits pass the live index (invariant 1); hybrid ranking; failure and budget fall back
 * to FTS5; the environment decides whether it is on.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GATES_ENFORCED } from "../src/availability.ts";
import {
  type AiSearchInstance,
  cloudflareAiSearchProvider,
  hybridProvider,
  type SearchBucket,
  searchProviderFromEnv,
  takeSearchCall,
} from "../src/search-ai.ts";
import { fts5Provider } from "../src/search-provider.ts";
import { seedStarterSite } from "../src/seed.ts";
import { SiteGraphStore } from "../src/store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const T0 = Date.UTC(2026, 9, 18, 9, 0, 0);
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** An R2 bucket in memory: keys, text and custom metadata. */
function memoryBucket() {
  const objects = new Map<string, { text: string; meta: Record<string, string> }>();
  const bucket: SearchBucket = {
    async put(key, value, options) {
      objects.set(key, { text: value, meta: options?.customMetadata ?? {} });
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
    async list({ prefix }) {
      return {
        objects: [...objects.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, o]) => ({ key, customMetadata: o.meta })),
        truncated: false,
      };
    },
  };
  return { bucket, objects };
}

/** AI Search over the bucket: the filters as documented, words or one synonym ("prices"). */
function fakeInstance(objects: ReturnType<typeof memoryBucket>["objects"]) {
  const calls: unknown[] = [];
  const instance: AiSearchInstance = {
    async search(request) {
      calls.push(request);
      const f = request.ai_search_options?.retrieval?.filters as {
        folder: { $gte: string; $lt: string };
        locale: string;
        kind?: { $in: string[] };
      };
      const words = request.query.toLowerCase().split(/\s+/);
      const means = (text: string) =>
        words.some((w) => text.includes(w) || (w === "prices" && text.includes("inflation")));
      const chunks = [...objects.entries()]
        .filter(([key, o]) => {
          const folder = key.slice(0, key.lastIndexOf("/") + 1);
          return (
            folder >= f.folder.$gte &&
            folder < f.folder.$lt &&
            o.meta.locale === f.locale &&
            (!f.kind || f.kind.$in.includes(o.meta.kind ?? ""))
          );
        })
        .filter(([, o]) => means(o.text.toLowerCase()))
        .map(([key, o]) => ({ score: 0.8, text: o.text, item: { key } }));
      return { chunks };
    },
  };
  return { instance, calls };
}

describe("Cloudflare AI Search provider", () => {
  let sql: SqlDriver;
  let store: SiteGraphStore;
  let site: Site;
  let now = T0;
  let objects: ReturnType<typeof memoryBucket>["objects"];
  let bucket: SearchBucket;
  let instance: AiSearchInstance;
  let calls: unknown[];
  let news: string;

  beforeEach(async () => {
    sql = await BetterSqlite3Driver.open(":memory:");
    ({ bucket, objects } = memoryBucket());
    ({ instance, calls } = fakeInstance(objects));
    now = T0;
    const semantic = cloudflareAiSearchProvider({ instance, bucket, sql });
    store = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      now: () => new Date(now),
      gates: GATES_ENFORCED,
      search: hybridProvider(fts5Provider(sql), semantic),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Desk", slug: "desk" });
    news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
  });

  const publish = async () => {
    const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
    site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
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
  const find = (q: string) => store.search(site.id, q, { locale: "en", now });
  const keys = () => [...objects.keys()].sort();

  it("mirrors what a publish makes live into the bucket, with locale and kind", async () => {
    const a = await article(
      "inflation",
      "Inflation at a ten-year high",
      "Rents and bread cost more.",
    );
    await article("draft", "A draft", "Never published.", { status: "draft" });
    await publish();
    const key = `sites/${site.id}/${a.id}/en.md`;
    expect(keys()).toContain(key);
    expect(objects.get(key)?.meta).toEqual({ locale: "en", kind: "article" });
    expect(objects.get(key)?.text).toMatch(/^# Inflation at a ten-year high\n\n/);
    expect(keys().some((k) => k.includes("draft"))).toBe(false);
    // pages and terms too, one object per node and locale
    expect(new Set([...objects.values()].map((o) => o.meta.kind))).toEqual(
      new Set(["article", "page", "term"]),
    );
    await store.deleteContentEntry(a);
    await publish();
    expect(keys()).not.toContain(key);
  });

  it("finds by meaning next to words, and only what is live", async () => {
    const inflation = await article("inflation", "Inflation at a ten-year high", "Rents rise.");
    await article("market", "Rising prices at the market", "Tomatoes cost more.");
    await article("later", "Inflation outlook", "Embargoed.", {
      availability: { from: iso(T0 + 5 * HOUR) },
    });
    await publish();
    const r = await find("rising prices");
    expect(r.provider).toBe("hybrid");
    // FTS5 finds the words; AI Search adds the article about inflation; the embargoed one stays out
    expect(r.hits.map((h) => h.href)).toEqual(["/posts/market", "/posts/inflation"]);
    expect(r.total).toBe(2);
    // an object left behind for a node that is not live (indexed late, kept too long) never shows
    await bucket.put(`sites/${site.id}/entry_gone000001/en.md`, "# Gone\n\nInflation everywhere.", {
      customMetadata: { locale: "en", kind: "article" },
    });
    expect((await find("prices")).hits.map((h) => h.href)).toEqual([
      "/posts/market",
      "/posts/inflation",
    ]);
    // the filters the instance got: the site's folder range, the locale
    expect(calls.at(-1)).toMatchObject({
      query: "prices",
      ai_search_options: {
        retrieval: {
          filters: {
            folder: { $gte: `sites/${site.id}/`, $lt: `sites/${site.id}0` },
            locale: "en",
          },
        },
      },
    });
    expect(inflation.id).toBeTruthy();
  });

  it("answers from FTS5 alone when AI Search fails, and past the daily budget", async () => {
    await article("market", "Rising prices at the market", "Tomatoes cost more.");
    await article("inflation", "Inflation at a ten-year high", "Rents rise.");
    await publish();
    const errors: unknown[] = [];
    const failing: AiSearchInstance = { search: () => Promise.reject(new Error("down")) };
    const broken = hybridProvider(
      fts5Provider(sql),
      cloudflareAiSearchProvider({ instance: failing, bucket, sql }),
      { onError: (e) => errors.push(e) },
    );
    const r = await broken.search({ siteId: site.id, query: "prices", locale: "en", now });
    expect(r.hits.map((h) => h.href)).toEqual(["/posts/market"]);
    expect(errors).toHaveLength(1);
    // the budget: one semantic call a day, then FTS5 alone, without asking the instance
    const spy = vi.fn(instance.search);
    const budgeted = hybridProvider(
      fts5Provider(sql),
      cloudflareAiSearchProvider({ instance: { search: spy }, bucket, sql }),
      { allow: (q) => takeSearchCall(sql, q.siteId, { now: q.now, limit: 1 }) },
    );
    const ask = () => budgeted.search({ siteId: site.id, query: "prices", locale: "en", now });
    expect((await ask()).hits).toHaveLength(2);
    expect((await ask()).hits).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    now += 24 * HOUR; // a new UTC day
    expect((await ask()).hits).toHaveLength(2);
  });

  it("is on only when the deployment says so and both bindings are there", () => {
    expect(searchProviderFromEnv({}, sql)).toBeUndefined();
    expect(
      searchProviderFromEnv({ AI_SEARCH: instance, SEARCH_BUCKET: bucket }, sql),
    ).toBeUndefined();
    expect(
      searchProviderFromEnv(
        { CLOUDHAL_SEARCH_PROVIDER: "cloudflare-ai-search", AI_SEARCH: instance },
        sql,
      ),
    ).toBeUndefined();
    expect(
      searchProviderFromEnv(
        {
          CLOUDHAL_SEARCH_PROVIDER: "cloudflare-ai-search",
          AI_SEARCH: instance,
          SEARCH_BUCKET: bucket,
        },
        sql,
      )?.id,
    ).toBe("hybrid");
  });
});
