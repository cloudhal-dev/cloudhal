/**
 * Shared API suite for RFC-0006 §9.2 (site analytics) — runs against SQLite and D1 like
 * `testing.ts`: people only, role gating through `ROUTE_SCOPES`, the read envelope, every report
 * with the conformance fixtures' known answers, the join to the current graph, the audited
 * settings route with CAS, the CSV export, the error mapping and the deploy-token routes.
 */

import {
  AuditLog,
  PEOPLE_ONLY_OWNERSHIP,
  type Principal,
  type Role,
  roleScopes,
} from "@cloudhal/agent-runtime";
import { type AnalyticsReader, AnalyticsUnavailableError } from "@cloudhal/analytics";
import { AnalyticsService } from "@cloudhal/analytics/service";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import {
  BOT_FIXTURE_EVENTS,
  BOT_NOW,
  BOT_SITE_LIKELY,
  FIXTURE_EVENTS,
  FIXTURE_SITE,
  NODE_A,
  NODE_B,
  NODE_HOME,
  NODE_TERM,
} from "@cloudhal/analytics/testing";
import type { AnalyticsEvent, ContentEntry } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { SqlDriver } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { StaffService } from "./auth.ts";

export interface AnalyticsApiFactory {
  create(): Promise<{ store: SiteGraphStore; sql: SqlDriver }>;
  dispose?(): Promise<void>;
}

type Json = Record<string, unknown>;

const NOW = new Date("2026-10-09T05:17:00Z");
const FULL = "from=2026-10-07&to=2026-10-09";
const DEPLOY_TOKEN = "analytics-deploy-token-0123456789abcdef";
const agent = { kind: "agent" as const, id: "agent_analytics01", name: "Bot" };

function person(role: Role): Principal {
  const id = `user_${role.padEnd(12, "0").slice(0, 12)}`;
  return {
    actor: { kind: "human", id, name: role },
    scopes: roleScopes(role),
    person: { id, userId: `u-${role}`, role, name: role },
  };
}

