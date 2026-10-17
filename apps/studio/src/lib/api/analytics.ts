/** Site analytics. */
import type { AnalyticsChannel, AnalyticsDevice } from "@cloudhal/core-contracts";
import { json, query, request } from "./http.ts";

// ---- site analytics (RFC-0006, packages/api/src/routes/analytics.ts) ----------------------------

/** Where events are recorded, whether Studio can read them, and how (`GET /api/instance`). */
export interface AnalyticsFeature {
  /** The deployment records analytics (`analytics.enabled` in cloudhal.json). */
  enabled: boolean;
  store: "wae" | "sql" | "none";
  /** `none` with a store: visits are recorded but cannot be read yet ("can't read yet"). */
  reader: "binding" | "sql" | "none";
  /** Days of live data (older ranges come from daily totals only). */
  liveDays: number;
  /** Uncached live queries per UTC day; `null` when not budgeted. */
  budget: number | null;
  /** `on-read`: no cron trigger; daily totals are computed when someone opens Analytics. */
  rollups: "scheduled" | "on-read";
  defaults: {
    enabled: boolean;
    uniqueVisitors: boolean;
    vitalsOneIn: AnalyticsVitalsOneIn;
    rollupRetentionDays?: number | null;
  };
}

/** Vitals sampling: one page view in N (0 = off). */
export type AnalyticsVitalsOneIn = 0 | 1 | 2 | 5 | 10 | 20;

