/**
 * `/api/sites/:siteId/analytics` (RFC-0006 §9.2): site analytics for people (agents use the MCP
 * tools). Reads need `analytics:read` (Authors and above); changing the settings needs
 * `site:settings` (Administrators), is CAS on `rev` and audited as `analytics.settings`.
 *
 * Every read answers `{ range, source, estimated, partial?, generatedAt, data }`. Parameters:
 * `range` (today · 7d · 30d · 90d · 12m) or `from` and `to` (ISO dates or instants, UTC, `to`
 * exclusive; at most two years, the live part at most 92 days), `filter` (one of `node:<id>`,
 * `channel:<enum>`, `country:<ISO2>`, `device:<enum>`), `limit` (1–100). Anything else is
 * 400 `invalid_query`. `siteId` always comes from the route, after the scope check (tenant
 * isolation): a query can never name another site.
 */
import { AnalyticsQueryError, ID_RE, type Range } from "@cloudhal/analytics";
import {
  type AnalyticsService,
  parseFilterParam,
  rangeFromParams,
} from "@cloudhal/analytics/service";
import {
  type AnalyticsMeta,
  analyticsNodes,
  combineMeta,
  nodeReport,
  seriesInterval,
  summaryReport,
} from "@cloudhal/mcp-server/analytics";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { notFound } from "../errors.ts";
import { actorOf, requireSite } from "../governance.ts";
import { param } from "../params.ts";

/** Rows per top list or render report on REST (the model allows more; the API caps at 100). */
export const API_MAX_LIMIT = 100;

function service(c: Context<Env>): AnalyticsService {
  const analytics = c.get("analytics");
  if (!analytics) throw notFound("analytics are not enabled on this server");
  return analytics;
}

function range(c: Context<Env>, analytics: AnalyticsService): Range {
  return rangeFromParams(
    { range: c.req.query("range"), from: c.req.query("from"), to: c.req.query("to") },
    analytics.now(),
  );
}

function limit(c: Context<Env>, fallback: number): number {
  const raw = c.req.query("limit");
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > API_MAX_LIMIT)
    throw new AnalyticsQueryError(`limit must be an integer from 1 to ${API_MAX_LIMIT}`);
  return n;
}

function compare(c: Context<Env>): boolean {
  const v = c.req.query("compare");
  if (v === undefined || v === "") return false;
  if (v !== "previous") throw new AnalyticsQueryError("compare takes previous");
  return true;
}

function envelope<T>(analytics: AnalyticsService, r: Range, meta: AnalyticsMeta, data: T) {
  return {
    range: r,
    source: meta.source,
    estimated: meta.estimated,
    ...(meta.partial ? { partial: true } : {}),
    generatedAt: analytics.now().toISOString(),
    data,
  };
}

/** `PUT …/settings` body: `rev` plus any of the settings. */
interface SettingsBody {
  rev?: unknown;
  enabled?: unknown;
  uniqueVisitors?: unknown;
  vitalsOneIn?: unknown;
  rollupRetentionDays?: unknown;
  planHint?: unknown;
}

const SETTINGS_KEYS = new Set([
  "rev",
  "enabled",
  "uniqueVisitors",
  "vitalsOneIn",
  "rollupRetentionDays",
  "planHint",
]);

