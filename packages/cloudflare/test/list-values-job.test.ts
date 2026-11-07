/** RFC-0042 §4, #110: the admin Worker's `lists.backfill` system job on D1. */
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import { afterAll, describe, expect, it } from "vitest";
import { everyFiveMinutes, listValuesJob } from "../src/list-values-job.ts";

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
afterAll(async () => {
  await d1?.dispose();
});

/** `sql`, counting statements as the tick's meter does (a batch counts each of its statements). */
function counting(sql: SqlDriver) {
  const c = { n: 0, sql: undefined as unknown as SqlDriver };
  c.sql = {
    name: `${sql.name}+count`,
    get: async (q, p) => {
      c.n++;
      return sql.get(q, p);
    },
    all: async (q, p) => {
      c.n++;
      return sql.all(q, p);
    },
    run: async (q, p) => {
      c.n++;
      return sql.run(q, p);
    },
    batch: async (st) => {
      c.n += st.length;
      return sql.batch(st);
    },
    exec: (q) => sql.exec(q),
    close: async () => {},
  };
  return c;
}

const author = { kind: "human" as const, id: "user_01HZX8K3Q9CD", name: "H" };
const price = [
  { key: "price", type: "number", labels: { en: { label: "Price" } }, localized: false },
];

describe("lists.backfill", () => {
  it("runs on five-minute marks", () => {
    expect(everyFiveMinutes(new Date("2026-10-26T10:03:10Z")).toISOString()).toBe(
      "2026-10-26T10:05:00.000Z",
    );
    expect(everyFiveMinutes(new Date("2026-10-26T10:05:00Z")).toISOString()).toBe(
      "2026-10-26T10:10:00.000Z",
    );
  });

  it("makes a collection without a state row ready, and logs only when it did work", async () => {
    d1 = await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const project = await store.createProject({
      name: "J",
      slug: "j",
      ownerId: "user_01HZX8K3Q9CD",
      siteIds: [],
    });
    const fields = [
      { key: "price", type: "number", labels: { en: { label: "Price" } }, localized: false },
    ];
    const site = await store.createSite({
      projectId: project.id,
      name: "J",
      slug: "j",
      defaultLocale: "en",
      locales: ["en"],
      domains: [],
      pageIds: [],
      theme: { name: "blog" },
      collections: { events: { fields, listFields: ["price"] } } as never,
    });
    await store.createContentEntry({
      siteId: site.id,
      collection: "events",
      slug: "a",
      locale: "en",
      status: "draft",
      title: "A",
      body: { format: "markdown", value: "A" },
      fields: { price: 1.5 },
      tags: [],
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "H" },
    });
    // A deployment from before migration 0029 has rows of nothing and no state.
    await sql.run("DELETE FROM entry_list_state");
    await sql.run("DELETE FROM entry_list_values");
    const lines: string[] = [];
    const job = listValuesJob(sql, { paid: false, log: (l) => lines.push(l) });
    expect(job.name).toBe("lists.backfill");
    await job.run({ now: new Date(), trigger: "cron" });
    expect(
      await sql.get("SELECT ready FROM entry_list_state WHERE site_id = ?", [site.id]),
    ).toEqual({ ready: 1 });
    expect(await sql.get("SELECT num FROM entry_list_values WHERE site_id = ?", [site.id])).toEqual(
      { num: 1.5 },
    );
    expect(lines).toEqual([expect.stringMatching(/^lists backfill: 1 entry indexed/)]);
    await job.run({ now: new Date(), trigger: "cron" });
    expect(lines).toHaveLength(1);
  });

  it("never issues more statements than its declared cost, however many collections wait", async () => {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    await sql.run("DELETE FROM entry_list_state");
    await sql.run("DELETE FROM entry_list_values");
    const sites: string[] = [];
    for (let i = 0; i < 4; i++) {
      const project = await store.createProject({
        name: `C${i}`,
        slug: `c${i}`,
        ownerId: author.id,
        siteIds: [],
      });
      const collections = Object.fromEntries(
        ["a", "b", "c", "d", "e"].map((c) => [c, { fields: price, listFields: ["price"] }]),
      );
      const site = await store.createSite({
        projectId: project.id,
        name: `C${i}`,
        slug: `c${i}`,
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { ...collections, gone: { fields: price } } as never,
      });
      sites.push(site.id);
      for (const c of ["a", "c"])
        await store.createContentEntry({
          siteId: site.id,
          collection: c,
          slug: "x",
          locale: "en",
          status: "draft",
          title: "X",
          body: { format: "markdown", value: "X" },
          fields: { price: i + 0.5 },
          tags: [],
          author,
        });
    }
    // As after an upgrade to migration 0029: twenty listed collections, none with a state row.
    await sql.run("DELETE FROM entry_list_state");
    for (const paid of [false, true]) {
      const counted = counting(sql);
      const job = listValuesJob(counted.sql, { paid, log: () => {} });
      let runs = 0;
      for (; runs < 40; runs++) {
        counted.n = 0;
        await job.run({ now: new Date(Date.UTC(2026, 9, 26, 10, 5 * runs)), trigger: "cron" });
        expect(counted.n, `run ${runs}`).toBeLessThanOrEqual(job.cost);
        const ready = await sql.get<{ n: number }>(
          "SELECT count(*) AS n FROM entry_list_state WHERE ready = 1 AND site_id IN (SELECT value FROM json_each(?))",
          [JSON.stringify(sites)],
        );
        if (Number(ready?.n) === 20) break;
      }
      expect(runs).toBeLessThan(40);
      // Nothing left: discovery alone, two statements (and, paid, one tidy for every site).
      counted.n = 0;
      await job.run({ now: new Date(), trigger: "cron" });
      expect(counted.n).toBe(paid ? 3 : 2);
      await sql.run("DELETE FROM entry_list_state");
    }
  });
});
