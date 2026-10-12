/**
 * RFC-0008 rollout step 9: the built-in automations on the site graph — `broken-links`,
 * `stale-content`, `feed-check`, `weekly-digest` and `cleanup` — stepped by the real tick
 * (`runScheduledTick`) on SQLite and Miniflare D1: bounded steps that resume across ticks, findings
 * with stable codes, run accounting, taint marking, notifications, "Run now", retention, and the
 * statements each step takes against its declared cost (S17).
 */
import type {
  Actor,
  Automation,
  BuiltinAutomationJob,
  ContentEntry,
  ScheduleRun,
  Site,
} from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import {
  BUILTIN_STEP_COST,
  type BuiltinFinding,
  createBuiltinRunner,
  type DigestFinding,
  type FetchedDocument,
  presetRule,
  runId,
  type ScheduleNotification,
  TICK_BUDGETS,
  type TickReport,
} from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type BuiltinInputs, graphBuiltinSources } from "./automations.ts";
import { GATES_ENFORCED } from "./availability.ts";
import { type PersonApproval, ReleaseService, runScheduledTick } from "./releases.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const owner = { id: "user_01HZX8K3Q9CD", name: "Halil" };
/** 2026-10-12T12:00:00Z. */
const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

/** The largest step of each job measured here (statements), for the README's table. */
export const AUTOMATION_STATEMENTS: Record<string, number> = {};
/** Statements of each whole tick of a job's first run (claim, step, finish, overview, heartbeat). */
export const AUTOMATION_TICKS: Record<string, number[]> = {};

/** A driver that counts statements (reads, writes, each statement of a batch). */
function counting(inner: SqlDriver): SqlDriver & { count: number } {
  const d = {
    name: `counting(${inner.name})`,
    count: 0,
    get: (sql: string, params?: readonly unknown[]) => {
      d.count++;
      return inner.get(sql, params as never);
    },
    all: (sql: string, params?: readonly unknown[]) => {
      d.count++;
      return inner.all(sql, params as never);
    },
    run: (sql: string, params?: readonly unknown[]) => {
      d.count++;
      return inner.run(sql, params as never);
    },
    batch: (list: SqlStatement[]) => {
      d.count += list.length;
      return inner.batch(list);
    },
    exec: (sql: string) => inner.exec(sql),
    close: () => inner.close(),
  };
  return d as unknown as SqlDriver & { count: number };
}