export const analytics: Hono<Env> = new Hono<Env>()
  /** Enabled, store, last rollup, budget and yesterday's request estimate (§10.1). */
  .get("/status", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    return c.json(await a.status(site.id));
  })
  .get("/summary", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const { data, results } = await summaryReport(a, site.id, r, {
      filter: parseFilterParam(c.req.query("filter")),
      compare: compare(c),
    });
    return c.json(envelope(a, r, combineMeta(results), data));
  })
  .get("/series", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const interval = c.req.query("interval") ?? seriesInterval(r);
    if (interval !== "hour" && interval !== "day")
      throw new AnalyticsQueryError("interval must be hour or day");
    const filter = parseFilterParam(c.req.query("filter"));
    const result = await a.query({
      kind: "series",
      siteId: site.id,
      range: r,
      interval,
      ...(filter ? { filter } : {}),
    });
    return c.json(envelope(a, r, combineMeta([result]), result.data));
  })
  .get("/top/:dimension", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const filter = parseFilterParam(c.req.query("filter"));
    const dimension = param(c, "dimension");
    const result = await a.query({
      kind: "top",
      siteId: site.id,
      range: r,
      dimension: dimension as never,
      limit: limit(c, 10),
      ...(filter ? { filter } : {}),
    });
    // Top content joins the current graph: a renamed article shows its new title and path.
    if (result.data.dimension === "node") {
      const nodes = await analyticsNodes(
        c.get("store"),
        site,
        result.data.rows.map((row) => row.key),
      );
      return c.json(
        envelope(a, r, combineMeta([result]), {
          dimension: "node",
          rows: result.data.rows.map((row) => ({ ...row, node: nodes.get(row.key) })),
        }),
      );
    }
    return c.json(envelope(a, r, combineMeta([result]), result.data));
  })
  .get("/vitals", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const filter = parseFilterParam(c.req.query("filter"));
    const result = await a.query({
      kind: "vitals",
      siteId: site.id,
      range: r,
      ...(filter ? { filter } : {}),
    });
    return c.json(envelope(a, r, combineMeta([result]), result.data));
  })
  /** errors (404/410/5xx with the linking page), redirects (hits per old path), crawlers. */
  .get("/renders/:report", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const result = await a.query({
      kind: "renders",
      siteId: site.id,
      range: r,
      statuses: param(c, "report") as never,
      limit: limit(c, 20),
    });
    return c.json(envelope(a, r, combineMeta([result]), result.data));
  })
  /** One page, article or archive: series, sources, countries, devices, vitals, old paths. */
  .get("/nodes/:nodeId", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const nodeId = param(c, "nodeId");
    if (!ID_RE.test(nodeId)) throw new AnalyticsQueryError("nodeId must be an id");
    const r = range(c, a);
    const { data, meta } = await nodeReport(a, c.get("store"), site, nodeId, r, {
      compare: compare(c),
    });
    return c.json(envelope(a, r, meta, data));
  })
  /** Site-level CSV of the daily rollups (open question 11): no personal data, nothing per visitor. */
  .get("/export", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const r = range(c, a);
    const csv = await a.exportCsv(site.id, r);
    const name = `${site.slug}-analytics-${r.from.slice(0, 10)}-${r.to.slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  })
  .get("/settings", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    return c.json({ settings: await a.settings(site.id), feature: a.feature() });
  })
  /**
   * CAS on `rev` (0 while the site uses the deployment defaults); 409 `conflict` when stale.
   * Audited as `analytics.settings` with `{from, to}` of what changed. Turning `enabled` or
   * `vitalsOneIn` purges the site's cache (the script tag follows); turning unique visitors off
   * deletes today's salt.
   */
  .put("/settings", async (c) => {
    const a = service(c);
    const site = await requireSite(c);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as SettingsBody;
    if (typeof body !== "object" || Array.isArray(body))
      throw new AnalyticsQueryError("the body must be a JSON object");
    for (const key of Object.keys(body))
      if (!SETTINGS_KEYS.has(key))
        throw new AnalyticsQueryError(`unknown field ${key.slice(0, 40)}`);
    if (!Number.isInteger(body.rev) || (body.rev as number) < 0)
      throw new AnalyticsQueryError("rev is required (0 while the site uses the defaults)");
    const actor = actorOf(c);
    const { rev: _rev, ...patch } = body;
    const result = await a.updateSettings({
      siteId: site.id,
      rev: body.rev as number,
      patch: patch as never,
      actorId: actor.id,
    });
    if (Object.keys(result.changes).length > 0)
      await c.get("audit")?.record({
        at: a.now().toISOString(),
        actor,
        siteId: site.id,
        tool: "analytics.settings",
        decision: "allow",
        outcome: "ok",
        input: {
          from: Object.fromEntries(Object.entries(result.changes).map(([k, v]) => [k, v.from])),
          to: Object.fromEntries(Object.entries(result.changes).map(([k, v]) => [k, v.to])),
          ...(result.saltDeleted ? { saltDeleted: true } : {}),
        },
        reason: `analytics settings changed: ${Object.keys(result.changes).join(", ")}`,
      });
    return c.json({
      settings: { ...result.after, stored: true },
      purged: result.purged,
      saltDeleted: result.saltDeleted,
    });
  });
