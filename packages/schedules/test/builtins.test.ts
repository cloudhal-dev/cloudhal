/**
 * The built-in jobs' pure parts (RFC-0008 §11.1): the feed and sitemap checks over fetched text,
 * and the runner's phases, caps, taint and notifications over fake sources. The same jobs over the
 * site graph, on SQLite and D1, are `@cloudhal/core-ts`'s automations suite.
 */
import type { Automation } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_STEP_COST,
  type BuiltinSources,
  checkRss,
  checkSitemap,
  createBuiltinRunner,
  digestSummary,
  type FeedExpectations,
  FINDING_CODES,
  type LinkFinding,
  MAX_FINDINGS_PER_RUN,
  openFindings,
  urlPath,
  xmlProblem,
} from "../src/index.ts";

const NOW = "2026-10-12T12:00:00.000Z";
const exp: FeedExpectations = {
  now: NOW,
  newest: [{ nodeId: "entry_newest01", path: "/posts/newest", title: "Newest" }],
  gated: [{ nodeId: "entry_embargo1", path: "/posts/embargoed", state: "embargoed" }],
  mediaPrefixes: ["0123456789abcdef"],
};
const ok = (body: string) => ({ status: 200, body });

describe("feed-check: the documents", () => {
  it("well-formed XML, or why not", () => {
    expect(xmlProblem('<?xml version="1.0"?><a><b x="1>2"/><![CDATA[<&>]]></a>')).toBeUndefined();
    expect(xmlProblem("<a><b></a>")).toBe("</a> closes <b>");
    expect(xmlProblem("<a>x & y</a>")).toBe("an unescaped & in text");
    expect(xmlProblem("<a/><b/>")).toBe("more than one root element");
    expect(xmlProblem("hello")).toBe("text outside the root element");
    expect(xmlProblem("<a>")).toBe("<a> is not closed");
    expect(xmlProblem("")).toBe("no root element");
    expect(urlPath("https://news.example.com/posts/x/?a=1#b")).toBe("/posts/x");
    expect(urlPath("/a%20b")).toBe("/a b");
  });

  it("RSS: incomplete items, future dates, the newest entries, assets, and the gate self-check", () => {
    const rss = `<rss version="2.0"><channel>
      <item><title><![CDATA[Newest]]></title><link>https://x.test/posts/newest</link></item>
      <item><title>No link</title></item>
      <item><title>Later</title><link>https://x.test/posts/later</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate></item>
      <item><title>Leak</title><link>https://x.test/posts/embargoed</link><enclosure url="https://x.test/media/fedcba9876543210/a.png" type="image/png"/></item>
    </channel></rss>`;
    const found = checkRss(ok(rss), exp);
    expect(found.map((f) => f.code).sort()).toEqual([
      "feed-asset-not-live",
      "feed-future-date",
      "feed-gated-node",
      "feed-item-incomplete",
    ]);
    expect(found.every((f) => f.untrusted && f.document === "rss")).toBe(true);
    expect(found.find((f) => f.code === "feed-gated-node")).toMatchObject({
      nodeId: "entry_embargo1",
      severity: "error",
    });
    // an id in the text is a leak too, even without a link
    expect(
      checkRss(
        ok(
          "<rss><channel><item><title>A</title><link>/posts/newest</link><guid>entry_embargo1</guid></item></channel></rss>",
        ),
        exp,
      ).map((f) => f.code),
    ).toEqual(["feed-gated-node"]);
  });

  it("unreachable, broken or the wrong kind of document", () => {
    expect(checkRss(undefined, exp)).toMatchObject([{ code: "feed-unreachable" }]);
    expect(checkRss({ status: 503, body: "" }, exp)).toMatchObject([
      { code: "feed-unreachable", detail: "HTTP 503" },
    ]);
    expect(checkRss(ok("<rss><channel></rss>"), exp)).toMatchObject([{ code: "feed-invalid" }]);
    expect(checkSitemap(ok("<rss><channel/></rss>"), exp)).toMatchObject([
      { code: "feed-invalid", detail: "not a sitemap urlset" },
    ]);
  });

  it("sitemap: the newest entries, lastmod and gated paths", () => {
    const xml = `<urlset><url><loc>https://x.test/</loc><lastmod>2027-01-01</lastmod></url>
      <url><loc>https://x.test/posts/embargoed/</loc></url><url></url></urlset>`;
    expect(
      checkSitemap(ok(xml), exp)
        .map((f) => f.code)
        .sort(),
    ).toEqual([
      "feed-future-date",
      "feed-gated-node",
      "feed-item-incomplete",
      "feed-missing-entry",
    ]);
  });
});