export function describeAnalyticsApi(label: string, factory: AnalyticsApiFactory): void {
  describe(`API analytics: ${label}`, () => {
    let store: SiteGraphStore;
    let sql: SqlDriver;
    let siteId: string;
    let entry: ContentEntry;
    let pageId: string;
    let termId: string;
    let app: ReturnType<typeof createApi>;
    let service: AnalyticsService;
    let audit: AuditLog;
    let purges: string[];

    const call = async (path: string, who: string | null = "administrator", init = {}) => {
      const res = await app.request(path, {
        headers: { "content-type": "application/json", ...(who ? { "x-test-user": who } : {}) },
        ...init,
      });
      const text = await res.text();
      let body: Json;
      try {
        body = JSON.parse(text) as Json;
      } catch {
        body = { text };
      }
      return { status: res.status, body, headers: res.headers };
    };
    const base = () => `/api/sites/${siteId}/analytics`;

    /** The conformance fixtures, moved onto the seeded site and its real nodes. */
    const events = (): AnalyticsEvent[] => {
      const ids: Record<string, string> = {
        [NODE_A]: entry.id,
        [NODE_HOME]: pageId,
        [NODE_TERM]: termId,
        // NODE_B stays: a node that no longer exists
      };
      return FIXTURE_EVENTS.filter((e) => e.siteId === FIXTURE_SITE).map((e) => {
        const nodeId = "nodeId" in e && e.nodeId ? (ids[e.nodeId] ?? e.nodeId) : undefined;
        return { ...e, siteId, ...(nodeId ? { nodeId } : {}) } as AnalyticsEvent;
      });
    };

    const build = (live?: AnalyticsReader, now = NOW) => {
      service = new AnalyticsService({
        sql,
        store: "sql",
        live: live ?? new SqlAnalytics(sql),
        defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
        now: () => now,
        purgeSite: async (id) => {
          purges.push(id);
        },
      });
      app = createApi({
        store,
        now: () => now,
        audit,
        analytics: service,
        admin: { deployToken: DEPLOY_TOKEN, storage: { sql, blobs: undefined as never } },
        // Roles without Better Auth: the header names the caller's role.
        staff: { ownership: PEOPLE_ONLY_OWNERSHIP } as unknown as StaffService,
        resolvePrincipal: async (c) => {
          const who = c.req.header("x-test-user");
          if (!who) return undefined;
          if (who === "agent") return { actor: agent, scopes: ["analytics:read"] };
          return person(who as Role);
        },
      });
    };

    beforeEach(async () => {
      ({ store, sql } = await factory.create());
      const site = await seedStarterSite(store, { name: "Analytics Site", slug: "analytics-site" });
      siteId = site.id;
      entry = (await store.listContentEntries(siteId))[0] as ContentEntry;
      pageId = ((await store.listPages(siteId)).find((p) => p.path === "/") as { id: string }).id;
      termId = ((await store.getTermBySlug(siteId, "category", "news")) as { id: string }).id;
      audit = new AuditLog(sql);
      purges = [];
      await new SqlAnalytics(sql).insertMany(events());
      build();
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("is for people with analytics:read: anonymous 401, agent keys 403, Contributors 403", async () => {
      expect((await call(`${base()}/summary`, null)).status).toBe(401);
      const a = await call(`${base()}/summary`, "agent");
      expect(a.status).toBe(403);
      expect(String(a.body.message)).toMatch(/MCP/);
      const contributor = await call(`${base()}/summary?${FULL}`, "contributor");
      expect(contributor.status).toBe(403);
      expect(contributor.body).toMatchObject({
        error: "missing_scope",
        details: { scope: "analytics:read" },
      });
      for (const role of ["author", "editor", "administrator", "owner"])
        expect((await call(`${base()}/summary?${FULL}`, role)).status, role).toBe(200);
    });

    it("summary: the envelope, the numbers and the previous period", async () => {
      const r = await call(`${base()}/summary?${FULL}&compare=previous`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({
        range: { from: "2026-10-07", to: "2026-10-09" },
        source: "live",
        estimated: false,
        generatedAt: NOW.toISOString(),
        data: {
          pageviews: 10,
          visits: 7,
          visitors: 5,
          viewsPerVisit: 1.43,
          // people's HTML 200 renders; the ratio needs an edge cache (Cloudflare), none here
          renders: 4,
          cacheHitRatio: null,
          signals: 1,
          privacySignalShare: 0.1,
          previous: {
            pageviews: 0,
            visits: 0,
            visitors: null,
            range: { from: "2026-10-05", to: "2026-10-07" },
          },
          change: { pageviews: null, visits: null, visitors: null },
        },
      });
      const filtered = await call(`${base()}/summary?${FULL}&filter=node:${entry.id}`);
      expect(filtered.body.data).toMatchObject({ pageviews: 5, visits: 3, visitors: 3 });
      // the default range is the last 30 days
      const def = await call(`${base()}/summary`);
      expect(def.body.range).toEqual({ from: "2026-09-10", to: "2026-10-10" });
      // the fixtures also hold one view early on 2026-10-09
      expect((def.body.data as Json).pageviews).toBe(11);
    });

    it("series: daily for long ranges, hourly for two days or less", async () => {
      const day = await call(`${base()}/series?from=2026-10-01&to=2026-10-09`);
      const d = day.body.data as { interval: string; points: { t: string; pageviews: number }[] };
      expect(d.interval).toBe("day");
      expect(d.points).toHaveLength(8);
      expect(d.points.at(-2)).toMatchObject({ t: "2026-10-07T00:00:00Z", pageviews: 6 });
      const hour = await call(`${base()}/series?${FULL}`);
      expect((hour.body.data as { interval: string }).interval).toBe("hour");
      expect((hour.body.data as { points: unknown[] }).points).toHaveLength(48);
    });

    it("top content joins the current graph; a deleted node reads as gone", async () => {
      const r = await call(`${base()}/top/node?${FULL}&limit=5`);
      expect(r.status).toBe(200);
      const rows = (r.body.data as { rows: { key: string; pageviews: number; node: Json }[] }).rows;
      expect(rows[0]).toMatchObject({
        key: entry.id,
        pageviews: 5,
        node: {
          nodeId: entry.id,
          kind: "entry",
          exists: true,
          title: entry.title,
          path: `/posts/${entry.slug}`,
          status: "published",
        },
      });
      const gone = rows.find((x) => x.key === NODE_B);
      expect(gone?.node).toEqual({
        nodeId: NODE_B,
        kind: "entry",
        exists: false,
        title: null,
        path: null,
        status: null,
      });
      const term = rows.find((x) => x.key === termId);
      expect(term?.node).toMatchObject({ kind: "archive", exists: true, path: "/category/news" });
      const channels = await call(`${base()}/top/channel?${FULL}`);
      expect((channels.body.data as { dimension: string }).dimension).toBe("channel");
    });

    it("bots: the possible-bot-traffic signal, its page joined to the graph", async () => {
      // the bot fixtures' "likely" site, moved onto the seeded site; its burst is on page 1
      await new SqlAnalytics(sql).insertMany(
        BOT_FIXTURE_EVENTS.filter((e) => e.siteId === BOT_SITE_LIKELY).map(
          (e) =>
            ({
              ...e,
              siteId,
              ...("nodeId" in e && e.nodeId === "entry_01HZXBOTPAGE1" ? { nodeId: entry.id } : {}),
            }) as AnalyticsEvent,
        ),
      );
      build(undefined, BOT_NOW);
      const r = await call(`${base()}/bots?range=7d`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({
        range: { from: "2026-10-06", to: "2026-10-13" },
        source: "live",
        data: {
          level: "likely",
          hour: "2026-10-11T03:00:00Z",
          pageviews: 261,
          baseline: 1,
          window: { from: "2026-10-05T13:00:00Z", to: "2026-10-12T13:00:00Z" },
        },
      });
      const reasons = (r.body.data as { reasons: { code: string; node?: Json }[] }).reasons;
      expect(reasons.map((x) => x.code)).toEqual([
        "hourly_spike",
        "direct_entrances",
        "single_browser",
        "single_page",
      ]);
      expect(reasons[3]?.node).toMatchObject({ nodeId: entry.id, title: entry.title });
      // a period before the burst: nothing to say
      const before = await call(`${base()}/bots?from=2026-10-01&to=2026-10-08`);
      expect(before.body.data).toMatchObject({ level: "none", reasons: [] });
      expect((await call(`${base()}/bots?range=7d`, "contributor")).status).toBe(403);
      expect((await call(`${base()}/bots?range=1y`)).status).toBe(400);
    });

    it("refuses what the query model does not allow, with 400 invalid_query", async () => {
      for (const q of [
        `top/path?${FULL}`,
        `top/node?${FULL}&limit=101`,
        `top/node?${FULL}&limit=0`,
        `summary?${FULL}&filter=path:/x`,
        `summary?${FULL}&filter=node:x`,
        `summary?from=2020-01-01&to=2026-10-01`,
        `summary?from=2026-10-09&to=2026-10-01`,
        `summary?range=1y`,
        `summary?${FULL}&compare=last-year`,
        `series?${FULL}&interval=minute`,
        `series?from=2026-09-01&to=2026-10-01&interval=hour`,
        `vitals?${FULL}&filter=channel:ai`,
        `renders/everything?${FULL}`,
        `nodes/not-an-id?${FULL}`,
      ]) {
        const r = await call(`${base()}/${q}`);
        expect(r.status, q).toBe(400);
        expect(r.body.error, q).toBe("invalid_query");
      }
    });

    it("vitals and the render reports", async () => {
      const v = await call(`${base()}/vitals?${FULL}`);
      expect(v.status).toBe(200);
      expect(
        (v.body.data as { metrics: { metric: string }[] }).metrics.map((m) => m.metric),
      ).toEqual(["lcp", "inp", "cls", "ttfb", "fcp"]);
      const errors = await call(`${base()}/renders/errors?${FULL}`);
      expect(errors.body.data).toMatchObject({
        report: "errors",
        rows: [{ path: "/wp-login.php", status: 404, hits: 20 }, {}, {}, {}],
      });
      const redirects = await call(`${base()}/renders/redirects?${FULL}&limit=1`);
      expect(redirects.body.data).toMatchObject({
        report: "redirects",
        rows: [{ path: "/posts/old", status: 301, nodeId: entry.id, hits: 2 }],
      });
      const crawlers = await call(`${base()}/renders/crawlers?${FULL}`);
      expect((crawlers.body.data as { rows: unknown[] }).rows).toEqual([
        { crawler: "gptbot", class: "ai", hits: 2 },
        { crawler: "googlebot", class: "search", hits: 1 },
      ]);
    });

    it("one node: its numbers, sources, devices, slug history and redirect hits", async () => {
      // A slug change on a published article leaves a 301 (RFC-0002); stats follow the id.
      const oldPath = `/posts/${entry.slug}`;
      await store.updateContentEntry({ ...entry, slug: "hello-cloudhal" });
      const r = await call(`${base()}/nodes/${entry.id}?${FULL}`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const data = r.body.data as Json;
      expect(data.node).toMatchObject({ exists: true, path: "/posts/hello-cloudhal" });
      expect(data.summary).toMatchObject({ pageviews: 5, visits: 3 });
      expect((data.series as { interval: string }).interval).toBe("hour");
      expect((data.channels as { key: string }[]).length).toBeGreaterThan(0);
      expect(data.devices).toBeDefined();
      expect(data.vitals).toBeDefined();
      expect(data.oldPaths).toEqual([
        {
          from: oldPath,
          to: "/posts/hello-cloudhal",
          status: 301,
          reason: "slug-change",
          hits: 0,
        },
      ]);
      // the fixture's /posts/old → this node
      expect(data.redirectHits).toBe(2);
      const gone = await call(`${base()}/nodes/${NODE_B}?${FULL}`);
      expect((gone.body.data as Json).node).toMatchObject({ exists: false });
    });

    it("settings: defaults, CAS, audit, purge and today's salt", async () => {
      const read = await call(`${base()}/settings`, "author");
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        settings: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5, rev: 0, stored: false },
        feature: { store: "sql", reader: "sql" },
      });
      const put = (who: string, body: unknown) =>
        call(`${base()}/settings`, who, { method: "PUT", body: JSON.stringify(body) });
      // Editors cannot change privacy settings (site:settings, Administrators).
      const editor = await put("editor", { rev: 0, uniqueVisitors: true });
      expect(editor.status).toBe(403);
      expect(editor.body).toMatchObject({ details: { scope: "site:settings" } });

      const on = await put("administrator", { rev: 0, uniqueVisitors: true });
      expect(on.status, JSON.stringify(on.body)).toBe(200);
      expect(on.body).toMatchObject({
        settings: { uniqueVisitors: true, rev: 1, stored: true },
        // a unique-visitors switch purges too: it resets the Site Worker's settings and salt memo
        purged: true,
        saltDeleted: false,
      });
      await sql.run("INSERT INTO analytics_salts (day, salt, created_at) VALUES (?, ?, ?)", [
        "2026-10-09",
        "a".repeat(64),
        NOW.toISOString(),
      ]);
      const stale = await put("administrator", { rev: 0, enabled: false });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("conflict");

      const off = await put("administrator", { rev: 1, uniqueVisitors: false, vitalsOneIn: 10 });
      expect(off.body).toMatchObject({ purged: true, saltDeleted: true });
      expect(purges).toEqual([siteId, siteId]);
      expect(await sql.all("SELECT * FROM analytics_salts")).toEqual([]);

      for (const bad of [
        { rev: 2, vitalsOneIn: 3 },
        { rev: 2, planHint: "enterprise" },
        { rev: 2, rollupRetentionDays: 0 },
      ]) {
        const r = await put("administrator", bad);
        expect(r.status, JSON.stringify(bad)).toBe(400);
        expect(r.body.error).toBe("invalid_settings");
      }
      for (const bad of [{ enabled: true }, { rev: 2, ip: true }, { rev: -1 }]) {
        const r = await put("administrator", bad);
        expect(r.status, JSON.stringify(bad)).toBe(400);
        expect(r.body.error).toBe("invalid_query");
      }
      // A no-op write bumps rev but leaves no audit row.
      await put("administrator", { rev: 2, vitalsOneIn: 10 });

      const rows = (await audit.list({ siteId })).filter((a) => a.tool === "analytics.settings");
      expect(rows).toHaveLength(2);
      expect(rows.map((a) => a.input)).toEqual(
        expect.arrayContaining([
          { from: { uniqueVisitors: false }, to: { uniqueVisitors: true } },
          {
            from: { uniqueVisitors: true, vitalsOneIn: 5 },
            to: { uniqueVisitors: false, vitalsOneIn: 10 },
            saltDeleted: true,
          },
        ]),
      );
      expect(rows[0]?.actor.id).toBe(person("administrator").actor.id);
    });

    it("status and the CSV export of rollups", async () => {
      const before = await call(`${base()}/status`);
      expect(before.body).toMatchObject({
        siteId,
        feature: { enabled: true, store: "sql" },
        settings: { enabled: true },
        lastRollup: null,
        budget: null,
        quota: { day: "2026-10-08", pageviews: 4, renders: 2, cacheHitRatio: null },
      });
      await service.rollup({ siteIds: [siteId], maxSiteDays: 10 });
      const after = await call(`${base()}/status`);
      expect(after.body.lastRollup).toMatchObject({ day: "2026-10-08", source: "sql" });

      const res = await app.request(`${base()}/export?${FULL}`, {
        headers: { "x-test-user": "author" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
      expect(res.headers.get("content-disposition")).toMatch(
        /attachment; filename="analytics-site-analytics-2026-10-07-2026-10-09.csv"/,
      );
      const csv = await res.text();
      expect(csv.split("\r\n")[0]).toBe(
        "day,dim,key,pageviews,visits,visitors,hits,value,samples,good,poor",
      );
      expect(csv).toContain("2026-10-07,total,all,6,5,3,,,,,");
      // rollups once done: the read says so
      const r = await call(`${base()}/summary?${FULL}`);
      expect(r.body).toMatchObject({ source: "rollups", data: { pageviews: 10 } });
    });

    it("maps an unreadable store to 503 analytics_unavailable with Retry-After", async () => {
      build({
        kind: "wae",
        async query() {
          throw new AnalyticsUnavailableError("Cloudflare's analytics service is busy", true);
        },
      });
      const r = await call(`${base()}/summary?${FULL}`);
      expect(r.status).toBe(503);
      expect(r.headers.get("retry-after")).toBe("30");
      expect(r.body).toMatchObject({
        error: "analytics_unavailable",
        details: { retryable: true },
      });
    });

    it("deploy-token routes: backfill, status and export", async () => {
      const admin = `/api/admin/sites/${siteId}/analytics`;
      const auth = { authorization: `Bearer ${DEPLOY_TOKEN}`, "content-type": "application/json" };
      expect((await app.request(`${admin}/status`)).status).toBe(401);
      let pending = Number.POSITIVE_INFINITY;
      let calls = 0;
      while (pending > 0 && calls < 10) {
        const res = await app.request(`${admin}/rollup`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ days: 7, maxSiteDays: 3 }),
        });
        expect(res.status).toBe(200);
        const report = (await res.json()) as { pending: number; done: unknown[]; reader: string };
        expect(report.reader).toBe("sql");
        pending = report.pending;
        calls++;
      }
      expect(calls).toBe(3);
      const bad = await app.request(`${admin}/rollup`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ days: 365 }),
      });
      expect(bad.status).toBe(400);
      const status = (await (
        await app.request(`${admin}/status`, { headers: auth })
      ).json()) as Json;
      expect(status.lastRollup).toMatchObject({ day: "2026-10-08" });
      const csv = await (await app.request(`${admin}/export?${FULL}`, { headers: auth })).text();
      expect(csv).toContain("2026-10-08,total,all,4,");
      expect(
        (
          await app.request(`/api/admin/sites/site_doesnotexist1/analytics/status`, {
            headers: auth,
          })
        ).status,
      ).toBe(404);
    });

    it("a server without analytics does not answer the routes", async () => {
      const plain = createApi({
        store,
        resolveActor: async () => ({ kind: "human", id: "user_plain000001" }),
      });
      expect((await plain.request(`${base()}/summary`)).status).toBe(404);
    });
  });
}