export function automationsSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`built-in automations (RFC-0008 §11.1): ${label}`, { timeout: 120_000 }, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let now = T0;
    let store: SiteGraphStore;
    let schedules: SqlScheduleStore;
    let site: Site;
    let news: string;
    const logs: string[] = [];
    const notices: ScheduleNotification[] = [];

    beforeEach(async () => {
      ({ sql, blobs } = await factory.create());
      await dropAllTables(sql);
      now = T0;
      logs.length = 0;
      notices.length = 0;
      store = new SiteGraphStore({ sql, blobs, now: () => new Date(now), gates: GATES_ENFORCED });
      await store.init();
      site = await seedStarterSite(store, { name: "Automations", slug: "automations" });
      site = await store.updateSite({
        ...site,
        domains: [{ hostname: "news.example.com", primary: true }],
      });
      news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
      schedules = new SqlScheduleStore(sql, { now: () => new Date(now) });
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const fresh = async () => (await store.getSite(site.id)) as Site;
    const publish = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish(await fresh(), snap.id);
    };
    const entry = (slug: string, value: string, over: Partial<ContentEntry> = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status: "published",
        title: slug.replace(/-/g, " "),
        body: { format: "markdown", value },
        fields: {},
        tags: [],
        terms: { category: { ids: [news], primary: news } },
        author: human,
        ...over,
      });
    const automation = (job: BuiltinAutomationJob, start = "2026-10-12T12:07") =>
      schedules.createAutomation({
        siteId: site.id,
        name: `Test ${job.builtin}`,
        job,
        recurrence: { start, timeZone: "UTC", rule: presetRule("hourly", start) },
        owner,
      });
    const tick = (
      at: number,
      o: { inputs?: BuiltinInputs; linkPageSize?: number; stalePageSize?: number } = {},
    ) =>
      runScheduledTick({
        sql,
        blobs,
        now: new Date(at),
        trigger: "cron",
        wake: "minute",
        budget: TICK_BUDGETS.free,
        log: (l) => logs.push(l),
        notify: { notify: async (n) => void notices.push(n) },
        ...(o.inputs ? { builtinInputs: () => o.inputs as BuiltinInputs } : {}),
        builtinOptions: {
          ...(o.linkPageSize ? { linkPageSize: o.linkPageSize } : {}),
          ...(o.stalePageSize ? { stalePageSize: o.stalePageSize } : {}),
        },
      });
    /** Ticks every minute from `from` until the run of `a` at `occurrence` ends; every tick ≤ 40. */
    const runToEnd = async (
      a: Automation,
      occurrence: number,
      from: number,
      o: Parameters<typeof tick>[1] = {},
    ): Promise<{ run: ScheduleRun; reports: TickReport[] }> => {
      const id = await runId(a.id, iso(occurrence));
      const reports: TickReport[] = [];
      for (let i = 0; i < 30; i++) {
        const r = await tick(from + i * MIN, o);
        reports.push(r);
        expect(r.statements, `tick ${i}`).toBeLessThanOrEqual(TICK_BUDGETS.free.maxQueries);
        const run = await schedules.getRun(site.id, id);
        if (run && run.state !== "running") {
          expect(isValid("schedule-run", run), JSON.stringify(run)).toBe(true);
          const job = a.job.kind === "builtin" ? a.job.builtin : "agent-task";
          AUTOMATION_TICKS[job] ??= reports.map((x) => x.statements ?? -1);
          return { run, reports };
        }
      }
      throw new Error("the run did not end within 30 ticks");
    };
    const findingsOf = async (run: ScheduleRun) =>
      (await schedules.runFindings(site.id, run.id)) as BuiltinFinding[];

    /** The world the broken-link sweep looks at. */
    const linkWorld = async () => {
      await entry("embargoed-story", "Not yet.", {
        availability: { from: iso(T0 + 30 * DAY) },
      });
      await entry(
        "linker",
        [
          "[ok](/posts/hello-world) [home](/) [about](/about/) [category](/category/news)",
          "[gone](/posts/missing-story) [external](https://example.com/x)",
          "[absolute](https://news.example.com/nope) ![img](asset:ASSET)",
          "[media](/media/0123456789abcdef/x.png) [font](/fonts/a.woff2) [feed](/rss.xml)",
          "[embargoed](/posts/embargoed-story) `[code](/posts/not-a-link)`",
        ].join("\n\n"),
      );
      // a reference to an asset that is gone (the store refuses one on write; an import or a
      // deletion leaves it behind): patched into the working row before publishing
      await sql.run(
        "UPDATE nodes SET body = json_set(body, '$.body.value', replace(json_extract(body, '$.body.value'), 'asset:ASSET', 'asset:asset_missing0001')) WHERE kind = 'contentEntry' AND json_extract(body, '$.slug') = 'linker'",
      );
      // a draft's links are not checked: readers never see it
      await entry("draft-story", "[gone](/posts/also-missing)", { status: "draft" });
      for (const n of [1, 2, 3, 4]) await entry(`filler-${n}`, "[home](/)");
      const { page: draft } = await store.createPage(await fresh(), {
        siteId: site.id,
        path: "/draft-page",
        title: "Draft page",
        locale: "en",
        status: "draft",
        sections: [],
      });
      site = await fresh();
      await store.createMenu({
        siteId: site.id,
        key: "primary",
        maxDepth: 2,
        items: [{ id: "item_draftpage1", kind: "page", pageId: draft.id }],
      });
      await publish();
    };
    const notFound: BuiltinInputs["notFound"] = async () => [
      { path: "/blog/hello-world", status: 404, refPath: "/about", hits: 12, lastSeen: null },
      { path: "/wp-login.php", status: 404, refPath: null, hits: 3, lastSeen: null },
    ];

    it("broken-links: bounded steps resume across ticks; findings, counts, taint and a notification", async () => {
      await linkWorld();
      const a = await automation({ kind: "builtin", builtin: "broken-links" });
      const occurrence = Date.UTC(2026, 9, 12, 12, 7);
      const { run, reports } = await runToEnd(a, occurrence, occurrence + 10_000, {
        inputs: { notFound },
        linkPageSize: 3,
      });
      // pages, entries, terms and the menu in pages of three, then the 404 rows: several ticks
      expect(reports.length).toBeGreaterThanOrEqual(4);
      expect(run).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
        trigger: "cron",
        taint: { tool: "broken_links" },
        counts: {
          "broken-internal-link": 2,
          "broken-media-reference": 2,
          "broken-menu-target": 1,
          "link-to-gated-content": 1,
          "not-found-path": 2,
          "broken-links": 5,
        },
      });
      expect(run.counts?.steps).toBe(reports.length);
      expect(run.counts?.statements).toBeGreaterThan(0);
      const findings = await findingsOf(run);
      const hrefs = findings
        .filter((f) => f.code === "broken-internal-link" || f.code === "broken-media-reference")
        .map((f) => (f as { href: string }).href)
        .sort();
      expect(hrefs).toEqual([
        "/media/0123456789abcdef/x.png",
        "/posts/missing-story",
        "asset:asset_missing0001",
        "https://news.example.com/nope",
      ]);
      expect(findings.find((f) => f.code === "link-to-gated-content")).toMatchObject({
        href: "/posts/embargoed-story",
        gate: "embargoed",
      });
      expect(findings.find((f) => f.code === "broken-menu-target")).toMatchObject({
        field: "items.item_draftpage1",
      });
      // the 404 path gets a redirect proposal; visitor text is marked untrusted
      expect(findings.find((f) => f.code === "not-found-path")).toMatchObject({
        path: "/blog/hello-world",
        hits: 12,
        linkedFrom: ["/about"],
        proposal: { path: "/posts/hello-world", reason: "similar" },
        untrusted: true,
      });
      expect(notices).toEqual([
        expect.objectContaining({
          id: `automation-findings:${run.id}`,
          kind: "automation-findings",
          recipients: [owner.id],
          automationId: a.id,
        }),
      ]);
      // the automation is back on its schedule, the cursor gone
      expect(await schedules.getAutomation(site.id, a.id)).toMatchObject({
        state: "active",
        nextRunAt: iso(occurrence + HOUR),
        consecutiveFailures: 0,
      });
      // a site that was never published: nothing to check
      const other = await seedStarterSite(store, { name: "Other", slug: "other" });
      const b = await schedules.createAutomation({
        siteId: other.id,
        name: "Other sweep",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: {
          start: "2026-10-12T13:07",
          timeZone: "UTC",
          rule: presetRule("hourly", "2026-10-12T13:07"),
        },
        owner,
      });
      const at = Date.UTC(2026, 9, 12, 13, 7);
      const r = await tick(at + 5_000);
      expect(r.statements).toBeLessThanOrEqual(40);
      expect(await schedules.getRun(other.id, await runId(b.id, iso(at)))).toMatchObject({
        state: "succeeded",
        outcome: "nothing-to-do",
      });
    });

    it("stale-content: live entries not updated for staleAfterDays, oldest first, over several ticks", async () => {
      now = T0 - 400 * DAY;
      await entry("ancient", "Old.");
      now = T0 - 200 * DAY;
      await entry("old", "Old.");
      await entry("old-draft", "Old.", { status: "draft" });
      now = T0;
      await entry("recent", "New.");
      await publish();
      const a = await automation({ kind: "builtin", builtin: "stale-content", staleAfterDays: 90 });
      const occurrence = Date.UTC(2026, 9, 12, 12, 7);
      const { run, reports } = await runToEnd(a, occurrence, occurrence, { stalePageSize: 2 });
      expect(reports.length).toBeGreaterThanOrEqual(3);
      expect(run).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
        counts: { "stale-entries": 2, "entries-scanned": 5 },
      });
      const findings = await findingsOf(run);
      expect(findings.map((f) => (f as { path: string }).path)).toEqual([
        "/posts/ancient",
        "/posts/old",
      ]);
      expect(findings[0]).toMatchObject({ code: "stale-entry", ageDays: 400 });
      expect(run.taint).toBeUndefined();
      // the default is 365 days (RFC §11.1)
      const b = await automation({ kind: "builtin", builtin: "stale-content" }, "2026-10-12T12:08");
      const b0 = Date.UTC(2026, 9, 12, 12, 8);
      const second = await runToEnd(b, b0, b0);
      expect(second.run.counts).toMatchObject({ "stale-entries": 1 });
    });

    it("feed-check: the feed and sitemap through the renderer, the gate self-check, and taint", async () => {
      await entry("embargoed-story", "Not yet.", { availability: { from: iso(T0 + DAY) } });
      await entry("newest", "Hi.", { publishedAt: iso(T0 - HOUR) });
      await publish();
      const fetched: string[] = [];
      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>A</title>
        <item><title>Newest</title><link>https://news.example.com/posts/newest</link><pubDate>${new Date(T0 - HOUR).toUTCString()}</pubDate></item>
        <item><title>Hello</title><link>https://news.example.com/posts/hello-world</link></item>
        <item><title>Leak</title><link>https://news.example.com/posts/embargoed-story</link><pubDate>${new Date(T0 + 2 * DAY).toUTCString()}</pubDate></item>
        </channel></rss>`;
      const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://news.example.com/</loc></url>
        <url><loc>https://news.example.com/posts/hello-world</loc></url></urlset>`;
      const fetchDocument = async ({ path }: { siteId: string; path: string }) => {
        fetched.push(path);
        return {
          status: 200,
          contentType: "application/xml",
          body: path === "/rss.xml" ? rss : sitemap,
        } satisfies FetchedDocument;
      };
      const a = await automation({ kind: "builtin", builtin: "feed-check" });
      const occurrence = Date.UTC(2026, 9, 12, 12, 7);
      // first step: the feed; the running run is tainted at once
      await tick(occurrence + 1_000, { inputs: { fetchDocument } });
      const id = await runId(a.id, iso(occurrence));
      expect(await schedules.getRun(site.id, id)).toMatchObject({
        state: "running",
        taint: { tool: "feed_check" },
      });
      const { run } = await runToEnd(a, occurrence, occurrence + MIN, {
        inputs: { fetchDocument },
      });
      expect(fetched).toEqual(["/rss.xml", "/sitemap.xml"]);
      expect(run).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
        taint: { tool: "feed_check", at: iso(occurrence + 1_000) },
        counts: {
          "documents-checked": 2,
          "feed-gated-node": 1,
          "feed-future-date": 1,
          "feed-missing-entry": 1,
        },
      });
      const findings = await findingsOf(run);
      expect(findings.find((f) => f.code === "feed-gated-node")).toMatchObject({
        document: "rss",
        url: "/posts/embargoed-story",
        untrusted: true,
      });
      expect(findings.find((f) => f.code === "feed-missing-entry")).toMatchObject({
        document: "sitemap",
        url: "/posts/newest",
      });
      // no renderer reachable from here: nothing to check, not a failure
      const b = await automation({ kind: "builtin", builtin: "feed-check" }, "2026-10-12T12:09");
      const b0 = Date.UTC(2026, 9, 12, 12, 9);
      const quiet = await runToEnd(b, b0, b0);
      expect(quiet.run).toMatchObject({ state: "succeeded", outcome: "nothing-to-do" });
      expect(quiet.run.taint).toBeUndefined();
    });

    it("weekly-digest: published, scheduled, needs attention and open findings, as a notification", async () => {
      const svc = new ReleaseService({ graph: store, now: () => new Date(now) });
      const approval = (): PersonApproval => ({ kind: "person", by: owner, at: iso(now) });
      await publish();
      const release = async (slug: string, at: number) => {
        const e = await entry(slug, "Body.", { status: "draft" });
        await store.updateContentEntry({ ...e, status: "published" });
        const { release: r } = await svc.create({
          siteId: site.id,
          set: [e.id],
          createdBy: human,
          title: slug,
          when: { at: iso(at) },
        });
        return svc.schedule(site.id, r.id, { expectedRev: r.rev, approval: approval() });
      };
      await release("went-live", T0 + HOUR);
      await release("missed-one", T0 + 2 * HOUR);
      await release("next-week", T0 + 3 * DAY);
      await entry("embargo-lifts", "Soon.", { availability: { from: iso(T0 + 2 * DAY) } });
      await tick(T0 + HOUR + 10_000); // publishes "went-live"
      now = T0 + 4 * HOUR;
      await tick(now); // "missed-one" is more than an hour late
      await publish(); // the embargoed entry goes live (gated)
      // another built-in's latest run reported findings
      // not due during this test: its latest run is the one inserted below
      const sweep = await automation(
        { kind: "builtin", builtin: "broken-links" },
        "2026-10-19T12:07",
      );
      await sql.run(
        `INSERT INTO schedule_runs (id, site_id, subject_kind, subject_id, occurrence_at, state, outcome, trigger, attempt, counts, rev, created_at, updated_at, ended_at)
         VALUES (?, ?, 'builtin', ?, ?, 'succeeded', 'did-work', 'cron', 1, ?, 1, ?, ?, ?)`,
        [
          "run_sweepdone0001",
          site.id,
          sweep.id,
          iso(T0),
          JSON.stringify({ "broken-links": 3, "not-found-path": 1, steps: 4 }),
          iso(T0),
          iso(T0),
          iso(T0),
        ],
      );
      const a = await automation({ kind: "builtin", builtin: "weekly-digest" }, "2026-10-12T16:07");
      const occurrence = Date.UTC(2026, 9, 12, 16, 7);
      now = occurrence;
      const { run, reports } = await runToEnd(a, occurrence, occurrence);
      expect(reports).toHaveLength(1);
      expect(run).toMatchObject({ state: "succeeded", outcome: "did-work" });
      expect(run.counts).toMatchObject({ scheduled: 2, "needs-attention": 1, "open-findings": 4 });
      expect(run.counts?.published).toBeGreaterThanOrEqual(1);
      expect(run.summary).toMatch(/^Week of 2026-10-05 to 2026-10-12\nPublished: /);
      const findings = await findingsOf(run);
      expect(findings.map((f) => f.code)).toEqual([
        "digest-published",
        "digest-scheduled",
        "digest-attention",
        "digest-open-findings",
      ]);
      const sections = Object.fromEntries(
        findings.map((f) => [f.code, (f as DigestFinding).items]),
      );
      expect(sections["digest-published"]).toContainEqual(
        expect.objectContaining({ title: "went-live", state: "published" }),
      );
      expect(sections["digest-scheduled"]).toEqual([
        expect.objectContaining({ title: "embargo lifts", state: "embargo" }),
        expect.objectContaining({ title: "next-week", state: "scheduled" }),
      ]);
      expect(sections["digest-attention"]).toEqual([
        expect.objectContaining({ title: "missed-one", state: "missed" }),
      ]);
      expect(sections["digest-open-findings"]).toEqual([
        expect.objectContaining({
          id: sweep.id,
          counts: { "broken-links": 3, "not-found-path": 1 },
        }),
      ]);
      const notice = notices.find((n) => n.kind === "automation-digest");
      expect(notice).toMatchObject({
        id: `automation-digest:${run.id}`,
        recipients: [owner.id],
        digest: { scheduled: { count: 2 }, attention: { count: 1 } },
      });
    });

    it("cleanup: retention of runs, releases and findings; expired leases; stale open rows; draft reminders", async () => {
      const old = T0 - 100 * DAY;
      const a = await automation({ kind: "builtin", builtin: "cleanup" });
      const other = await automation(
        { kind: "builtin", builtin: "broken-links" },
        "2026-10-12T12:30",
      );
      const insertRun = (id: string, o: Record<string, unknown>) => {
        const row: Record<string, unknown> = {
          id,
          site_id: site.id,
          subject_kind: "builtin",
          subject_id: other.id,
          occurrence_at: iso(old),
          state: "succeeded",
          trigger: "cron",
          attempt: 1,
          rev: 1,
          created_at: iso(old),
          updated_at: iso(old),
          ...o,
        };
        const cols = Object.keys(row);
        return sql.run(
          `INSERT INTO schedule_runs (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          Object.values(row) as never,
        );
      };
      for (const n of [1, 2, 3])
        await insertRun(`run_oldrun0000${n}`, { occurrence_at: iso(old + n * MIN) });
      await insertRun("run_manyfindings1", {
        occurrence_at: iso(T0 - DAY),
        created_at: iso(T0 - DAY),
        findings: JSON.stringify(Array.from({ length: 250 }, (_, i) => ({ code: "x", i }))),
        lease_token: "left-behind",
      });
      await insertRun("run_abandoned0001", {
        occurrence_at: iso(T0 - 2 * DAY),
        created_at: iso(T0 - 2 * DAY),
        started_at: iso(T0 - 2 * DAY),
        state: "running",
      });
      // a claim that never started (the tick closes agent windows itself; this is the safety net)
      await insertRun("run_staledue0001", {
        occurrence_at: iso(T0 - 3 * DAY),
        created_at: iso(T0 - 3 * DAY),
        state: "due",
        lease_token: "lost",
      });
      await sql.run(
        `INSERT INTO releases (id, site_id, title, state, hash, created_by, rev, created_at, updated_at, lease_token)
         VALUES ('rel_ancient0001', ?, 'Ancient', 'canceled', ?, ?, 1, ?, ?, 'stale')`,
        [
          site.id,
          `rl1:${"0".repeat(64)}`,
          JSON.stringify(human),
          iso(T0 - 401 * DAY),
          iso(T0 - 401 * DAY),
        ],
      );
      // a recent terminal release that kept its lease (an old one is deleted before its lease matters)
      await sql.run(
        `INSERT INTO releases (id, site_id, title, state, hash, created_by, rev, created_at, updated_at, lease_token)
         VALUES ('rel_recent00001', ?, 'Recent', 'canceled', ?, ?, 1, ?, ?, 'stale')`,
        [site.id, `rl1:${"1".repeat(64)}`, JSON.stringify(human), iso(T0 - DAY), iso(T0 - DAY)],
      );
      await sql.run(
        "UPDATE automations SET lease_token = 'expired', lease_until = ? WHERE id = ?",
        [iso(T0 - HOUR), other.id],
      );
      now = T0 - 100 * DAY;
      await entry("forgotten", "Draft.", { status: "draft" });
      now = T0;
      const occurrence = Date.UTC(2026, 9, 12, 12, 7);
      const { run, reports } = await runToEnd(a, occurrence, occurrence);
      expect(reports).toHaveLength(2); // retention, then the draft reminders
      expect(run).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
        counts: {
          "runs-deleted": 3,
          "releases-deleted": 1,
          "findings-trimmed": 1,
          "leases-cleared": 3,
          "stale-runs-closed": 2,
          "stale-drafts": 1,
        },
      });
      expect(await findingsOf(run)).toEqual([
        expect.objectContaining({ code: "stale-draft", title: "forgotten", ageDays: 100 }),
      ]);
      expect(await schedules.runFindings(site.id, "run_manyfindings1")).toHaveLength(200);
      expect(await schedules.getRun(site.id, "run_abandoned0001")).toMatchObject({
        state: "failed",
        error: { code: "abandoned" },
      });
      expect(await schedules.getRun(site.id, "run_staledue0001")).toMatchObject({
        state: "missed",
      });
      expect(await schedules.getRun(site.id, "run_oldrun00001")).toBeUndefined();
      expect(await schedules.getRelease(site.id, "rel_ancient0001")).toBeUndefined();
      // a step deletes at most `limit` rows of each table and says when more is left
      for (const n of [4, 5, 6])
        await insertRun(`run_oldrun0000${n}`, { occurrence_at: iso(old + n * MIN) });
      expect(await schedules.cleanupSite(site.id, iso(T0), { limit: 2 })).toMatchObject({
        counts: { "runs-deleted": 2 },
        more: true,
      });
    });

    it("Run now: a manual run stepped by the next tick; the automation returns to its schedule", async () => {
      await publish();
      const a = await automation({ kind: "builtin", builtin: "stale-content" });
      now = T0 + 20 * MIN;
      const id = await schedules.startBuiltinNow({ automation: a, now: iso(now) });
      expect(id).toBe(await runId(a.id, iso(T0 + 20 * MIN)));
      expect(await schedules.startBuiltinNow({ automation: a, now: iso(now) })).toBeUndefined();
      expect(await schedules.getRun(site.id, id as string)).toMatchObject({
        state: "running",
        trigger: "manual",
      });
      await tick(now + 5_000);
      expect(await schedules.getRun(site.id, id as string)).toMatchObject({
        state: "succeeded",
        trigger: "manual",
      });
      expect(await schedules.getAutomation(site.id, a.id)).toMatchObject({
        state: "active",
        nextRunAt: a.nextRunAt,
      });
      // the scheduled occurrence then runs as usual
      const scheduled = Date.parse(a.nextRunAt as string);
      await tick(scheduled + 5_000);
      expect(await schedules.getRun(site.id, await runId(a.id, iso(scheduled)))).toMatchObject({
        state: "succeeded",
        trigger: "cron",
      });
    });

    it("S17: every step of every job stays within its declared statements", async () => {
      await linkWorld();
      now = T0 - 400 * DAY;
      await entry("ancient", "Old.");
      now = T0;
      await publish();
      const counted = counting(sql);
      const fetchDocument = async () => ({ status: 200, body: "<rss><channel></channel></rss>" });
      const runner = createBuiltinRunner(
        graphBuiltinSources({ sql: counted, blobs, inputs: { notFound, fetchDocument } }),
        { linkPageSize: 50, stalePageSize: 200 },
      );
      const jobs: BuiltinAutomationJob[] = [
        { kind: "builtin", builtin: "broken-links" },
        { kind: "builtin", builtin: "stale-content" },
        { kind: "builtin", builtin: "feed-check" },
        { kind: "builtin", builtin: "weekly-digest" },
        { kind: "builtin", builtin: "cleanup" },
      ];
      for (const job of jobs) {
        const a = await automation(job);
        let position: unknown;
        for (let step = 0; step < 20; step++) {
          counted.count = 0;
          const r = await runner.step({
            automation: a,
            job,
            run: { id: "run_measure0001", occurrenceAt: iso(T0), attempt: 1 },
            ...(position !== undefined ? { position } : {}),
            now: new Date(T0),
            trigger: "cron",
          });
          expect(counted.count, `${job.builtin} step ${step}`).toBeLessThanOrEqual(
            BUILTIN_STEP_COST[job.builtin],
          );
          AUTOMATION_STATEMENTS[job.builtin] = Math.max(
            AUTOMATION_STATEMENTS[job.builtin] ?? 0,
            counted.count,
          );
          if (r.done) break;
          position = JSON.parse(JSON.stringify(r.position));
        }
      }
      expect(Object.keys(AUTOMATION_STATEMENTS).sort()).toEqual([
        "broken-links",
        "cleanup",
        "feed-check",
        "stale-content",
        "weekly-digest",
      ]);
    });
  });
}