describe("the runner over fake sources", () => {
  const automation = (builtin: string): Automation =>
    ({
      schemaVersion: 1,
      id: "aut_runner0001",
      siteId: "site_runner0001",
      name: "Runner",
      job: { kind: "builtin", builtin },
      recurrence: { start: "2026-10-12T10:07", timeZone: "UTC", preset: "daily" },
      state: "active",
      consecutiveFailures: 0,
      owner: { id: "user_owner0001" },
      createdAt: NOW,
      updatedAt: NOW,
      rev: 1,
    }) as Automation;
  const link = (n: number): LinkFinding => ({
    code: "broken-internal-link",
    severity: "error",
    nodeId: `entry_n${String(n).padStart(6, "0")}`,
    nodeKind: "contentEntry",
    field: "body",
    href: `/missing-${n}`,
  });
  const base: BuiltinSources = {
    scanLinks: async ({ after }) => {
      const page = after ? Number(after) : 0;
      return {
        scanned: 50,
        links: 150,
        findings: Array.from({ length: 150 }, (_, i) => link(page * 150 + i)),
        ...(page < 2 ? { next: String(page + 1) } : {}),
      };
    },
    notFoundPaths: async () => [
      { path: "/old", status: 404, hits: 30, linkedFrom: [], lastSeen: null },
    ],
    staleEntries: async () => ({ scanned: 0, stale: [] }),
    feedExpectations: async () => exp,
    digest: async () => ({
      siteId: "site_runner0001",
      from: "2026-10-05T12:00:00.000Z",
      now: NOW,
      to: "2026-10-19T12:00:00.000Z",
      published: {
        count: 1,
        items: [{ id: "rel_a00001", title: "Launch", at: NOW, state: "published" }],
      },
      scheduled: { count: 0, items: [] },
      attention: { count: 0, items: [] },
      openFindings: { count: 0, items: [] },
    }),
    cleanup: async () => ({ counts: { "runs-deleted": 0 }, more: false }),
    staleDrafts: async () => ({ count: 0, drafts: [] }),
  };

  async function runAll(sources: BuiltinSources, builtin: string) {
    const runner = createBuiltinRunner(sources);
    const a = automation(builtin);
    let position: unknown;
    const steps = [];
    for (let i = 0; i < 10; i++) {
      const r = await runner.step({
        automation: a,
        job: a.job as never,
        run: { id: "run_runner00001", occurrenceAt: NOW, attempt: 1 },
        ...(position !== undefined ? { position } : {}),
        now: new Date(NOW),
        trigger: "cron",
      });
      steps.push(r);
      if (r.done) return steps;
      position = JSON.parse(JSON.stringify(r.position));
    }
    throw new Error("no end");
  }

  it("broken-links: pages, then the 404 rows (tainted); 200 findings kept, counts exact", async () => {
    const steps = await runAll(base, "broken-links");
    expect(steps).toHaveLength(4);
    const last = steps[3];
    expect(last?.taint).toEqual({ at: NOW, tool: "broken_links" });
    expect(steps.slice(0, 3).every((s) => !s.taint)).toBe(true);
    expect(last?.findings).toHaveLength(MAX_FINDINGS_PER_RUN);
    expect(last?.counts).toMatchObject({
      "broken-internal-link": 450,
      "not-found-path": 1,
      "broken-links": 450,
      "nodes-scanned": 150,
    });
    expect(last?.notify?.[0]).toMatchObject({
      id: "automation-findings:run_runner00001",
      recipients: ["user_owner0001"],
    });
    // without analytics: no 404 phase, no taint
    const { notFoundPaths: _n, ...noAnalytics } = base;
    const quiet = await runAll(noAnalytics, "broken-links");
    expect(quiet).toHaveLength(3);
    expect(quiet.some((s) => s.taint)).toBe(false);
  });

  it("feed-check without a renderer, and the digest's text", async () => {
    const steps = await runAll(base, "feed-check");
    expect(steps).toEqual([expect.objectContaining({ done: true, outcome: "nothing-to-do" })]);
    const digest = await runAll(base, "weekly-digest");
    expect(digest[0]?.summary).toBe(
      digestSummary(await base.digest({ siteId: "x", automationId: "y", now: new Date(NOW) })),
    );
    expect(digest[0]?.summary).toContain("- Launch (2026-10-12 12:00 UTC) [published]");
    expect(digest[0]?.notify?.[0]).toMatchObject({ kind: "automation-digest" });
  });

  it("codes, costs and open findings", () => {
    expect(new Set(FINDING_CODES).size).toBe(FINDING_CODES.length);
    for (const c of FINDING_CODES) expect(c).toMatch(/^[a-z][a-z0-9-]{0,40}$/);
    expect(Math.max(...Object.values(BUILTIN_STEP_COST))).toBeLessThanOrEqual(20);
    expect(openFindings({ "broken-links": 2, steps: 4, "stale-entries": 0 })).toEqual({
      "broken-links": 2,
    });
  });
});