/** A site's analytics settings: its row, or the deployment defaults (`rev` 0, `stored` false). */
export interface AnalyticsSettings {
  siteId: string;
  enabled: boolean;
  uniqueVisitors: boolean;
  vitalsOneIn: AnalyticsVitalsOneIn;
  /** `null`: keep daily totals forever. */
  rollupRetentionDays: number | null;
  planHint: "free" | "paid" | null;
  rev: number;
  stored: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export type AnalyticsSettingsPatch = Partial<
  Pick<
    AnalyticsSettings,
    "enabled" | "uniqueVisitors" | "vitalsOneIn" | "rollupRetentionDays" | "planHint"
  >
>;

export interface AnalyticsStatus {
  siteId: string;
  feature: AnalyticsFeature;
  settings: AnalyticsSettings;
  lastRollup: { day: string; finishedAt: string | null; source: string } | null;
  budget: { day: string; used: number; limit: number; spent: boolean } | null;
  /** Yesterday's request estimate for the Workers Free warning; `null` when unreadable. */
  quota: {
    day: string;
    pageviews: number;
    beacons: number;
    requests: number;
    /** People's HTML 200 renders that day (cache misses); `null` when not known. */
    renders?: number | null;
    /** Estimated cache-hit ratio that day (0–1), Cloudflare only. */
    cacheHitRatio?: number | null;
  } | null;
}

export type AnalyticsRangePreset = "today" | "7d" | "30d" | "90d" | "12m";
export type AnalyticsDimension =
  | "node"
  | "refHost"
  | "channel"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "country"
  | "device"
  | "browser"
  | "os";
export type AnalyticsRenderReport = "errors" | "redirects" | "crawlers";
export type { AnalyticsChannel, AnalyticsDevice };

/** A range by preset, or `from`/`to` (ISO dates or instants, UTC, `to` exclusive). */
export interface AnalyticsRangeQuery {
  range?: AnalyticsRangePreset;
  from?: string;
  to?: string;
  /** One of `node:<id>`, `channel:<channel>`, `country:<ISO2>`, `device:<device>`. */
  filter?: string;
}

/** Every analytics read: where the answer came from and whether it is complete. */
export interface AnalyticsEnvelope<T> {
  range: { from: string; to: string };
  source: "live" | "rollups" | "mixed";
  /** Approximate (sampled or distinct counts, merged percentiles). */
  estimated: boolean;
  /** Part of the range could not be read (budget spent, older than live data, no reader). */
  partial?: boolean;
  generatedAt: string;
  data: T;
}

export interface AnalyticsTotals {
  pageviews: number;
  visits: number;
  /** Daily unique visitors, summed; `null` when the mode was off. */
  visitors: number | null;
  /** Pages rendered for people (cache misses); `null` when not known. */
  renders?: number | null;
  /** Page views that carried GPC or DNT (counted, never hashed); `null` when not known. */
  signals?: number | null;
}

export interface AnalyticsSummary extends AnalyticsTotals {
  viewsPerVisit: number | null;
  /** **Estimated** cache-hit ratio, 1 − renders ÷ page views (0–1); Cloudflare only, else `null`. */
  cacheHitRatio?: number | null;
  /** Share of page views with GPC or DNT (0–1): unique visitors are a lower bound. */
  privacySignalShare?: number | null;
  previous?: AnalyticsTotals & { range: { from: string; to: string } };
  /** Relative change (0.12 = +12 %); `null` where the previous value was 0. */
  change?: { pageviews: number | null; visits: number | null; visitors: number | null };
}

export interface AnalyticsSeries {
  interval: "hour" | "day";
  points: { t: string; pageviews: number; visits: number }[];
}

/** A page, article or archive as the current graph knows it. */
export interface AnalyticsNode {
  nodeId: string;
  kind: "page" | "entry" | "archive" | null;
  /** `false`: it no longer exists ("No longer exists"). */
  exists: boolean;
  title: string | null;
  path: string | null;
  status: string | null;
}

export interface AnalyticsTopRow {
  key: string;
  pageviews: number;
  visits: number;
  /** Top content only. */
  node?: AnalyticsNode;
}

export interface AnalyticsTop {
  dimension: AnalyticsDimension;
  rows: AnalyticsTopRow[];
}

export interface AnalyticsVitalsMetric {
  metric: "lcp" | "inp" | "cls" | "ttfb" | "fcp";
  p75: number | null;
  samples: number;
  good: number | null;
  needsImprovement: number | null;
  poor: number | null;
}

export type AnalyticsRenders =
  | {
      report: "errors";
      /** `path` is what visitors requested: show it as plain text, never as a link. */
      rows: {
        path: string;
        status: number;
        refPath: string | null;
        hits: number;
        lastSeen: string | null;
      }[];
    }
  | {
      report: "redirects";
      rows: {
        path: string;
        status: number;
        redirectTo: string;
        nodeId: string | null;
        hits: number;
      }[];
    }
  | {
      report: "crawlers";
      rows: {
        crawler: string;
        class: "search" | "ai" | "social" | "monitor" | "other";
        hits: number;
      }[];
    };

/** What raised the possible-bot-traffic level (RFC-0006 §5.5); Studio words it by `code`. */
export interface AnalyticsBotReason {
  code: "hourly_spike" | "direct_entrances" | "single_browser" | "single_page";
  /** One English sentence (agents, logs); Studio shows its own words. */
  detail: string;
  /** `hourly_spike`: times the median hour; the others: a share (0–1). */
  value: number;
  threshold: number;
  /** `single_page`: the node id; `single_browser`: the browser family. */
  key?: string;
  /** `single_page`: the page as the graph knows it now. */
  node?: AnalyticsNode;
}

/** `…/analytics/bots`: the busiest hour of the period's last 7 days, and whether it looks forged. */
export interface AnalyticsBotTraffic {
  level: "none" | "watch" | "likely";
  reasons: AnalyticsBotReason[];
  /** Bucket start (UTC) of the busiest hour checked; `null` without page views. */
  hour: string | null;
  pageviews: number;
  /** The median hour of the 7 days checked. */
  baseline: number;
  window: { from: string; to: string } | null;
  partial?: boolean;
}

export interface AnalyticsNodeStats {
  node: AnalyticsNode;
  summary: AnalyticsSummary;
  series: AnalyticsSeries;
  channels: AnalyticsTopRow[];
  referrers: AnalyticsTopRow[];
  countries: AnalyticsTopRow[];
  devices: AnalyticsTopRow[];
  vitals: { metrics: AnalyticsVitalsMetric[] };
  /** Earlier paths (slug changes) and the redirects they left, with hits in the range. */
  oldPaths: { from: string; to: string; status: number; reason: string; hits: number }[];
  redirectHits: number;
}

function analyticsQuery(
  q: AnalyticsRangeQuery,
  extra: Record<string, string | number | undefined> = {},
): string {
  return query({ range: q.range, from: q.from, to: q.to, filter: q.filter, ...extra });
}

const analyticsPath = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}/analytics`;

/** Site analytics (RFC-0006 §9.2): reads for Authors and above, settings for Administrators. */
export const analyticsApi = {
  status: (siteId: string) => request<AnalyticsStatus>(`${analyticsPath(siteId)}/status`),
  summary: (siteId: string, q: AnalyticsRangeQuery = {}, compare = false) =>
    request<AnalyticsEnvelope<AnalyticsSummary>>(
      `${analyticsPath(siteId)}/summary${analyticsQuery(q, { compare: compare ? "previous" : undefined })}`,
    ),
  /** The possible-bot-traffic signal (no `filter`: it looks at the whole site). */
  bots: (siteId: string, q: AnalyticsRangeQuery = {}) =>
    request<AnalyticsEnvelope<AnalyticsBotTraffic>>(
      `${analyticsPath(siteId)}/bots${analyticsQuery({ ...q, filter: undefined })}`,
    ),
  series: (siteId: string, q: AnalyticsRangeQuery = {}, interval?: "hour" | "day") =>
    request<AnalyticsEnvelope<AnalyticsSeries>>(
      `${analyticsPath(siteId)}/series${analyticsQuery(q, { interval })}`,
    ),
  top: (
    siteId: string,
    dimension: AnalyticsDimension,
    q: AnalyticsRangeQuery = {},
    limit?: number,
  ) =>
    request<AnalyticsEnvelope<AnalyticsTop>>(
      `${analyticsPath(siteId)}/top/${dimension}${analyticsQuery(q, { limit })}`,
    ),
  vitals: (siteId: string, q: AnalyticsRangeQuery = {}) =>
    request<AnalyticsEnvelope<{ metrics: AnalyticsVitalsMetric[] }>>(
      `${analyticsPath(siteId)}/vitals${analyticsQuery(q)}`,
    ),
  renders: <R extends AnalyticsRenderReport>(
    siteId: string,
    report: R,
    q: Omit<AnalyticsRangeQuery, "filter"> = {},
    limit?: number,
  ) =>
    request<AnalyticsEnvelope<Extract<AnalyticsRenders, { report: R }>>>(
      `${analyticsPath(siteId)}/renders/${report}${analyticsQuery(q, { limit })}`,
    ),
  node: (
    siteId: string,
    nodeId: string,
    q: Omit<AnalyticsRangeQuery, "filter"> = {},
    compare = false,
  ) =>
    request<AnalyticsEnvelope<AnalyticsNodeStats>>(
      `${analyticsPath(siteId)}/nodes/${encodeURIComponent(nodeId)}${analyticsQuery(q, { compare: compare ? "previous" : undefined })}`,
    ),
  /** A download link: CSV of the daily totals (complete, rolled-up days). */
  exportUrl: (siteId: string, q: Omit<AnalyticsRangeQuery, "filter"> = {}) =>
    `${analyticsPath(siteId)}/export${analyticsQuery(q)}`,
  settings: (siteId: string) =>
    request<{ settings: AnalyticsSettings; feature: AnalyticsFeature }>(
      `${analyticsPath(siteId)}/settings`,
    ),
  /** CAS on `rev` (0 while the site uses the defaults): 409 `conflict` when it changed meanwhile. */
  updateSettings: (siteId: string, rev: number, patch: AnalyticsSettingsPatch) =>
    request<{ settings: AnalyticsSettings; purged: boolean; saltDeleted: boolean }>(
      `${analyticsPath(siteId)}/settings`,
      { method: "PUT", ...json({ rev, ...patch }) },
    ),
};
