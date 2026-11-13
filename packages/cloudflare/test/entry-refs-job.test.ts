/** RFC-0045 §2.4, rollout step 7: the admin Worker's `refs.rebuild` system job on D1. */
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import { afterAll, describe, expect, it } from "vitest";
import { entryRefsJob, everyFiveMinutesOffset } from "../src/entry-refs-job.ts";

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
afterAll(async () => {
  await d1?.dispose();
});

const author = { kind: "human" as const, id: "user_01HZX8K3Q9CD", name: "H" };
const L = (label: string) => ({ en: { label } });
const VENUE = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
};

/** `sql`, counting statements as the tick's meter does (a batch counts each of its statements). */
function counting(sql: SqlDriver) {
  const c = { n: 0, sql: undefined as unknown as SqlDriver };
  c.sql = {
    ...sql,
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
  };
  return c;
}

describe("refs.rebuild", () => {
  it("runs on five-minute marks, half-way between lists.backfill's", () => {
    expect(everyFiveMinutesOffset(new Date("2026-11-13T10:01:10Z")).toISOString()).toBe(
      "2026-11-13T10:02:30.000Z",
    );
    expect(everyFiveMinutesOffset(new Date("2026-11-13T10:02:30Z")).toISOString()).toBe(
      "2026-11-13T10:07:30.000Z",
    );
    expect(everyFiveMinutesOffset(new Date("2026-11-13T10:04:59Z")).toISOString()).toBe(
      "2026-11-13T10:07:30.000Z",
    );
  });

  it("rebuilds every site once within its declared cost, logs while it works, then stays quiet", async () => {
    d1 = await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const store = new SiteGraphStore({
      sql,
      blobs: new MemoryBlobStore(),
      fieldTypes: { supported: () => true },
    });
    await store.init();
    const expected: { site: string; rows: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const project = await store.createProject({
        name: `R${i}`,
        slug: `r${i}`,
        ownerId: author.id,
        siteIds: [],
      });
      const site = await store.createSite({
        projectId: project.id,
        name: `R${i}`,
        slug: `r${i}`,
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: { places: {}, events: { fields: [VENUE] } } as never,
      });
      const entry = (collection: string, slug: string, fields = {}) =>
        store.createContentEntry({
          siteId: site.id,
          collection,
          slug,
          locale: "en",
          status: "published",
          title: slug,
          body: { format: "markdown", value: slug },
          fields,
          tags: [],
          author,
        });
      const place = await entry("places", "hall");
      for (let j = 0; j < 5; j++) await entry("events", `e${j}`, { venue: place.id });
      expected.push({ site: site.id, rows: 5 });
    }
    // An index the writers never filled (what the job is the safety net for).
    await sql.run("DELETE FROM entry_refs");
    const lines: string[] = [];
    const counted = counting(sql);
    const job = entryRefsJob(counted.sql, { paid: false, log: (l) => lines.push(l) });
    expect(job.name).toBe("refs.rebuild");
    for (let run = 0; run < 20; run++) {
      counted.n = 0;
      await job.run({ now: new Date(), trigger: "cron" });
      expect(counted.n).toBeLessThanOrEqual(job.cost);
      const states = await sql.all<{ done: number }>("SELECT done FROM entry_refs_state");
      if (states.length === 3 && states.every((s) => Number(s.done) === 1)) break;
    }
    for (const { site, rows } of expected)
      expect(
        await sql.get<{ c: number }>("SELECT count(*) AS c FROM entry_refs WHERE site_id = ?", [
          site,
        ]),
      ).toEqual({ c: rows });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^refs rebuild: \d+ entr(y|ies) checked/);
    // done everywhere: two discovery reads a run, and nothing logged
    const n = lines.length;
    counted.n = 0;
    await job.run({ now: new Date(), trigger: "cron" });
    expect(counted.n).toBe(2);
    expect(lines).toHaveLength(n);
  });
});
